import type { WorkflowSkill } from './workflow-skills.js'

/** Focused procedures for performance, runtime, visual and Skill behavior work. */
export const SPECIALIST_WORKFLOW_SKILLS: readonly WorkflowSkill[] = [
  {
    name: 'code-perf-issue',
    title: 'Measure and fix performance problems',
    description: 'Use for a reported slowdown, high resource use or performance regression; establish a baseline and prove the change against it.',
    instructions: [
      'Identify the affected user-visible operation, environment, representative input and target metric before changing code. Separate a measured problem from a hunch.',
      'Reproduce the issue and capture a repeatable baseline with the existing profiler, benchmark or timing path. Record warmup, sample count, variance and relevant machine/runtime conditions.',
      'Trace the measured bottleneck to its cause using a profile or other runtime evidence. Do not optimize unrelated code or infer a hot path from source shape alone.',
      'State one falsifiable optimization hypothesis and change the smallest causal area. Preserve correctness and compare against the same workload and conditions.',
      'Repeat the measurement enough to distinguish a real change from noise; report absolute values, relative change, sample conditions and any tradeoffs. Do not claim a speedup when the baseline or measurement is inconclusive.',
      'Run behavior tests and inspect the final diff. If the regression cannot be reproduced or the profiler is unavailable, report that limit and do not present an unmeasured change as a performance fix.',
    ],
  },
  {
    name: 'code-runtime-forensics',
    title: 'Investigate runtime symptoms and trace artifacts',
    description: 'Use for live hangs, crashes, leaks or resource spikes, and for analyzing CPU profiles, traces or heap snapshots.',
    instructions: [
      'Classify the evidence first: a live symptom needs a controlled reproduction and instrumentation; a captured profile or trace needs artifact-specific inspection. Do not claim access to artifacts that were not supplied.',
      'Preserve the failing environment and record the trigger, workload, runtime version and time window. Reproduce before changing code when possible; distinguish product behavior from tooling or environment failure.',
      'For live symptoms, add the least invasive temporary instrumentation that can distinguish competing causes, observe state while the issue occurs, then remove or justify any instrumentation kept.',
      'For a CPU profile, trace or heap snapshot, identify capture settings and likely sampling limits; follow the dominant path or retaining references back to their owner and confirm with a second observation.',
      'Redact credentials, personal data, request payloads and unrelated process details before sharing logs or artifacts. Do not upload sensitive artifacts to external services without explicit authorization.',
      'Form and test one causal explanation at a time. Verify the fix against the original trigger or a focused equivalent, and state clearly when evidence is incomplete or from a different surface.',
    ],
  },
  {
    name: 'code-visual-parity',
    title: 'Compare an interface against a reference',
    description: 'Use when an interface must match a reference screenshot, design or existing implementation across layout and interaction states.',
    instructions: [
      'Identify the reference and target surface, viewport, device scale, theme, route and interaction state. Capture both under matching conditions using available Host UI tools.',
      'Compare the actual rendered result, not source code alone. Note concrete mismatches in geometry, typography, color, spacing, assets, responsive behavior and interaction states.',
      'Fix the largest visible mismatch first, then capture again. Keep each iteration small so the visual effect can be attributed to the change.',
      'Check relevant states such as loading, empty, error, hover, focus and narrow viewport when they are in scope; verify keyboard access and reduced-motion behavior where applicable.',
      'Do not invent screenshots or report pixel-level parity from an unrendered mock. If browser or screenshot access is unavailable, provide a code-based review and mark visual verification as unrun.',
      'Finish with evidence from the actual target surface and inspect the diff for unrelated visual or behavior changes.',
    ],
  },
  {
    name: 'code-skill-evaluation',
    title: 'Evaluate a Skill or prompt change',
    description: 'Use when changing a Skill or agent prompt and you need evidence that behavior improved without regressions.',
    instructions: [
      'Define the behavior change and a small set of representative user tasks before editing. Include ordinary cases, edge cases and at least one prompt that tempts the old failure.',
      'Write a short rubric with observable criteria such as correctness, required evidence, safety boundaries and output usefulness. Keep the rubric hidden from candidate runs when a blinded comparison is feasible.',
      'Run the same prompts against the previous and proposed Skill under comparable model, tool and project conditions. Label outputs neutrally; do not leak the rubric or variant identity to candidate agents.',
      'Have a separate reviewer or model score anonymized outputs against the rubric when available. Otherwise score them yourself and disclose that the comparison was not blind or independent.',
      'Inspect the actual work products and tool evidence, not unverified claims about following instructions. Record regressions, failures and meaningful uncertainty alongside improvements.',
      'Keep the change only when it improves target behavior without material safety or quality regressions. Bound runs, context and cost; never expose private transcripts or use hidden evaluation metadata in candidate prompts.',
    ],
  },
]