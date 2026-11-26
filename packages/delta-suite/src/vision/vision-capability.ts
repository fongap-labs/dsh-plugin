import { VisionBridge } from './vision-bridge.js'
import type {
  CapabilityModule, CapabilityMatchRequest, CapabilityResult, BridgeRuntime, ChatContent,
} from '../types.js'

function hasImage(content: ChatContent): boolean {
  return typeof content !== 'string' && content.some(part => part.type === 'image_url' || part.type === 'input_image')
}

/** Registry adapter around the existing visual evidence implementation. */
export class VisionCapability implements CapabilityModule {
  readonly id = 'vision-evidence'
  readonly version = '1'
  readonly description = 'Cached structured visual evidence for non-native image paths'
  readonly inputModalities = ['image'] as const
  readonly priority = 100
  private readonly bridge: VisionBridge

  constructor(runtime: BridgeRuntime) {
    this.bridge = new VisionBridge(runtime)
  }

  canHandle({ model, messages }: CapabilityMatchRequest): boolean {
    return model.capabilities.input?.image !== true
      && messages.some(message => hasImage(message.content))
  }

  async invoke({ model, messages }: Parameters<CapabilityModule['invoke']>[0]): Promise<CapabilityResult> {
    return { messages: await this.bridge.prepareMessages(model, messages), metadata: { evidenceBoundary: 'structured' } }
  }

  dispose(): void {
    this.bridge.clear()
  }
}
