# Agent Guide

This repository is a managed Fongap Labs repository. Shared governance (task dispatch, PR governance, CI evidence, merge gate, release and deploy policy, naming, changelog and attribution rules) is owned by `fongap-labs/action-worker`. Do not copy it here.

Shared documents: https://github.com/fongap-labs/action-worker/tree/main/docs

## Required reading

1. `AGENTS.md`
2. `CLAUDE.md`
3. Action Worker `skills/agent-execution/SKILL.md`
4. Action Worker `docs/01_SHARED_GOVERNANCE.md`
5. Action Worker `docs/05_INTEGRATION_GUIDE.md`
6. Action Worker `docs/DEVELOPMENT_GUIDE.md`
7. Action Worker `docs/04_CHANGELOG_CONVENTIONS.md`, before any change that needs a changelog fragment
8. `README.md`

## Project boundary

- This repository owns the DeepSeek harness plugin: product code, product tests, and project build and package scripts.
- Heavy execution (CI, build, AI review, release, deploy, task) runs in Action Worker. Do not add full CI, release or deploy workflows here.
- `.github/workflows/notify-action-worker.yml` is the only dispatch bridge. It must stay byte-identical to `templates/bridge/notify-action-worker.yml` in Action Worker.
- Project execution needs are declared in `.github/execution-manifest.json` once the project scripts exist. The manifest declares runner profiles, never runner names or labels.
- Commit and pull request attribution follow the commit hygiene section of Action Worker `CLAUDE.md`.

## Project prohibitions

- Do not store central secrets, tokens or cross-repository write credentials in this repository. The only repository secret allowed is `AW_DISPATCH_TOKEN`, used by the bridge.
- Do not name self-hosted runners, runner labels or runner groups.
- Do not add workflows that use `pull_request_target`, except the approved bridge.
