const misconceptionPatterns = [
  {
    pattern: /(vote|ballot).*(text message|sms|whatsapp|email|social media)/i,
    myth: 'You can vote by SMS, email, or social media.',
    fact: 'Voting is only allowed physically at official polling stations.'
  },
  {
    pattern: /(mobile|phone|camera).*(booth|polling)/i,
    myth: 'Mobile phones are allowed inside polling booths.',
    fact: 'Mobile phones and electronic devices are prohibited inside polling booths.'
  },
  {
    pattern: /(app).*(direct vote|vote directly)/i,
    myth: 'There is an app for direct voting.',
    fact: 'There is no official app for direct voting.'
  }
];

const proceduralKeywords = ['how', 'process', 'step', 'registration', 'register', 'timeline', 'when', 'where'];
const opinionKeywords = ['i think', 'i believe', 'probably', 'might be'];
const hypotheticalKeywords = ['what if', 'suppose', 'if someone'];

const stopwords = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which',
  'about', 'have', 'has', 'will', 'your', 'they', 'them', 'state', 'election', 'result', 'results',
  'vote', 'voting', 'claim', 'claims', 'person', 'persons', 'people', 'of', 'to', 'in', 'on', 'at',
  'by', 'an', 'a', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'as', 'this',
  'year', 'today', 'now', 'same', 'day'
]);

const tokenize = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export const classifyClaimType = (claim) => {
  const lower = claim.toLowerCase();

  if (hypotheticalKeywords.some((token) => lower.includes(token))) {
    return 'hypothetical';
  }

  if (opinionKeywords.some((token) => lower.includes(token))) {
    return 'opinion';
  }

  if (proceduralKeywords.some((token) => lower.includes(token))) {
    return 'procedural';
  }

  return 'factual';
};

export const findRelatedMisconceptions = (claim) => {
  return misconceptionPatterns
    .filter((item) => item.pattern.test(claim))
    .map((item) => ({ myth: item.myth, fact: item.fact }));
};

export const extractSourceQuotes = (claim, context, verdict) => {
  const claimTokens = new Set(tokenize(claim).filter((token) => token.length > 2 && !stopwords.has(token)));
  const lines = context
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.startsWith('Deadline:') || line.startsWith('Step'));

  const scored = lines
    .map((line) => {
      const lineTokens = tokenize(line).filter((token) => token.length > 2 && !stopwords.has(token));
      const overlap = lineTokens.filter((token) => claimTokens.has(token)).length;
      return { line, overlap };
    })
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  if (verdict === 'UNVERIFIED') {
    // Avoid showing weakly related context as supporting evidence for unknown claims.
    return scored
      .filter((entry) => entry.overlap >= 3)
      .slice(0, 1)
      .map((entry) => entry.line);
  }

  const topQuotes = scored.slice(0, 2).map((entry) => entry.line);

  return topQuotes;
};

export const scoreConfidence = ({ verdict, sourceQuotes, claimType, hasModelError }) => {
  if (hasModelError) {
    return {
      confidence: 20,
      confidenceReason: 'Model processing failed, fallback response generated.'
    };
  }

  let confidence = 50;

  if (verdict === 'True' || verdict === 'False') {
    confidence += 25;
  }

  confidence += Math.min(20, sourceQuotes.length * 10);

  if (claimType === 'opinion' || claimType === 'hypothetical') {
    confidence -= 15;
  }

  if (verdict === 'UNVERIFIED') {
    confidence -= 10;
  }

  confidence = Math.max(5, Math.min(99, confidence));

  let confidenceReason = 'Moderate confidence based on rule matching.';
  if (confidence >= 85) {
    confidenceReason = 'High confidence due to direct overlap with official election guidelines.';
  } else if (confidence <= 40) {
    confidenceReason = 'Low confidence due to limited or indirect context overlap.';
  }

  return { confidence, confidenceReason };
};

export const buildUnverifiedSuggestion = (claimType) => {
  if (claimType === 'procedural') {
    return 'Try asking with specific keywords like registration deadline, polling hours, or required ID documents.';
  }

  return 'Rephrase with a clear factual claim related to voter registration, polling day rules, or official announcement timing.';
};
