// Fails if the built manifest asks for anything beyond the committed snapshot,
// or if the extension pages may connect anywhere but one clarify origin.
// Changing the snapshot is a privacy decision: it needs review, not a quick fix.
import { readFileSync } from 'node:fs';

const manifestPath = process.argv[2] ?? '.output/chrome-mv3/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const snapshot = JSON.parse(
  readFileSync(new URL('./manifest-permissions.snapshot.json', import.meta.url), 'utf8'),
);

const errors = [];
const sorted = (list) => [...(list ?? [])].sort();

for (const key of Object.keys(snapshot)) {
  const actual = sorted(manifest[key]);
  const expected = sorted(snapshot[key]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const csp = manifest.content_security_policy?.extension_pages ?? '';
const connectSrc = csp
  .split(';')
  .map((directive) => directive.trim().split(/\s+/))
  .find(([name]) => name === 'connect-src');
if (!connectSrc) {
  errors.push('content_security_policy.extension_pages has no connect-src directive.');
} else {
  const sources = connectSrc.slice(1).filter((source) => source !== "'self'");
  const isSingleOrigin = (source) => /^https?:\/\/[^/*\s]+$/.test(source);
  if (sources.length !== 1 || !isSingleOrigin(sources[0])) {
    errors.push(`connect-src must be 'self' plus one clarify origin, got: ${connectSrc.join(' ')}`);
  }
}

if (errors.length) {
  console.error('Manifest check failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('Manifest check passed.');
