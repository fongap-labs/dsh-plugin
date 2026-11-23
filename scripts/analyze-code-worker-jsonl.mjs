#!/usr/bin/env node
/** Offline DSH session.v4.jsonl analysis. Never emit transcript text, args, paths or credentials. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const MAX_FILE_BYTES = 160 * 1024 * 1024
const MAX_LINE_CHARS = 16 * 1024 * 1024
const MAX_CALLS = 200_000
const MAX_SESSIONS = 12
const MAX_TRACKED = 4096
const NAME = /^[A-Za-z][A-Za-z_0-9:-]{0,63}$/
const isSeq = x => Number.isSafeInteger(x) && x >= 0
const isTime = x => Number.isFinite(x) && x > 0

/** Feed only event shape and derived values; original content is never stored. */
function sessionAccumulator() {
  const s = {
    eventCount: 0, userMessages: 0, toolCalls: 0, codeToolCalls: 0,
    toolResults: 0, toolErrors: 0, modelRetryEvents: 0,
    repeatCandidates: 0, toolCallsAfterLastSummary: 0,
    compactionStarts: 0, compactionSummaries: 0, compactionEnds: 0,
    linkedSummaryCount: 0, compactionDurationMs: [], shadowedTokenCountSum: 0,
    todoWrites: 0, todosAfterLastSummary: 0, todoRefreshedAfterSummary: false,
    firstTime: null, lastTime: null, elapsedMs: null,
    lastSummarySeq: -1, lastTodoSeq: -1, latestTodoStatus: { pending: 0, in_progress: 0, completed: 0 },
    byTool: {},
  }
  const starts = new Map()
  const fingerprints = new Map()
  let postSummaryToolCalls = 0
  let postSummaryTodoWrites = 0
  let priorSeq = -1
  let headerSeen = false
  const accept = event => {
    if (event?.type === 'session' && event.seq === undefined && priorSeq < 0 && !headerSeen) {
      headerSeen = true
      return
    }
    if (!event || typeof event !== 'object' || Array.isArray(event) ||
        !isSeq(event.seq) || typeof event.type !== 'string' || event.seq <= priorSeq) {
      throw Error('invalid or reordered session event')
    }
    priorSeq = event.seq
    s.eventCount++
    const { seq, type } = event
    const d = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {}
    if (isTime(event.time)) {
      s.firstTime = s.firstTime === null ? event.time : Math.min(s.firstTime, event.time)
      s.lastTime = s.lastTime === null ? event.time : Math.max(s.lastTime, event.time)
    }
    if (type === 'user/message' && d.source?.kind === 'user') s.userMessages++
    if (type === 'llm/retry') s.modelRetryEvents++
    if (type === 'tool/call') {
      s.toolCalls++
      if (s.toolCalls > MAX_CALLS) throw Error('too many tool calls')
      const name = typeof d.name === 'string' && NAME.test(d.name) ? d.name : '(other)'
      if (name.startsWith('code_')) s.codeToolCalls++
      s.byTool[name] = (s.byTool[name] ?? 0) + 1
      if (s.lastSummarySeq >= 0) postSummaryToolCalls++
      if (typeof d.arguments === 'string' && d.arguments.length <= MAX_LINE_CHARS) {
        const hash = createHash('sha256').update(name).update('\0').update(d.arguments).digest('hex')
        if (fingerprints.has(hash)) s.repeatCandidates++
        fingerprints.delete(hash)
        fingerprints.set(hash, true)
        if (fingerprints.size > MAX_TRACKED) fingerprints.delete(fingerprints.keys().next().value)
      }
    }
    if (type === 'tool/result') {
      s.toolResults++
      if (d.message?.isError === true) s.toolErrors++
    }
    if (type === 'compaction/start') {
      s.compactionStarts++
      if (typeof d.compactionId === 'string' && d.compactionId.length <= 128 && isTime(event.time)) {
        starts.set(d.compactionId, event.time)
        if (starts.size > 256) starts.delete(starts.keys().next().value)
      }
    }
    if (type === 'compaction/summary') {
      s.compactionSummaries++
      s.lastSummarySeq = seq
      postSummaryToolCalls = 0
      postSummaryTodoWrites = 0
      if (typeof d.compactionId === 'string' && starts.has(d.compactionId)) {
        s.linkedSummaryCount++
        const duration = event.time - starts.get(d.compactionId)
        if (Number.isFinite(duration) && duration >= 0) s.compactionDurationMs.push(duration)
        starts.delete(d.compactionId)
      }
      if (Number.isSafeInteger(d.shadowedTokenCount) && d.shadowedTokenCount >= 0) {
        s.shadowedTokenCountSum += d.shadowedTokenCount
      }
    }
    if (type === 'compaction/end') s.compactionEnds++
    if (type === 'todo/write') {
      s.todoWrites++
      s.lastTodoSeq = seq
      if (s.lastSummarySeq >= 0) postSummaryTodoWrites++
      const todos = Array.isArray(d.todos) ? d.todos : []
      s.latestTodoStatus = { pending: 0, in_progress: 0, completed: 0 }
      for (const x of todos.slice(0, 128)) {
        const status = x && typeof x === 'object' ? x.status : undefined
        if (status === 'pending' || status === 'in_progress' || status === 'completed') s.latestTodoStatus[status]++
      }
    }
  }
  const finish = () => {
    s.todoRefreshedAfterSummary = s.lastSummarySeq >= 0 && s.lastTodoSeq > s.lastSummarySeq
    // Counts are chronological by event seq. Summaries from overlapping exports cannot be pooled.
    s.todosAfterLastSummary = postSummaryTodoWrites
    s.toolCallsAfterLastSummary = postSummaryToolCalls
    s.elapsedMs = s.firstTime === null || s.lastTime === null ? null : s.lastTime - s.firstTime
    s.byTool = Object.fromEntries(Object.entries(s.byTool).sort(([a], [b]) => a.localeCompare(b, 'en')))
    if (s.compactionDurationMs.length) {
      const sorted = s.compactionDurationMs.toSorted((a, b) => a - b)
      s.compactionMedianMs = sorted[Math.floor((sorted.length - 1) / 2)]
    } else s.compactionMedianMs = null
    delete s.compactionDurationMs
    return s
  }
  return { accept, finish }
}

export function analyzeSessionEvents(events) {
  const a = sessionAccumulator()
  for (const event of events) a.accept(event)
  return a.finish()
}

/** Stream bounded extracted JSONL; never load or output session text. */
export async function analyzeJsonlFiles(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_SESSIONS) {
    throw Error('expected 1..12 extracted session.v4.jsonl paths')
  }
  const sessions = []
  for (const path of paths) {
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) throw Error('session exceeds safe file limit')
    const input = createReadStream(path, { encoding: 'utf8' })
    const rl = createInterface({ input, crlfDelay: Infinity })
    const a = sessionAccumulator()
    let lines = 0
    try {
      for await (const line of rl) {
        if (line.length > MAX_LINE_CHARS) throw Error('session line exceeds safe limit')
        if (!line.trim()) continue
        let event
        try { event = JSON.parse(line) } catch { throw Error('invalid session JSONL') }
        a.accept(event)
        if (++lines > 250_000) throw Error('too many session events')
      }
    } finally { rl.close(); input.destroy() }
    sessions.push(a.finish())
  }
  return {
    schemaVersion: 1,
    interpretation: 'Offline main-session event counts only. No completion, permission, compaction-quality or causal advantage inferred. Compare only controlled independent sessions; never pool overlapping exports.',
    sessions,
  }
}

function argsParser(values) {
  const paths = []
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== '--session' || !values[i + 1] || values[i + 1].startsWith('--')) {
      throw Error('usage: node scripts/analyze-code-worker-jsonl.mjs --session FILE [--session FILE]')
    }
    paths.push(values[++i])
  }
  return paths
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await analyzeJsonlFiles(argsParser(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) {
    console.error('Session event analysis failed: ' + (error instanceof Error ? error.message : 'unknown error'))
    process.exitCode = 1
  }
}
