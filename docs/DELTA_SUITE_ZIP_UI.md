# ZIP-first UI integration contract

UI authority: user-provided `dsh-delta-desktop(3).zip` from 2026-11-12.
The runtime stylesheet is selector-equivalent to ZIP blob `8d893d7ecfe4a82703aa17ed4935ecdf4b773773`. CSS six-digit Unicode escapes stand in for non-ASCII selectors/comments to meet the existing engineering-language gate. The contract test reconstructs and checks the canonical ZIP SHA.
ZIP controls sidebar, search field, Ctrl/Cmd+K, 7 SearchPalette tabs, modal chrome,
TOTP/session dialogs and the existing personalization appearance.

The repository contributes **only additive** features registered through public slots:
- context assistant (right pane, discussion/optimization, compaction activity)
- MCP manager under the official Plugins add-actions
- extended feature preferences and Vision credentials through settings section
- existing Host modules for redaction, perception, privacy, session search and proxy.

Never reintroduce the legacy `installHostSearch` or `.dtd-search-dialog` UI.
Existing ZIP search binding must not open the palette on focus/click.
`src/feature-extras.css` contains only new-feature selectors that are not
present in ZIP CSS. Keep feature CSS separated from the UI-authoritative theme.

Acceptance: ZIP signature tests, complete TypeScript builds, context/MCP
contract tests, Linux/Windows/Security CI and actual DSH Desktop verification.

## Release gate and migration boundary

The ZIP3 sidebar/search compatibility implementation is a **frozen, reviewed transitional adapter**, not a license to create new Host-private DOM dependencies. `verify-delta-desktop-release.mjs` validates the exact ZIP theme and pinned compatibility-region source digests in both published archives. It still rejects duplicate adapters, the retired search dialog and unauthorized Host registry coupling. Changes to compatibility-region implementation require an explicit reviewed digest update and tests; do not rename identifiers to silence the gate.

Under the MECE migration, Discovery owns SearchPalette/query, Sessions owns durable session/workspace state, Security owns permission/TOTP/privacy, Shell owns feature registration/UI lifecycle. A versioned Host Adapter replaces legacy DOM lookups when the public Host capability is available. ZIP visual behavior and user interactions must be tested on Windows before declaring the adapter retired.
