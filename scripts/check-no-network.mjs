// Fails if code that runs inside web pages can reach the network.
// Scans the source files and the built bundles, so imported helpers are covered too.
// Content scripts are not bound by the extension's CSP, so this check is the guard.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES = [
  'entrypoints/content.ts',
  'entrypoints/page.content.ts',
  'lib/calm.ts',
  'lib/calm-css.ts',
  'lib/cover.ts',
  'lib/motion-watch.ts',
  'lib/forecast.ts',
  'lib/forecast-bar.ts',
  'lib/page-signals.ts',
];
const BUNDLE_DIR = process.argv[2] ?? '.output/chrome-mv3/content-scripts';

const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bRTCPeerConnection\b/, 'RTCPeerConnection'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\bimport\s*\(\s*['"`]https?:/, 'remote import()'],
  // Any remote URL literal could become an <img>, <script> or <link> request.
  [/['"`]https?:\/\/(?!www\.w3\.org\/)/, 'remote URL literal'],
];

const files = SOURCES.filter((file) => existsSync(file));
if (!existsSync(BUNDLE_DIR)) {
  console.error(`No built content scripts at ${BUNDLE_DIR}. Run "npm run build" first.`);
  process.exit(1);
}
files.push(...readdirSync(BUNDLE_DIR).map((name) => join(BUNDLE_DIR, name)));

const errors = [];
for (const file of files) {
  const code = readFileSync(file, 'utf8');
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(code)) errors.push(`${file}: uses ${label}`);
  }
}

if (errors.length) {
  console.error('In-page code must not use the network:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`No network use found in ${files.length} in-page files.`);
