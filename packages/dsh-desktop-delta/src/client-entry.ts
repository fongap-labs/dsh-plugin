/**
 * Compatibility client entry for DeepSeek Harness Web boot.
 *
 * Delta Desktop runs its UI at /dsh-ui-delta/app. The original Suite UI must
 * never mount into the Harness native renderer. The loader still discovers a
 * declared client entry, so it must register the exact package ID and an
 * inert module rather than the retired Suite UI's factory.
 */
window.__ModuleLoader__.load({
  id: '@fongap-labs/dsh-desktop-delta',
  factory(_require: HarnessRequire): HarnessModuleExports {
    return {
      inject: [],
      apply(_ctx: HarnessClientContext): void {
        // No native UI contributions: independent Desktop is a Host-served page.
      },
    }
  },
});
