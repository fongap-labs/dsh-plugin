import type { IncomingMessage, ServerResponse } from 'node:http'
import { deltaMemory, type MemoryInput, type MemoryQuery, type MemorySettings } from './memory.js'

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void
type Register = (path: string, handler: Handler) => void
const MAX_BODY = 2 * 1024 * 1024
const send = (res: ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const part of req) {
    size += part.length
    if (size > MAX_BODY) throw new Error('memory payload too large')
    chunks.push(part)
  }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid memory request')
  return data as Record<string, unknown>
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const requireId = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 100 || value.length === 0) throw new Error('invalid memory id')
  return value
}
export function registerMemoryRoutes(route: Register): void {
  route('/dsh-ui-delta/memory', async (req, res) => {
    try {
      if (req.method === 'GET') {
        // Management displays only global scope by default. Other scopes
        // require an explicit query filter; model tools have stricter scope rules.
        const url = new URL(req.url || '/', 'http://localhost')
        const scope = url.searchParams.get('scope') || 'global'
        const scopeId = url.searchParams.get('scopeId') || ''
        const query = url.searchParams.get('q') || ''
        const limit = Number(url.searchParams.get('limit') || '30')
        const items = query
          ? (await deltaMemory.search({ query, projectId: scope === 'project' ? scopeId : '',
              sessionId: scope === 'session' ? scopeId : '', limit }))
              .filter(item => item.scope === scope && item.scopeId === scopeId)
          : await deltaMemory.list({ scope, scopeId, limit })
        return send(res, 200, { items })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const payload = await body(req)
      switch (payload.action) {
        case 'save': {
          if (!isRecord(payload.memory)) throw new Error('memory required')
          const record = await deltaMemory.save(payload.memory as MemoryInput)
          return send(res, 200, { memory: record })
        }
        case 'delete':
          return send(res, 200, { deleted: await deltaMemory.remove(requireId(payload.id)) })
        case 'import':
          return send(res, 200, await deltaMemory.import(payload.data))
        case 'settings':
          if (!isRecord(payload.settings)) throw new Error('settings required')
          return send(res, 200, { settings: await deltaMemory.setSettings(payload.settings as MemorySettings) })
        default:
          return send(res, 400, { error: 'unknown memory action' })
      }
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : 'memory operation failed' })
    }
  })
  route('/dsh-ui-delta/memory/scopes', async (req, res) => {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    try { return send(res, 200, { scopes: await deltaMemory.scopes() }) }
    catch (error) { return send(res, 503, { error: String(error) }) }
  })
  route('/dsh-ui-delta/memory/settings', async (req, res) => {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    try { return send(res, 200, { settings: await deltaMemory.settings() }) }
    catch (error) { return send(res, 503, { error: String(error) }) }
  })
  route('/dsh-ui-delta/memory/export', async (req, res) => {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    try { return send(res, 200, await deltaMemory.export()) }
    catch (error) { return send(res, 503, { error: String(error) }) }
  })
}
