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
