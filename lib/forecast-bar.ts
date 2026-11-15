// The Page Forecast: a small card in the bottom-right corner. Not a strip
// across the top, because that covered the logo, menu and sign-in on most
// sites. It shows one snapshot and never updates or moves by itself.
// CLEAR's notices sit in the bottom-left corner.
// Lives in a closed shadow root so page styles can't change it.

import { CLEAR_UI_ATTR } from './cover';
import type { Forecast } from './protocol';

const STYLE = `
:host { all: initial; }
section {
  box-sizing: border-box;
  width: min(300px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 10px 14px;
  background: #f7f6f2;
  color: #24231f;
  border: 1px solid #bdb9ad;
  border-radius: 4px;
  font: 14px/1.4 system-ui, sans-serif;
}
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
h2 { margin: 0; font-size: 14px; font-weight: 600; }
ul { margin: 0; padding: 0; list-style: none; }
li { padding: 1px 0; }
.label { color: #5c5a53; }
button {
  flex-shrink: 0;
  font: inherit;
  padding: 2px 12px;
  color: #2f5d62;
  background: #fff;
  border: 1px solid #2f5d62;
  border-radius: 4px;
  cursor: pointer;
}
button:focus-visible { outline: 3px solid #2f5d62; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  section { background: #1d1e1c; color: #e8e6df; border-color: #4a4b46; }
  .label { color: #a9a69c; }
  button { background: #2a2b28; color: #8fb8bc; border-color: #8fb8bc; }
  button:focus-visible { outline-color: #8fb8bc; }
}
`;

const number = (value: number) => value.toLocaleString();
const countOrNone = (value: number) => (value === 0 ? 'none' : number(value));

function describe(forecast: Forecast): Array<[string, string]> {
  const media =
    forecast.media === 0
      ? 'none'
      : forecast.autoplay > 0
        ? `${number(forecast.media)} (${number(forecast.autoplay)} start by themselves)`
        : number(forecast.media);
  return [
    ['Video or sound', media],
    ['Moving parts', countOrNone(forecast.moving)],
    ['Popups', countOrNone(forecast.popups)],
    ['Cookie banner', forecast.cookieBanner ? 'yes' : 'no'],
    ['Ads', countOrNone(forecast.ads)],
    [
      'Length',
      (forecast.words === 0
        ? 'no text found, '
        : `about ${number(forecast.words)} words, ${number(forecast.readingMinutes)} min read, `) +
        `${number(forecast.screens)} ${forecast.screens === 1 ? 'screen' : 'screens'}`,
    ],
  ];
}

/** Shows the bar and returns a function that removes it. */
export function showForecastBar(forecast: Forecast): () => void {
  const host = document.createElement('clear-forecast');
  host.setAttribute(CLEAR_UI_ATTR, '');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:block;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLE;
  const section = document.createElement('section');
  section.setAttribute('role', 'region');
  section.setAttribute('aria-label', 'Page forecast from CLEAR');
  const heading = document.createElement('h2');
  heading.textContent = 'Page forecast';
  const list = document.createElement('ul');
  for (const [label, value] of describe(forecast)) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = `${label}: `;
    item.append(name, value);
    list.append(item);
  }
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.textContent = 'Hide';
  hide.addEventListener('click', () => host.remove());
  const top = document.createElement('div');
  top.className = 'top';
  top.append(heading, hide);
  section.append(top, list);
  shadow.append(style, section);

  document.documentElement.append(host);
  return () => host.remove();
}
