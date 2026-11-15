import { useEffect, useState } from 'react';
import { EVERY_SITE_ORIGINS, type CalmSettings, type ColourMode, type Settings } from '@/lib/protocol';
import { loadSettings, saveSettings } from '@/lib/settings';

type CalmSwitch = Exclude<keyof CalmSettings, 'colourMode'>;

const CALM_OPTIONS: Array<{ key: CalmSwitch; label: string; detail: string }> = [
  {
    key: 'pauseMedia',
    label: 'Pause video and sound',
    detail: 'Stops autoplay. Embedded players wait until you load them.',
  },
  { key: 'freezeAnimations', label: 'Stop animations', detail: 'Moving, spinning and sliding parts stay still.' },
  { key: 'freezeGifs', label: 'Freeze GIFs', detail: 'Shows one still picture instead.' },
  {
    key: 'stopCarousels',
    label: 'Stop areas that keep changing',
    detail: 'Slideshows and countdowns show a still copy. You can show each one live again.',
  },
  { key: 'coverFlashing', label: 'Cover flashing', detail: 'Anything flashing more than 3 times a second.' },
  {
    key: 'hidePopups',
    label: 'Hide popups that open by themselves',
    detail: 'Popups you open with a click are left alone. CLEAR never clicks buttons for you.',
  },
  {
    key: 'hideCookieBanners',
    label: 'Hide cookie banners',
    detail:
      'Hides them without answering. Sites usually treat that as not accepting extra cookies, and may ask again next time.',
  },
  { key: 'dimAds', label: 'Dim ads', detail: 'Ads are faded and grey.' },
];

const COLOUR_OPTIONS: Array<{ value: ColourMode; label: string; detail: string }> = [
  { value: 'off', label: 'Original colours', detail: 'No change.' },
  { value: 'soften', label: 'Soften', detail: 'Bright colours are less intense but still recognisable.' },
  { value: 'greyscale', label: 'Greyscale', detail: 'No colour. Colour that carries meaning (like red errors) is lost.' },
];

const everySiteAllowed = () => browser.permissions.contains({ origins: EVERY_SITE_ORIGINS });

/** The host name of the page in the current tab, if CLEAR may see it. */
async function currentSite(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  const url = new URL(tab.url);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.hostname : null;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [everySite, setEverySite] = useState(false);
  const [skipMessage, setSkipMessage] = useState('');

  useEffect(() => {
    void loadSettings().then(setSettings);
    // Follow the permission itself: it can also be removed in chrome://extensions.
    const refresh = () => void everySiteAllowed().then(setEverySite);
    refresh();
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);
    return () => {
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, []);

  const update = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  };
  const toggle = (key: CalmSwitch) => {
    if (settings) update({ ...settings, calm: { ...settings.calm, [key]: !settings.calm[key] } });
  };
  const setColour = (colourMode: ColourMode) => {
    if (settings) update({ ...settings, calm: { ...settings.calm, colourMode } });
  };
  const toggleForecast = () => {
    if (settings) update({ ...settings, forecast: { showBar: !settings.forecast.showBar } });
  };
  const toggleEverySite = () => {
    // Chrome only shows the permission prompt during the click itself, so ask
    // before anything else is awaited.
    const change = everySite
      ? browser.permissions.remove({ origins: EVERY_SITE_ORIGINS })
      : browser.permissions.request({ origins: EVERY_SITE_ORIGINS });
    void change.then(everySiteAllowed).then(setEverySite);
  };
  const setSkipSites = (skipSites: string[]) => {
    if (settings) update({ ...settings, everySite: { skipSites } });
  };
  const skipCurrentSite = async () => {
    if (!settings) return;
    const site = await currentSite();
    if (!site) {
      setSkipMessage('The current tab is not a website CLEAR can change.');
    } else if (settings.everySite.skipSites.includes(site)) {
      setSkipMessage(`${site} is already skipped.`);
    } else {
      setSkipSites([...settings.everySite.skipSites, site].sort());
      setSkipMessage(`${site} will be left alone from the next time it loads.`);
    }
  };

  return (
    <main>
      <h1>CLEAR</h1>
      <p>
        To calm a page, click the CLEAR button in the toolbar, or press <kbd>Alt</kbd>+
        <kbd>Shift</kbd>+<kbd>C</kbd> (<kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> on a Mac). Do the same again to undo.{' '}
        {everySite ? 'Calm mode also starts by itself on every website.' : 'Nothing changes until you do.'}
      </p>

      <h2>What calm mode does</h2>
      <p className="muted">Changes here apply the next time you turn calm mode on.</p>
      {settings && (
        <ul className="options">
          <li>
            <label>
              <input type="checkbox" checked={settings.forecast.showBar} onChange={toggleForecast} />
              <span>
                <strong>Show the Page Forecast</strong>
                <span className="muted">
                  A small box in the bottom-right corner listing videos, moving parts, popups, ads and page length.
                </span>
              </span>
            </label>
          </li>
          {CALM_OPTIONS.map(({ key, label, detail }) => (
            <li key={key}>
              <label>
                <input type="checkbox" checked={settings.calm[key]} onChange={() => toggle(key)} />
                <span>
                  <strong>{label}</strong>
                  <span className="muted">{detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {settings && (
        <fieldset className="options">
          <legend>Colours</legend>
          {COLOUR_OPTIONS.map(({ value, label, detail }) => (
            <label key={value}>
              <input
                type="radio"
                name="colour"
                checked={settings.calm.colourMode === value}
                onChange={() => setColour(value)}
              />
              <span>
                <strong>{label}</strong>
                <span className="muted">{detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <h2>Every website</h2>
      <ul className="options">
        <li>
          <label>
            <input type="checkbox" checked={everySite} onChange={toggleEverySite} />
            <span>
              <strong>Calm every website automatically</strong>
              <span className="muted">
                Pages are calmed as they open, without clicking CLEAR. Chrome will say CLEAR can “read and change all
                your data on all websites”. CLEAR needs that to change pages, but does all its work on your device:
                it never sends the pages you visit, or anything on them, anywhere. Click CLEAR on a page to undo
                calm mode there.
              </span>
            </span>
          </label>
        </li>
      </ul>
      {settings && everySite && (
        <section className="skip" aria-labelledby="skip-heading">
          <h3 id="skip-heading">Sites CLEAR leaves alone</h3>
          <p className="muted">Saved on this device only.</p>
          {settings.everySite.skipSites.length > 0 && (
            <ul className="skip-list">
              {settings.everySite.skipSites.map((site) => (
                <li key={site}>
                  <span>{site}</span>
                  <button
                    type="button"
                    aria-label={`Stop skipping ${site}`}
                    onClick={() => setSkipSites(settings.everySite.skipSites.filter((item) => item !== site))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void skipCurrentSite()}>
            Leave the site in this tab alone
          </button>
          <p className="muted" role="status">
            {skipMessage}
          </p>
        </section>
      )}
    </main>
  );
}
