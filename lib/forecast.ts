// Page Forecast: counts what a page contains so the user knows what to expect.
// Runs on the device only, reads the DOM, and sends nothing anywhere.
// Call it before calm mode changes the page, so the counts describe the page as built.

import {
  AD_CANDIDATES,
  POPUP_CANDIDATES,
  isGif,
  isMediaEmbed,
  isOwnUi,
  looksLikeAd,
  looksLikeCookieBanner,
  outermost,
} from './page-signals';
import type { Forecast } from './protocol';

const WORDS_PER_MINUTE = 200;

export function scanPage(): Forecast {
  const media = [...document.querySelectorAll<HTMLMediaElement>('video, audio')];
  const embeds = [...document.querySelectorAll('iframe')].filter(isMediaEmbed);
  const autoplay =
    media.filter((element) => element.autoplay || !element.paused).length +
    embeds.filter((iframe) => /(^|;)\s*autoplay/.test(iframe.getAttribute('allow') ?? '')).length;

  const runningAnimations = document
    .getAnimations()
    .filter((animation) => animation.playState === 'running').length;
  const gifs = [...document.querySelectorAll('img')].filter(isGif).length;
  const marquees = document.querySelectorAll('marquee').length;

  const cookieBanners = [...document.querySelectorAll<HTMLElement>('body *')].filter(
    (element) => !isOwnUi(element) && looksLikeCookieBanner(element),
  );
  const popups = outermost(
    [...document.querySelectorAll(POPUP_CANDIDATES)].filter(
      (element) => !isOwnUi(element) && !cookieBanners.some((banner) => banner.contains(element)),
    ),
  );
  const ads = outermost(
    [...document.querySelectorAll(AD_CANDIDATES)].filter((element) => !isOwnUi(element) && looksLikeAd(element)),
  );

  const words = countWords(mainText());

  return {
    media: media.length + embeds.length,
    autoplay,
    moving: runningAnimations + gifs + marquees,
    popups: popups.length,
    cookieBanner: cookieBanners.length > 0,
    ads: ads.length,
    words,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    screens: Math.max(1, Math.round(document.documentElement.scrollHeight / innerHeight)),
  };
}

/** The page's main text: its one article, its main area, or else the whole body. */
function mainText(): string {
  const articles = document.querySelectorAll<HTMLElement>('article');
  const root =
    (articles.length === 1 ? articles[0] : null) ??
    document.querySelector<HTMLElement>('[role="main"], main') ??
    document.body;
  return root?.innerText ?? '';
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
