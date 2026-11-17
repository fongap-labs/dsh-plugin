/** DSH-specific call signature adaptation. This is not a capability probe or a version whitelist. */
import type { DeltaFileWriteContract } from '../../contracts/files.js'
import type { HostFsCapabilities, HostWriteIntent } from './host-fs.js'

export async function writeDshHostText(
  fs: HostFsCapabilities,
  target: unknown,
  content: string,
  signal: AbortSignal,
  contract: DeltaFileWriteContract,
  intent?: HostWriteIntent,
): Promise<unknown> {
  if (typeof fs.writeText !== 'function') throw new Error('DSH Host FS writeText unavailable')
  if (contract === 'guarded-intent') {
    if (!intent) throw new Error('guarded-intent requires an explicit write guard')
    return fs.writeText(target, content, intent, signal)
  }
  if (intent) throw new Error('pinned intent cannot be used for an unconditional write')
  if (contract === 'native-unguarded') {
    // The public FileSystem API uses an omitted expected argument for
    // unconditional writes; signal remains the fourth parameter.
    return fs.writeText(target, content, undefined, signal)
  }
  return fs.writeText(target, content, 'overwrite', signal)
}
