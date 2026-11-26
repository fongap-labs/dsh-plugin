import type { BridgeRuntime, ProviderConfig, ProviderClient } from '../types.js'
import { OpenAICompatibleProvider } from './openai-compatible.js'

/** All first-party providers deliberately share the public OpenAI-compatible adapter. */
export function createProvider(config: ProviderConfig, runtime: BridgeRuntime): ProviderClient {
  return new OpenAICompatibleProvider(config, {
    fetch: runtime.fetch,
    credentials: runtime.credentials,
    logger: runtime.logger,
  })
}
