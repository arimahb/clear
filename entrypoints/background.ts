// Service worker. It must never send page URLs or content anywhere.
// The toolbar button and keyboard shortcut toggle calm mode on the current tab,
// using the temporary access activeTab gives for that click. When the user
// gives CLEAR access to all sites, it also registers a content script that
// calms every page as it loads.
import { EVERY_SITE_ORIGINS, type Message } from '@/lib/protocol';
import { loadSettings } from '@/lib/settings';

const TITLE_OFF = 'CLEAR: calm this page';
const TITLE_ON = 'CLEAR: calm mode is on. Click to undo.';
const TITLE_BLOCKED = 'CLEAR cannot change this page';
const TITLE_RELOAD = 'CLEAR was updated. Reload this page to use it here.';

const CALM_CSS_FILE = 'calm.css';
const AUTO_SCRIPT_ID = 'clear-every-site';

// Tabs with a toggle in progress, so a quick double click can't run two at once.
const busy = new Set<number>();
// A toggle that takes longer than this has hung; let the next click try again.
const TOGGLE_TIMEOUT_MS = 10_000;

async function showState(tabId: number, active: boolean): Promise<void> {
  await browser.action.setBadgeBackgroundColor({ tabId, color: '#2f5d62' });
  await browser.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
  await browser.action.setTitle({ tabId, title: active ? TITLE_ON : TITLE_OFF });
}

/** Asks the top frame whether calm mode is on. Undefined if CLEAR isn't in the page. */
async function queryCalm(tabId: number): Promise<Message | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, { type: 'calm/query' } satisfies Message, {
      frameId: 0,
    })) as Message | undefined;
  } catch {
    return undefined;
  }
}

async function toggleCalm(tabId: number): Promise<void> {
  const target = { tabId, allFrames: true };
  try {
    // Inject straight away: by default Chrome waits until every frame has
    // finished loading, and on pages with ads some frames never do.
    await browser.scripting.executeScript({
      target,
      files: ['/content-scripts/content.js'],
      injectImmediately: true,
    });
  } catch {
    // Browser pages, the Web Store, and file:// pages without file access.
    await browser.action.setTitle({ tabId, title: TITLE_BLOCKED });
    return;
  }

  // The top frame decides the new state, so all frames switch together.
  const current = await queryCalm(tabId);
  if (current?.type !== 'calm/status') {
    // No listener: a copy from before CLEAR was updated still holds the page.
    await browser.action.setTitle({ tabId, title: TITLE_RELOAD });
    return;
  }

  if (current.active) {
    await browser.tabs.sendMessage(tabId, { type: 'calm/undo' } satisfies Message);
    await browser.scripting.removeCSS({ target, files: [CALM_CSS_FILE] }).catch(() => {});
  } else {
    const { calm, forecast } = await loadSettings();
    await browser.scripting.insertCSS({ target, files: [CALM_CSS_FILE] });
    await browser.tabs.sendMessage(tabId, {
      type: 'calm/apply',
      settings: calm,
      showForecast: forecast.showBar,
    } satisfies Message);
  }
  await showState(tabId, !current.active);
}

function onToggle(tabId: number): void {
  if (busy.has(tabId)) return;
  busy.add(tabId);
  const timeout = new Promise<never>((_, reject) => setTimeout(reject, TOGGLE_TIMEOUT_MS));
  Promise.race([toggleCalm(tabId), timeout])
    .catch(() => browser.action.setTitle({ tabId, title: TITLE_BLOCKED }))
    .finally(() => busy.delete(tabId));
}

/**
 * Registers the every-website script while CLEAR has access to all sites,
 * and removes it otherwise. The permission is the only record of the choice,
 * so revoking it in chrome://extensions turns the feature off.
 */
async function syncEverySite(): Promise<void> {
  const allowed = await browser.permissions.contains({ origins: EVERY_SITE_ORIGINS });
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [AUTO_SCRIPT_ID] });
  if (allowed && registered.length === 0) {
    await browser.scripting.registerContentScripts([
      {
        id: AUTO_SCRIPT_ID,
        js: ['content-scripts/auto.js'],
        css: [CALM_CSS_FILE],
        matches: EVERY_SITE_ORIGINS,
        allFrames: true,
        runAt: 'document_start',
      },
    ]);
  } else if (!allowed && registered.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT_ID] });
  }
}

let syncing = Promise.resolve();
function queueSync(): void {
  // Run one at a time, so two quick changes can't both register the script.
  syncing = syncing.then(syncEverySite).catch(() => {});
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) onToggle(tab.id);
  });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-calm' && tab?.id !== undefined) onToggle(tab.id);
  });

  // Calm mode started by itself in a page (every-website mode): show the badge.
  browser.runtime.onMessage.addListener((message: Message, sender) => {
    if (message.type === 'calm/started' && sender.tab?.id !== undefined && sender.frameId === 0) {
      void showState(sender.tab.id, true).catch(() => {});
    }
  });
  // When a page finishes loading, make the badge match the page. A new page
  // has no CLEAR in it (no answer) unless every-website mode calmed it. Only
  // the load status is read, never the address.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;
    void queryCalm(tabId)
      .then((reply) => showState(tabId, reply?.type === 'calm/status' && reply.active))
      .catch(() => {});
  });

  browser.runtime.onInstalled.addListener(queueSync);
  browser.runtime.onStartup.addListener(queueSync);
  browser.permissions.onAdded.addListener(queueSync);
  browser.permissions.onRemoved.addListener(queueSync);
});
