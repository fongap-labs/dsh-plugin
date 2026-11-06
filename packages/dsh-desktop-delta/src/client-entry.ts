/**
 * Delta Desktop client-side activation bridge for the native Harness window.
 *
 * The Electron shell always starts at dsh-app://app/ and imports enabled client
 * plugins. We replace THAT document with the Host-served Delta page once its
 * authenticated route is ready. This keeps exactly one active renderer, does
 * not launch a second Harness process, and does not mount the original Suite UI.
 *
 * Browser-only Harness usage remains unchanged: redirect is strictly limited
 * to the desktop app's own main origin and initial shell document.
 */
window.__ModuleLoader__.load({
  id: '@fongap-labs/dsh-desktop-delta',
  factory(_require: HarnessRequire): HarnessModuleExports {
    return {
      inject: [],
      apply(_ctx: HarnessClientContext): void {
        const page = window.location;
        if (page.protocol !== 'dsh-app:' || page.hostname !== 'app'
          || (page.pathname !== '/' && page.pathname !== '/index.html')) return;

        // Never hijack desktop navigation until the plugin Host route has
        // confirmed that it is available and the current peer is authorized.
        const activate = async (): Promise<void> => {
          try {
            const response = await fetch('/dsh-ui-delta/app/status', {
              cache: 'no-store',
              credentials: 'same-origin',
            });
            if (!response.ok) return;
            const status: unknown = await response.json();
            if (status === null || typeof status !== 'object'
              || !('authenticated' in status) || status.authenticated !== true
              || !('desktop' in status) || status.desktop !== 'Delta Desktop') return;
            if (window.location.protocol !== 'dsh-app:' || window.location.hostname !== 'app'
              || !['/', '/index.html'].includes(window.location.pathname)) return;
            window.location.replace('/dsh-ui-delta/app');
          } catch {
            // Host may be stopping, or plugin disabled mid-boot: leave the
            // existing document intact rather than crash the entire desktop.
          }
        };
        void activate();
      },
    };
  },
});
