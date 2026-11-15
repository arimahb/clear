// What runs in the page (isolated world) for both ways CLEAR starts:
// - entrypoints/content.ts, injected when the user clicks CLEAR or presses its shortcut;
// - entrypoints/auto.content.ts, registered for every website when the user turns that on.
// Must make no network requests (checked by scripts/check-no-network.mjs).
import { markCalmEarly, startCalm, type CalmSession } from './calm';
import { scanPage } from './forecast';
import { showForecastBar } from './forecast-bar';
import { isSkippedSite, type CalmSettings, type Forecast, type Message } from './protocol';
import { loadSettings } from './settings';

export function runInPage({ auto }: { auto: boolean }): void {
  // Both scripts share CLEAR's isolated world, and the background may inject
  // the on-demand one on every click. Only the first copy on a page listens.
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

  const apply = (settings: CalmSettings, showForecast: boolean) => {
    if (session) return;
    settings = forThisFrame(settings);
    // Count first, so the forecast describes the page before calm mode changed it.
    if (isTopFrame) forecast = scanPage();
    session = startCalm(settings, {
      restructureAfter: document.readyState === 'complete' ? undefined : loadedAndSettled(),
    });
    if (!isTopFrame || !showForecast) return;
    if (document.readyState === 'complete') {
      hideBar = showForecastBar(forecast!);
      return;
    }
    // Calmed while loading (every-website mode): many sites build their content
    // with scripts after that, so count again once the page has loaded.
    const early = forecast!;
    const current = session;
    const showWhenLoaded = () => {
      if (session !== current) return;
      forecast = mergeForecasts(early, scanPage());
      hideBar = showForecastBar(forecast);
    };
    addEventListener('load', showWhenLoaded, { once: true });
    hideBar = () => removeEventListener('load', showWhenLoaded);
  };

  const undo = () => {
    session?.stop();
    session = null;
    hideBar?.();
    hideBar = null;
  };

  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    switch (message.type) {
      case 'calm/query':
        sendResponse(status());
        break;
      case 'calm/apply':
        apply(message.settings, message.showForecast);
        sendResponse(status());
        break;
      case 'calm/undo':
        undo();
        sendResponse(status());
        break;
      case 'forecast/request':
        if (isTopFrame) sendResponse({ type: 'forecast/result', forecast: forecast ?? scanPage() });
        break;
    }
  });

  if (auto) void startAutomatically(apply, () => session !== null);
}

async function startAutomatically(
  apply: (settings: CalmSettings, showForecast: boolean) => void,
  isActive: () => boolean,
): Promise<void> {
  const settings = await loadSettings();
  if (isSkippedSite(location.hostname, settings.everySite.skipSites)) return;
  // Stop motion and soften colours straight away, so the page never shows
  // uncalmed. The rest waits for the page to be parsed: watching every element
  // as it arrives would slow page loading.
  const unmark = markCalmEarly(forThisFrame(settings.calm));
  const start = () => {
    // The user may have turned calm mode on by hand in the meantime.
    if (isActive()) return;
    unmark();
    apply(settings.calm, settings.forecast.showBar);
    if (window === window.top) void browser.runtime.sendMessage({ type: 'calm/started' } satisfies Message);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

// After the load event, page scripts often still build the page for a moment.
const SETTLE_MS = 1500;

/** Resolves a little after the page has loaded. */
function loadedAndSettled(): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => setTimeout(resolve, SETTLE_MS);
    if (document.readyState === 'complete') settle();
    else addEventListener('load', settle, { once: true });
  });
}

/**
 * Combines a count taken while the page loaded with one taken after. Calm mode
 * has stopped things by the second count, so keep the larger of each number.
 */
function mergeForecasts(early: Forecast, late: Forecast): Forecast {
  const merged = { ...late };
  for (const key of Object.keys(late) as Array<keyof Forecast>) {
    if (key === 'cookieBanner') merged.cookieBanner = early.cookieBanner || late.cookieBanner;
    else merged[key] = Math.max(early[key], late[key]);
  }
  return merged;
}

/**
 * Frames are drawn through the top page's colour filter already, and popups,
 * cookie banners and ads are judged by the top page as a whole.
 */
function forThisFrame(settings: CalmSettings): CalmSettings {
  if (window === window.top) return settings;
  return { ...settings, colourMode: 'off', hidePopups: false, hideCookieBanners: false, dimAds: false };
}
