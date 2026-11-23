import Schema from '@deepseek-ai/schemastery'

/**
 * Compatibility schema for retired model-policy configuration.
 *
 * The public llm/stream waterfall is read-only for agent-built requests and
 * next() cannot accept a replacement request. Model listing and resolution
 * have no ownership-transfer contract permitting third-party method wrappers.
 * No request-redaction or provider-policy hook is installed here.
 *
 * Local, offline redaction belongs to privacy.ts/redact.ts and is not an LLM
 * transport guarantee.
 */
export const Config = Schema.object({})
