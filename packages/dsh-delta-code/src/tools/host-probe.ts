import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'

/** Inspect only method presence; do not invoke FS, subprocess or workspace capabilities. */
export function inspectHostCapabilities(ctx: Context) {
  let fs: unknown
  let workingDirectory: unknown
  try { fs = ctx.get('fs') } catch { /* not exposed to this plugin */ }
  try { workingDirectory = ctx.get('workingDirectory') } catch { /* not exposed */ }
  const has = (value: unknown, method: string): boolean =>
    value !== null && typeof value === 'object'
    && typeof (value as Record<string, unknown>)[method] === 'function'
  return {
    fsAccessible: Boolean(fs),
    fsResolve: has(fs, 'resolve'),
    fsReadText: has(fs, 'readText'),
    fsWriteText: has(fs, 'writeText'),
    subprocessMounted: ctx.subprocess !== null && ctx.subprocess !== undefined,
    subprocessSpawn: has(ctx.subprocess, 'spawn'),
    workspaceAccessible: Boolean(workingDirectory),
    workspaceEnsure: has(workingDirectory, 'ensure'),
    toolRegistry: has(ctx.tools, 'register'),
    writeContract: 'unverified' as const,
  }
}

/**
 * Read-only DSH runtime diagnostics. This is not a permission grant or a
 * real FS write/CLI smoke test; actual Host calls require separate evidence.
 */
export function createHostProbeTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'code_host_probe',
    description: 'Report available native DSH service methods without reading files, running commands, exposing credentials or testing write permissions. Use during Host compatibility diagnosis.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fsAccessible: { type: 'boolean', required: true },
          fsResolve: { type: 'boolean', required: true },
          fsReadText: { type: 'boolean', required: true },
          fsWriteText: { type: 'boolean', required: true },
          subprocessMounted: { type: 'boolean', required: true },
          subprocessSpawn: { type: 'boolean', required: true },
          workspaceAccessible: { type: 'boolean', required: true },
          workspaceEnsure: { type: 'boolean', required: true },
          toolRegistry: { type: 'boolean', required: true },
          writeContract: { type: 'string', required: true, enum: ['unverified'] },
        },
      },
      render(_args, value) {
        const flags = [
          ['FS service', value.fsAccessible],
          ['FS resolve', value.fsResolve],
          ['FS readText', value.fsReadText],
          ['FS writeText', value.fsWriteText],
          ['Subprocess mounted', value.subprocessMounted],
          ['Subprocess spawn', value.subprocessSpawn],
          ['Workspace service', value.workspaceAccessible],
          ['Workspace ensure', value.workspaceEnsure],
          ['Tool registry', value.toolRegistry],
        ]
        return [{ type: 'text', text: [
          'DSH Host method presence (read-only; no permission tested):',
          ...flags.map(([name, available]) => name + ': ' + (available ? 'available' : 'unavailable')),
          'FS writeText contract: unverified (requires actual Host smoke test)',
        ].join('\n') }]
      },
    },
    async execute(_args, exec) {
      if (exec.signal.aborted) throw new Error('host probe cancelled')
      return inspectHostCapabilities(ctx)
    },
  })
}
