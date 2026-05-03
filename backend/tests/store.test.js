import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetStoreForTests,
  addFeedback,
  getAnalyticsSummary,
  listHistory,
  saveVerification
} from '../services/storeService.js';

test('storeService saves verifications and computes analytics', () => {
  __resetStoreForTests();

  const claim = saveVerification({
    claim: 'Can I vote by SMS?',
    verdict: 'False',
    explanation: 'No.',
    confidence: 90,
    claimType: 'factual',
    sourceQuotes: ['- Ballots cannot be submitted via text message']
  });

  addFeedback({ claimId: claim.id, helpful: true, comment: 'Useful' });

  const history = listHistory(10);
  assert.equal(history.length, 1);

  const summary = getAnalyticsSummary();
  assert.equal(summary.totalVerifications, 1);
  assert.equal(summary.verdictCounts.False, 1);
  assert.equal(summary.totalFeedback, 1);
});
