import type { OpenAICompatibleApi } from './api/openai-compatible-api.js'
import type { BridgeHostContext, BridgeLogger, CredentialResolver } from './types.js'

interface WebServer {
  register?: (route: {
    path: string
    methods?: string[]
    requestBody?: string
    handler: (request: unknown, response: any) => Promise<void> | void
  }) => (() => void) | void
}

function responseJson(response: any, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function requestBody(request: any): Promise<unknown> {
  if (request && typeof request.body === 'object' && request.body !== null) return request.body
  if (typeof request?.body === 'string') {
    try { return JSON.parse(request.body) } catch { return undefined }
  }
  if (typeof request?.json === 'function') return request.json()
  return undefined
}

function secretFallback(): CredentialResolver {
  return { resolve: async () => undefined }
}

export interface HostAdapter {
  logger: BridgeLogger
  fetch: typeof globalThis.fetch
  credentials: CredentialResolver
  registerApi(api: OpenAICompatibleApi, pathPrefix: string): () => void
}

/** Detects only public optional Host services; missing services leave the plugin inert. */
export function createHostAdapter(ctx: BridgeHostContext): HostAdapter {
  const logger = ctx.logger ?? {}
  const fetcher = ctx.fetch ?? globalThis.fetch
  if (typeof fetcher !== 'function') throw new Error('Delta Suite requires the Host or Node fetch API')
  const credentials = ctx.credentials ?? secretFallback()
  return {
    logger,
    fetch: fetcher,
    credentials,
    registerApi(api, pathPrefix) {
      let isActive = true
      const registered: (() => void)[] = []
      let injection: unknown
      const registerScope = (scope: unknown) => {
        if (!isActive) return () => {}
        const webServer = (scope as { webServer?: WebServer } | undefined)?.webServer
        if (!webServer || typeof webServer.register !== 'function') {
          logger.warn?.('delta-suite: webServer service unavailable; API routes disabled')
          return () => {}
        }
        const register = (suffix: string, method: string, handler: (request: unknown) => Promise<unknown>) => {
          const disposer = webServer.register?.({
            path: pathPrefix.replace(/\/$/, '') + suffix,
            methods: [method],
            requestBody: 'buffered',
            async handler(request, response) {
              try {
                const result = await handler(request)
                const payload = result as { status?: number; json?: unknown; stream?: AsyncIterable<unknown> }
                if (payload.stream) {
                  response.writeHead(payload.status ?? 200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                  })
                  for await (const chunk of payload.stream) response.write(`data: ${JSON.stringify(chunk)}\n\n`)
                  response.end('data: [DONE]\n\n')
                } else {
                  responseJson(response, payload.status ?? 200, payload.json ?? {})
                }
              } catch (error) {
                responseJson(response, 500, { error: { message: error instanceof Error ? error.message : String(error) } })
              }
            },
          })
          if (typeof disposer === 'function') registered.push(disposer)
        }
        register('/models', 'GET', () => api.dispatch(pathPrefix + '/models', 'GET'))
        register('/status', 'GET', () => api.dispatch(pathPrefix + '/status', 'GET'))
        register('/chat/completions', 'POST', async request => api.dispatch(
          pathPrefix + '/chat/completions', 'POST', await requestBody(request)))
        return () => {
          for (const dispose of registered.splice(0).reverse()) {
            try { dispose() } catch { /* Host cleanup is best effort */ }
          }
        }
      }
      try {
        injection = ctx.inject?.(['webServer'], registerScope)
      } catch (error) {
        logger.warn?.(`delta-suite: API route registration failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      return () => {
        isActive = false
        if (typeof injection === 'function') {
          try { injection() } catch { /* Host cleanup is best effort */ }
        }
        for (const dispose of registered.splice(0).reverse()) {
          try { dispose() } catch { /* Host cleanup is best effort */ }
        }
      }
    },
  }
}
