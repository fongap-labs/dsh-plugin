---
name: dsh-plugin-dev
description: Develop, test, package, and maintain native DeepSeek Harness plugins in the fongap-labs/dsh-plugin monorepo.
---

# DSH Plugin Development

## Required reading

1. `AGENTS.md` and `CLAUDE.md`
2. `README.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DEVELOPMENT.md`
5. `docs/OPERATIONS.md` before changing release metadata
6. Action Worker shared governance and integration documents referenced by `CLAUDE.md`

## Workspace layout

- `packages/<package>/`: plugin or shared package source, resources, package metadata, README, and LICENSE.
- `projects/<product>/release.manifest.json`: Action Worker release input for independently released products.
- `scripts/`: reusable repository build, bundle, release, and local-profile tooling.
- `tests/`: Node.js regression and contract tests.
- `docs/`: human-maintained project architecture, development, and operations documentation.
- `.agents/skills/<skill-name>/SKILL.md`: agent workflow instructions; one self-contained skill per directory.

## Package identity

- Use the `@fongap-labs/<package-name>` scope. Do not introduce the obsolete `@dsh-plugin/*` scope.
- Keep `package.json.name`, `cordis.patch.yml.name`, package README, and release metadata aligned.
- Keep each plugin independently versioned and releasable.
- Do not rename an already published package without an explicit migration plan.

## Runtime and build contracts

- Host plugins are TypeScript ESM. Export `apply(ctx, config)` and any required `inject` list.
- Host source is compiled by the pinned TypeScript compiler into `lib/*.js` and `lib/*.d.ts`.
- Delta UI browser code is currently one client entry compiled to `lib/client.js`. Preserve the Harness closure-factory contract: `window.__ModuleLoader__.load({ id, factory(require) { ... } })`.
- The browser factory's `require` is injected by the Harness loader; it is not Node's `require`.
- Do not split browser code into local imports unless the build emits one verified client artifact and the installed Harness loads it successfully.
- Host modules may be split by responsibility. Keep public plugin exports, route paths, config shape, and lifecycle behavior stable unless a reviewed change requires otherwise.
- Do not add a bundler or runtime dependency solely to reduce source-file length. Any bundler adoption requires a pinned lockfile and real Harness installation regression tests.

## Commands

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm validate
```

Tests consume compiled package output; build before running the test suite after a clean checkout.

## New plugin checklist

1. Copy `packages/plugin-template` into a new `packages/<name>` directory.
2. Set a unique `@fongap-labs/<name>` package name and Cordis patch ID.
3. Declare explicit `license`, include the matching package `LICENSE`, and keep the default Apache-2.0 unless there is a reason to choose another license.
4. Add `projects/<name>/release.manifest.json` when the plugin is a separately released product.
5. Add focused tests for behavior, lifecycle cleanup, package contents, and release metadata.
6. Update the relevant human-facing documentation in Chinese; keep machine-facing contracts and this skill in English.
7. Run the full validation command set before opening a PR.

## License rules

- Root `LICENSE` and root `package.json.license` define the repository default (Apache-2.0).
- A package may override the default only by declaring its own SPDX expression, shipping its own `LICENSE`, and matching `projects/<name>/release.manifest.json.license_expression`.
- Never infer a third-party dependency's license from the package that consumes it.

## Release and governance

- Heavy CI, PR governance, AI review, release, and deployment are centrally executed by Action Worker.
- Do not add repository-local copies of central workflows or secrets.
- Keep `.github/workflows/notify-action-worker.yml` byte-identical to the Action Worker bridge template.
- The current release-build contract requires a Windows runner profile and a PowerShell entry script. Do not change that contract from this repository alone.
- Never use developer-specific absolute paths or retain one-off source-rewriting scripts in `scripts/`.
