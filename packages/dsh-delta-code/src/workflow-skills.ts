/**
 * DSH-native coding playbooks. This module owns workflow guidance, not a new
 * orchestrator, task store, terminal, permission system, or LSP.
 *
 * Methods synthesized from publicly documented engineering practices (see
 * Code Worker README). Each body is loaded by the Host Skills service only
 * when selected. Avoid prescribing APIs the Host has not exposed.
 */
export interface WorkflowSkill {
  name: string
  title: string
  description: string
  instructions: string[]
}

export const WORKFLOW_SKILLS: readonly WorkflowSkill[] = [
  {
    name: 'code-workflow',
    title: 'Code Worker: route and finish coding work',
    description: 'Start a coding task or decide which coding procedure to use; routes by risk and complexity rather than forcing a full process for small changes.',
    instructions: [
      'First obey user instructions and repository AGENTS.md/CLAUDE.md. Inspect code_project_profile. For substantial work use code_workflow_route with grounded scope/risk and only confirmed native subagent capability; then read bounded relevant sources.',
      'Route a clear one-file edit to code-fast-change; a defect to code-root-cause-debugging; uncertain requirements to code-brainstorming; an agreed multi-step change to code-writing-plans then code-executing-plans.',
      'Use code-subagent-delivery only for independently reviewable work when the native Host exposes agent dispatch. Use code-parallel-work only for disjoint tasks; never invent agent APIs or silently raise permissions.',
      'For behavior changes use code-test-driven-development when a meaningful test exists. Apply code-verification-gate before completion claims, and code-finish-branch for PR or cleanup.',
      'Success means correct behavior with observed verification, readable diffs, and preserved user work. Failed tests and unavailable capabilities are explicit unresolved outcomes, not excuses to claim completion.',
      'Keep one Agent loop: small changes go directly to edit/verify; multi-step work needs a compact goal, acceptance tests, dependency-aware plan and evidence-backed checkpoints using Host todo_write when available. Avoid a second planner runtime or redundant model calls.',
    ],
  },
  {
    name: 'code-brainstorming',
    title: 'Feature discovery and technical design',
    description: 'Use for ambiguous features or substantial new behavior to establish goals, constraints, risks and a reviewable design before editing.',
    instructions: [
      'Look at the existing relevant code and project rules before questioning the user. Identify the actual behavior requested, affected users, acceptance examples and constraints.',
      'Distinguish decisions with material product or security consequences from ordinary implementation details. Ask only the consequential questions; do not block a clear request with unnecessary formalities.',
      'Compare two or three implementable approaches including reuse of existing modules. Prefer smaller changes, obvious rollback, and explicit non-goals.',
      'Record a concise change specification: current behavior, proposed behavior, ADDED/MODIFIED/REMOVED requirements where useful, affected interfaces, compatibility risks and observable acceptance examples. Follow the project documentation convention.',
      'Resolve major design contradictions before code; treat the approved decisions as constraints passed to code-writing-plans. Do not present unapproved assumptions as facts.',
    ],
  },
  {
    name: 'code-writing-plans',
    title: 'Executable, testable implementation plans',
    description: 'Turn an approved multi-step design or clear requirements into small tasks with files, tests, dependencies and evidence of completion.',
    instructions: [
      'Confirm user intent and the observable goal, non-goals, constraints and acceptance criteria; inspect project_profile, relevant code and tests before writing a plan. Planning-only requests must not edit source.',
      'Write an executable plan with small behavior-focused tasks. For each task name its scope, allowed files, expected change, exact focused test command, success signal, dependencies and safe recovery point.',
      'Represent dependencies explicitly and group disjoint ready tasks into execution waves; identify the first testable task, integration checks, rollback strategy and when new evidence requires replanning. Preserve APIs and migration compatibility.',
      'Prefer existing dependencies and abstractions. Identify any unsupported Host capability and propose a Host-native fallback rather than adding another framework.',
      'Use native Host todo_write when available: publish a short pending/in_progress/completed task list, update the full list at verified checkpoints and resume from the session record plus current repository state. Otherwise keep it inline; never add a competing task store.',
      'Self-review for missing failure paths, inconsistent assumptions, tasks with no tests and security-critical irreversible actions. Start implementation once requirements are sufficiently settled, subject to Host approvals.',
    ],
  },
  {
    name: 'code-executing-plans',
    title: 'Implement an approved plan inline',
    description: 'Use when implementing a written plan in the current agent context without native subagent dispatch.',
    instructions: [
      'Read the agreed plan, current branch state, uncommitted changes and repository rules before editing; preserve existing user work and do not treat a planning-only request as approval to execute.',
      'Execute one ready plan item at a time: inspect bounded context, reproduce or test first when feasible, make the smallest change, run the focused check and inspect the diff. Only then mark the item done with exact evidence.',
      'When Host todo_write is available, replace its whole list at each checkpoint (pending/in_progress/completed); keep one active item unless native parallel execution is permitted. Never fake completed work or create a second ledger.',
      'When a focused test fails, load code-root-cause-debugging and inspect the actual error before changing more code. If evidence contradicts the plan, revise the remaining steps and acceptance checks rather than blindly retrying.',
      'Continue to the next ready item after verification without asking for redundant confirmation; stop for denied Host permissions, destructive actions, user approval boundaries or cancelled execution.',
      'After the final task, run relevant integration checks, compare outcomes against the original acceptance criteria, request native independent review when available and apply code-verification-gate before completion.',
    ],
  },
  {
    name: 'code-subagent-delivery',
    title: 'Native subagent implementation and independent review',
    description: 'Implement a multi-task plan with fresh-context subagents and review when DSH native agent delegation is available.',
    instructions: [
      'Only use the official Host agent/delegation interface if actually exposed and permitted. If unavailable, load code-executing-plans and work inline; never spawn or emulate a second agent runtime.',
      'Give each implementer a fresh-context brief: exact behavior delta, allowed files, acceptance tests, dependencies and recovery anchors. Dispatch only ready tasks in the current wave; do not pass entire chat histories.',
      'Use fresh-context reviewers separate from the implementation when native dispatch permits. Review spec/acceptance compliance first, then correctness, security and maintainability.',
      'Treat implementer claims as hypotheses; require changed-file and test evidence. If the reviewer finds a concrete issue, return it with a reproduction or invariant and re-review the correction.',
      'Do not run simultaneous writers on overlapping files or the same worktree. Stop if context, permissions or cancellation cannot be reliably isolated.',
      'Resume by checking Host task evidence and latest repository state rather than replaying completed work. Integrate each verified wave, then run branch-wide checks and independent review.',
    ],
  },
  {
    name: 'code-parallel-work',
    title: 'Parallelize independent work safely',
    description: 'Speed up separate investigations or nonoverlapping coding tasks via existing DSH subagents without duplicating orchestration.',
    instructions: [
      'Parallelize only work with genuinely independent dependencies and disjoint write sets. Good candidates are separate bug investigations or read-only research.',
      'Dispatch bounded native subagent tasks with exact goals and expected evidence. Prefer read-only exploration before parallel implementation.',
      'If Host dispatch is absent, execute sequentially. Never invent task tools, launch external agents without user authorization or share a mutable worktree with concurrent writers.',
      'Track findings via the Host task facility when available; reconcile contradictions and run integration tests after merging results.',
      'Measure actual speed benefit against extra context and review costs; one capable agent is often faster for tightly coupled changes.',
    ],
  },
  {
    name: 'code-test-driven-development',
    title: 'Test-first behavior changes',
    description: 'Use for a meaningful behavior change or regression: establish a failing test, implement the smallest fix and refactor with green checks.',
    instructions: [
      'Choose an observable acceptance case at the public behavior boundary. Avoid mocks that simply repeat implementation assumptions.',
      'Run the new test before changing production code; verify it fails for the expected reason. An environment or import failure is not a useful red test.',
      'Make the minimum implementation change to satisfy the test, run it again and record the result; then refactor without expanding scope.',
      'Add boundary, error and backward-compatibility cases that matter for the change. Do not inflate coverage with vacuous assertions.',
      'Use existing test runner/Host terminal or code_verify for declared Node scripts and project-scoped Rust, Go and Python checks. If execution is unavailable or dependencies are missing, state tests are unrun or failed.',
      'Review source and test diffs together. Green focused tests are not a substitute for integration and CI gates.',
    ],
  },
  {
    name: 'code-worktrees',
    title: 'Safe isolated development worktrees',
    description: 'Use when isolation is beneficial for risky changes or concurrent tasks; preserve current work and avoid direct default-branch edits.',
    instructions: [
      'Inspect git status first. Never discard, reset or stash existing user changes without explicit authorization.',
      'Prefer existing Host workspace isolation. If allowed, code_git_worktree can create a named feature worktree; its path must remain inside the configured workspace.',
      'Establish a clean baseline and ensure the expected base ref. Worktree creation is an explicit permission, not a default side effect.',
      'Direct all subsequent file reads, edits and test runs to the selected worktree. Check the actual cwd to avoid accidentally changing the primary checkout.',
      'After validation, use code-finish-branch; never clean up a worktree that contains unmerged or uncommitted user work.',
    ],
  },
  {
    name: 'code-request-review',
    title: 'Request evidence-based implementation review',
    description: 'Use after a meaningful implementation to review spec compliance, risk, and test evidence with a fresh-context reviewer when possible.',
    instructions: [
      'Prepare a short brief: intended behavior, relevant diff, base/head, test outputs, risky interfaces, and explicit unverified areas.',
      'If native Host reviewer delegation is available, request an independent read-only review. Otherwise conduct code-review-readiness inline without pretending independence.',
      'Review from several bounded perspectives: behavior/spec compliance, correctness, security, performance and maintainability. Deduplicate findings and cite precise files, failing cases and severity rather than vague praise.',
      'Fix actionable high-severity issues and re-run affected tests. Do not make drive-by refactors while addressing review comments.',
      'Preserve external GitHub and Action Worker CI checks as final authority for remote merge readiness.',
    ],
  },
  {
    name: 'code-receive-review',
    title: 'Process code review feedback without blind agreement',
    description: 'Use when an agent or human reviewer reports a defect, API conflict or design concern; validate feedback before changing code.',
    instructions: [
      'Read each review claim against the exact current code and contract. Separate clear bugs from subjective style requests and stale comments.',
      'For a concrete defect, reproduce it with a test or trace, then apply a focused fix and record the changed behavior.',
      'If advice conflicts with existing requirements, explain the evidence and request a decision only for a real product tradeoff.',
      'Avoid making changes solely to appease a reviewer. Do not claim an issue is fixed without running the relevant verification.',
      'Respond with changed paths, tests and any disagreement or remaining uncertainty; rerun checks against the newest branch head.',
    ],
  },
  {
    name: 'code-verification-gate',
    title: 'Evidence before completion',
    description: 'Use before claiming that code is working, complete or ready to merge; verify tests, diffs, permissions and CI status.',
    instructions: [
      'Inspect current git status/diff and the task acceptance criteria. Ensure no unrelated files or secrets slipped into the change.',
      'Run the specific required tests and applicable typecheck/lint/build through the Host execution path when available and permitted.',
      'Record exact commands, process exit codes, failure output, scope and current commit SHA; do not convert a test that was skipped, timed out or not run into PASS.',
      'For final code_delivery_gate verification, supply the exact native Todo snapshot and one ordered taskAcceptance criterion/check mapping per task; accept only checks freshly executed against this Git HEAD. Self-reported criteria are not proof of semantic correctness.',
      'Investigate failures rather than retrying blindly. If verification cannot run, report the blocker and offer a reproducible command without declaring success.',
      'For a PR, inspect the HEAD SHA and the required check/status conclusions through existing GitHub tools. A red or pending gate blocks a readiness claim.',
      'Summarize what changed, what passed, what remains unverified and any deployment or runtime smoke-test gaps.',
    ],
  },
  {
    name: 'code-finish-branch',
    title: 'Finish and hand off a coding branch',
    description: 'Use when implementation and verification are complete to prepare a safe PR, handoff or worktree cleanup.',
    instructions: [
      'Re-check all acceptance criteria, latest diff, test evidence and outstanding review comments before integration.',
      'Check branch and remote target; never push directly to the default branch or rewrite unrelated history. Use existing GitHub integration only when writes are explicitly enabled.',
      'Create/update a feature-branch PR with concise behavior, tests, risks and unverified items. External CI and Action Worker retain merge authority.',
      'Never auto-merge, publish releases, delete branches or clean up worktrees just because tests pass. Follow the user’s explicit delivery request and repository governance.',
      'Report the exact PR and latest commit status. Missing checks and pending checks are not green; do not claim completion when required gates are red.',
    ],
  },
  {
    name: 'code-skill-authoring',
    title: 'Author and validate reliable coding Skills',
    description: 'Use when adding or improving a coding skill; build concise decision-oriented instructions and test that the agent follows them.',
    instructions: [
      'Check whether a Host-native skill or an existing Code Worker skill already solves the task before adding another.',
      'Define one narrow trigger, expected behavior, safety limits and failure examples. Keep the description searchable and the loaded body short.',
      'Evaluate behavior with representative prompts including pressure to skip tests, unsafe edits and ambiguous requirements. Check baseline and improved behavior, not only markdown syntax.',
      'Use DSH native skill registration and discovery; do not add another skill loader, install manager or shadow a higher-priority user skill.',
      'Write tests for registration, cleanup and any new tool contract; document compatibility and any external attribution when copying licensed material.',
    ],
  },
  {
    name: 'code-context-discipline',
    title: 'Low-token repository investigation',
    description: 'Reduce irrelevant context by ranking files, tracing symbols and reading only needed code and tests on large repositories.',
    instructions: [
      'Start with code_project_profile and a narrow code_workspace_map query. The map ranks tracked filenames only; do not mistake it for a dependency graph or proof of symbol ownership.',
      'Use Host native text search, file read and LSP references to locate definitions/callers and trace likely effects. Expand to neighboring modules only when evidence requires.',
      'Read bounded ranges around exact symbols, then the nearest tests and public API contracts. Avoid dumping lockfiles, generated sources, binary files or entire repository trees into context.',
      'Keep a compact working hypothesis: objective, affected files, key constraints, exact failure/test, and remaining questions. Prefer Host-managed compaction/recovery over a separate long-term memory store.',
      'Use output budgets and stop searching when sufficient evidence exists to implement a focused change. If uncertain, make the uncertainty explicit.',
    ],
  },
  {
    name: 'code-incident-diagnosis',
    title: 'Diagnose coding workflow failures',
    description: 'Analyze stalled, repetitive, expensive or failed coding sessions using actual logs and commits instead of inventing explanations.',
    instructions: [
      'Establish the expected objective and the observed outcome. Collect relevant tool results, test logs, branch/commit state and timestamps where available.',
      'Distinguish model reasoning errors, missing context, tool failures, permission denials, environmental issues and actual code defects.',
      'Identify where the workflow diverged and what evidence would falsify the diagnosis. Do not claim access to Host private transcripts or telemetry that was not provided.',
      'Close the learning loop with a minimal regression test or durable repository rule for repeatable mistakes. Record only reusable evidence, not sensitive transcripts or an ever-growing notes archive.',
      'Redact tokens and sensitive user data before sharing diagnostic excerpts or GitHub issues.',
    ],
  },
  {
    name: 'code-autonomous-loop',
    title: 'Long-running coding loop with bounded verification',
    description: 'Use when a user requests sustained autonomous feature delivery or repeated verification; delegate iteration to native DSH Ralph or Workflow only when available.',
    instructions: [
      'Confirm the objective and concrete stop conditions: acceptance tests, scope, permission boundaries, maximum iterations and human approval points.',
      'Inspect whether DSH native ralph or workflow tools are actually exposed. If present, use them for orchestration and native subagents; do not write a second persistent scheduler or background task engine.',
      'Break complex objectives into small verified checkpoints and use a bounded task plan. Read actual tool and test feedback at each round; do not repeatedly run the same failing command without a new hypothesis.',
      'Stop on destructive operations, missing credentials, unresolvable environment failures or a contradiction in the accepted requirements. Never silently escalate host permissions.',
      'On completion inspect the latest diff, run code-verification-gate and report tests with exact evidence; pending external CI is not finished work.',
    ],
  },
  {
    name: 'code-ci-repair',
    title: 'GitHub PR and CI red-check repair',
    description: 'Diagnose a failed PR or GitHub Actions check using commit-scoped status, failed jobs and logs, then patch the real cause and verify the new head.',
    instructions: [
      'Identify the repository, PR and exact current head SHA before acting. Use code_github_checks and code_github_jobs when configured; for failures in Action Worker inspect its referenced run rather than only the source repository.',
      'Read the failed step and decisive error lines, distinguishing code/test failure, governance rule, missing secret or token permission, runner outage and stale historical failures.',
      'Do not chase older runs after the PR head changes. State the concrete failure and narrowest proposed fix; reproduce locally via native terminal/code_verify when possible.',
      'Change only files addressing the demonstrated cause. Keep required changelog fragments, naming rules, secret handling and workflow permissions intact; never bypass a required check to turn it green.',
      'If credentials are missing or insufficient, fail closed and name the required token and minimal permissions without exposing its value. Do not fall back to broader tokens.',
      'After pushing to a feature branch, inspect the new head SHA and new check conclusions. Report pending/running/failed exactly; never claim a red PR is fixed before its latest gates pass.',
    ],
  },

]
