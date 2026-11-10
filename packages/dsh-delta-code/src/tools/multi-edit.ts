import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, SandboxViolationError, resolveInside } from '@fongap-labs/shared'
import type { EditResult, Settings } from '../types.js'
import { TOOL_PREFIX, resolveRoot, readTextSafe, writeTextSafe, validateWriteTargetSafe, errorMessage } from '../runtime.js'
import type { GuardedWriteIntent } from '../runtime.js'

export function createMultiEditTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}multi_edit`,
    description:
      'Apply workspace edits with per-edit results (not a filesystem transaction). Each edit either overwrites content or performs literal find/replace. Optional preflight validates the batch before writing; overwrite edits may specify expectedSha256 to reject stale source content. dryRun does not write.',
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
            expectedSha256: { type: 'string', description: 'Optional SHA-256 of the current UTF-8 file content for a preflight overwrite. Rejects stale edits; requires preflight=true.' },
          },
        },
      },
      dryRun: { type: 'boolean', description: 'When true, validate without writing.' },
      preflight: { type: 'boolean', description: 'Check the entire batch before writing. Preflight failure writes nothing; write-stage failures may still leave earlier edits (not an atomic transaction).' },
      rollbackOnFailure: { type: 'boolean', description: 'Opt-in guarded compensation for existing files only; requires preflight=true and execution.fsWriteContract=guarded-intent. Restores confirmed earlier writes only if the Host write version is unchanged. Not atomic.' },
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
          rollback: {
            type: 'object',
            additionalProperties: false,
            properties: {
              attempted: { type: 'integer', required: true },
              restored: { type: 'integer', required: true },
              failed: { type: 'integer', required: true },
              skippedReason: { type: 'string' },
            },
          },
        },
      },
      render(_args, value) {
        const lines = [
          `MultiEdit: ${value.applied} edit(s)${value.dryRun ? ' (dry run)' : ''} applied.`,
        ]
        if (value.rollback) {
          lines.push(`  Recovery: ${value.rollback.restored}/${value.rollback.attempted} restored; ${value.rollback.failed} failed.`)
          if (value.rollback.skippedReason) lines.push(`  Recovery skipped: ${value.rollback.skippedReason}`)
        }
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
      const shouldRollback = args.rollbackOnFailure === true
      if (shouldRollback && (!args.preflight || args.dryRun || settings.fsWriteContract !== 'guarded-intent')) {
        return {
          applied: 0,
          results: edits.map((edit) => ({
            path: typeof edit?.path === 'string' ? edit.path : '',
            action: 'skipped' as const,
            ok: false,
            note: 'rollbackOnFailure requires preflight=true, dryRun=false and guarded-intent Host FS',
          })),
          dryRun: Boolean(args.dryRun),
        }
      }
      if (args.preflight || args.dryRun) {
        // Every dry run must validate targets and Host permissions before claiming success.
        // Real writes without explicit preflight retain the existing best-effort mode.
        const prepared: Array<{
          path: string
          action: EditResult['action']
          content: string
          note: string
          original?: string
          pinnedIntent?: GuardedWriteIntent
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
            // Check symlinks and Host FS permissions before any batch write.
            const pinnedIntent = await validateWriteTargetSafe(ctx, exec, root, path, settings)
            if (shouldRollback && pinnedIntent?.kind !== 'replaceIfVersion') {
              throw new Error('rollbackOnFailure requires an existing file with a Host version')
            }
            const isReplace = edit.find !== undefined
            if (isReplace === (edit.content !== undefined)) {
              throw new Error('provide exactly one of content or find/replace')
            }
            if (isReplace) {
              if (edit.expectedSha256 !== undefined) throw new Error('expectedSha256 is only supported for content overwrite')
              if (typeof edit.find !== 'string' || edit.find.length === 0 || typeof edit.replace !== 'string') {
                throw new Error('find must be non-empty and replace must be a string')
              }
              const original = await readTextSafe(ctx, exec, root, path)
              if (shouldRollback && Buffer.byteLength(original, 'utf8') > 2 * 1024 * 1024) {
                throw new Error('rollbackOnFailure snapshot exceeds 2 MiB')
              }
              const index = original.indexOf(edit.find)
              if (index === -1) throw new Error('find substring not present')
              const content = original.slice(0, index) + edit.replace + original.slice(index + edit.find.length)
              prepared.push({ path, action: 'replace', content, original, pinnedIntent, note: 'replaced 1 occurrence' })
              checked.push({ path, action: 'replace', ok: true, note: 'replaced 1 occurrence' })
            } else {
              if (typeof edit.content !== 'string') throw new Error('content must be a string')
              let original: string | undefined
              if (shouldRollback) {
                original = await readTextSafe(ctx, exec, root, path)
                if (Buffer.byteLength(original, 'utf8') > 2 * 1024 * 1024) {
                  throw new Error('rollbackOnFailure snapshot exceeds 2 MiB')
                }
              }
              if (edit.expectedSha256 !== undefined) {
                if (!args.preflight) throw new Error('expectedSha256 requires preflight=true')
                if (typeof edit.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(edit.expectedSha256)) {
                  throw new Error('expectedSha256 must be a 64-character lowercase SHA-256 digest')
                }
                original ??= await readTextSafe(ctx, exec, root, path)
                const actualSha256 = createHash('sha256').update(original, 'utf8').digest('hex')
                if (actualSha256 !== edit.expectedSha256) throw new Error('expectedSha256 mismatch; file changed')
              }
              prepared.push({ path, action: 'overwrite', content: edit.content, original, pinnedIntent, note: edit.content.length + ' characters' })
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
        const confirmed: Array<{ resultIndex: number; path: string; original: string; version: string }> = []
        const compensate = async (): Promise<{
          attempted: number; restored: number; failed: number; skippedReason?: string
        }> => {
          const rollback = { attempted: 0, restored: 0, failed: 0, skippedReason: undefined as string | undefined }
          if (exec.signal.aborted) {
            // Do not use a new signal to circumvent a cancelled Host operation.
            rollback.skippedReason = 'operation cancelled; no further writes authorized'
            return rollback
          }
          for (const entry of confirmed.reverse()) {
            if (exec.signal.aborted) {
              rollback.skippedReason = 'operation cancelled during recovery'
              break
            }
            rollback.attempted += 1
            try {
              // The exact version returned by OUR write is mandatory.
              // Never fetch a newer version and treat it as permission to restore.
              const restoredOutcome = await writeTextSafe(ctx, exec, root, entry.path, entry.original, settings,
                { kind: 'replaceIfVersion', version: entry.version })
              const restoredVersion = (restoredOutcome as { version?: unknown } | null)?.version
              if (typeof restoredVersion !== 'string' || restoredVersion.length === 0) {
                // The Host may have applied the restoration but its final state
                // is unconfirmed. Do not count it as a successful rollback.
                throw new Error('recovery outcome missing a valid Host version; state unconfirmed')
              }
              rollback.restored += 1
              applied -= 1
              written[entry.resultIndex] = {
                ...written[entry.resultIndex]!,
                ok: false, note: 'restored after later batch failure',
              }
            } catch (error) {
              rollback.failed += 1
              written[entry.resultIndex] = {
                ...written[entry.resultIndex]!,
                note: 'write may remain; recovery unconfirmed or refused: ' + errorMessage(error),
              }
            }
          }
          return rollback
        }
        for (const [index, item] of prepared.entries()) {
          try {
            if (exec.signal.aborted) throw new Error('operation cancelled')
            if (item.original !== undefined) {
              const current = await readTextSafe(ctx, exec, root, item.path)
              if (current !== item.original) throw new Error('file changed after preflight')
            }
            const outcome = await writeTextSafe(ctx, exec, root, item.path, item.content, settings, item.pinnedIntent)
            applied += 1
            written.push({ path: item.path, action: item.action, ok: true, note: item.note })
            if (shouldRollback) {
              const version = (outcome as { version?: unknown } | null)?.version
              if (typeof version !== 'string' || version.length === 0) {
                // The current file has been written but cannot be safely restored:
                // do not risk a blind rollback or execute additional batch writes.
                written[index]!.note = 'write succeeded; Host returned no version, recovery unavailable'
                const rollback = await compensate()
                rollback.skippedReason = 'Host write outcome lacked version for ' + item.path
                for (const pending of prepared.slice(index + 1)) {
                  written.push({ path: pending.path, action: 'skipped', ok: false, note: 'recovery unavailable; batch stopped' })
                }
                return { applied, results: written, dryRun: false, rollback }
              }
              confirmed.push({ resultIndex: index, path: item.path, original: item.original!, version })
            }
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
            if (shouldRollback) {
              const rollback = await compensate()
              // The failing Host write may have partially mutated its own target.
              // Only earlier confirmed writes have an authoritative version.
              return { applied, results: written, dryRun: false, rollback }
            }
            break
          }
        }
        return { applied, results: written, dryRun: false }
      }
      for (const edit of edits) {
        const rel = typeof edit?.path === 'string' ? edit.path : ''
        try {
          if (!edit || typeof edit !== 'object' || Array.isArray(edit) || typeof edit.path !== 'string') {
            throw new Error('edit must be an object with a string path')
          }
          if (edit.content !== undefined && edit.find !== undefined) {
            throw new Error('provide exactly one of content or find/replace')
          }
          if (edit.expectedSha256 !== undefined) {
            throw new Error('expectedSha256 requires preflight=true')
          }
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
            const pinnedIntent = settings.fsWriteContract === 'guarded-intent'
              ? await validateWriteTargetSafe(ctx, exec, root, rel, settings)
              : undefined
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
            // Catch a stale read before attempting a best-effort replacement.
            // Legacy Host FS cannot guarantee atomicity; guarded intent can.
            const current = await readTextSafe(ctx, exec, root, rel)
            if (current !== original) throw new Error('file changed before replacement')
            await writeTextSafe(ctx, exec, root, rel, next, settings, pinnedIntent)
            note = 'replaced 1 occurrence'
          } else {
            if (typeof edit.content !== 'string') throw new Error('content must be a string')
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, edit.content, settings)
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
