import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, SandboxViolationError } from '@fongap-labs/shared'
import type { EditResult, Settings } from '../types.js'
import { TOOL_PREFIX, resolveRoot, readTextSafe, writeTextSafe, errorMessage } from '../runtime.js'

export function createMultiEditTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}multi_edit`,
    description:
      'Apply a batch of file edits atomically within the workspace. Each edit either overwrites a file with `content` or performs a `find`/`replace` substitution. Set `dryRun` to validate paths and inputs without writing.',
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
      for (const edit of edits) {
        const rel = String(edit.path ?? '')
        try {
          if (!edit.content && edit.find === undefined) {
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
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, String(edit.content ?? ''))
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
