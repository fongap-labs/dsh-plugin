/** Read-only context projection for the single browser bundle. */
interface AssistantChatSnapshot {
  legacy?: { nodes?: readonly Record<string, any>[] }
  nodes?: { values(): readonly Record<string, any>[] }
  timeline?: { turnOrder?: readonly number[] }
}

function readContextUsage(value: unknown): { percent: number; used: number; capacity: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const pressure = value as Record<string, unknown>
  const used = typeof pressure.projectedTokens === 'number' ? pressure.projectedTokens
    : typeof pressure.pressureTokens === 'number' ? pressure.pressureTokens : undefined
  const capacity = typeof pressure.contextWindow === 'number' ? pressure.contextWindow : undefined
  if (used === undefined || capacity === undefined || capacity <= 0) return undefined
  return { percent: Math.min(100, Math.round(used / capacity * 100)), used, capacity }
}
function messageText(node: Record<string, any>): string {
  const data = (node.data && typeof node.data === 'object' ? node.data : node) as Record<string, any>
  if (Array.isArray(data.blocks)) return data.blocks.flatMap((block: any) =>
    block?.kind === 'text' && typeof block.text === 'string' ? [block.text] : []).join('')
  if (Array.isArray(data.content)) return data.content.flatMap((part: any) =>
    part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('')
  if (typeof data.summary === 'string') return data.summary
  return ''
}
function compactionCheckpointSource(node: Record<string, any>): boolean {
  const data = (node.data && typeof node.data === 'object' ? node.data : node) as Record<string, any>
  const sources = [node.source, data.source, data.message?.source, data.finalNode?.source,
    data.finalNode?.data?.source, data.node?.source]
  return sources.some(source => source?.kind === 'compact-checkpoint')
}
function isCompactionCheckpoint(node: Record<string, any>): boolean {
  return node.kind === 'compaction' || compactionCheckpointSource(node)
}
function conversationContext(chat: AssistantChatSnapshot | undefined, maxChars = 6000): string {
  const nodes = chat?.legacy?.nodes
  if (!Array.isArray(nodes)) return ''
  const excerpts = nodes.flatMap((node) => {
    if (!node || typeof node !== 'object') return []
    const text = messageText(node).trim()
    if (!text) return []
    const kind = isCompactionCheckpoint(node) ? 'Checkpoint'
      : node.kind === 'user' || node.kind === 'steering' ? 'User'
      : node.kind === 'assistant' ? 'Assistant'
        : undefined
    return kind ? [`${kind}: ${text.slice(0, 1600)}`] : []
  })
  let result = ''
  for (const item of excerpts.slice(-8)) {
    const next = result ? `${result}\n\n${item}` : item
    if (next.length > maxChars) {
      const remaining = maxChars - result.length - (result ? 2 : 0)
      if (remaining > 120) result = `${result}${result ? '\n\n' : ''}${item.slice(-remaining)}`
      break
    }
    result = next
  }
  return result
}
function latestCheckpoint(chat: AssistantChatSnapshot | undefined): { summary: string; count?: number; tokens?: number } | undefined {
  const nodes = chat?.legacy?.nodes ?? []
  const node = nodes.filter(value => value && typeof value === 'object' && isCompactionCheckpoint(value)).at(-1)
  const summary = node ? messageText(node) || (typeof node.summary === 'string' ? node.summary
    : typeof node.data?.summary === 'string' ? node.data.summary : undefined) : undefined
  if (!summary) return undefined
  const shadowedItemCount = node?.shadowedItemCount ?? node?.data?.shadowedItemCount
  const shadowedTokenCount = node?.shadowedTokenCount ?? node?.data?.shadowedTokenCount
  return { summary,
    ...(typeof shadowedItemCount === 'number' ? { count: shadowedItemCount } : {}),
    ...(typeof shadowedTokenCount === 'number' ? { tokens: shadowedTokenCount } : {}) }
}
function latestAssistantMessageId(chat: AssistantChatSnapshot | undefined): string | undefined {
  const nodes = chat?.nodes?.values?.() ?? []
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    const data = node?.data as Record<string, any> | undefined
    const id = data?.finalNode?.messageId ?? data?.messageId
    if (node?.kind === 'assistant-step' && typeof id === 'string') return id
  }
  return undefined
}
