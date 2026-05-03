import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnverifiedSuggestion,
  classifyClaimType,
  extractSourceQuotes,
  findRelatedMisconceptions,
  scoreConfidence
} from '../services/claimEnhancer.js';

const context = `
- Ballots cannot be submitted via text message, email, or social media.
- Mobile phones, cameras, and electronic devices are STRICTLY PROHIBITED inside the polling booth.
- Polling stations open exactly at 7:00 AM and close exactly at 6:00 PM.
`;

test('classifyClaimType detects procedural and opinion claims', () => {
  assert.equal(classifyClaimType('How do I register to vote?'), 'procedural');
  assert.equal(classifyClaimType('I think voting can happen online'), 'opinion');
});

test('findRelatedMisconceptions detects common myths', () => {
  const related = findRelatedMisconceptions('Can I vote by text message?');
  assert.equal(related.length > 0, true);
});

test('extractSourceQuotes returns matching lines', () => {
  const quotes = extractSourceQuotes('Can I vote by text message?', context, 'False');
  assert.equal(quotes.length > 0, true);
});

test('extractSourceQuotes does not leak unrelated counting lines for postal ballot claims', () => {
  const postalContext = `
- Counting of votes does NOT begin immediately after polling ends on the same day; counting starts on the official counting day notified by the Election Commission.
- Ballots cannot be submitted via text message, email, or social media.
`;

  const quotes = extractSourceQuotes('The Election Commission has cancelled postal ballots for senior citizens this year.', postalContext, 'UNVERIFIED');
  assert.equal(quotes.length, 0);
});

test('scoreConfidence returns bounded confidence', () => {
  const scored = scoreConfidence({
    verdict: 'False',
    sourceQuotes: ['- Ballots cannot be submitted via text message'],
    claimType: 'factual',
    hasModelError: false
  });

  assert.equal(scored.confidence >= 5 && scored.confidence <= 99, true);
  assert.equal(typeof scored.confidenceReason, 'string');
});

test('buildUnverifiedSuggestion returns contextual guidance', () => {
  const suggestion = buildUnverifiedSuggestion('procedural');
  assert.equal(suggestion.includes('registration deadline'), true);
});
