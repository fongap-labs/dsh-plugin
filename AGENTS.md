# Agent Guide

## Documentation map

Read docs/README.md for architecture, development, operations, and product design documents.

This repository is a managed Fongap Labs repository. Shared governance (task dispatch, PR governance, CI evidence, merge gate, release and deploy policy, naming, changelog and attribution rules) is owned by `fongap-labs/action-worker`. Do not copy it here.

Shared documents: https://github.com/fongap-labs/action-worker/tree/main/docs

## Required reading

1. Action Worker `skills/agent-execution/SKILL.md`
2. Action Worker `docs/01_SHARED_GOVERNANCE.md`
3. Action Worker `docs/05_INTEGRATION_GUIDE.md`
4. Action Worker `docs/DEVELOPMENT_GUIDE.md`
5. Action Worker `docs/04_CHANGELOG_CONVENTIONS.md`, before any change requiring an Unreleased changelog entry
6. `README.md`

## Project boundary

- This repository owns independent Delta / DeepSeek Harness plugins: product code, approved non-externalizable tests, and project build and package scripts. New externalizable tests belong in Action Worker `tests/packs/plugins/`.
- Heavy execution (CI, build, AI review, release, deploy, task) runs in Action Worker. Do not add full CI, release or deploy workflows here.
- `.github/workflows/notify-action-worker.yml` is the approved event bridge. It is the only local workflow; do not restore duplicate main CI dispatch. The bridge must stay byte-identical to `templates/bridge/notify-action-worker.yml` in Action Worker.
- Project execution needs are declared in `.github/execution-manifest.json` once the project scripts exist. The manifest declares runner profiles, never runner names or labels.
- Commit and pull request attribution follow the commit hygiene section of Action Worker `AGENTS.md`.

## Product architecture

- Read `docs/ARCHITECTURE_GOVERNANCE.md`, `docs/SECURITY.md`, `docs/COMPATIBILITY.md`, `projects/architecture.json`, and the affected product architecture/readiness contracts before changing a product.
- Keep Suite, Code, Shared and Host ownership distinct. No product-to-product internal imports, second Agent runtime, private Host patches, proxy or Vision Bridge revival. Missing public Host capabilities must preserve native behavior.
- Update the affected contract, implementation and regression tests together. Do not infer real Host acceptance from static checks or Windows source CI.

## Project prohibitions

- Do not store central secrets, tokens or cross-repository write credentials in this repository. The only repository secret allowed is `AW_DISPATCH_TOKEN`, used by the bridge.
- Do not name self-hosted runners, runner labels or runner groups.
- Do not add workflows that use `pull_request_target`, except the approved bridge.

## Commit messages

- Follow the organization’s required format for commit titles. Every non-empty Git commit body must use Chinese for its natural-language explanation; preserve technical identifiers, paths, and commands verbatim. See the [changelog conventions](https://github.com/fongap-labs/action-worker/blob/main/docs/04_CHANGELOG_CONVENTIONS.md).
