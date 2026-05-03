import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_HISTORY = Number(process.env.MAX_HISTORY_ITEMS || 250);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = path.join(__dirname, '../data/verification_store.json');

const history = [];
const feedback = [];
let sequence = 1;

const persistStore = () => {
  try {
    const payload = {
      sequence,
      history,
      feedback
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Non-fatal in hackathon environments without disk write permissions.
  }
};

const loadStore = () => {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return;
    }

    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.history)) {
      history.push(...parsed.history);
    }
    if (Array.isArray(parsed.feedback)) {
      feedback.push(...parsed.feedback);
    }
    if (typeof parsed.sequence === 'number' && parsed.sequence > 0) {
      sequence = parsed.sequence;
    }
  } catch {
    // Ignore corrupted persistence payload and continue with in-memory mode.
  }
};

loadStore();

export const saveVerification = (record) => {
  const item = {
    id: `claim-${sequence++}`,
    createdAt: new Date().toISOString(),
    ...record
  };

  history.unshift(item);

  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  persistStore();

  return item;
};

export const listHistory = (limit = 20) => {
  return history.slice(0, Math.max(1, Math.min(limit, MAX_HISTORY)));
};

export const addFeedback = ({ claimId, helpful, comment }) => {
  const linkedClaim = history.find((item) => item.id === claimId);

  const item = {
    id: `feedback-${sequence++}`,
    claimId,
    helpful: Boolean(helpful),
    comment: typeof comment === 'string' ? comment.trim() : '',
    createdAt: new Date().toISOString(),
    foundClaim: Boolean(linkedClaim)
  };

  feedback.unshift(item);
  persistStore();
  return item;
};

export const getAnalyticsSummary = () => {
  const verdictCounts = { True: 0, False: 0, UNVERIFIED: 0 };
  const claimTypeCounts = {};
  let confidenceSum = 0;

  for (const item of history) {
    verdictCounts[item.verdict] = (verdictCounts[item.verdict] || 0) + 1;
    claimTypeCounts[item.claimType] = (claimTypeCounts[item.claimType] || 0) + 1;
    confidenceSum += Number(item.confidence || 0);
  }

  const helpfulCount = feedback.filter((entry) => entry.helpful).length;

  return {
    totalVerifications: history.length,
    verdictCounts,
    claimTypeCounts,
    averageConfidence: history.length === 0 ? 0 : Math.round(confidenceSum / history.length),
    totalFeedback: feedback.length,
    helpfulFeedbackRatio: feedback.length === 0 ? 0 : Math.round((helpfulCount / feedback.length) * 100),
    recentClaims: listHistory(5).map((item) => ({
      id: item.id,
      claim: item.claim,
      verdict: item.verdict,
      confidence: item.confidence,
      createdAt: item.createdAt
    }))
  };
};

export const __resetStoreForTests = () => {
  history.length = 0;
  feedback.length = 0;
  sequence = 1;
  persistStore();
};
