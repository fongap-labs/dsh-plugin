# AGENTS

## Common rules

- Inspect the requested branch, source SHA, relevant code and existing contracts before editing. Do not read unrelated trees or expand the task.
- Reuse existing implementations; fix the root cause. Delete obsolete code. No speculative features, duplicate abstractions, unnecessary dependencies, fallback stacking or new workflows.
- Own boolean variables and parameters must use is/has/can/should: `enabled` -> `isEnabled`, `retry` -> `shouldRetry`; Python/Rust: `is_enabled`. Preserve external protocol names.
- Use precise language-native identifiers. Governed file names: `helper.ts` -> `validate-token-format.ts`. Own external configuration: `AW_TOKEN` -> `AW_STATUS_TOKEN`. Use three semantic segments; preserve standard platform names.
- Comments: add or retain only if omission would cause a concrete foreseeable error. Delete optional explanations, code narration, decorative separators and commented-out code. Preserve required legal notices, machine directives and external contracts.
- Tests: verify necessary observable behavior, security and regressions. Extend existing coverage before adding tests. Delete redundant or retired tests; never weaken useful coverage. Externalizable tests belong in the central test packs; local tests require an existing approved exception.
- Update existing authoritative documentation; no duplicate guides, task summaries or speculative plans.
- Commit and PR titles: only feat/fix/chore, in English (e.g. `fix(auth): reject invalid token`). Every commit requires a blank line and a substantive Chinese body explaining why and what changed. No AI attribution.
- Update only the Unreleased section of CHANGELOG.md with matching Chinese entries (feat=addition, fix=correction, chore=maintenance); do not rewrite released history.
- Use the declared target branch; omitted targets mean main. main is stable/production; dev is Beta only when enabled. Never fall back to another branch. No direct protected-branch writes, cross-branch transfer or history rewrite without the applicable authorization.
- No secrets in code, logs or untrusted execution. No bypass of security, CI, merge or release gates. Never change tests merely to obtain green status.
- Run the applicable central preflight before submission; fix introduced failures. Verify the final diff and actual outcomes. Report unverified checks and blockers; never claim success without fresh evidence.

## Branch rules

- main is stable/production; dev is Beta only. Use independent task branches and PRs.

## Repository rules

- Keep plugins independent: Suite owns general interaction, Code owns coding orchestration, Shared owns neutral utilities and Host owns execution, sessions, models, credentials and authorization. No cross-plugin internal imports or second Agent runtime.
- Use public Host contracts only. No private DOM/Store patches, credential reads, network proxy or Vision Bridge revival. When a public capability is absent, disable only the affected feature and preserve native behavior.
- Keep the kernel limited to registration, lifecycle, failure isolation and rollback; inject dependencies at composition boundaries.
- Before changing a product, read docs/ARCHITECTURE_GOVERNANCE.md, docs/SECURITY.md, docs/COMPATIBILITY.md, projects/architecture.json and the affected architecture/readiness contracts. Update relevant contracts and behavior evidence together; static/Windows source CI does not prove real Host acceptance.
- Heavy CI/build/release/deploy/task execution belongs centrally. Externalizable tests belong in Action Worker tests/packs/plugins/. Keep both approved workflow bridges byte-identical to their central templates; no third bridge or independent workflow. Declare runner profiles in .github/execution-manifest.json, never names or labels.
- Only the approved bridge may use AW_DISPATCH_TOKEN. No other repository secrets or cross-repository write credentials.
