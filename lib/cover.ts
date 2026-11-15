// In-page UI for calm mode: plain boxes that cover an area (flashing, or
// changing by itself), stand in for an embedded player until the user loads
// it, and a short list of notices for things CLEAR hid (popups, cookie
// banners, paused slideshows). Everything lives in closed shadow roots so page
// styles can't reach it.

export const CLEAR_UI_ATTR = 'data-clear-ui';

const STYLE = `
:host { all: initial; }
.box {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  overflow: hidden;
  background: #e9e7e1;
  color: #24231f;
  border: 1px solid #bdb9ad;
  font: 14px/1.4 system-ui, sans-serif;
  text-align: center;
  pointer-events: auto;
}
.cover { position: absolute; }
.notices {
  position: fixed;
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: min(420px, calc(100vw - 32px));
  margin: 0;
  padding: 0;
  list-style: none;
}
.notice { flex-direction: row; justify-content: space-between; text-align: left; border-radius: 4px; }
.notices:empty { display: none; }
.hold { width: 100%; height: 100%; }
button {
  font: inherit;
  padding: 4px 12px;
  color: #2f5d62;
  background: #fff;
  border: 1px solid #2f5d62;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
button:focus-visible { outline: 3px solid #2f5d62; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .box { background: #2a2b28; color: #e8e6df; border-color: #4a4b46; }
  button { background: #1d1e1c; color: #8fb8bc; border-color: #8fb8bc; }
  button:focus-visible { outline-color: #8fb8bc; }
}
`;

function makeShadowHost(tag: string): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  host.setAttribute(CLEAR_UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.append(style);
  return { host, shadow };
}

function makeBox(className: string, message: string, actionLabel: string, onAction: () => void) {
  const box = document.createElement('div');
  box.className = `box ${className}`;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'CLEAR');
  const text = document.createElement('div');
  text.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = actionLabel;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onAction();
  });
  box.append(text, button);
  return box;
}

interface Covered {
  box: HTMLElement;
  restore: () => void;
}

export class CoverLayer {
  private readonly layer: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly covered = new Map<Element, Covered>();
  private readonly held = new Map<HTMLIFrameElement, HTMLElement>();
  private readonly notices: HTMLElement;
  /** Areas the user chose to show. Calm mode leaves them alone from then on. */
  readonly revealed = new WeakSet<Element>();
  private frame = 0;
  private readonly timer: number;
  private readonly schedule = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.reposition());
  };

  constructor() {
    const { host, shadow } = makeShadowHost('clear-cover-layer');
    host.style.cssText =
      'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;';
    this.layer = host;
    this.shadow = shadow;
    this.notices = document.createElement('ul');
    this.notices.className = 'notices';
    this.notices.setAttribute('aria-label', 'Things CLEAR hid on this page');
    shadow.append(this.notices);
    document.documentElement.append(host);
    addEventListener('scroll', this.schedule, { capture: true, passive: true });
    addEventListener('resize', this.schedule, { passive: true });
    // Layout can change without scroll or resize (images loading, content added).
    this.timer = window.setInterval(this.schedule, 1000);
  }

  isCovered(element: Element): boolean {
    return this.covered.has(element);
  }

  /** Hide an element (keeping its space) and put a notice over it. */
  cover(element: HTMLElement, message: string, actionLabel: string): void {
    if (this.covered.has(element) || this.revealed.has(element)) return;
    const previous = element.style.getPropertyValue('visibility');
    const priority = element.style.getPropertyPriority('visibility');
    element.style.setProperty('visibility', 'hidden', 'important');
    const restore = () => element.style.setProperty('visibility', previous, priority);
    const box = makeBox('cover', message, actionLabel, () => {
      this.uncover(element);
      this.revealed.add(element);
    });
    this.shadow.append(box);
    this.covered.set(element, { box, restore });
    this.place(element, box);
  }

  private uncover(element: Element): void {
    const entry = this.covered.get(element);
    if (!entry) return;
    entry.restore();
    entry.box.remove();
    this.covered.delete(element);
  }

  /**
   * Replace an embedded player with a placeholder. The iframe is taken out of
   * the page so it stops playing, and goes back (without autoplay) on "Load it".
   */
  hold(iframe: HTMLIFrameElement, message: string, actionLabel: string): void {
    if (this.held.has(iframe) || !iframe.isConnected) return;
    const rect = iframe.getBoundingClientRect();
    const { host, shadow } = makeShadowHost('clear-placeholder');
    host.style.cssText = `display:inline-block;vertical-align:top;width:${Math.max(rect.width, 200)}px;height:${Math.max(rect.height, 80)}px;`;
    shadow.append(
      makeBox('hold', message, actionLabel, () => {
        withoutAutoplay(iframe);
        host.replaceWith(iframe);
        this.held.delete(iframe);
      }),
    );
    iframe.replaceWith(host);
    this.held.set(iframe, host);
  }

  /** Add a line to the notice list. Returns a function that removes it. */
  notice(message: string, actionLabel: string, onAction: () => void): () => void {
    const item = document.createElement('li');
    const remove = () => item.remove();
    item.append(
      makeBox('notice', message, actionLabel, () => {
        remove();
        onAction();
      }),
    );
    this.notices.append(item);
    return remove;
  }

  private place(element: Element, box: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    box.style.left = `${rect.left + scrollX}px`;
    box.style.top = `${rect.top + scrollY}px`;
    box.style.width = `${Math.max(rect.width, 1)}px`;
    box.style.height = `${Math.max(rect.height, 1)}px`;
  }

  private reposition(): void {
    this.frame = 0;
    for (const [element, { box }] of this.covered) {
      if (element.isConnected) {
        this.place(element, box);
      } else {
        box.remove();
        this.covered.delete(element);
      }
    }
  }

  /** Undo everything: show covered areas and put held players back as they were. */
  destroy(): void {
    for (const element of [...this.covered.keys()]) this.uncover(element);
    for (const [iframe, placeholder] of this.held) {
      if (placeholder.isConnected) placeholder.replaceWith(iframe);
    }
    this.held.clear();
    removeEventListener('scroll', this.schedule, { capture: true });
    removeEventListener('resize', this.schedule);
    clearInterval(this.timer);
    cancelAnimationFrame(this.frame);
    this.layer.remove();
  }
}

function withoutAutoplay(iframe: HTMLIFrameElement): void {
  const allow = iframe.getAttribute('allow');
  if (allow) {
    const kept = allow
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('autoplay'));
    iframe.setAttribute('allow', kept.join('; '));
  }
  if (iframe.src) {
    try {
      const url = new URL(iframe.src, location.href);
      if (url.searchParams.has('autoplay')) {
        url.searchParams.set('autoplay', '0');
        iframe.src = url.href;
      }
    } catch {
      // Not a URL we can parse; leave src alone.
    }
  }
}
