// Shared rules for recognising things on a page. Used by calm mode (to change
// them) and the Page Forecast (to count them), so both always agree.
// Only looks at the DOM; never loads anything.

import { CLEAR_UI_ATTR } from './cover';

const EMBED_HOSTS =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|vimeo\.com|dailymotion\.com|twitch\.tv|tiktok\.com|spotify\.com|soundcloud\.com|streamable\.com|wistia\.com|jwplayer\.com|brightcove\.net)$/;
const AD_HOSTS =
  /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|amazon-adsystem\.com|taboola\.com|outbrain\.com|criteo\.com|adsrvr\.org|moatads\.com)$/;
const AD_TOKEN = /(^|[-_])(ad|ads|advert|adverts|advertisement|advertising|sponsor|sponsored|adsbygoogle|dfp)([-_]|$)/i;

export const AD_CANDIDATES =
  'iframe, ins, aside, [id*="ad" i], [class*="ad" i], [class*="sponsor" i], [data-ad], [data-ad-slot], [data-ad-unit]';

export const POPUP_CANDIDATES =
  'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="modal" i], [class*="popup" i], [id*="modal" i], [id*="popup" i]';

const STRONG_POPUP = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

const COOKIE_WORDS = /cookie|consent|gdpr|privacy choices|privacy[-_ ]?(banner|notice)|onetrust|cookiebot|usercentrics|didomi|truste|quantcast/i;

export function hostOf(src: string): string {
  try {
    return new URL(src, location.href).hostname;
  } catch {
    return '';
  }
}

export function isOwnUi(element: Element): boolean {
  return element.closest(`[${CLEAR_UI_ATTR}]`) !== null;
}

export function isGif(img: HTMLImageElement): boolean {
  const src = (img.currentSrc || img.src).toLowerCase();
  if (src.startsWith('data:image/gif')) return true;
  try {
    return new URL(src, location.href).pathname.endsWith('.gif');
  } catch {
    return false;
  }
}

export function isMediaEmbed(iframe: HTMLIFrameElement): boolean {
  if (iframe.hasAttribute(CLEAR_UI_ATTR)) return false;
  const allow = iframe.getAttribute('allow') ?? '';
  return /(^|;)\s*autoplay/.test(allow) || EMBED_HOSTS.test(hostOf(iframe.src));
}

export function looksLikeAd(element: Element): boolean {
  if (element instanceof HTMLIFrameElement && AD_HOSTS.test(hostOf(element.src))) return true;
  if (element.matches('ins.adsbygoogle')) return true;
  const tokens = [...element.classList, ...element.id.split(/\s+/)];
  if (tokens.some((token) => AD_TOKEN.test(token))) return true;
  return [...element.attributes].some((attribute) => /^data-(ad|ads|advert)(-|$)/.test(attribute.name));
}

export function looksLikeCookieBanner(element: HTMLElement): boolean {
  const label = `${element.id} ${element.className} ${element.getAttribute('aria-label') ?? ''}`;
  if (!COOKIE_WORDS.test(label)) return false;
  const position = getComputedStyle(element).position;
  return position === 'fixed' || position === 'sticky' || element.matches('[role="dialog"], [role="region"], dialog');
}

/** Whether the element is actually showing (not display:none, hidden, or zero-sized). */
export function isShown(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * A see-through layer fixed over most of the window: the dimmed backdrop
 * behind a popup. Opaque full-window layers are skipped, because some sites
 * build their whole layout that way.
 */
export function looksLikeBackdrop(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.position !== 'fixed') return false;
  const rect = element.getBoundingClientRect();
  if (rect.width * rect.height < 0.5 * innerWidth * innerHeight) return false;
  const alpha = style.backgroundColor.match(/^rgba\([^)]*[,\s/]\s*([\d.]+)\s*\)$/);
  const opacity = alpha ? Number(alpha[1]) : 1;
  return opacity > 0.05 && opacity < 0.95;
}

/** A dialog, a popup's backdrop, or something named "modal" or "popup" that floats. */
export function isPopupLike(element: Element): boolean {
  if (element.matches(STRONG_POPUP)) return true;
  if (looksLikeBackdrop(element)) return true;
  if (!element.matches(POPUP_CANDIDATES)) return false;
  // "modal" or "popup" in a class name alone is weak: also require it to float.
  const position = getComputedStyle(element).position;
  return position === 'fixed' || position === 'absolute';
}

/** Keep only elements that are not inside another element of the list. */
export function outermost<T extends Element>(elements: Iterable<T>): T[] {
  const list = [...elements];
  return list.filter((element) => !list.some((other) => other !== element && other.contains(element)));
}
