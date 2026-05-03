import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBatchClaims,
  sanitizeClaim,
  validateClaim,
  validateImageMimeType
} from '../utils/validation.js';

test('sanitizeClaim removes control chars and trims', () => {
  const result = sanitizeClaim('  hello\n\u0000 world  ');
  assert.equal(result, 'hello world');
});

test('validateClaim rejects empty and overly long claims', () => {
  assert.equal(validateClaim('   ').isValid, false);

  const tooLong = 'a'.repeat(5001);
  assert.equal(validateClaim(tooLong).isValid, false);
});

test('validateImageMimeType accepts png and rejects gif', () => {
  assert.equal(validateImageMimeType('image/png').isValid, true);
  assert.equal(validateImageMimeType('image/gif').isValid, false);
});

test('parseBatchClaims enforces limits and sanitizes claims', () => {
  const parsed = parseBatchClaims([' First claim ', 'Second claim']);
  assert.equal(parsed.isValid, true);
  assert.deepEqual(parsed.cleanedClaims, ['First claim', 'Second claim']);

  const invalid = parseBatchClaims([]);
  assert.equal(invalid.isValid, false);
});
