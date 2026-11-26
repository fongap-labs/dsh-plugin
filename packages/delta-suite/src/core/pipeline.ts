import type {
  BridgeRuntime, CapabilityMatchRequest, ChatMessage, PipelineRequest, PipelineResult, RequestPipeline,
} from '../types.js'

function copyMetadata(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { ...value }
}

/** Composes independent capabilities before a provider receives a request. */
export class ModelCapabilityPipeline implements RequestPipeline {
  constructor(private readonly runtime: BridgeRuntime) {}

  async prepare(input: PipelineRequest): Promise<PipelineResult> {
    let messages: readonly ChatMessage[] = input.messages
    const appliedCapabilities: string[] = []
    const metadata: Record<string, unknown> = {}
    if (!this.runtime.permissions.allows('capability-execution')) {
      return { messages, appliedCapabilities, metadata }
    }
    for (const capability of this.runtime.capabilities.list()) {
      const match: CapabilityMatchRequest = { model: input.model, request: input.request, messages }
      if (!(await capability.canHandle(match))) continue
      const result = await capability.invoke({ ...match, signal: input.signal })
      if (result.messages) messages = result.messages
      if (result.metadata) Object.assign(metadata, result.metadata)
      appliedCapabilities.push(capability.id)
    }
    return { messages, appliedCapabilities, metadata: copyMetadata(metadata) }
  }
}
