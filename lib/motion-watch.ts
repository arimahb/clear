// Watches the page's DOM for things that move or flash by themselves.
// Works only from DOM changes: it cannot see inside <canvas>, <video> or
// cross-origin frames, and CSS-only flashing is handled by freezing animations.

export interface MotionWatchOptions {
  flashing: boolean;
  changingAreas: boolean;
  /** An element whose brightness changed more than 3 times a second (WCAG 2.3.1). */
  onFlashing: (element: HTMLElement) => void;
  /** An area that kept changing in at least 4 separate seconds without user input. */
  onChangingArea: (element: HTMLElement) => void;
  /** Small text that keeps changing by itself, such as a countdown or clock. */
  onChangingText: (element: HTMLElement) => void;
  /** Every element added to the page, so new media, GIFs and frames get calmed. */
  onAdded: (element: Element) => void;
  /** An element added or restyled, with the time since the user last did something. */
  onMutated: (element: HTMLElement, msSinceInput: number) => void;
  /** Elements to ignore: CLEAR's own UI, and areas already covered or revealed. */
  ignore: (element: Element) => boolean;
}

// A flash is a pair of opposing changes, so more than 3 flashes a second
// means 7 or more large brightness changes within one second.
const FLASH_CHANGES_PER_SECOND = 7;
const BRIGHTNESS_STEP = 0.1;
const MIN_FLASH_SIZE = 32;

const CHANGE_WINDOW_SECONDS = 10;
const CHANGE_SECONDS_NEEDED = 4;
// Changes this soon after the user does something are treated as caused by them.
const INPUT_GRACE_MS = 600;
const MIN_AREA_WIDTH = 120;
const MIN_AREA_HEIGHT = 60;
const MAX_CHANGING_TEXT = 200;
// Areas meant to update (chat logs, status messages) are left alone.
const LIVE_REGION = '[role="log"], [role="status"], [role="alert"]';
const INPUT_EVENTS = ['pointerdown', 'pointerover', 'keydown', 'wheel', 'scroll', 'focusin', 'input'];

export function watchMotion(options: MotionWatchOptions): () => void {
  let lastInput = 0;
  const markInput = () => {
    lastInput = performance.now();
  };
  const brightness = new WeakMap<Element, { value: number; changes: number[] }>();
  const activeSeconds = new WeakMap<Element, Set<number>>();
  const reported = new WeakSet<Element>();

  const isInsideReported = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (reported.has(node) || options.ignore(node)) return true;
    }
    return false;
  };

  const checkFlash = (element: HTMLElement, now: number) => {
    const value = visibleBrightness(element);
    if (value === null) return;
    const entry = brightness.get(element);
    if (!entry) {
      brightness.set(element, { value, changes: [] });
      return;
    }
    if (Math.abs(value - entry.value) < BRIGHTNESS_STEP) return;
    entry.value = value;
    entry.changes = entry.changes.filter((time) => now - time < 1000);
    entry.changes.push(now);
    if (entry.changes.length < FLASH_CHANGES_PER_SECOND) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_FLASH_SIZE || rect.height < MIN_FLASH_SIZE) return;
    reported.add(element);
    options.onFlashing(element);
  };

  const noteChange = (area: HTMLElement, now: number, textChanged: boolean) => {
    if (area === document.body || area === document.documentElement) return;
    if (area.closest(LIVE_REGION)) return;
    const second = Math.floor(now / 1000);
    const seconds = activeSeconds.get(area) ?? new Set<number>();
    seconds.add(second);
    for (const s of seconds) if (s <= second - CHANGE_WINDOW_SECONDS) seconds.delete(s);
    activeSeconds.set(area, seconds);
    if (seconds.size < CHANGE_SECONDS_NEEDED) return;
    if (area.contains(document.activeElement) && document.activeElement !== document.body) return;
    const rect = area.getBoundingClientRect();
    if (rect.width * rect.height > 0.8 * innerWidth * innerHeight) return;
    if (rect.width >= MIN_AREA_WIDTH && rect.height >= MIN_AREA_HEIGHT) {
      reported.add(area);
      options.onChangingArea(area);
    } else if (textChanged && isPlainText(area)) {
      reported.add(area);
      options.onChangingText(area);
    }
  };

  const observer = new MutationObserver((records) => {
    const now = performance.now();
    const userCaused = now - lastInput < INPUT_GRACE_MS;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element) || options.ignore(node)) continue;
          options.onAdded(node);
          if (node instanceof HTMLElement) options.onMutated(node, now - lastInput);
        }
      }
      if (record.type === 'attributes' && record.target instanceof HTMLElement && !options.ignore(record.target)) {
        options.onMutated(record.target, now - lastInput);
      }
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!(target instanceof HTMLElement) || isInsideReported(target)) continue;
      if (options.flashing && record.type === 'attributes') checkFlash(target, now);
      if (options.changingAreas && !userCaused) {
        // A changed slide or item tells us its container is the moving area.
        const area = record.type === 'attributes' ? target.parentElement : target;
        if (area instanceof HTMLElement && !isInsideReported(area)) {
          noteChange(area, now, record.type !== 'attributes');
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'src'],
  });
  for (const type of INPUT_EVENTS) addEventListener(type, markInput, { capture: true, passive: true });

  return () => {
    observer.disconnect();
    for (const type of INPUT_EVENTS) removeEventListener(type, markInput, { capture: true });
  };
}

/** Short text with no media or frames inside, safe to show as a still copy. */
function isPlainText(element: HTMLElement): boolean {
  const text = element.textContent ?? '';
  return text.trim().length > 0 && text.length <= MAX_CHANGING_TEXT && !element.querySelector('img, video, audio, iframe, canvas, svg, input, button, select, textarea');
}

/** Relative luminance (0–1) of what the element shows, or null if unknown. */
function visibleBrightness(element: HTMLElement): number | null {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return 0;
  const opacity = Number(style.opacity);
  const colour = parseRgb(style.backgroundColor);
  if (!colour) return null;
  const [r, g, b, alpha] = colour;
  // No background of its own: an image or block flashing by opacity or visibility.
  if (alpha === 0) return opacity;
  return relativeLuminance(r, g, b) * alpha * opacity;
}

function parseRgb(value: string): [number, number, number, number] | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
