# Delta Desktop: MECE ownership and extensibility architecture

## Decision

Refactor by **business capability and ownership**, not by file length or type declarations. MECE means each behavior has **one authoritative owner** and **every existing behavior** is assigned; dependencies between owners use explicit ports. Layers and features are orthogonal classifications, not a second competing list of business owners.

Machine-readable taxonomy: `projects/dsh-delta-desktop/architecture-mece.json`.

## Feature map

| Single accountable owner | Responsibility | Delegates to |
| --- | --- | --- |
| `shell` | Bootstrap, official/Delta fallback, theme, i18n, branding, feature preferences, lifecycle and notifications | Domain features and Host capabilities |
| `sessions` | Session/workspace state, listing projections, move, delete, archive, default workspace protection | Security for authorization and locked-session access |
| `discovery` | Seven-category SearchPalette, search index, keyboard shortcuts, result navigation | Sessions read/query ports; Host adapter for navigation |
| `context` | Assistant discussion/optimization, context usage, durable compaction progress | Host model execution and Security approvals |
| `security` | Identity, TOTP, lock permissions, privacy/redaction, data egress and access policy | Host for enforcement, secret resolution and audit |
| `integrations` | MCP management, Vision routing, provider credentials reference, proxy | Security for all external access decisions; Host credential service |

A policy is never duplicated inside Sessions or Integrations. Vision routing is an integration; permission to send an image is a Security decision. Session archive/move is a Sessions action; TOTP authorization is Security. Search only queries/navigates and never alters workspace state.

## Layering and dependency rule

```text
Bootstrap / Shell                      (startup, mode switch, failure fallback)
    │
Feature Registry                       (descriptor, capability gating, lifecycle)
    │
Feature Domains                        (the six MECE accountable owners)
    │
Typed Ports                            (versioned, narrow, read-only by default)
    │
Host Adapter: DSH vN                   (only interpreter of supported DSH APIs)
    │
DSH Host                              (execution, storage, credentials, final permission)
```

UI is a projection of domain state and may extend only the **left sidebar**, **right sidebar** and **settings**. Existing ZIP-authoritative window, modal chrome, navigation and SearchPalette behavior remain unchanged while the adapter is migrated. The registry does not create a new Host-private DOM entry point.

Future Delta Native runtime uses the same domain contracts with a different adapter. Neither the DSH adapter nor DSH's plugin system belongs inside the domain/kernel itself.

## Stable extension contract (target)

```ts
type FeatureOwner = 'shell' | 'sessions' | 'discovery'
  | 'context' | 'security' | 'integrations'

type Surface = 'left-sidebar' | 'right-sidebar' | 'settings'

interface DeltaDesktopFeature {
  id: string
  owner: FeatureOwner
  requires: readonly string[]        // supported Host capabilities, version-checked
  surfaces: readonly Surface[]
  mount(context: Readonly<FeatureContext>): () => void
}
```

Registry requirements: reject duplicate IDs and undeclared surfaces; do not initialize features whose required capabilities are missing; isolate optional feature failures; dispose in reverse mount order. **Shell boot is successful only after a real working UI is attached**; otherwise hand control back to DSH native UI. A missing optional MCP/Vision feature must not take down conversations.

Security is a Host-enforced, deny-before-action boundary. File modifications and external data egress require a scope check immediately before execution. Approval choices remain **deny / allow once / allow for conversation**, not a silent permanent allow. A plugin cannot register a new privileged operation merely by declaring a UI surface. No bypasses through a client-side state flag.

## Legacy compatibility and migration sequence

Current `packages/dsh-delta-desktop/src/client.ts` is more than 7,000 lines. It contains two large DOM compatibility entry points (`installSidebarCompatibility` and `installHostSearch`), a compound client feature manager, and a broad bootstrap/module factory. Host-side redaction, Vision and context projection are already separate.

0. **First implementation landed in this PR:** `src/feature-registry.ts` enforces owner IDs, allowed surfaces, capability prerequisites, unique registration and reverse lifecycle cleanup. `src/index.ts` now uses it for Host feature modules. It does **not** yet modularize browser `client.ts` or create unrestricted new Host capabilities.
1. **Freeze and measure:** lock approved ZIP CSS/legacy adapter signatures during release; inventory each action, event, snapshot projection and permission boundary. Treat DOM coupling as explicit technical debt, never a core extension API.
2. **Extract ports and registry:** define read-only queries versus Host-authorized commands; introduce a real owner registry, capability negotiation and lifecycle tests. Do not add an unused parallel registry.
3. **Move business behaviors by owner:** start with pure query/context logic, then MCP/Vision, and only then the session-security coupling. Keep each migration independently reversible.
4. **Retire DOM takeover:** replace private selectors with DSH public slots/capabilities where actually supported. Preserve the exact ZIP interaction contract; if DSH cannot support one feature, report it as pending rather than privately monkey-patching Host internals.
5. **Dual-runtime verification:** identical feature-contract suite under DSH Adapter and future native adapter; Windows DSH UI test for session search, navigation, 2FA, MCP/Vision and fallback before release.

### Required gates per migration

- No duplicate feature ownership or registration IDs.
- Import graph runs downward through ports; no feature imports another feature's internals.
- Host authorization and privacy tests remain fail-closed.
- Client bundle still has one `__ModuleLoader__` registration and no unresolved runtime imports.
- ZIP visual/search/keyboard/TOTP contract tests pass on Linux and Windows.
- CI Evidence, PR Governance and validate-merge must pass on the exact head; release version stays manually controlled.

The current release-guard exception for verified ZIP compatibility must be removed when the Host-independent adapter is shipped, not expanded into a permanent global waiver.
