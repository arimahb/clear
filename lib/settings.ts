import { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from './protocol';

/**
 * Stored settings merged over defaults: new settings get their default value,
 * and settings that no longer exist are dropped.
 */
export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as
    | Partial<Record<keyof Settings, Record<string, unknown>>>
    | undefined;
  return {
    calm: withDefaults(DEFAULT_SETTINGS.calm, stored?.calm),
    forecast: withDefaults(DEFAULT_SETTINGS.forecast, stored?.forecast),
    everySite: withDefaults(DEFAULT_SETTINGS.everySite, stored?.everySite),
    clarify: withDefaults(DEFAULT_SETTINGS.clarify, stored?.clarify),
  };
}

function withDefaults<T extends object>(defaults: T, stored: Record<string, unknown> | undefined): T {
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = stored?.[key as string];
    if (Array.isArray(defaults[key])) {
      // Lists hold strings only (such as host names).
      if (Array.isArray(value)) result[key] = value.filter((item) => typeof item === 'string') as T[keyof T];
    } else if (typeof value === typeof defaults[key]) {
      result[key] = value as T[keyof T];
    }
  }
  return result;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}
