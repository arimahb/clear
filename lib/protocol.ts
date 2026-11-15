// Shared types for settings, messages between extension parts, and the
// "Explain text" server request/response.
//
// Privacy contract: nothing in this file may carry a URL, page title, user ID
// or timestamp off the device. ClarifyRequest is the only shape that is ever
// sent over the network, and validateClarifyRequest rejects any extra field.

// ---------------------------------------------------------------------------
// Settings (stored in chrome.storage.local only)
// ---------------------------------------------------------------------------

export type ColourMode = 'off' | 'soften' | 'greyscale';

export interface CalmSettings {
  /** Pause video and audio, stop autoplay, hold embedded players until loaded. */
  pauseMedia: boolean;
  freezeAnimations: boolean;
  freezeGifs: boolean;
  /** Show still copies of areas that keep changing, such as carousels and countdowns. */
  stopCarousels: boolean;
  coverFlashing: boolean;
  /** Hide popups that open without the user clicking anything. */
  hidePopups: boolean;
  /** Hide cookie banners without answering them. Off by default: see PRIVACY.md. */
  hideCookieBanners: boolean;
  dimAds: boolean;
  colourMode: ColourMode;
}

export interface ForecastSettings {
  showBar: boolean;
}

export interface ClarifySettings {
  /** On-device AI is always tried first. This allows the server fallback. */
  allowServer: boolean;
  /** Show exactly what will be sent before every server request. */
  previewBeforeSending: boolean;
  outputLanguage: string;
}

export interface Settings {
  calm: CalmSettings;
  forecast: ForecastSettings;
  clarify: ClarifySettings;
}

// Sites the user has made "always on" are not stored here. The granted
// optional host permissions (chrome.permissions.getAll) are the only record.

export const DEFAULT_SETTINGS: Settings = {
  calm: {
    pauseMedia: true,
    freezeAnimations: true,
    freezeGifs: true,
    stopCarousels: true,
    coverFlashing: true,
    hidePopups: true,
    hideCookieBanners: false,
    dimAds: true,
    colourMode: 'soften',
  },
  forecast: { showBar: true },
  clarify: { allowServer: false, previewBeforeSending: true, outputLanguage: 'en' },
};

export const SETTINGS_KEY = 'settings';

// ---------------------------------------------------------------------------
// Page Forecast (computed and shown on the device only)
// ---------------------------------------------------------------------------

export interface Forecast {
  /** Video and audio elements plus embedded players. */
  media: number;
  /** Of those, how many play by themselves (autoplay set, or already playing). */
  autoplay: number;
  /** Running CSS and script animations, marquees and animated GIFs. */
  moving: number;
  /** Popups and dialogs, shown now or waiting hidden in the page. */
  popups: number;
  cookieBanner: boolean;
  ads: number;
  words: number;
  readingMinutes: number;
  /** Page height in screens (page height divided by window height). */
  screens: number;
}

// ---------------------------------------------------------------------------
// Messages between side panel, background and content scripts
// ---------------------------------------------------------------------------

export type Message =
  | { type: 'calm/query' }
  | { type: 'calm/apply'; settings: CalmSettings; showForecast: boolean }
  | { type: 'calm/undo' }
  | { type: 'calm/status'; active: boolean; changes: number }
  | { type: 'forecast/request' }
  | { type: 'forecast/result'; forecast: Forecast }
  | { type: 'clarify/start'; text: string }
  | { type: 'clarify/result'; result: ClarifyResponse; source: 'device' | 'server' }
  | { type: 'clarify/error'; reason: string };

// ---------------------------------------------------------------------------
// "Explain text" wire format — the only data that ever leaves the device
// ---------------------------------------------------------------------------

export const CLARIFY_MAX_CHARS = 4000;

/** Text is already redacted (emails, phones, URLs, long numbers replaced). */
export interface ClarifyRequest {
  text: string;
  /** BCP 47 language for the answer, e.g. "en" or "pt-BR". */
  lang: string;
}

export type ToneConfidence = 'low' | 'medium' | 'high';

export interface PossibleTone {
  /** A short noun such as "sarcasm". The UI always shows it as "May be: …". */
  label: string;
  confidence: ToneConfidence;
  /** Why, quoting the text. */
  reason: string;
}

export interface Idiom {
  phrase: string;
  plain_meaning: string;
}

export interface ClarifyResponse {
  literal_meaning: string;
  what_is_asked: string;
  missing_information: string[];
  /** Empty means "no clear tone cues". */
  possible_tone: PossibleTone[];
  idioms: Idiom[];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const CLARIFY_REQUEST_KEYS = ['text', 'lang'];
const LANG_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Used by both the extension (before sending) and the server (on receipt). */
export function validateClarifyRequest(body: unknown): Validation<ClarifyRequest> {
  if (!isRecord(body)) return { ok: false, error: 'Request must be an object.' };
  if (!hasOnlyKeys(body, CLARIFY_REQUEST_KEYS)) {
    return { ok: false, error: 'Request has fields other than text and lang.' };
  }
  const { text, lang } = body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'Text is missing.' };
  }
  if (text.length > CLARIFY_MAX_CHARS) {
    return { ok: false, error: `Text is longer than ${CLARIFY_MAX_CHARS} characters.` };
  }
  if (typeof lang !== 'string' || !LANG_PATTERN.test(lang)) {
    return { ok: false, error: 'Language code is not valid.' };
  }
  return { ok: true, value: { text, lang } };
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isTone(value: unknown): value is PossibleTone {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['label', 'confidence', 'reason']) &&
    isString(value.label) &&
    (value.confidence === 'low' || value.confidence === 'medium' || value.confidence === 'high') &&
    isString(value.reason)
  );
}

function isIdiom(value: unknown): value is Idiom {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['phrase', 'plain_meaning']) &&
    isString(value.phrase) &&
    isString(value.plain_meaning)
  );
}

/** Model output is untrusted: anything outside the schema is rejected. */
export function validateClarifyResponse(body: unknown): Validation<ClarifyResponse> {
  if (!isRecord(body)) return { ok: false, error: 'Response must be an object.' };
  const keys = ['literal_meaning', 'what_is_asked', 'missing_information', 'possible_tone', 'idioms'];
  if (!hasOnlyKeys(body, keys)) return { ok: false, error: 'Response has unexpected fields.' };
  const { literal_meaning, what_is_asked, missing_information, possible_tone, idioms } = body;
  if (
    !isString(literal_meaning) ||
    !isString(what_is_asked) ||
    !Array.isArray(missing_information) ||
    !missing_information.every(isString) ||
    !Array.isArray(possible_tone) ||
    !possible_tone.every(isTone) ||
    !Array.isArray(idioms) ||
    !idioms.every(isIdiom)
  ) {
    return { ok: false, error: 'Response does not match the schema.' };
  }
  return {
    ok: true,
    value: { literal_meaning, what_is_asked, missing_information, possible_tone, idioms },
  };
}
