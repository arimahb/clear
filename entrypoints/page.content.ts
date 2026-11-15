// Main-world content script, registered at document_start only for "always on"
// sites, so autoplay can be stopped before the page starts it.
// Must make no network requests (checked by scripts/check-no-network.mjs).
export default defineContentScript({
  registration: 'runtime',
  noScriptStartedPostMessage: true,
  world: 'MAIN',
  main() {},
});
