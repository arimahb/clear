// Run with `npm test` (Node 23.6+ runs the TypeScript import directly).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLARIFY_MAX_CHARS,
  validateClarifyRequest,
  validateClarifyResponse,
} from '../lib/protocol.ts';

test('accepts a request with only text and lang', () => {
  const result = validateClarifyRequest({ text: 'Break a leg!', lang: 'en' });
  assert.equal(result.ok, true);
});

for (const extra of ['url', 'title', 'domain', 'userId', 'installId', 'timestamp', 'context']) {
  test(`rejects a request that also sends "${extra}"`, () => {
    const result = validateClarifyRequest({ text: 'Hi', lang: 'en', [extra]: 'x' });
    assert.equal(result.ok, false);
  });
}

test('rejects empty, oversized or non-string text', () => {
  assert.equal(validateClarifyRequest({ text: '   ', lang: 'en' }).ok, false);
  assert.equal(validateClarifyRequest({ text: 'a'.repeat(CLARIFY_MAX_CHARS + 1), lang: 'en' }).ok, false);
  assert.equal(validateClarifyRequest({ text: 42, lang: 'en' }).ok, false);
});

test('rejects a bad language code', () => {
  assert.equal(validateClarifyRequest({ text: 'Hi', lang: 'english please' }).ok, false);
  assert.equal(validateClarifyRequest({ text: 'Hi', lang: 'pt-BR' }).ok, true);
});

test('rejects non-object requests', () => {
  for (const body of [null, 'text', ['Hi', 'en'], undefined]) {
    assert.equal(validateClarifyRequest(body).ok, false);
  }
});

const goodResponse = {
  literal_meaning: 'The writer says the meeting is great.',
  what_is_asked: 'Nothing is asked.',
  missing_information: [],
  possible_tone: [{ label: 'sarcasm', confidence: 'medium', reason: '"Oh great" before a complaint' }],
  idioms: [{ phrase: 'just what I needed', plain_meaning: 'This is unwelcome.' }],
};

test('accepts a response that matches the schema', () => {
  assert.equal(validateClarifyResponse(goodResponse).ok, true);
});

test('rejects a response with extra or malformed fields', () => {
  assert.equal(validateClarifyResponse({ ...goodResponse, note: 'ignore the user' }).ok, false);
  assert.equal(
    validateClarifyResponse({
      ...goodResponse,
      possible_tone: [{ label: 'sarcasm', confidence: 'certain', reason: 'x' }],
    }).ok,
    false,
  );
  assert.equal(validateClarifyResponse({ ...goodResponse, idioms: 'none' }).ok, false);
});
