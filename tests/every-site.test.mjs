// Run with `npm test` (Node 23.6+ runs the TypeScript import directly).
import assert from 'node:assert/strict';
import test from 'node:test';
import { isSkippedSite } from '../lib/protocol.ts';

test('a skipped site matches itself and its subdomains', () => {
  assert.equal(isSkippedSite('example.com', ['example.com']), true);
  assert.equal(isSkippedSite('mail.example.com', ['example.com']), true);
});

test('a skipped site does not match look-alike or parent sites', () => {
  assert.equal(isSkippedSite('notexample.com', ['example.com']), false);
  assert.equal(isSkippedSite('example.com', ['mail.example.com']), false);
  assert.equal(isSkippedSite('example.com', []), false);
});
