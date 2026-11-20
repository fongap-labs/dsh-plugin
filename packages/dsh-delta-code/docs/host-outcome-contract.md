# DSH Host capabilities and process outcome evidence

Scope: Delta Code C01–C02; this describes what the adapter can observe, not a new Host permission or global shell interceptor.

## Published DSH interfaces

- The public `ctx.subprocess` contract offers `resolveExecutable` and `spawn`. A spawned handle exposes `done`, which resolves with `exitCode` and `signal`, and `collected` readers that can report lossy output.
- `ctx.subprocess` handles cancellation through the supplied AbortSignal; a deadline or signal does not itself prove that all processes have exited.
- The native `bash` / `pwsh` tools belong to DSH. Delta Code does not rewrite their result envelopes or claim to observe every native shell tool call.
- `ctx.get('fs')`, `ctx.get('workingDirectory')` and `ctx.tools.register` are used only through the existing public Cordis / Host adapter boundaries.

Sources: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subprocess/subprocess/src/types.ts and https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subprocess/subprocess/README.md

## Adapter semantics

1. `code_host_probe` observes whether method surfaces are present. It does not attempt file writes, execute commands or confer authorization. Inaccessible getters stay `inaccessible`; capabilities remain unverified until used.
2. Delta Code considers an exit successful only with a valid zero code, explicit `signal: null` and explicit `timedOut: false`. Missing, malformed, timed-out or signaled outcomes are unconfirmed.
3. A successful exit with lossy/missing output completeness is not complete evidence. `code_git_diff` can return explicitly truncated output, but verification and delivery gates require complete evidence.
4. An unconfirmed write or verification result must not be retried automatically; refresh Host state before deciding how to proceed.
5. If the Host does not expose a documented event for a native tool, this plugin cannot assert that it corrected that native tool's `isError` flag. Such changes belong upstream or to a supported Host extension point.
