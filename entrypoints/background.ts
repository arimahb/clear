// Service worker. It must never send page URLs or content anywhere.
// The toolbar button and keyboard shortcut toggle calm mode on the current tab,
// using the temporary access activeTab gives for that click.
import { CALM_CSS } from '@/lib/calm-css';
import type { Message } from '@/lib/protocol';
import { loadSettings } from '@/lib/settings';

const TITLE_OFF = 'CLEAR: calm this page';
const TITLE_ON = 'CLEAR: calm mode is on. Click to undo.';
const TITLE_BLOCKED = 'CLEAR cannot change this page';

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
  const current = (await browser.tabs.sendMessage(tabId, { type: 'calm/query' } satisfies Message, {
    frameId: 0,
  })) as Message;
  const active = current.type === 'calm/status' && current.active;

  if (active) {
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
  await showState(tabId, !active);
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) void toggleCalm(tab.id);
  });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-calm' && tab?.id !== undefined) void toggleCalm(tab.id);
  });
});
