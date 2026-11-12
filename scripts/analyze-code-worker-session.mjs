#!/usr/bin/env node
/**
 * Offline analysis of DSH Markdown session exports.
 * No network, telemetry or stored raw arguments/results.
 * These counts never establish task completion or a causal improvement.
 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const TOOL = /^\*\*Tool: \x60([^\x60\r\n]+)\x60\*\*[ \t]*$/gm
const RESULT = /^\*\*Result(?: \(error\))?\*\*[ \t]*$/m
const JSON_ARGS = /^\x60\x60\x60json[ \t]*\r?\n([\s\S]*?)\r?\n\x60\x60\x60[ \t]*$/m
const EXIT = /\[exit code:\s*(-?\d+)\]/g
const MAX_BYTES = 20 * 1024 * 1024

function counters() {
  return { toolCalls: 0, codeWorkerCalls: 0, nativeOrOtherCalls: 0,
    explicitToolErrors: 0, nonzeroExitCalls: 0, observedFailedCalls: 0,
    repeatCandidates: 0, repeatsAfterObservedFailure: 0,
    unparsedArguments: 0, missingResults: 0, byTool: {} }
}
function signature(name, input) {
  const match = JSON_ARGS.exec(input)
  if (!match) return undefined
  try {
    const args = JSON.parse(match[1])
    return createHash('sha256').update(name).update('\0')
      .update(JSON.stringify(args)).digest('hex')
  } catch { return undefined }
}
export function analyzeTranscript(source) {
  if (typeof source !== 'string') throw TypeError('transcript must be text')
  const matches = [...source.matchAll(TOOL)]
  const result = counters()
  const previous = new Map()
  for (let i = 0; i < matches.length; i++) {
    const hit = matches[i]
    const name = hit[1]
    const end = matches[i + 1]?.index ?? source.length
    const section = source.slice(hit.index + hit[0].length, end)
    const marker = RESULT.exec(section)
    const input = marker ? section.slice(0, marker.index) : section
    const output = marker
      ? section.slice(marker.index + marker[0].length).split(/^\*\*Assistant\*\*[ \t]*$/m, 1)[0] : ''
    const isError = marker?.[0].includes('(error)') === true
    const hasNonzeroExit = [...output.matchAll(EXIT)].some(m => Number(m[1]) !== 0)
    const isFailure = isError || hasNonzeroExit
    result.toolCalls++
    if (name.startsWith('code_')) result.codeWorkerCalls++
    else result.nativeOrOtherCalls++
    // Report tool categories only, never input or tool result content.
    const safeName = /^[a-zA-Z][a-zA-Z_0-9:-]{0,63}$/.test(name) ? name : '(other)'
    result.byTool[safeName] = (result.byTool[safeName] ?? 0) + 1
    if (isError) result.explicitToolErrors++
    if (hasNonzeroExit) result.nonzeroExitCalls++
    if (isFailure) result.observedFailedCalls++
    if (!marker) result.missingResults++
    const id = signature(name, input)
    if (!id) { result.unparsedArguments++; continue }
    if (previous.has(id)) {
      result.repeatCandidates++
      if (previous.get(id) === true) result.repeatsAfterObservedFailure++
    }
    previous.set(id, isFailure)
  }
  result.byTool = Object.fromEntries(Object.entries(result.byTool)
    .sort(([a], [b]) => a.localeCompare(b, 'en')))
  return result
}
function summarize(sessions) {
  const total = counters()
  const byTool = new Map()
  for (const sample of sessions) {
    for (const key of Object.keys(total)) if (key !== 'byTool') total[key] += sample[key]
    for (const [name, n] of Object.entries(sample.byTool)) {
      byTool.set(name, (byTool.get(name) ?? 0) + n)
    }
  }
  total.byTool = Object.fromEntries([...byTool].sort(([a], [b]) => a.localeCompare(b, 'en')))
  return { sessions: sessions.length, ...total,
    observedFailedCallRate: total.toolCalls ? Number((total.observedFailedCalls / total.toolCalls).toFixed(4)) : null,
    repeatCandidateRate: total.toolCalls ? Number((total.repeatCandidates / total.toolCalls).toFixed(4)) : null }
}
export function compareGroups(baseline, candidate) {
  const keys = ['toolCalls', 'observedFailedCalls', 'repeatCandidates', 'repeatsAfterObservedFailure']
  return Object.fromEntries(keys.map(key => [key, candidate[key] - baseline[key]]))
}
export async function analyzeGroups(groups, format = 'json') {
  const output = { schemaVersion: 1,
    interpretation: 'Observational Markdown transcript counts. Repeats may be legitimate; no task success or causal claim.',
    groups: {} }
  for (const [name, paths] of Object.entries(groups)) {
    if (!paths.length) continue
    const sessions = []
    for (const path of paths) {
      let source
      try {
        const meta = await stat(path)
        if (!meta.isFile() || meta.size > MAX_BYTES) throw Error('invalid file')
        source = await readFile(path, 'utf8')
      } catch {
        throw Error('transcript must be readable UTF-8 and no larger than 20 MiB')
      }
      sessions.push(analyzeTranscript(source))
    }
    output.groups[name] = { summary: summarize(sessions), sessions }
  }
  if (output.groups.baseline && output.groups.candidate) {
    output.delta = compareGroups(output.groups.baseline.summary, output.groups.candidate.summary)
    output.comparisonWarning = 'Comparable tasks, environment and export formats are required; count deltas alone do not prove improvement.'
  }
  if (format === 'json') return JSON.stringify(output, null, 2)
  const lines = ['# DSH Code Worker transcript assessment', '',
    '> Observational only. No task completion or A/B causality is established.', '']
  for (const [name, group] of Object.entries(output.groups)) {
    const x = group.summary
    lines.push('## ' + name + ' (' + x.sessions + ' sessions)', '',
      '| Metric | Count |', '|---|---:|',
      '| Tool calls | ' + x.toolCalls + ' |',
      '| Code Worker calls | ' + x.codeWorkerCalls + ' |',
      '| Explicit tool errors | ' + x.explicitToolErrors + ' |',
      '| Calls with nonzero exits | ' + x.nonzeroExitCalls + ' |',
      '| Failed calls (union) | ' + x.observedFailedCalls + ' |',
      '| Same-argument repeats | ' + x.repeatCandidates + ' |',
      '| Repeats after observed failure | ' + x.repeatsAfterObservedFailure + ' |',
      '| Unparsed arguments | ' + x.unparsedArguments + ' |',
      '| Missing result markers | ' + x.missingResults + ' |', '')
  }
  if (output.delta) lines.push('## Comparison limits', '',
    'Counts must not be interpreted causally without equivalent tasks and environments.', '')
  return lines.join('\n')
}
function parseArgs(args) {
  const groups = { baseline: [], candidate: [] }
  let format = 'json'
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (flag === '--format') {
      if (!['json', 'markdown'].includes(args[i + 1])) throw Error('format must be json or markdown')
      format = args[++i]
    } else if (flag === '--baseline' || flag === '--candidate') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw Error('missing transcript file')
      groups[flag.slice(2)].push(value)
    } else throw Error('expected --baseline FILE [--candidate FILE] [--format json|markdown]')
  }
  if (!groups.baseline.length && !groups.candidate.length) throw Error('at least one transcript is required')
  return { groups, format }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const parsed = parseArgs(process.argv.slice(2))
    process.stdout.write(await analyzeGroups(parsed.groups, parsed.format) + '\n')
  } catch (error) {
    console.error('Session analysis failed: ' + (error instanceof Error ? error.message : 'unknown error'))
    process.exitCode = 1
  }
}
