import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, resolveInside } from '@fongap-labs/shared'
import type { LspProbeResult, Settings } from '../types.js'
import { TOOL_PREFIX, resolveRoot, errorMessage } from '../runtime.js'

export function createLspProbeTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}lsp_probe`,
    description:
      'Probe the workspace for available language servers (by checking command availability via `--help`/`--version`). Returns which configured LSP servers are installed and runnable.',
    parameters: {
      cwd: { type: 'string', description: 'Optional subdirectory inside the workspace to probe from.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          servers: {
            type: 'array',
            required: true,
            description: 'Probe results per configured server.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                language: { type: 'string', required: true },
                command: { type: 'string', required: true },
                available: { type: 'boolean', required: true },
                note: { type: 'string' },
              },
            },
          },
        },
      },
      render(_args, value) {
        const lines = ['LSP probe:']
        for (const server of value.servers) {
          const flag = server.available ? 'ok' : 'no'
          lines.push(
            `  [${flag}] ${server.language}: ${server.command}${server.note ? ` — ${server.note}` : ''}`,
          )
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const servers: LspProbeResult[] = []
      for (const server of settings.lspServers) {
        let isAvailable = false
        let note = ''
        try {
          const result = await runCommand(ctx, {
            command: server.command,
            args: ['--version'],
            cwd,
            signal: exec.signal,
            timeoutMs: 8_000,
            maxOutputBytes: 4 * 1024,
          })
          isAvailable = result.exitCode === 0 || result.exitCode !== null
          if (result.timedOut) {
            isAvailable = false
            note = 'timed out'
          }
        } catch (error) {
          isAvailable = false
          note = errorMessage(error).split('\n')[0]!
        }
        servers.push({
          language: server.language,
          command: server.command,
          available: isAvailable,
          note,
        })
      }
      return { servers }
    },
  })
}
