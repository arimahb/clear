import { useEffect, useState } from 'react';
import type { CalmSettings, ColourMode, Settings } from '@/lib/protocol';
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

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
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

  return (
    <main>
      <h1>CLEAR</h1>
      <p>
        To calm a page, click the CLEAR button in the toolbar, or press <kbd>Alt</kbd>+
        <kbd>Shift</kbd>+<kbd>C</kbd> (<kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> on a Mac). Do the same again to undo. Nothing changes until you do.
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
                  A bar at the top listing videos, moving parts, popups, ads and page length.
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
    </main>
  );
}
