# Delta Code Architecture 2.0

Delta Code is one installable Harness plugin with a small composition kernel and peer feature modules. This document describes module ownership; it is not a second Agent runtime.

| Directory | Responsibility |
|---|---|
| `delta-code-kernel/` | Feature declarations, duplicate-contract checks, lifecycle composition and rollback |
| `delta-code-adapter/contracts/` | Delta-owned types stable across external providers |
| `delta-code-adapter/providers/dsh/` | Cordis tool registration, Host FS, native retries and service access |
| `delta-code-adapter/providers/github/` | GitHub HTTP, token reference resolution and transport errors |
| `delta-code-strategy/` | Coding Skills, route selection and prompt registration |
| `delta-code-coding/` | Editing, static project discovery, LSP probes and diagnostics |
| `delta-code-quality/` | Verification, task recovery, delivery evidence and failure policy |
| `delta-code-repository/` | Workspace, Git, worktrees, repository selection, PR and CI business rules |
| `delta-code-collaboration/` | Safe native-subagent delegation policy, not a second agent runner |
| `delta-code-support/` | Ephemeral execution/A-B counters; no persistent session database |

## Boundaries

- External APIs are not runtime-version-pinned; compatibility depends on available, semantically verified capabilities.
- Repository and coding business rules must not own GitHub authentication or raw HTTP transport.
- Host permission denial must never be downgraded to Node filesystem access or shell execution.
- Kernel does not schedule agent work, store sessions, maintain a model catalog or own context compression.
- Old `lib/tools/*` and root import paths remain as compatibility re-exports until consumers are migrated and existing tests pass.
- Native DSH `tools` and `subprocess` registration remains the historical top-level contract in this first migration. Replacing it with module-scoped service dependencies requires separate real Cordis lifecycle tests.
- An absent provider is not the same as an explicitly denied provider; fail closed where permission semantics cannot be preserved.

## Migration / acceptance

1. Preserve public `code_*` tools, plugin ID and configuration contracts.
2. Verify module loading/unloading and deferred prompt/skill registration.
3. Validate TypeScript, existing regression tests and Github/AW gate.
4. Test real Harness FS writes, scoped command execution, workflow cancellation, account routing and hot reload before release.
5. Only then remove obsolete compatibility facades and duplicate implementation paths.
