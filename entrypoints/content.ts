// Isolated-world content script for calm mode on demand. Not listed in the
// manifest: the background injects it with activeTab when the user clicks
// CLEAR or presses its shortcut.
// Must make no network requests (checked by scripts/check-no-network.mjs).
import { runInPage } from '@/lib/content-main';

export default defineContentScript({
  registration: 'runtime',
  noScriptStartedPostMessage: true,
  main() {
    runInPage({ auto: false });
  },
});
