// Service worker. It must never send page URLs or content anywhere.
// The toolbar button and keyboard shortcut toggle calm mode on the current tab,
// using the temporary access activeTab gives for that click.
import { CALM_CSS } from '@/lib/calm-css';
import type { Message } from '@/lib/protocol';
import { loadSettings } from '@/lib/settings';

const TITLE_OFF = 'CLEAR: calm this page';
const TITLE_ON = 'CLEAR: calm mode is on. Click to undo.';
const TITLE_BLOCKED = 'CLEAR cannot change this page';
const TITLE_RELOAD = 'CLEAR was updated. Reload this page to use it here.';

// Tabs with a toggle in progress, so a quick double click can't run two at once.
const busy = new Set<number>();

async function showState(tabId: number, active: boolean): Promise<void> {
  await browser.action.setBadgeBackgroundColor({ tabId, color: '#2f5d62' });
  await browser.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
  await browser.action.setTitle({ tabId, title: active ? TITLE_ON : TITLE_OFF });
}

async function toggleCalm(tabId: number): Promise<void> {
  const target = { tabId, allFrames: true };
  try {
    await browser.scripting.executeScript({ target, files: ['/content-scripts/content.js'] });
  } catch {
    // Browser pages, the Web Store, and file:// pages without file access.
    await browser.action.setTitle({ tabId, title: TITLE_BLOCKED });
    return;
  }

  // The top frame decides the new state, so all frames switch together.
  let current: Message | undefined;
  try {
    current = (await browser.tabs.sendMessage(tabId, { type: 'calm/query' } satisfies Message, {
      frameId: 0,
    })) as Message | undefined;
  } catch {
    // No listener: a copy from before CLEAR was updated still holds the page.
  }
  if (current?.type !== 'calm/status') {
    await browser.action.setTitle({ tabId, title: TITLE_RELOAD });
    return;
  }

  if (current.active) {
    await browser.tabs.sendMessage(tabId, { type: 'calm/undo' } satisfies Message);
    await browser.scripting.removeCSS({ target, css: CALM_CSS }).catch(() => {});
  } else {
    const { calm, forecast } = await loadSettings();
    await browser.scripting.insertCSS({ target, css: CALM_CSS });
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
  toggleCalm(tabId)
    .catch(() => browser.action.setTitle({ tabId, title: TITLE_BLOCKED }))
    .finally(() => busy.delete(tabId));
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) onToggle(tab.id);
  });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-calm' && tab?.id !== undefined) onToggle(tab.id);
  });
  // A new page starts uncalmed, so clear the badge. Needs no `tabs` permission:
  // only the status is read, never the address.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') void showState(tabId, false).catch(() => {});
  });
});
