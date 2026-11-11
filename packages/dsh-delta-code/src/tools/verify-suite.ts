import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import type { VerificationScript } from './verify-presets.js'
import { prepareVerify, runPreparedVerify } from './verify.js'
import { classifyFailure, classifyVerificationEvidence, verificationNextAction } from './failure-policy.js'

const CHECKS = new Set(['test', 'typecheck', 'build', 'lint', 'check'])
const STEP_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    script: { type: 'string' as const, required: true },
    project: { type: 'string' as const, required: true },
    command: { type: 'string' as const, required: true },
    exitCode: { type: 'integer' as const, required: true },
    passed: { type: 'boolean' as const, required: true },
    timedOut: { type: 'boolean' as const, required: true },
    output: { type: 'string' as const, required: true },
    truncated: { type: 'boolean' as const, required: true },
    failureKind: { type: 'string' as const, required: true },
  },
} as const

/** Bounded sequential execution; every requested step is checked before the first spawn. */
export function createVerifySuiteTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_verify_suite',
    description: 'Prevalidate 1–5 distinct project scripts, then execute sequentially in the DSH Host subprocess. Stop at first failure and retain bounded per-step evidence. Honors execution.allowCommands.',
    parameters: {
      scripts: {
        type: 'array', required: true,
        description: 'Ordered distinct checks: test, typecheck, build, lint, check (1..5).',
        items: { type: 'string', enum: ['test', 'typecheck', 'build', 'lint', 'check'] },
      },
      cwd: { type: 'string', description: 'Optional workspace-relative directory.' },
      project: { type: 'string', enum: ['auto', 'node', 'rust', 'python', 'go'], description: 'Project type; auto requires exactly one manifest type.' },
      timeoutMs: { type: 'integer', description: 'Per-step timeout, 10000..600000 ms.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        passed: { type: 'boolean', required: true },
        completed: { type: 'integer', required: true },
        skipped: { type: 'array', required: true, items: { type: 'string' } },
        nextAction: { type: 'string', required: true },
        results: { type: 'array', required: true, items: STEP_SCHEMA },
      } },
      render(_args, value) {
        return [{ type: 'text', text: [
          'Verify suite: ' + (value.passed ? 'PASS' : 'FAIL') + ', ' + value.completed + ' run, ' + value.skipped.length + ' skipped.',
          ...value.results.map(step => step.command + ': ' + (step.passed ? 'PASS' : 'FAIL') + ' (' + step.exitCode + ')\n' + step.output),
          ...(value.skipped.length ? ['Skipped: ' + value.skipped.join(', ')] : []),
          'Next: ' + value.nextAction,
        ].join('\n') }]
      },
    },
    async execute(args, exec) {
      const scripts = args.scripts as VerificationScript[]
      if (!Array.isArray(scripts) || scripts.length < 1 || scripts.length > 5) {
        throw new Error('verification suite requires 1..5 scripts')
      }
      if (new Set(scripts).size !== scripts.length) throw new Error('verification scripts must not be duplicated')
      if (scripts.some(script => !CHECKS.has(script))) throw new Error('script is not allowlisted')
      // No command may run if a later script is undeclared or the workspace is unsafe.
      const prepared = []
      for (const script of scripts) {
        if (exec.signal.aborted) throw new Error('verification cancelled')
        prepared.push(await prepareVerify(ctx, settings, exec, {
          script, cwd: args.cwd, project: args.project, timeoutMs: args.timeoutMs,
        }))
      }
      // Every step must target the same Host execution filesystem.
      // A changing processPath during preflight is not safe to execute.
      const executionCwd = prepared[0]!.cwd
      if (prepared.some(step => step.cwd !== executionCwd)) {
        throw new Error('Host verification execution directory changed during preflight')
      }
      const results = []
      for (const step of prepared) {
        if (exec.signal.aborted) throw new Error('verification cancelled')
        try {
          const evidence = await runPreparedVerify(ctx, settings, exec, step)
          const failureKind = classifyVerificationEvidence(evidence)
          results.push({ ...evidence, failureKind })
          if (!evidence.passed) break
        } catch (error) {
          if (exec.signal.aborted) throw error
          results.push({
            script: step.script, project: step.plan.project,
            failureKind: classifyFailure(error),
            command: [step.plan.command, ...step.plan.args].join(' '),
            exitCode: -1, passed: false, timedOut: false, truncated: false,
            output: 'Host subprocess refused or failed; inspect Host logs.',
          })
          break
        }
      }
      const passed = results.length === prepared.length && results.every(result => result.passed)
      const failure = results.find(result => !result.passed)
      const nextAction = verificationNextAction(failure?.failureKind ?? 'none')
      return {
        passed, completed: results.length,
        skipped: prepared.slice(results.length).map(step => step.script),
        nextAction, results,
      }
    },
  })
}
