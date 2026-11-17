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
| `delta-code-support/` | Ephemeral execution counters; no persistent session database |

## Boundaries

- Project rule discovery inspects only bounded ancestor directories inside the authorized workspace through DSH Host FS; it reports existing AGENTS.md/CLAUDE.md paths but does not interpret or inject file contents. Native Host instruction precedence remains authoritative.

- Approved Skill selection can be re-ordered using session-local, verified native tool outcome co-occurrence after at least three observations per candidate. `tools/result` only observes approved Skill load successes and definite `code_verify` results. Tool arguments, transcripts and sources are never stored; this feedback is not causal evidence and never authorizes external commands.

- SDK-free `delta-code-strategy/task-resource-policy.ts` routes official documentation, cross-repository analysis, native MCP/tool discovery and explicit GitHub Skill discovery to preexisting Host capabilities. No secondary web/MCP client or project-wide indexing agent is created.

- Approved remote Skill responses are streamed under a hard byte cap even when `Content-Length` is absent or dishonest; the final Git blob hash must still match the reviewed commit. No external scripts or secondary resources are auto-loaded.

- DSH Skill registration suppresses repeated injection of the same Host registry, rolls back every disposable Skill in an incomplete batch, and returns child-scoped cleanup with idempotent parent teardown. Approved remote providers are registered once per Host registry. Hosts that omit disposers retain their legacy behavior but expose a warning and cannot guarantee rollback of prior contributions.

- Approved public GitHub Skills are selected by SDK-free `delta-code-strategy/trusted-github-skills.ts`, loaded by the read-only pinned-content `delta-code-adapter/providers/github/approved-skills.ts`, and registered through the optional DSH native `skills.registerProvider()` seam. The catalog records the SPDX license, source metadata name, immutable commit and Git blob SHA. Remote content is hash-verified at load and never installed or executed by Delta. Unreviewed repositories and incomplete single-file bundles are not promoted into model-invocable Skills.

- `code-find-skills` uses the preexisting Host GitHub/web capabilities. When an authorized GitHub repository is configured, `code_github_skill_candidates` searches bounded `SKILL.md` paths, and `code_github_skill_review` reads exact pinned bytes and license-file evidence through the existing GitHub transport. Search results and candidate metadata are untrusted. A default-branch HEAD hint is not verification that the indexed candidate exists at that revision.
- Candidate review never installs, approves or registers Skills. Only a separately reviewed catalog PR can authorize a new Skill after license, maintenance, security and complete-bundle checks. For absent credentials, unsupported Host capability or missing evidence, the agent reports an incomplete review and continues without the candidate.

- Volatile configuration reload validates the next settings before disposal; when Host tool registration rejects the replacement, Delta attempts to re-mount the last active settings, and reports failure explicitly if both mounts fail.

- DSH tool-registration refusal is a mount failure, not a warning-only success. The Delta feature kernel unwinds prior tool registrations and feature disposers; a valid Host registration without a disposer remains supported for compatibility.

- GitHub multi-account routing, PR/CI inspection, guarded branch/commit/PR operations and write conflict handling remain in `delta-code-repository/github-operations.ts` and `github-policy.ts`, with Delta transport contracts. DSH tool schema/registration and optional Host Git Origin resolution live in `delta-code-adapter/providers/dsh/github.ts`.

- `code_workspace_map` Host Git enumeration, bounded directory discovery, FS authorization and cancellation live in `delta-code-adapter/providers/dsh/workspace.ts`; ranked tracked-file queries, discovery limits, batched-query validation and presentation selection live in SDK-free `delta-code-repository/workspace-policy.ts`.

- Worktree task and branch validation live in Host-independent `delta-code-repository/worktree-policy.ts`; DSH worktree commands, Host FS target/symlink containment, safe removal and cancellation live in `delta-code-adapter/providers/dsh/worktree.ts`. Existing Repository and `tools/` paths remain compatible.

- DSH-backed Git status/diff execution, checkout authorization, literal diff pathscoping, Host subprocess and cancellation live in `delta-code-adapter/providers/dsh/git.ts`; `delta-code-repository/git-status-policy.ts` and `git-execution.ts` remain Host-independent. Legacy Repository and `tools/` exports are retained.

- `code_multi_edit` DSH Host FS guarded writes, batch preflight, readback, cancellation and compensation execution live in `delta-code-adapter/providers/dsh/multi-edit.ts`. Pure edit transformations and mode/compensation selection remain in Coding; the old Coding tool path is a compatibility facade.

- Native `todo/write` folding, checkpoint validation and recovery decisions live in `delta-code-quality/resume-policy.ts`; DSH session projection registration and read-only Git inspection live in `delta-code-adapter/providers/dsh/resume.ts`. Legacy imports remain compatible.

- `code_delivery_gate` DSH Git/verification execution and native Todo checkpoint enforcement live in `delta-code-adapter/providers/dsh/delivery-gate.ts`, while task acceptance and gate-result policies remain SDK-free in `delta-code-quality/delivery-policy.ts`. The former Quality entrypoint is a compatibility facade.

- DSH-backed `code_verify` and `code_verify_suite` tool definitions, workspace authorization, subprocess execution, token redaction and cancellation live in `delta-code-adapter/providers/dsh/verify*.ts`; Quality retains Host-neutral selection, failure and delivery policies. Legacy Quality and `tools/` paths are compatibility facades.

- Project stack/script/guidance classification lives in Host-independent `delta-code-coding/project-profile-policy.ts`; `delta-code-adapter/providers/dsh/profile.ts` owns authorized local/Host file discovery, cancellation and permission boundaries; the Coding profile entrypoint remains a compatibility facade.
- Manifest classification, package-manager selection and allowlisted Node script declarations live in Host-independent `delta-code-quality/verification-project-policy.ts`; `delta-code-adapter/providers/dsh/verify.ts` owns Host metadata reads, cwd authorization and bounded subprocess execution.
- Delivery task acceptance, final-gate Todo handling and result construction live in Host-independent `delta-code-quality/delivery-policy.ts`; `delivery-gate.ts` still reads native Todo and obtains Git/verification evidence exclusively through authorized Host execution.
- Read-only `code_host_probe` service inspection and DSH `Context` typing live in `delta-code-adapter/providers/dsh/host-probe.ts`; `delta-code-coding/host-probe.ts` remains a compatibility re-export. It never invokes privileged FS, workspace or subprocess methods.
- DSH-backed `code_lsp_probe` execution lives in `delta-code-adapter/providers/dsh/lsp.ts`; language-server status classification is an SDK-free Coding policy. Existing tool import paths remain compatibility facades.
- Coding, Quality and Repository feature assembly accepts only Delta-owned named-tool contracts. DSH-specific tool construction lives in `delta-code-adapter/providers/dsh/feature-tools.ts`; no Host SDK types enter their feature entrypoints.
- DSH tool implementation, Host FS and subprocess access are now owned by `delta-code-adapter/providers/dsh/`; Coding, Quality and Repository modules retain Host-independent policy/operation contracts and legacy compatibility facades.
- Coding task selection and Skills data live in `delta-code-strategy` with no Host dependencies. DSH Inbox events, Skills service registration and static/dynamic prompt installation live in `delta-code-adapter/providers/dsh`; composition supplies registration callbacks to Strategy.

- Public `src/types.ts` contains only Host-independent configuration/result types. Cordis Context augmentation and DSH prompt type imports are isolated in `delta-code-adapter/providers/dsh/host-types.ts`.
- External APIs are not runtime-version-pinned; compatibility depends on available, semantically verified capabilities.
- Repository and coding business rules must not own GitHub authentication or raw HTTP transport.
- Pure GitHub account selection, remote origin parsing, branch, path and SHA checks live in `delta-code-repository/github-policy.ts`; the DSH tool wrapper imports this policy without owning it.
- GitHub accounts use optional explicit repository bindings to select credentials across organizations; ambiguous repository bindings fail during configuration validation. Legacy owner selection remains available.
- Host permission denial must never be downgraded to Node filesystem access or shell execution.
- Kernel does not schedule agent work, store sessions, maintain a model catalog or own context compression.
- Old `lib/tools/*` and root import paths remain as compatibility re-exports until consumers are migrated and existing tests pass.
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
