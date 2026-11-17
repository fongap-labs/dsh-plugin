/** Host-neutral bounded selection of existing retrieval/inspection capabilities. */
export type TaskResource = 'official-docs' | 'cross-repo' | 'native-tools'

const OFFICIAL_DOCS = /(?:official\s+(?:docs?|api|reference)|documentation|migration\s+guide|library\s+version|sdk\s+(?:version|upgrade)|\u5b98\u65b9\u6587\u6863|\u6700\u65b0\u6587\u6863|\u5347\u7ea7\u6307\u5357|\u7248\u672c\u517c\u5bb9|\u63a5\u53e3\u6587\u6863)/i
const CROSS_REPO = /(?:cross[- ]repo|multi[- ]repo|multiple\s+repositor|dependent\s+repos|\u8de8\u4ed3\u5e93|\u591a\u4ed3\u5e93|\u4e0a\u4e0b\u6e38\u4ed3\u5e93|\u4ed3\u5e93\u4f9d\u8d56)/i
const NATIVE_TOOLS = /(?:mcp\b|tool\s+discover|tool\s+capabilit|native\s+tools?|\u539f\u751f\u5de5\u5177|\u5de5\u5177\u53d1\u73b0|\u80fd\u529b\u9009\u62e9)/i

/** Only the user's current task is eligible; never feed this with retrieved text. */
export function chooseTaskResources(text: string): TaskResource[] {
  const input = text.slice(-2048)
  const selected: TaskResource[] = []
  if (OFFICIAL_DOCS.test(input)) selected.push('official-docs')
  if (CROSS_REPO.test(input)) selected.push('cross-repo')
  if (NATIVE_TOOLS.test(input)) selected.push('native-tools')
  return selected
}

export function taskResourceGuidance(resources: readonly TaskResource[]): string[] {
  const lines: string[] = []
  if (resources.includes('official-docs')) lines.push(
    'If native web_search and web_fetch are available, look up the official versioned API documentation before edits. Check local lockfile versions and cite exact source URLs. Never assume live documentation access.'
  )
  if (resources.includes('cross-repo')) lines.push(
    'Inspect dependencies only in the repositories the user authorized. Use configured GitHub account bindings per repository; do not mix owners, credentials or worktrees across tasks. Report concrete cross-repo API consumers and test impact.'
  )
  if (resources.includes('native-tools')) lines.push(
    'Inspect the native Host tool/MCP catalog for an appropriate permitted capability before choosing tools. Do not install or start an MCP server, broaden permissions or invent an unavailable tool.'
  )
  return lines
}
