import { defineConfig } from 'wxt';

// The only place the extension may send data: the "Explain text" server.
// Override with WXT_CLARIFY_ORIGIN at build time (origin only, no path).
const CLARIFY_ORIGIN = process.env.WXT_CLARIFY_ORIGIN ?? 'http://localhost:8787';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CLEAR',
    description:
      'Calms busy web pages, previews what a page contains, and explains confusing messages in plain language.',
    // Keep this list in sync with scripts/manifest-permissions.snapshot.json.
    // `sidePanel` is added by WXT because entrypoints/sidepanel exists.
    // `contextMenus` comes back with "Explain text" (step 5); unused permissions stay out.
    permissions: ['activeTab', 'scripting', 'storage'],
    // Granted one origin at a time, only when the user turns on "always on" for a site.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'CLEAR: calm this page' },
    // A keyboard shortcut grants activeTab just like a toolbar click.
    commands: {
      'toggle-calm': {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Turn calm mode on or off for this page',
      },
    },
    content_security_policy: {
      extension_pages: `script-src 'self'; object-src 'self'; connect-src 'self' ${CLARIFY_ORIGIN}`,
    },
  },
});
