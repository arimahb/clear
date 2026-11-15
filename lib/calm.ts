// Calm mode: stops autoplay, motion and flashing on the current page, hides
// popups that open by themselves, and can dim ads and soften colours. Runs only
// on the device and makes no network requests. Every change is recorded so stop() puts the page back.
//
// The CSS half (lib/calm-css.ts) is inserted by the background; this file
// switches it on by setting attributes on <html>.

import { CLEAR_UI_ATTR, CoverLayer } from './cover';
import { watchMotion } from './motion-watch';
import {
  AD_CANDIDATES,
  POPUP_CANDIDATES,
  isGif,
  isMediaEmbed,
  isShown,
  looksLikeAd,
  looksLikeBackdrop,
  looksLikeCookieBanner,
} from './page-signals';
import type { CalmSettings } from './protocol';

export interface CalmSession {
  stop(): void;
  /** How many things calm mode has changed on this page so far. */
  changes(): number;
}

const FREEZE_ATTR = 'data-clear-freeze';
const COLOUR_ATTR = 'data-clear-colour';

// A play() this soon after the user clicks or presses a key is treated as theirs.
const USER_PLAY_GRACE_MS = 1000;
// Likewise a popup that opens this soon after the user does something.
const USER_POPUP_GRACE_MS = 1000;
// Popup parts hidden this close together (a dialog and its backdrop) share one notice.
const POPUP_GROUP_MS = 300;
const STRONG_POPUP = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

export function startCalm(settings: CalmSettings): CalmSession {
  const undo: Array<() => void> = [];
  // Set by stop(). Work that finishes later (an image loading) must not change the page after that.
  let stopped = false;
  let changes = 0;
  const count = () => {
    changes += 1;
  };
  const root = document.documentElement;
  const cover = new CoverLayer();
  undo.push(() => cover.destroy());

  const isOurs = (element: Element) =>
    element.hasAttribute(CLEAR_UI_ATTR) || cover.isCovered(element) || cover.revealed.has(element);

  // --- CSS animations, transitions, marquees, SVG and script animations -----
  if (settings.freezeAnimations) {
    root.setAttribute(FREEZE_ATTR, '');
    undo.push(() => root.removeAttribute(FREEZE_ATTR));
    count();
    const pausedAnimations = new Set<Animation>();
    const pauseScriptAnimations = () => {
      for (const animation of document.getAnimations()) {
        // CSS animations and transitions are already handled by the stylesheet.
        if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue;
        if (animation.playState === 'running' && !pausedAnimations.has(animation)) {
          animation.pause();
          pausedAnimations.add(animation);
          count();
        }
      }
    };
    pauseScriptAnimations();
    const timer = window.setInterval(pauseScriptAnimations, 2000);
    undo.push(() => {
      clearInterval(timer);
      // Skip animations the page has since cancelled or finished, so they don't restart.
      for (const animation of pausedAnimations) if (animation.playState === 'paused') animation.play();
    });
  }

  const freezeIn = (scope: ParentNode) => {
    if (!settings.freezeAnimations) return;
    for (const marquee of scope.querySelectorAll('marquee')) {
      const element = marquee as HTMLElement & { stop(): void; start(): void };
      element.stop();
      undo.push(() => element.start());
      count();
    }
    for (const svg of scope.querySelectorAll('svg')) {
      if (!svg.animationsPaused()) {
        svg.pauseAnimations();
        undo.push(() => svg.unpauseAnimations());
        count();
      }
    }
  };

  // --- Video, audio and embedded players ------------------------------------
  let lastGesture = 0;
  const handledMedia = new WeakSet<HTMLMediaElement>();
  const quietMedia = (media: HTMLMediaElement) => {
    if (handledMedia.has(media)) return;
    handledMedia.add(media);
    if (media.autoplay) {
      media.autoplay = false;
      undo.push(() => {
        media.autoplay = true;
      });
    }
    if (!media.paused) {
      media.pause();
      count();
    }
  };

  const holdEmbed = (iframe: HTMLIFrameElement) => {
    if (!isMediaEmbed(iframe)) return;
    cover.hold(iframe, 'Embedded video or audio. It will not load until you choose.', 'Load it');
    count();
  };

  if (settings.pauseMedia) {
    const onGesture = (event: Event) => {
      if (event.isTrusted) lastGesture = performance.now();
    };
    const onPlay = (event: Event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement)) return;
      if (performance.now() - lastGesture < USER_PLAY_GRACE_MS) return;
      media.pause();
      count();
    };
    addEventListener('pointerdown', onGesture, true);
    addEventListener('keydown', onGesture, true);
    // Media events don't bubble, but they do pass through document while capturing.
    document.addEventListener('play', onPlay, true);
    undo.push(() => {
      removeEventListener('pointerdown', onGesture, true);
      removeEventListener('keydown', onGesture, true);
      document.removeEventListener('play', onPlay, true);
    });
  }

  const calmMediaIn = (scope: ParentNode) => {
    if (!settings.pauseMedia) return;
    for (const media of scope.querySelectorAll<HTMLMediaElement>('video, audio')) quietMedia(media);
    for (const iframe of scope.querySelectorAll('iframe')) holdEmbed(iframe);
  };

  // --- GIFs -----------------------------------------------------------------
  const frozenGifs = new WeakSet<HTMLImageElement>();
  const freezeGif = (img: HTMLImageElement) => {
    if (frozenGifs.has(img) || !isGif(img)) return;
    frozenGifs.add(img);
    const draw = () => {
      if (stopped || !img.isConnected || !img.naturalWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      // A cross-origin GIF still draws; we never read its pixels back.
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      canvas.className = img.className;
      canvas.style.cssText = img.style.cssText;
      canvas.style.width = `${img.width}px`;
      canvas.style.height = `${img.height}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', img.alt);
      canvas.setAttribute(CLEAR_UI_ATTR, '');
      const previousDisplay = img.style.getPropertyValue('display');
      const previousPriority = img.style.getPropertyPriority('display');
      img.before(canvas);
      img.style.setProperty('display', 'none', 'important');
      undo.push(() => {
        canvas.remove();
        img.style.setProperty('display', previousDisplay, previousPriority);
      });
      count();
    };
    if (img.complete) draw();
    else {
      img.addEventListener('load', draw, { once: true });
      undo.push(() => img.removeEventListener('load', draw));
    }
  };

  const freezeGifsIn = (scope: ParentNode) => {
    if (!settings.freezeGifs) return;
    for (const img of scope.querySelectorAll('img')) freezeGif(img);
  };

  // --- Ads ------------------------------------------------------------------
  const dimmed = new WeakSet<HTMLElement>();
  const dimAd = (element: HTMLElement) => {
    if (dimmed.has(element) || !looksLikeAd(element)) return;
    const rect = element.getBoundingClientRect();
    // Never dim something that is most of the page, or that holds the main content.
    if (rect.width * rect.height > 0.5 * innerWidth * innerHeight) return;
    if (element.querySelector('main, article')) return;
    dimmed.add(element);
    const style = element.style;
    const previous = ['opacity', 'filter'].map(
      (name) => [name, style.getPropertyValue(name), style.getPropertyPriority(name)] as const,
    );
    style.setProperty('opacity', '0.25', 'important');
    style.setProperty('filter', 'grayscale(1)', 'important');
    undo.push(() => {
      for (const [name, value, priority] of previous) style.setProperty(name, value, priority);
    });
    count();
  };

  const dimAdsIn = (scope: ParentNode) => {
    if (!settings.dimAds) return;
    for (const element of scope.querySelectorAll<HTMLElement>(AD_CANDIDATES)) {
      if (!isOurs(element)) dimAd(element);
    }
  };

  // --- Apply to the page now, and to anything added later -------------------
  const calmSubtree = (element: Element) => {
    // querySelectorAll only looks inside the element, so check the element itself too.
    if (settings.pauseMedia && element instanceof HTMLMediaElement) quietMedia(element);
    if (settings.pauseMedia && element instanceof HTMLIFrameElement) holdEmbed(element);
    if (settings.freezeGifs && element instanceof HTMLImageElement) freezeGif(element);
    if (settings.dimAds && element instanceof HTMLElement && element.matches(AD_CANDIDATES)) {
      dimAd(element);
    }
    calmMediaIn(element);
    freezeGifsIn(element);
    dimAdsIn(element);
    freezeIn(element);
  };

  calmMediaIn(document);
  freezeGifsIn(document);
  dimAdsIn(document);
  freezeIn(document);

  if (settings.colourMode !== 'off') {
    root.setAttribute(COLOUR_ATTR, settings.colourMode);
    undo.push(() => root.removeAttribute(COLOUR_ATTR));
    count();
  }

  // --- Popups and cookie banners --------------------------------------------
  // CLEAR never clicks a site's buttons: it hides the popup, unlocks scrolling,
  // and lists it in the notices with a "Show it" button.
  const hiddenPopups = new WeakSet<HTMLElement>();
  const userShown = new WeakSet<HTMLElement>();
  let group: { at: number; elements: HTMLElement[]; restores: Array<() => void> } | null = null;

  const unlockScroll = () => {
    for (const element of [document.documentElement, document.body]) {
      if (!element || getComputedStyle(element).overflowY !== 'hidden') continue;
      const previous = element.style.getPropertyValue('overflow');
      const priority = element.style.getPropertyPriority('overflow');
      element.style.setProperty('overflow', 'visible', 'important');
      undo.push(() => element.style.setProperty('overflow', previous, priority));
    }
  };

  const hidePopup = (element: HTMLElement, isCookieBanner: boolean) => {
    hiddenPopups.add(element);
    const previous = element.style.getPropertyValue('display');
    const priority = element.style.getPropertyPriority('display');
    element.style.setProperty('display', 'none', 'important');
    const restore = () => element.style.setProperty('display', previous, priority);
    undo.push(restore);
    count();

    const now = performance.now();
    if (group && now - group.at < POPUP_GROUP_MS) {
      group.elements.push(element);
      group.restores.push(restore);
    } else {
      const current = { at: now, elements: [element], restores: [restore] };
      group = current;
      const removeNotice = cover.notice(
        isCookieBanner
          ? 'CLEAR hid a cookie banner. You have not accepted or refused cookies.'
          : 'CLEAR hid a popup that opened by itself.',
        'Show it',
        () => {
          for (const step of current.restores) step();
          // Mark every part (the dialog and its backdrop), so none is hidden again.
          for (const part of current.elements) userShown.add(part);
        },
      );
      undo.push(removeNotice);
    }
    // Sites often lock scrolling just after opening the popup, so check again shortly.
    unlockScroll();
    for (const delay of [300, 1000]) {
      const timer = window.setTimeout(unlockScroll, delay);
      undo.push(() => clearTimeout(timer));
    }
  };

  const isPopupLike = (element: HTMLElement) => {
    if (element.matches(STRONG_POPUP)) return true;
    if (looksLikeBackdrop(element)) return true;
    if (!element.matches(POPUP_CANDIDATES)) return false;
    // "modal" or "popup" in a class name alone is weak: also require it to float.
    const position = getComputedStyle(element).position;
    return position === 'fixed' || position === 'absolute';
  };

  const considerPopup = (element: HTMLElement) => {
    if (element === document.body || element === root) return;
    if (isOurs(element) || hiddenPopups.has(element) || userShown.has(element)) return;
    const isCookieBanner = looksLikeCookieBanner(element);
    if (isCookieBanner ? !settings.hideCookieBanners : !settings.hidePopups) return;
    if (!isCookieBanner && !isPopupLike(element)) return;
    // Leave popups inside a cookie banner to the cookie banner setting.
    if (!isCookieBanner) {
      for (let node: HTMLElement | null = element.parentElement; node && node !== document.body; node = node.parentElement) {
        if (hiddenPopups.has(node) || looksLikeCookieBanner(node)) return;
      }
    }
    if (!isShown(element)) return;
    hidePopup(element, isCookieBanner);
  };

  const popupsIn = (scope: ParentNode) => {
    if (!settings.hidePopups && !settings.hideCookieBanners) return;
    for (const element of scope.querySelectorAll<HTMLElement>(POPUP_CANDIDATES)) considerPopup(element);
    // Backdrops and cookie banners rarely have a popup role, so check floating elements too.
    for (const element of scope.querySelectorAll<HTMLElement>('body > *, body > * > *')) {
      const position = getComputedStyle(element).position;
      if (position === 'fixed' || position === 'sticky') considerPopup(element);
    }
  };
  popupsIn(document);

  const onMutated = (element: HTMLElement, msSinceInput: number) => {
    if (msSinceInput < USER_POPUP_GRACE_MS) return;
    if (!settings.hidePopups && !settings.hideCookieBanners) return;
    // Check the changed element and what it sits in, outermost first, so a
    // dialog and its backdrop are hidden together rather than piece by piece.
    const chain: HTMLElement[] = [];
    for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) {
      chain.unshift(node);
    }
    for (const node of chain) {
      if (hiddenPopups.has(node)) return;
      considerPopup(node);
      if (hiddenPopups.has(node)) return;
    }
    popupsIn(element);
  };

  // --- Still copies of areas that keep changing (carousels) ------------------
  // The page's script keeps changing the original, hidden underneath. The copy
  // takes over the original's ids so id-based styles still match it.
  const showStillCopy = (area: HTMLElement): boolean => {
    if (area.querySelector('video, audio, iframe, canvas, object, embed')) return false;
    const before = area.getBoundingClientRect();
    const copy = area.cloneNode(true) as HTMLElement;
    copy.setAttribute(CLEAR_UI_ATTR, '');
    const movedIds = [area, ...area.querySelectorAll<HTMLElement>('[id]')]
      .filter((element) => element.id)
      .map((element) => [element, element.id] as const);
    for (const [element] of movedIds) element.removeAttribute('id');
    const previousDisplay = area.style.getPropertyValue('display');
    const previousPriority = area.style.getPropertyPriority('display');
    area.before(copy);
    area.style.setProperty('display', 'none', 'important');

    let removeNotice = () => {};
    let watcher: MutationObserver | null = null;
    const restore = () => {
      watcher?.disconnect();
      removeNotice();
      copy.remove();
      for (const [element, id] of movedIds) element.id = id;
      area.style.setProperty('display', previousDisplay, previousPriority);
    };

    const after = copy.getBoundingClientRect();
    const sizeChanged =
      Math.abs(after.width - before.width) > before.width * 0.1 ||
      Math.abs(after.height - before.height) > before.height * 0.1;
    if (sizeChanged || after.width === 0) {
      restore();
      return false;
    }

    // If the page's script finds and changes the copy too, fall back to covering.
    watcher = new MutationObserver(() => {
      restore();
      cover.cover(area, 'This area keeps changing by itself, so CLEAR covered it.', 'Show it');
    });
    watcher.observe(copy, { subtree: true, childList: true, attributes: true, characterData: true });
    removeNotice = cover.notice('CLEAR paused an area that keeps changing, such as a slideshow.', 'Show live', () => {
      restore();
      cover.revealed.add(area);
    });
    undo.push(restore);
    count();
    return true;
  };

  // --- Changing text (countdowns, clocks) ----------------------------------
  // The page's timer keeps running, so show a still copy and hide the original.
  // Clicking the copy (or pressing Enter on it) shows the live text again.
  const freezeText = (element: HTMLElement) => {
    const still = element.cloneNode(true) as HTMLElement;
    still.removeAttribute('id');
    for (const child of still.querySelectorAll('[id]')) child.removeAttribute('id');
    still.setAttribute(CLEAR_UI_ATTR, '');
    still.setAttribute('role', 'button');
    still.setAttribute('tabindex', '0');
    still.title = 'CLEAR stopped this from changing. Click to show it live.';
    still.style.cursor = 'pointer';
    const previousDisplay = element.style.getPropertyValue('display');
    const previousPriority = element.style.getPropertyPriority('display');
    element.before(still);
    element.style.setProperty('display', 'none', 'important');
    const restore = () => {
      still.remove();
      element.style.setProperty('display', previousDisplay, previousPriority);
    };
    const reveal = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      restore();
      // Leave the live text alone from now on, or it would be stopped again.
      cover.revealed.add(element);
    };
    still.addEventListener('click', reveal);
    still.addEventListener('keydown', reveal);
    undo.push(restore);
    count();
  };

  const stopWatching = watchMotion({
    flashing: settings.coverFlashing,
    changingAreas: settings.stopCarousels,
    onFlashing: (element) => {
      cover.cover(element, 'This area was flashing, so CLEAR covered it.', 'Show it (it may flash)');
      count();
    },
    onChangingArea: (element) => {
      if (showStillCopy(element)) return;
      cover.cover(element, 'This area keeps changing by itself, so CLEAR covered it.', 'Show it');
      count();
    },
    onChangingText: freezeText,
    onAdded: calmSubtree,
    onMutated,
    ignore: isOurs,
  });
  undo.push(stopWatching);

  return {
    stop() {
      stopped = true;
      for (const step of undo.reverse()) step();
      undo.length = 0;
    },
    changes: () => changes,
  };
}

