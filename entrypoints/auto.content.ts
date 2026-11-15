// Isolated-world content script for "Calm every website". Not listed in the
// manifest: the background registers it for every site only while the user
// has given CLEAR access to all sites, and removes it when they take it away.
// Must make no network requests (checked by scripts/check-no-network.mjs).
import { runInPage } from '@/lib/content-main';

export default defineContentScript({
  registration: 'runtime',
  noScriptStartedPostMessage: true,
  main() {
    runInPage({ auto: true });
  },
});
