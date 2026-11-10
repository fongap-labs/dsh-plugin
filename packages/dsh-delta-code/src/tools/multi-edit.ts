import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, SandboxViolationError, resolveInside } from '@fongap-labs/shared'
import type { EditResult, Settings } from '../types.js'
import { TOOL_PREFIX, resolveRoot, readTextSafe, writeTextSafe, errorMessage } from '../runtime.js'

export function createMultiEditTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}multi_edit`,
    description:
      'Apply workspace edits with per-edit results (not a filesystem transaction). Each edit either overwrites content or performs literal find/replace. Optional preflight validates the batch before writing; dryRun does not write.',
    parameters: {
      edits: {
        type: 'array',
        required: true,
        description:
          'Edits to apply, each an object with `path` plus either `content` or `find`/`replace`.',
        items: {
          type: 'object',
          // The edit objects are validated per property; unlisted keys stay ignored.
          additionalProperties: true,
          properties: {
            path: { type: 'string', required: true, description: 'Workspace-relative file path.' },
            content: { type: 'string', description: 'Full replacement content for the file.' },
            find: { type: 'string', description: 'Literal substring to locate (used with `replace`).' },
            replace: { type: 'string', description: 'Replacement text for the located substring.' },
          },
        },
      },
      dryRun: { type: 'boolean', description: 'When true, validate without writing.' },
      preflight: { type: 'boolean', description: 'Check the entire batch before writing. Preflight failure writes nothing; write-stage failures may still leave earlier edits (not an atomic transaction).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          applied: { type: 'integer', required: true, description: 'Number of edits applied.' },
          results: {
            type: 'array',
            required: true,
            description: 'Per-edit outcome list.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                action: { type: 'string', required: true, enum: ['overwrite', 'replace', 'skipped'] },
                ok: { type: 'boolean', required: true },
                note: { type: 'string' },
              },
            },
          },
          dryRun: { type: 'boolean' },
        },
      },
      render(_args, value) {
        const lines = [
          `MultiEdit: ${value.applied} edit(s)${value.dryRun ? ' (dry run)' : ''} applied.`,
        ]
        for (const result of value.results) {
          const flag = result.ok ? 'ok' : 'fail'
          lines.push(
            `  [${flag}] ${result.action} ${result.path}${result.note ? ` — ${result.note}` : ''}`,
          )
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const results: EditResult[] = []
      let applied = 0
      const edits = Array.isArray(args.edits) ? args.edits : []
      if (args.preflight) {
        // Opt-in mode: validate all edits and compute replacements before writing.
        // Existing default stays a per-edit best-effort workflow.
        const prepared: Array<{
          path: string
          action: EditResult['action']
          content: string
          note: string
          original?: string
        }> = []
        const checked: EditResult[] = []
        const targets = new Set<string>()
        let isInvalid = false
        for (const edit of edits) {
          const path = typeof edit?.path === 'string' ? edit.path : ''
          try {
            if (exec.signal.aborted) throw new Error('operation cancelled')
            const target = resolveInside(root, path)
            if (targets.has(target)) throw new Error('duplicate edit target in preflight batch')
            targets.add(target)
            const isReplace = edit.find !== undefined
            if (isReplace === (edit.content !== undefined)) {
              throw new Error('provide exactly one of content or find/replace')
            }
            if (isReplace) {
              if (typeof edit.find !== 'string' || edit.find.length === 0 || typeof edit.replace !== 'string') {
                throw new Error('find must be non-empty and replace must be a string')
              }
              const original = await readTextSafe(ctx, exec, root, path)
              const index = original.indexOf(edit.find)
              if (index === -1) throw new Error('find substring not present')
              const content = original.slice(0, index) + edit.replace + original.slice(index + edit.find.length)
              prepared.push({ path, action: 'replace', content, original, note: 'replaced 1 occurrence' })
              checked.push({ path, action: 'replace', ok: true, note: 'replaced 1 occurrence' })
            } else {
              if (typeof edit.content !== 'string') throw new Error('content must be a string')
              prepared.push({ path, action: 'overwrite', content: edit.content, note: edit.content.length + ' characters' })
              checked.push({ path, action: 'overwrite', ok: true, note: edit.content.length + ' characters' })
            }
          } catch (error) {
            isInvalid = true
            checked.push({
              path,
              action: 'skipped',
              ok: false,
              note: error instanceof SandboxViolationError ? 'path escapes workspace sandbox' : errorMessage(error),
            })
          }
        }
        if (isInvalid) {
          return {
            applied: 0,
            results: checked.map(item => item.ok
              ? { path: item.path, action: 'skipped' as const, ok: false, note: 'batch preflight blocked by another invalid edit' }
              : item),
            dryRun: Boolean(args.dryRun),
          }
        }
        if (args.dryRun) {
          // Preserve the legacy dryRun convention: "applied" counts validated edits.
          return { applied: prepared.length, results: checked, dryRun: true }
        }
        const written: EditResult[] = []
        for (const [index, item] of prepared.entries()) {
          try {
            if (exec.signal.aborted) throw new Error('operation cancelled')
            if (item.original !== undefined) {
              const current = await readTextSafe(ctx, exec, root, item.path)
              if (current !== item.original) throw new Error('file changed after preflight')
            }
            await writeTextSafe(ctx, exec, root, item.path, item.content)
            applied += 1
            written.push({ path: item.path, action: item.action, ok: true, note: item.note })
          } catch (error) {
            written.push({
              path: item.path,
              action: 'skipped',
              ok: false,
              note: error instanceof SandboxViolationError ? 'path escapes workspace sandbox' : errorMessage(error),
            })
            for (const pending of prepared.slice(index + 1)) {
              written.push({ path: pending.path, action: 'skipped', ok: false, note: 'earlier batch write failed' })
            }
            break
          }
        }
        return { applied, results: written, dryRun: false }
      }
      for (const edit of edits) {
        const rel = String(edit.path ?? '')
        try {
          if (edit.content === undefined && edit.find === undefined) {
            results.push({
              path: rel,
              action: 'skipped',
              ok: false,
              note: 'missing content or find/replace',
            })
            continue
          }
          let action: EditResult['action'] = 'overwrite'
          let note: string | undefined
          if (edit.find !== undefined) {
            if (typeof edit.find !== 'string' || edit.find.length === 0 || typeof edit.replace !== 'string') {
              throw new Error('find must be non-empty and replace must be a string')
            }
            const original = await readTextSafe(ctx, exec, root, rel)
            const index = original.indexOf(String(edit.find))
            if (index === -1) {
              results.push({
                path: rel,
                action: 'skipped',
                ok: false,
                note: 'find substring not present',
              })
              continue
            }
            action = 'replace'
            const next =
              original.slice(0, index) +
              String(edit.replace ?? '') +
              original.slice(index + String(edit.find).length)
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, next)
            note = 'replaced 1 occurrence'
          } else {
            if (typeof edit.content !== 'string') throw new Error('content must be a string')
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, edit.content)
            note = `${String(edit.content ?? '').length} bytes`
          }
          applied += 1
          results.push({ path: rel, action, ok: true, note })
        } catch (error) {
          results.push({
            path: rel,
            action: 'skipped',
            ok: false,
            note:
              error instanceof SandboxViolationError
                ? 'path escapes workspace sandbox'
                : errorMessage(error),
          })
        }
      }
      return { applied, results, dryRun: Boolean(args.dryRun) }
    },
  })
}
