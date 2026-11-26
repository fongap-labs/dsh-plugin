import type {
  CapabilityModule, CapabilityMatchRequest, CapabilityResult, ChatMessage, ChatContent,
} from '../types.js'

function text(value: ChatContent): string {
  if (typeof value === 'string') return value
  return value.filter(part => part.type === 'text').map(part => part.text).join('\n')
}

/** Optional, provider-independent instruction layer. It only changes the chat messages. */
export class ModelInstructionCapability implements CapabilityModule {
  readonly id = 'model-instructions'
  readonly version = '1'
  readonly description = 'Consistent instruction-following and evidence-boundary guidance'
  readonly inputModalities = ['text', 'image', 'audio', 'video', 'file'] as const
  readonly priority = 10

  constructor(private readonly prompt: string, private readonly mode: 'prepend' | 'append') {}

  canHandle({ messages }: CapabilityMatchRequest): boolean {
    return !messages.some(message => message.role === 'system' && text(message.content).includes('<delta-suite-instructions>'))
  }

  async invoke({ messages }: Parameters<CapabilityModule['invoke']>[0]): Promise<CapabilityResult> {
    const content = `<delta-suite-instructions>\n${this.prompt}\n</delta-suite-instructions>`
    const existingIndex = messages.findIndex(message => message.role === 'system')
    if (this.mode === 'append' && existingIndex >= 0) {
      const existing = messages[existingIndex]
      const existingText = text(existing.content)
      const next: ChatMessage = { ...existing, content: existingText ? `${existingText}\n\n${content}` : content }
      return { messages: messages.map((message, index) => index === existingIndex ? next : message), metadata: { instructionMode: 'append' } }
    }
    return {
      messages: [{ role: 'system', content }, ...messages],
      metadata: { instructionMode: 'prepend' },
    }
  }
}
