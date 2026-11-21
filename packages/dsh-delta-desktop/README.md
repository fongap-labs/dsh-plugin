# Delta Desktop (B2 prototype)

`@fongap-labs/dsh-delta-desktop` is an **independent DeepSeek Harness plugin** maintained as a sibling of `dsh-delta-suite` and `dsh-delta-code` in the `fongap-labs/dsh-plugin` monorepo. It is not an Electron application.

- Own package manifest, Host and Client entry points, Cordis ID, configs and lifecycle.
- No imports, dependencies or runtime calls to Suite or Code. A pure lifecycle utility has been **copied from Suite** under the MIT license and is independently maintained.
- UI uses public Harness Root Slot and Session Client service.
- The initial UI provides session listing, text-only event previews, creating sessions, and sending text prompts.
- Default profile configuration does **not** disable Harness native UI; the Root component shadows the default AppFrame but does not unload it.
- `cordis.delta-only.patch.yml` is a non-default **experimental candidate** for isolated-profile testing. It is not verified and may break client boot, approvals, settings and third-party plugin interfaces.

## Build and boundaries

The root workspace's `pnpm typecheck`, `pnpm build`, and `pnpm validate` include this sibling package. The source version stays `0.0.0`; it now has a product release manifest and portable artifact verification, but **no Windows acceptance or published release** yet.

B2 is **not finished** until native UI exclusions, API contract parity, permission/approval flows, third-party slots, startup-safe rollback and measured memory improvements are verified. Installing both Delta Suite and Delta Desktop is technically a separate bundle selection, but Suite's native UI additions may no longer be visible under Desktop Root and coexistence is not yet tested.

Development source is in this directory alone; release artifacts must be versioned and published separately from Suite and Code. The new `projects/dsh-delta-desktop/release.manifest.json` opts into the existing Action Worker release contract; no local release workflow was added. The existing generic builder currently permits stable and beta versions only, so the previously suggested alpha tag is **not supported**. This prototype must not be represented as production-ready.

Quick-validation checklist: [docs/quick-validation.md](docs/quick-validation.md). This is not yet a Windows-validated or released build.

## Rapid-validation runtime entry

This first alpha prototype ships **hand-maintained JavaScript source** directly from `src/index.js` and `src/client.js`, with `src/index.d.ts` as its public declaration. It does not require the existing trusted CI's fixed TypeScript compile list to produce `lib/` before bundle validation. Source version stays at `0.0.0`.

The TS feature registry under `src/kernel/` remains independent and may be compiled by the package's local TypeScript build. This is a temporary bootstrap boundary, not an excuse to skip CI. When trusted CI can compile every sibling plugin through its approved control process, the package can migrate back to typed build outputs. Do not commit generated `lib/` files.

## Workspace shell milestone

The Root UI now has a workspace rail, a cwd-based workspace filter, a session browser, a dedicated conversation timeline and a read-only Session diagnostics panel. Workspace labels come from public `SessionSummary.cwd` (not a full Harness workspace registry); this does **not** claim complete workspace lifecycle support. Existing committed user and assistant text uses the public `eventSource`. Tool payloads, approvals, file attachments and transient stream chunks are deliberately not displayed. CI and Windows smoke proof remain mandatory.
