import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { publicView, updateConfig } from './config.js'
import { readFolderView, mutateFolderView, forgetDeletedSession, countMissingAssignments, pruneMissingAssignments, FolderConflictError, type FolderAction } from './folders.js'
import { generateImage } from './image-gen.js'
import { recognizeImage } from './vision.js'
import { mainModelView } from './main-model.js'
import { searchWeb, researchWeb } from './search.js'
import { detectDdgsDependencies } from './python-ddgs.js'
import { collectEvidence, type HostFetch } from './research-fetch.js'
import { digestEvidence } from './evidence-analysis.js'
import { deleteColdSession } from './session-delete.js'
import { registerMemoryRoutes } from './memory-routes.js'
import { listSkills, mutateSkill, listSkillRevisions, restoreSkillRevision, type SkillAction } from './skills.js'
import { previewGithubSkill, previewZipSkill } from './skill-import.js'

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
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function registerRoutes(ctx: Context): void {
  // without a web server there is nowhere to serve the routes; the plugin stays inert
  const webServer = ctx?.webServer
  if (!webServer) return
  let modelContext = ctx
  const optionalContext = ctx as unknown as {
    inject?: (dependencies: string[], callback: (child: unknown) => void) => unknown
  }
  optionalContext.inject?.(['settings', 'credentials', 'llm', 'agentDefaultModel'], (child) => {
    modelContext = child as Context
  })

  // Reuse the Host's selected fetch provider; no second networking stack.
  let hostFetch: HostFetch | undefined
  optionalContext.inject?.(['web'], (child) => {
    const service = (child as { web?: { fetch?: HostFetch } }).web
    if (typeof service?.fetch === 'function') {
      hostFetch = (request, signal) => service.fetch!(request, signal)
    }
  })

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

  registerMemoryRoutes(route)

  // Native skills registry, supplied by Harness when mounted. Missing services
  // must not abort Delta settings or conversation boot.
  let skillsRegistry: Parameters<typeof listSkills>[0]
  optionalContext.inject?.(['skills'], (child) => {
    skillsRegistry = (child as { skills?: typeof skillsRegistry }).skills
  })
  route('/dsh-ui-delta/skills', async (req, res) => {
    if (req.method === 'GET') return sendJson(res, 200, await listSkills(skillsRegistry))
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, 160 * 1024)).toString('utf8') || '{}') as SkillAction
    try { return sendJson(res, 200, await mutateSkill(body)) }
    catch (error) { return sendJson(res, 400, { error: errorMessage(error) }) }
  })

  route('/dsh-ui-delta/skills/import-preview', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    try {
      const mime = String(req.headers['content-type'] || '')
      if (mime.startsWith('application/zip')) {
        const archive = await readBody(req, 2_000_000)
        return sendJson(res, 200, previewZipSkill(archive))
      }
      if (!mime.startsWith('application/json')) return sendJson(res, 415, { error: 'Expected JSON or ZIP' })
      const payload = JSON.parse((await readBody(req, 2048)).toString('utf8')) as { githubUrl?: string }
      return sendJson(res, 200, await previewGithubSkill(payload.githubUrl ?? ''))
    } catch (error) { return sendJson(res, 400, { error: errorMessage(error) }) }
  })
  route('/dsh-ui-delta/skills/revisions', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    try {
      const payload = JSON.parse((await readBody(req, 2048)).toString('utf8')) as
        { name: string; action: 'list' | 'restore'; revision?: string }
      if (payload.action === 'list') return sendJson(res, 200, await listSkillRevisions(payload.name))
      if (payload.action === 'restore') return sendJson(res, 200, await restoreSkillRevision(payload.name, payload.revision ?? ''))
      return sendJson(res, 400, { error: 'Unknown revision action' })
    } catch (error) { return sendJson(res, 400, { error: errorMessage(error) }) }
  })

  const configView = async () => ({ ...publicView(), mainModel: await mainModelView(modelContext) })

  route('/dsh-ui-delta/config', async (req, res) => {
    if (req.method === 'GET') return sendJson(res, 200, await configView())
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
      await updateConfig(body)
      return sendJson(res, 200, await configView())
    }
    return sendJson(res, 405, { error: 'method not allowed' })
  })

  route('/dsh-ui-delta/folders', async (req, res) => {
    if (req.method === 'GET') {
      try { return sendJson(res, 200, readFolderView()) }
      catch (error) { return sendJson(res, 409, { error: errorMessage(error) }) }
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    try {
      const payload = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}') as FolderAction & { expectedRevision?: string }
      return sendJson(res, 200, mutateFolderView(payload))
    } catch (error) {
      return sendJson(res, error instanceof FolderConflictError ? 409 : 400, { error: errorMessage(error) })
    }
  })

  // Session disposal is not durable deletion. Only confirmed persisted IDs
  // plus currently active sessions can authorize a manual orphan cleanup.
  const knownSessionIds = async (): Promise<Set<string>> => {
    const host = ctx as unknown as { get?: (name: string) => unknown }
    const persistence = host.get?.('sessionPersistence') as {
      list?: () => Promise<Array<{ id?: string; header?: { id?: string } }>>
    } | undefined
    const sessions = host.get?.('sessions') as { get?: (id: string) => unknown } | undefined
    if (!persistence?.list || !sessions?.get) {
      throw new Error('Host session persistence and live session registry required')
    }
    const rows = await persistence.list()
    if (!Array.isArray(rows)) throw new Error('Host session persistence listing unavailable')
    const ids = new Set<string>()
    for (const row of rows) {
      const id = row?.header?.id || row?.id
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('Host session persistence listing incomplete')
      }
      ids.add(id)
    }
    // Include sessions that exist in Host memory but are not yet persisted.
    for (const id of Object.keys(readFolderView().assignments)) {
      if (sessions.get(id) !== undefined) ids.add(id)
    }
    return ids
  }

  route('/dsh-ui-delta/folder-cleanup', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return sendJson(res, 405, { error: 'method not allowed' })
    }
    try {
      const known = await knownSessionIds()
      if (req.method === 'GET') {
        const view = readFolderView()
        return sendJson(res, 200, {
          missingCount: countMissingAssignments(known, view),
          revision: view.revision,
        })
      }
      const body = JSON.parse((await readBody(req, 2048)).toString('utf8') || '{}') as {
        expectedRevision?: string
      }
      if (typeof body.expectedRevision !== 'string' || body.expectedRevision.length !== 64) {
        return sendJson(res, 400, { error: 'Folder revision is required' })
      }
      const result = pruneMissingAssignments(known, body.expectedRevision)
      return sendJson(res, 200, { ...result.view, removedCount: result.removedCount })
    } catch (error) {
      const status = error instanceof FolderConflictError ? 409 : 503
      return sendJson(res, status, { error: errorMessage(error) })
    }
  })

  route('/dsh-ui-delta/vision', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const mime = String(req.headers['content-type'] || '')
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mime)) {
      return sendJson(res, 415, { error: 'image required' })
    }
    const bytes = await readBody(req, MAX_IMAGE_BYTES)
    return sendJson(res, 200, { text: await recognizeImage(bytes, mime, modelContext) })
  })

  route('/dsh-ui-delta/image-generate', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return sendJson(res, 400, { error: 'prompt required' })
    return sendJson(res, 200, await generateImage(prompt, body.size, modelContext))
  })

  // Read-only dependency guidance. Never triggers installs or downloads.
  route('/dsh-ui-delta/ddgs-status', async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
    return sendJson(res, 200, await detectDdgsDependencies())
  })

  route('/dsh-ui-delta/search', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const query = String(body.query || '').trim().slice(0, 500)
    if (query === '') return sendJson(res, 400, { error: 'query required' })
    return sendJson(res, 200, { results: await searchWeb(query) })
  })

  route('/dsh-ui-delta/research', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const query = String(body.query || '').trim().slice(0, 500)
    if (!query) return sendJson(res, 400, { error: 'query required' })
    const report = await researchWeb(query)
    const pages = await collectEvidence(report.results, hostFetch, undefined, 5)
    const analysis = digestEvidence(query, pages.evidence)
    return sendJson(res, 200, { ...report, ...pages, analysis })

  })

  route('/dsh-ui-delta/session-delete', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const id = typeof body.sessionId === 'string' ? body.sessionId : ''
    try {
      await deleteColdSession(ctx as unknown as Parameters<typeof deleteColdSession>[0], id)
      // Session deletion has committed. Folder cleanup is best effort and must
      // not claim that the deleted Session still exists if its folder lock is busy.
      let isFolderCleanupComplete = true
      try { forgetDeletedSession(id) }
      catch (error) {
        isFolderCleanupComplete = false
        console.warn('[dsh-ui-delta] session folder cleanup deferred:', errorMessage(error))
      }
      return sendJson(res, 200, { ok: true, folderCleanup: isFolderCleanupComplete })
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
