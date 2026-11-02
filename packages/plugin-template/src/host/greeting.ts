/** A replaceable sample tool, not a requirement for generated plugins. */
import { defineTool } from '@fongap-labs/shared'

export function createGreetingTool(toolName: string, greeting: string) {
  return defineTool({
    name: toolName,
    description: 'Return the configured greeting for a supplied name (example tool).',
    parameters: {
      name: { type: 'string', required: true, description: 'Recipient of the greeting.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string', required: true } },
      },
      render: (_args, result) => [{ type: 'text', text: result.text }],
    },
    async execute(args) {
      return { text: `${greeting}, ${args.name}!` }
    },
  })
}
