/** Configuration is validated once at the Host boundary; examples remain opt-in. */
export interface TemplateConfig {
  enabled?: boolean
  greeting?: string
  systemPromptText?: string
  promptOrder?: number
}

export interface TemplateSettings {
  enabled: boolean
  greeting: string
  systemPromptText: string
  promptOrder?: number
}

export function normalizeTemplateConfig(config?: TemplateConfig | null): TemplateSettings {
  const input = config && typeof config === 'object' ? config : {}
  const greeting = typeof input.greeting === 'string' && input.greeting.trim()
    ? input.greeting.trim() : 'hello'
  const text = typeof input.systemPromptText === 'string' ? input.systemPromptText.trim() : ''
  const promptOrder = typeof input.promptOrder === 'number' && Number.isFinite(input.promptOrder)
    ? input.promptOrder : undefined
  return {
    enabled: input.enabled !== false,
    greeting,
    systemPromptText: text,
    ...(promptOrder === undefined ? {} : { promptOrder }),
  }
}
