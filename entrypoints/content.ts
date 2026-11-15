// Isolated-world content script: calm mode and the Page Forecast.
// Not listed in the manifest. The background injects it with activeTab
// (on demand) or registers it for sites the user made "always on".
// Must make no network requests (checked by scripts/check-no-network.mjs).
import { startCalm, type CalmSession } from '@/lib/calm';
import { scanPage } from '@/lib/forecast';
import { showForecastBar } from '@/lib/forecast-bar';
import type { Forecast, Message } from '@/lib/protocol';

export default defineContentScript({
  registration: 'runtime',
  noScriptStartedPostMessage: true,
  main() {
    // The background injects this file on every toolbar click. Only the first
    // copy on a page listens; this flag lives in CLEAR's world, not the page's.
    const world = globalThis as { __clearLoaded?: boolean };
    if (world.__clearLoaded) return;
    world.__clearLoaded = true;

    const isTopFrame = window === window.top;
    let session: CalmSession | null = null;
    let forecast: Forecast | null = null;
    let hideBar: (() => void) | null = null;

    const status = (): Message => ({
      type: 'calm/status',
      active: session !== null,
      changes: session?.changes() ?? 0,
    });

    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      switch (message.type) {
        case 'calm/query':
          sendResponse(status());
          break;
        case 'calm/apply':
          if (!session) {
            // Count first, so the forecast describes the page before calm mode changed it.
            if (isTopFrame) {
              forecast = scanPage();
              if (message.showForecast) hideBar = showForecastBar(forecast);
            }
            session = startCalm(message.settings);
          }
          sendResponse(status());
          break;
        case 'calm/undo':
          session?.stop();
          session = null;
          hideBar?.();
          hideBar = null;
          sendResponse(status());
          break;
        case 'forecast/request':
          if (isTopFrame) sendResponse({ type: 'forecast/result', forecast: forecast ?? scanPage() });
          break;
      }
    });
  },
});
