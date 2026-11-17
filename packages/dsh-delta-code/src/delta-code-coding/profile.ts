import { access, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, isPathInside, resolveInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { requireHostFs } from '../delta-code-adapter/providers/dsh/host-fs.js'
import { PROJECT_FILES, declaredScripts, profileSummary } from './project-profile-policy.js'
import type { ProjectProfile } from './project-profile-policy.js'
export type { ProjectProfile } from './project-profile-policy.js'

export async function inspectProject(cwd: string, root: string): Promise<ProjectProfile> {
  const canonicalRoot = await realpath(root)
  const canonicalCwd = await realpath(cwd)
  if (!isPathInside(canonicalRoot, canonicalCwd)) throw new Error('project directory escapes workspace')

  const files: string[] = []
  for (const name of PROJECT_FILES) {
    try {
      const file = await realpath(join(canonicalCwd, name))
      if (!isPathInside(canonicalRoot, file)) continue
      await access(file)
      files.push(name)
    } catch { /* file absent or unsafe */ }
  }
  let scripts: string[] = []
  if (files.includes('package.json')) {
    try {
      const raw = await readFile(join(canonicalCwd, 'package.json'), 'utf8')
      scripts = declaredScripts(raw)
    } catch { /* profile remains useful without package.json */ }
  }
  return profileSummary(canonicalCwd, files, scripts)
}


/** DSH FS is authoritative when mounted; do not switch to local Node reads on refusal. */
export async function inspectProjectWithHost(
  ctx: Context, exec: { signal: AbortSignal }, cwd: string, root: string,
): Promise<ProjectProfile> {
  const fs = requireHostFs(ctx, ['resolve', 'contains', 'stat', 'readText'], 'refusing local profile fallback')
  if (!fs) return inspectProject(cwd, root)
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const rootTarget = await fs.resolve(root, { cwd: root, signal: exec.signal })
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const cwdTarget = await fs.resolve(cwd, { cwd: root, signal: exec.signal })
  if (!fs.contains(rootTarget, cwdTarget)) throw new Error('project directory escapes workspace')
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const directoryInfo = await fs.stat(cwdTarget, exec.signal)
  if (!directoryInfo || directoryInfo.type !== 'directory') {
    throw new Error('project cwd is not a Host-authorized directory')
  }
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const files: string[] = []
  let packageTarget: unknown
  for (const name of PROJECT_FILES) {
    if (exec.signal.aborted) throw new Error('project profile cancelled')
    const target = await fs.resolve(join(cwd, name), { cwd, signal: exec.signal })
    if (!fs.contains(rootTarget, target)) continue
    const info = await fs.stat(target, exec.signal)
    if (exec.signal.aborted) throw new Error('project profile cancelled')
    if (info?.type !== 'file') continue
    files.push(name)
    if (name === 'package.json') packageTarget = target
  }
  let scripts: string[] = []
  if (packageTarget !== undefined) {
    // Host read failures remain fatal: never silently use local Node data.
    const raw = await fs.readText(packageTarget, exec.signal)
    if (exec.signal.aborted) throw new Error('project profile cancelled')
    scripts = declaredScripts(raw)
  }
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  return profileSummary(cwd, files, scripts)
}

export function createProjectProfileTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_project_profile',
    description: 'Quick read-only project preflight: detect tech stack, project rule files and existing verification scripts without reading source bodies. Use before planning or choosing tests.',
    parameters: {
      cwd: { type: 'string', description: 'Optional workspace-relative project directory.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        cwd: { type: 'string', required: true },
        files: { type: 'array', required: true, items: { type: 'string' } },
        technologies: { type: 'array', required: true, items: { type: 'string' } },
        scripts: { type: 'array', required: true, items: { type: 'string' } },
        guidance: { type: 'array', required: true, items: { type: 'string' } },
        suggestedChecks: { type: 'array', required: true, items: { type: 'string' } },
      } },
      render(_args, result) {
        return [{ type: 'text', text: [
          'Project: ' + result.cwd,
          'Stack: ' + (result.technologies.join(', ') || '(unknown)'),
          'Rules: ' + (result.guidance.join(', ') || '(none at cwd; inspect parent directories)'),
          'Scripts: ' + (result.scripts.join(', ') || '(none)'),
          'Suggested checks: ' + (result.suggestedChecks.join(', ') || '(none)'),
          'Detected files: ' + result.files.join(', '),
        ].join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      return inspectProjectWithHost(ctx, exec, cwd, root)
    },
  })
}
