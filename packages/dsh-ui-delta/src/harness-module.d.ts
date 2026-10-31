/**
 * Type declarations for the Harness browser module loader.
 *
 * The browser client runs inside a factory(require) closure where `require`
 * is a runtime callback injected by the Harness module loader — NOT Node's
 * require. React and other dependencies are obtained through this callback.
 *
 * This file must be included in tsconfig.client.json "include" so the
 * factory(require) parameter is correctly typed.
 */

/**
 * Minimal local React surface.
 *
 * The browser bundle is loaded by the Harness module loader, which provides
 * React at runtime; `@types/react` is not a dependency of this package, so the
 * small slice of the API this client uses is declared here instead of pulling
 * the full React typings into the build.
 */
interface HarnessReactElement {
  type: unknown;
  props: Record<string, unknown>;
  key: string | number | null;
}

interface HarnessReactChangeEvent<T = Element> {
  target: T & { value: string };
}

interface HarnessReact {
  createElement(
    type: string,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): HarnessReactElement;
  useState<S>(initial: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
}

interface HarnessModuleFactory {
  (require: HarnessRequire): HarnessModuleExports;
}

interface HarnessRequire {
  (module: 'react'): HarnessReact;
  (module: string): unknown;
}

interface HarnessModuleExports {
  /** Inject list for the Harness client plugin registry. */
  inject: string[];
  /** Apply function called when the plugin is activated. */
  apply(ctx: HarnessClientContext): void | (() => void);
}

/** Client-side plugin context provided by the Harness host. */
interface HarnessClientContext {
  /** Theme service for token overrides. */
  theme: {
    /** Override a set of CSS custom properties (tokens) for this plugin. */
    overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void;
  };
  /** Slots service for UI injection. */
  slots: {
    /** Inject a slot factory into a named slot. */
    inject(slot: string, factory: () => unknown): void;
    /** Register a component into a slot with metadata. */
    register(meta: { name: string; id: string; order: number; label: string }, component: unknown): unknown;
    /** Dynamic slot readers (varies by Harness version). */
    entriesOfSlot?(name: string): unknown;
    entries?(name: string): unknown;
    slotEntries?(name: string): unknown;
    get?(name: string): unknown;
    getSlot?(name: string): unknown;
    ofSlot?(name: string): unknown;
    slot?(name: string): unknown;
    /** Nested slots object. */
    slots?: Record<string, unknown>;
    /** Registry of slot definitions. */
    registry?: Record<string, unknown>;
    /** Map of slot names to entries. */
    map?: Record<string, unknown>;
    /** Array of slot definitions. */
    definitions?: unknown[];
    [key: string]: unknown;
  };
  /** Effect service for lifecycle-managed side effects. */
  effect(fn: () => void | (() => void), label?: string): void;
  /** Optional service for product analytics. */
  productAnalytics?: {
    track(event: string, properties?: Record<string, unknown>): void;
  };
  /** Optional Better Sidebar service. */
  betterSidebar?: {
    openTab(options: { type: string }): void;
  };
  /** Optional generic service getter. */
  get?(serviceName: string): unknown;
  [key: string]: unknown;
}

/** Module loader entry as accepted by window.__ModuleLoader__.load. */
interface ModuleLoaderEntry {
  id: string;
  factory: HarnessModuleFactory;
}

/** Augment the global Window with the Harness module loader. */
interface Window {
  /** Harness module loader — loads a plugin factory. */
  __ModuleLoader__: {
    load(entry: ModuleLoaderEntry): void;
    modules?: Record<string, unknown>;
    registry?: Record<string, unknown>;
    cache?: Record<string, unknown>;
    definitions?: Record<string, unknown>;
    [key: string]: unknown;
  };
  /** Diagnostic object exposed by DeltaUI for debugging. */
  __ensDiag?: {
    version: string;
    ua: string;
    url: string;
    slotsApi: string[];
    dom: Record<string, unknown>;
    moduleProbe: unknown[];
    attempts: unknown[];
  };
  /** Module feature flags exposed by DeltaUI. */
  __deltaModules?: {
    list: Array<{ id: string; zh: string; en: string; status?: string; defaultOn?: boolean; zhDesc: string; enDesc: string }>;
    enabled: (id: string) => boolean;
  };
  /** Export conversation function exposed by DeltaUI. */
  __deltaExportConversation?: () => void;
}