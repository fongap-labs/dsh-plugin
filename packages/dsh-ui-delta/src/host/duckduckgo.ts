/**
 * Stable provider ID and request types for existing Harness profiles.
 * Search execution now lives in python-ddgs.ts and uses the PyPI ddgs package.
 */
export const DUCKDUCKGO_PROVIDER_ID = 'delta-duckduckgo'

export interface SearchRequest {
  readonly query: string
  readonly maxResults?: number
}
