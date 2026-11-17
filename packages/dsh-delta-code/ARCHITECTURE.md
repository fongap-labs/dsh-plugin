# Delta Code Architecture 2.0

Delta Code is one installable Harness plugin with a small composition kernel and peer feature modules. This document describes module ownership; it is not a second Agent runtime.

| Directory | Responsibility |
|---|---|
| `delta-code-kernel/` | Feature declarations, duplicate-contract checks, lifecycle composition and rollback |
| `delta-code-adapter/contracts/` | Delta-owned types stable across external providers |
| `delta-code-adapter/providers/dsh/` | Cordis tool registration, Host FS, native retries, service access and read-only capability diagnostics |
| `delta-code-adapter/providers/github/` | GitHub HTTP, token reference resolution and transport errors |
| `delta-code-strategy/` | Host-neutral coding route policy and Skills data; Host integrations are injected by composition |
| `delta-code-coding/` | Editing, static project discovery, LSP probes and diagnostics |
| `delta-code-quality/` | Verification, task recovery, delivery evidence and failure policy |
| `delta-code-repository/` | Workspace, Git, worktrees, repository selection, PR and CI business rules |
| `delta-code-collaboration/` | Safe native-subagent delegation policy, not a second agent runner |
| `delta-code-support/` | Ephemeral execution counters; no persistent session database |

## Boundaries

- `code_host_probe` and Host capability introspection are implemented solely inside the DSH Adapter. The Coding and `tools/` import paths are compatibility facades; the public tool name, output and cancellation behavior are unchanged.

- Project stack/script/guidance classification lives in Host-independent `delta-code-coding/project-profile-policy.ts`; `profile.ts` retains authorized local and DSH Host file discovery, cancellation and permission boundaries.
- Coding, Quality and Repository feature assembly accepts only Delta-owned named-tool contracts. DSH-specific tool construction lives in `delta-code-adapter/providers/dsh/feature-tools.ts`; no Host SDK types enter their feature entrypoints.
- This does not yet remove Host SDK imports from the individual tool implementations; those are the next migration seam.
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
