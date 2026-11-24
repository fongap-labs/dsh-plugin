# Delta Code Architecture 2.0

Delta Code is one installable Harness plugin with a small composition kernel and peer feature modules. This document describes module ownership; it is not a second Agent runtime.

| Directory | Responsibility |
|---|---|
| `delta-code-kernel/` | Feature declarations, duplicate-contract checks, lifecycle composition and rollback |
| `delta-code-adapter/contracts/` | Delta-owned types stable across external providers |
| `delta-code-adapter/providers/dsh/` | Cordis tool registration, Host FS, native retries and service access |
| `delta-code-adapter/providers/github/` | GitHub HTTP, token reference resolution and transport errors |
| `delta-code-strategy/` | Host-neutral coding route policy and Skills data; Host integrations are injected by composition |
| `delta-code-coding/` | Host-independent text edit planning, mode/compensation policies, project discovery and compatibility facades |
| `delta-code-quality/` | Verification, task recovery, delivery evidence and failure policy |
| `delta-code-repository/` | Workspace, Git, worktrees, repository selection, PR and CI business rules |
| `delta-code-collaboration/` | Safe native-subagent delegation policy, not a second agent runner |
| `delta-code-support/` | Ephemeral Delta tool counters and optional native result-event observations; no persistent session database |

## Boundaries

- The semantic capability directory (`delta-code-strategy/capability-catalog.ts`) is reviewed, read-only metadata exposed via `code_capabilities` (list/get/compose). It validates all Skill targets, unique IDs, links and cycles before registration. Native Agent intent selects scenarios; regex auto-routing is an advisory compatibility hint. `uses` is a non-executing reference and does not load dependencies, create tools or grant permissions.

- Quality-strength, diagnostic-readiness and verified-experience procedures are optional disposable native Skills. Mutations require existing authorized project scripts and actual test evidence; experience candidates cannot auto-promote to trusted GitHub Skills or bypass central CI. No second runtime, tracking database, implicit SDK installation or paid tool is created.

- Project rule discovery inspects only bounded ancestor directories inside the authorized workspace through DSH Host FS; it reports existing AGENTS.md/CLAUDE.md paths but does not interpret or inject file contents. Native Host instruction precedence remains authoritative.

- Approved Skill selection can be re-ordered using session-local, verified native tool outcome co-occurrence after at least three observations per candidate. `tools/result` only observes approved Skill load successes and definite `code_verify` results. Tool arguments, transcripts and sources are never stored; this feedback is not causal evidence and never authorizes external commands.

- `code_workflow_route` may also accept a small, model-proposed milestone plan with explicit per-step acceptance and earlier-step dependencies. Its pure validator checks length, duplicate objectives, safe relative write sets and cycle-free ordering before computing waves. These proposed milestones do not mark any native Todo completed, dispatch agents, or override Host permissions. Replanning requires contradictory evidence or a changed task requirement rather than routine repeated investigation.
- Milestone plans can produce exact native Todo drafts (`pending` only) and per-task acceptance hints without writing Host state. The native `code_resume` tool optionally validates a supplied `expectedTasks` content list against the actual Host projection before Git inspection; mismatches block continuation. Fresh executed verification and Host `todo_write` are still required.

- SDK-free `delta-code-strategy/builtin-task-signals.ts` owns reviewed bilingual keyword patterns. `declarative-rules.ts` is a pure matching engine; ordered `task-routing.ts` and `task-resource-policy.ts` catalogs hold route/resource decisions and resource guidance as declarative data. The optional, Host-injected `DeltaCodeRoutingPolicy` can select reviewed rule catalogs without changing the matcher. Workflow mode, ordered conditional Skill steps, and verification text are separately declared in `delta-code-strategy/workflow-policy.ts`; `workflow-route.ts` only matches profiles and computes dependency waves. The strategy feature accepts reviewed `workflowRules` at the trusted composition boundary. Invariant Host permissions, irreversible-action approval, red/pending CI evidence, and disjoint-write/native-subagent checks are always enforced by the engine, not overridable via a profile. User opt-outs, external Skill consent, current-user-message ownership, and Host capabilities remain enforced; no model/tool output may introduce executable matching policy. No secondary web/MCP client or project-wide indexing agent is created.

- Approved remote Skill responses are streamed under a hard byte cap even when `Content-Length` is absent or dishonest; the final Git blob hash must still match the reviewed commit. No external scripts or secondary resources are auto-loaded.

- Native coding Skills and approved external GitHub Skills are exposed only through disposable DSH `skills.registerProvider()` registrations. Discovery publishes metadata; the full local body is supplied only by `get()`, never eagerly through `skills.register()` or the dynamic system prompt. Providers are registered once per Host registry and disposed on Host-child/plugin teardown. If `registerProvider` is absent or returns no disposer, the affected Skill feature is disabled (an already registered non-disposable provider is invalidated and returns no candidates or bodies). Core editing, Git and verification tools remain available. Host cannot retroactively erase content already included in prior conversation turns.

- Approved public GitHub Skills are selected by SDK-free `delta-code-strategy/trusted-github-skills.ts`, loaded by the read-only pinned-content `delta-code-adapter/providers/github/approved-skills.ts`, and registered through the optional DSH native `skills.registerProvider()` seam. The catalog records the SPDX license, source metadata name, immutable commit and Git blob SHA. Remote content is hash-verified at load and never installed or executed by Delta. Unreviewed repositories and incomplete single-file bundles are not promoted into model-invocable Skills.
- Trusted GitHub Skill updates use a monotonically bumped catalog version, and each candidate locator binds both Commit SHA and Blob SHA. Exact revoked revisions remain in a reviewed tombstone catalog and are excluded from discovery/loading. The DSH provider's registration-scoped AbortSignal is propagated into list, fetch and streamed body reads, so disposal invalidates future discovery and cancels in-flight loads. Revocation cannot erase text already inserted into an existing model context; hard isolation requires a new session after plugin update. See `docs/trusted-github-skills-governance.md`.

- `code-find-skills` uses the preexisting Host GitHub/web capabilities. When an authorized GitHub repository is configured, `code_github_skill_candidates` searches bounded `SKILL.md` paths, and `code_github_skill_review` reads exact pinned bytes and license-file evidence through the existing GitHub transport. Search results and candidate metadata are untrusted. A default-branch HEAD hint is not verification that the indexed candidate exists at that revision.
- Candidate review never installs, approves or registers Skills. Only a separately reviewed catalog PR can authorize a new Skill after license, maintenance, security and complete-bundle checks. For absent credentials, unsupported Host capability or missing evidence, the agent reports an incomplete review and continues without the candidate.

- Volatile configuration reload validates the next settings before disposal; when Host tool registration rejects the replacement, Delta attempts to re-mount the last active settings, and reports failure explicitly if both mounts fail.

- DSH tool-registration refusal is a mount failure, not a warning-only success. The Delta feature kernel unwinds prior tool registrations and feature disposers; a valid Host registration without a disposer remains supported for compatibility.

- GitHub multi-account routing, PR/CI inspection, guarded branch/commit/PR operations and write conflict handling remain in `delta-code-repository/github-operations.ts` and `github-policy.ts`, with Delta transport contracts. DSH tool schema/registration and optional Host Git Origin resolution live in `delta-code-adapter/providers/dsh/github.ts`.

- `code_workspace_map` Host Git enumeration, bounded directory discovery, FS authorization and cancellation live in `delta-code-adapter/providers/dsh/workspace.ts`; ranked tracked-file queries, discovery limits, batched-query validation and presentation selection live in SDK-free `delta-code-repository/workspace-policy.ts`.

- Worktree task and branch validation live in Host-independent `delta-code-repository/worktree-policy.ts`; DSH worktree commands, Host FS target/symlink containment, safe removal and cancellation live in `delta-code-adapter/providers/dsh/worktree.ts`. Existing Repository and `tools/` paths remain compatible.

- DSH-backed Git status/diff execution, checkout authorization, literal diff pathscoping, Host subprocess and cancellation live in `delta-code-adapter/providers/dsh/git.ts`; `delta-code-repository/git-status-policy.ts` and `git-execution.ts` remain Host-independent. Legacy Repository and `tools/` exports are retained.

- `code_multi_edit` DSH Host FS guarded writes, batch preflight, readback, cancellation and compensation execution live in `delta-code-adapter/providers/dsh/multi-edit.ts`. Pure edit transformations and mode/compensation selection remain in Coding; the old Coding tool path is a compatibility facade.

- Quota exhaustion is classified distinctly from short transient network failures in Quality and suppresses blind DSH automatic replay through the existing request-error waterfall. This is a stop decision only, not a second retry scheduler; explicit Host policy and authorized new credentials remain outside Delta's control.

- Native `compaction/summary` events are reduced into a metadata-only, versioned Host Session Projection by `delta-code-adapter/providers/dsh/compaction-marker.ts`; the summary body is never copied or emitted by Delta. `code_execution_next` reports the compaction watermark and whether the native Todo was updated afterward, and advises reviewing user constraints/decisions/unresolved errors using Host history and Git. This is not a replacement compressor, a task database or proof of successful semantic retention. Unsupported/unavailable Host projections report unavailable rather than inventing continuity.

- `delta-code-quality/execution-convergence.ts` is a pure, read-only next-step policy. The optional lightweight `code_execution_next` Host tool (available even without subprocess) uses actual native Todo and sanitized, session-scoped outcomes observed by `ExecutionStats`; a mutation invalidates previous verification. It never runs tools or certifies delivery. A missing/invalid Host projection blocks instead of fabricating progress.

- Native `todo/write` folding, checkpoint validation and recovery decisions live in `delta-code-quality/resume-policy.ts`; DSH session projection registration and read-only Git inspection live in `delta-code-adapter/providers/dsh/resume.ts`. Legacy imports remain compatible.
- The native `code_resume` adapter validates supplied Todo seq / HEAD format and cancellation before returning even for a missing or empty Todo. Stale pinned checkpoints fail closed without invoking Host Git.

- `code_delivery_gate` DSH Git/verification execution and native Todo checkpoint enforcement live in `delta-code-adapter/providers/dsh/delivery-gate.ts`, while task acceptance and gate-result policies remain SDK-free in `delta-code-quality/delivery-policy.ts`. The former Quality entrypoint is a compatibility facade.

- DSH-backed `code_verify` and `code_verify_suite` tool definitions, workspace authorization, subprocess execution, token redaction and cancellation live in `delta-code-adapter/providers/dsh/verify*.ts`; Quality retains Host-neutral selection, failure and delivery policies. Legacy Quality and `tools/` paths are compatibility facades.

- Project stack/script/guidance classification lives in Host-independent `delta-code-coding/project-profile-policy.ts`; `delta-code-adapter/providers/dsh/profile.ts` owns authorized local/Host file discovery, cancellation and permission boundaries; the Coding profile entrypoint remains a compatibility facade.
- Manifest classification, package-manager selection and allowlisted Node script declarations live in Host-independent `delta-code-quality/verification-project-policy.ts`; `delta-code-adapter/providers/dsh/verify.ts` owns Host metadata reads, cwd authorization and bounded subprocess execution.
- Delivery task acceptance, final-gate Todo handling and result construction live in Host-independent `delta-code-quality/delivery-policy.ts`; `delivery-gate.ts` still reads native Todo and obtains Git/verification evidence exclusively through authorized Host execution.
- Read-only `code_host_probe` service inspection and DSH `Context` typing live in `delta-code-adapter/providers/dsh/host-probe.ts`; `delta-code-coding/host-probe.ts` remains a compatibility re-export. It never invokes privileged FS, workspace or subprocess methods.
- DSH-backed `code_lsp_probe` execution lives in `delta-code-adapter/providers/dsh/lsp.ts`; language-server status classification is an SDK-free Coding policy. Existing tool import paths remain compatibility facades.
- Coding, Quality and Repository feature assembly accepts only Delta-owned named-tool contracts. DSH-specific tool construction lives in `delta-code-adapter/providers/dsh/feature-tools.ts`; no Host SDK types enter their feature entrypoints.
- DSH tool implementation, Host FS and subprocess access are now owned by `delta-code-adapter/providers/dsh/`; Coding, Quality and Repository modules retain Host-independent policy/operation contracts and legacy compatibility facades.
- Optional native routing hints consume only the session-local scalar `ExecutionStats.readRepeatedFailedCalls`. After a newly observed repeat of an identical failed Delta tool request, the prompt advises diagnosing the actual failure once; a per-task baseline and one-shot notice avoid permanent prompt pollution. This never blocks an authorized tool, caches a Host result, or fingerprints native Host tool arguments.

- Native `tools/result` observation is an optional, disposable, name-only Host adapter in `delta-code-adapter/providers/dsh/native-tool-stats.ts`. It counts result events without arguments or raw output and excludes registered Delta tools from double counting. These are not authoritative native call counts, retry counts or duplicate-call statistics; only Delta tool wrappers can fingerprint arguments.

- Intent-to-Spec validation lives in `delta-code-strategy/intent-contract.ts`. The optional `code_task_spec` tool checks model-selected user quotations against the last claimed native user message; proposed acceptance is never represented as verified. `UserTaskContext` is a bounded in-memory per-agent anchor, not persistent task storage or a second planner. Host native Todo/session remains authoritative for task progress. Substantial tasks may generate one contract before planning; fast changes do not require another tool or model call.
- Native user follow-ups may append bounded, per-agent intent evidence (four inherited messages plus current). `quoteEvidence` identifies current versus inherited quotations. `sourceHistoryComplete=false` reports loss of older source messages after the retention bound; retrieve native history or clarify constraints instead of assuming complete recall. Historical quotes are evidence only: later user overrides remain authoritative; this adapter does not claim semantic conflict resolution, store tasks, or call another model.
- `findDirectConstraintConflicts` flags only opposite explicit permission/prohibition phrases for an identical literal subject in current versus the most recent inherited user message. `code_task_spec.readyForPlanning=false` also covers incomplete retained history; the Agent must reconcile before planning. This is a conservative signal, not general semantic inference or a way to override Host permissions.

- Coding task selection and Skills data live in `delta-code-strategy` with no Host dependencies. DSH Inbox events, Skills service registration and static/dynamic prompt installation live in `delta-code-adapter/providers/dsh`; composition supplies registration callbacks to Strategy.

- Public `src/types.ts` contains only Host-independent configuration/result types. Cordis Context augmentation and DSH prompt type imports are isolated in `delta-code-adapter/providers/dsh/host-types.ts`.
- External APIs are not runtime-version-pinned; compatibility depends on available, semantically verified capabilities.
- Repository and coding business rules must not own GitHub authentication or raw HTTP transport.
- Pure GitHub account selection, remote origin parsing, branch, path and SHA checks live in `delta-code-repository/github-policy.ts`; the DSH tool wrapper imports this policy without owning it.
- Each GitHub Token reference binds to exactly one configured account/organization owner; routing never crosses owners. There is no repository-count cap. With no configured accounts, Host `GITHUB_TOKEN` is accepted only under its `/user`-verified login; organizations require a dedicated owner binding. GitHub validates permissions on every repository request.
- Host permission denial must never be downgraded to Node filesystem access or shell execution.
- Kernel does not schedule agent work, store sessions, maintain a model catalog or own context compression.
- Old `lib/tools/*` and root import paths remain as compatibility re-exports until consumers are migrated and existing tests pass. Internal configuration, composition and DSH adapters must import the owning implementation or stable adapter boundary rather than route through a legacy facade. Compatibility files are retained for existing consumers and must not acquire new business logic.
- Only DSH `tools` is a root dependency. `subprocess` is injected only for LSP probes, command-backed Quality, and local Git/worktree/workspace operations; its absence preserves Strategies, Skills, and lightweight metrics.
- An absent provider is not the same as an explicitly denied provider; fail closed where permission semantics cannot be preserved.

## Migration / acceptance

1. Preserve public `code_*` tools, plugin ID and configuration contracts.
2. Verify module loading/unloading and deferred prompt/skill registration.
3. Validate TypeScript, existing regression tests and Github/AW gate.
4. Test real Harness FS writes, scoped command execution, workflow cancellation, account routing and hot reload before release.
5. Only then remove obsolete compatibility facades and duplicate implementation paths.

Remote GitHub API calls, the multi-edit tool, project profiles and Host capability probes remain accessible without subprocess. An omitted repository may still require local Git origin detection and will fail clearly when subprocess is unavailable.

## File access boundary

The DSH Host FS write signatures are isolated in `delta-code-adapter/providers/dsh/fs-write.ts`.
`guarded-intent` supplies a version or create guard; `native-unguarded` passes an omitted
expected argument and checks Host containment; `legacy-overwrite` retains the historical
Host call signature by explicit selection only. No write probes, inferred function-arity
checks, Harness-version whitelist, or privilege-reducing fallback are used.



The filesystem's Host capability lookup, guarded writes, and safety-checked local fallback live in `delta-code-adapter/workspace-files.ts`. The old `src/runtime.ts` paths are compatibility re-exports. Business modules should use the adapter's stable public file-access boundary instead of Host providers directly; local fallbacks remain denied when the Host has an inaccessible or incomplete mounted FS.
