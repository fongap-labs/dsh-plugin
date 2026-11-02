import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { publicView, updateConfig } from './config.js'
import { recognizeImage } from './vision.js'
import { searchWeb } from './search.js'
import { deleteColdSession } from './session-delete.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional host web server; without it the plugin stays inert. */
    webServer?: WebServerService
  }
}

/** Route registration accepted by the host web server. */
interface WebServerRoute {
  name: string
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** The subset of the host web server service this plugin relies on. */
interface WebServerService {
  register(route: WebServerRoute): unknown
}

const PLUGIN_DIR = fileURLToPath(new URL('../..', import.meta.url))
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_CONFIG_BYTES = 64 * 1024
const ROUTE_REFUSAL = 'dsh-ui-delta: request refused'
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// Same fence as the modlens routes: loopback host only, and no cross-site request.
const isLoopbackHost = (hostname: string): boolean =>
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)

const isTrustedRequest = (req: IncomingMessage): boolean => {
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHost(hostUrl.hostname)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

const readBody = async (req: IncomingMessage, limit: number): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function registerRoutes(ctx: Context): void {
  // without a web server there is nowhere to serve the routes; the plugin stays inert
  const webServer = ctx?.webServer
  if (!webServer) return

  const route = (
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
  ): void => {
    try {
      webServer.register({
        name: `dsh-ui-delta${path.replace(/\//g, '-')}`,
        kind: 'exact',
        path,
        handler: async (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { error: ROUTE_REFUSAL })
            return
          }
          try {
            await handler(req, res)
          } catch (error) {
            // errors carry no key and no request body
            sendJson(res, 500, { error: errorMessage(error) })
          }
        },
      })
    } catch (error) {
      if (errorMessage(error).includes('duplicate')) {
        return
      }
      throw error
    }
  }

  route('/dsh-ui-delta/config', async (req, res) => {
    if (req.method === 'GET') return sendJson(res, 200, publicView())
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
      return sendJson(res, 200, await updateConfig(body))
    }
    return sendJson(res, 405, { error: 'method not allowed' })
  })

  route('/dsh-ui-delta/vision', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const mime = String(req.headers['content-type'] || '')
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mime)) {
      return sendJson(res, 415, { error: 'image required' })
    }
    const bytes = await readBody(req, MAX_IMAGE_BYTES)
    return sendJson(res, 200, { text: await recognizeImage(bytes, mime) })
  })

  route('/dsh-ui-delta/search', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const query = String(body.query || '').trim().slice(0, 500)
    if (query === '') return sendJson(res, 400, { error: 'query required' })
    return sendJson(res, 200, { results: await searchWeb(query, ctx as unknown as { get?: (name: string) => unknown }) })
  })

  route('/dsh-ui-delta/session-delete', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const id = typeof body.sessionId === 'string' ? body.sessionId : ''
    try {
      await deleteColdSession(ctx as unknown as Parameters<typeof deleteColdSession>[0], id)
      return sendJson(res, 200, { ok: true })
    } catch (error) {
      return sendJson(res, 409, { error: errorMessage(error) })
    }
  })

  // version endpoint: client polls once on load to detect if a new version is on disk
  route('/dsh-ui-delta/version', async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
    try {
      const manifest = JSON.parse(
        readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8'),
      ) as { version?: string }
      return sendJson(res, 200, { version: manifest.version })
    } catch {
      return sendJson(res, 500, { error: 'version unreadable' })
    }
  })
}
