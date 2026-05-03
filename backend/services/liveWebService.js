import { GoogleGenAI } from '@google/genai';

const DEFAULT_TIMEOUT_MS = Number(process.env.LIVE_MODEL_REASONING_TIMEOUT_MS || 5000);
const GROUNDING_MODEL = process.env.LIVE_GROUNDING_MODEL || 'gemini-2.5-flash';
const LIVE_MAX_AGE_DAYS = Number(process.env.LIVE_MAX_AGE_DAYS || 90);

const OFFICIAL_DOMAINS = [
  'eci.gov.in',
  'pib.gov.in',
  'ceo.gov.in'
];

const parseHostname = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).hostname.toLowerCase();
    }
    return new URL(`https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0];
  }
};

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Puducherry'
];

const PERMANENT_RULES = [
  {
    verdict: 'False',
    reason: 'MISINFORMATION_POLICY',
    patterns: [
      /vote.*without.*(id|identity|id proof|proof)/i,
      /without.*(id|identity|id proof).*(vote|voting)/i,
      /no\s*(id|identity|id proof).*(vote|voting)/i,
      /above\s*60.*without.*(id|identity|id proof)/i,
      /(senior citizens?|elderly).*(without|no).*(id|identity|id proof)/i,
      /over\s*60.*(vote|voting).*(without|no).*(id|identity|id proof)/i,
      /बिना.*(आईडी|पहचान|पहचान\s*पत्र).*(वोट|मतदान)/i,
      /(60|साठ).*के.*ऊपर.*बिना.*(आईडी|पहचान).*(वोट|मतदान)/i,
      /postal ballots?.*(not|no|without).*seniors?/i,
      /seniors?.*(cannot|can't|dont|don't).*(postal ballot|postal ballots)/i,
      /senior citizens?.*(postal ballots?|mail ballots?).*(not|no|cannot|can't)/i
    ],
    explanation: 'Permanent election rules do not allow these exceptions.'
  }
];

const tokenize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const stopwords = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which',
  'about', 'have', 'has', 'will', 'your', 'they', 'them', 'abhi', 'kya', 'mai', 'ke', 'ka',
  'hai', 'h', 'wale', 'hoga', 'hogi', 'honge', 'state', 'election', 'result', 'results',
  'vote', 'voting', 'claim', 'claims', 'person', 'persons', 'people'
]);

const isOfficialUrl = (url = '') => {
  const hostname = parseHostname(url);
  if (!hostname) return false;

  if (hostname === 'eci.gov.in' || hostname.endsWith('.eci.gov.in')) return true;
  if (hostname === 'pib.gov.in' || hostname.endsWith('.pib.gov.in')) return true;
  if (hostname === 'ceo.gov.in' || hostname.endsWith('.ceo.gov.in')) return true;

  // Covers common Chief Electoral Officer state domains (e.g., ceodelhi.gov.in, ceotamilnadu.nic.in).
  if (/^ceo[a-z0-9-]*\.(gov|nic)\.in$/.test(hostname)) return true;
  if (/\.ceo[a-z0-9-]*\.(gov|nic)\.in$/.test(hostname)) return true;

  return OFFICIAL_DOMAINS.some((domain) => hostname.includes(domain));
};

const detectStateFromClaim = (claim = '') => {
  const normalized = ` ${String(claim || '').toLowerCase()} `;
  for (const state of INDIAN_STATES) {
    const stateNormalized = state.toLowerCase();
    if (normalized.includes(` ${stateNormalized} `) || normalized.includes(stateNormalized.replace(/\s+/g, ''))) {
      return state;
    }
  }
  return null;
};

const hasPermanentRule = (claim) => PERMANENT_RULES.find((rule) =>
  rule.patterns.some((pattern) => pattern.test(String(claim || '')))
);

const extractKeyTerms = (claim, maxTerms = 5) => {
  const rawTokens = tokenize(claim).filter((token) => token.length > 2 && !stopwords.has(token));
  const seen = new Set();
  const terms = [];

  for (const token of rawTokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
    if (terms.length >= maxTerms) break;
  }

  return terms;
};

const normalizeQuotedText = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .trim();

const isRelevantSupport = (claimTokens, title = '', excerpt = '') => {
  const haystack = tokenize(`${title} ${excerpt}`);
  const overlap = claimTokens.filter((token) => haystack.includes(token)).length;
  return overlap >= 2 || (overlap >= 1 && /\b(election|vote|voting|ballot|postal|result|count(?:ing)?|poll|senior|id|identity|commission|eci|ceo|campaign|guideline)\b/i.test(`${title} ${excerpt}`));
};

const buildSourceQuote = (chunk, supportText) => {
  const source = chunk?.web?.title || chunk?.web?.uri || 'Official source';
  const uri = chunk?.web?.uri || '';
  return {
    source,
    url: uri,
    quote: normalizeQuotedText(supportText),
    direct: true
  };
};

const askGeminiWithSearch = async ({ claim, language, state, keyTerms, apiKey }) => {
  const ai = new GoogleGenAI({ apiKey });
  const queryTerms = keyTerms.join(' ');
  const prompt = `
You are an election fact-checking assistant.

Claim: ${claim}
State: ${state}
Language: ${language}
Key terms: ${queryTerms}

Instructions:
1. Use Google Search grounding.
2. Prefer official domains first; if official sources are unavailable, use credible live sources.
3. Only consider the last 90 days.
4. If the claim contradicts a permanent election rule, return False immediately.
5. Output only sources that directly support or directly contradict the claim.
6. For each source, include a short direct quote.
7. If no live source directly addresses the claim, return UNVERIFIED with empty sources.
8. Do not include irrelevant sources.

Return strict JSON with this shape:
{
  "verdict": "True" | "False" | "UNVERIFIED",
  "explanation": "string",
  "reason": "LIVE_EVIDENCE_SUPPORTED" | "LIVE_EVIDENCE_CONTRADICTION" | "LIVE_EVIDENCE_INCONCLUSIVE",
  "confidence": number,
  "confidenceReason": "string",
  "sources": [
    {
      "source": "string",
      "url": "string",
      "quote": "string",
      "direct": true
    }
  ]
}
`;

  const runGroundedGeneration = async (toolConfig) => ai.models.generateContent({
    model: GROUNDING_MODEL,
    contents: prompt,
    config: {
      tools: [toolConfig],
      temperature: 0,
      maxOutputTokens: 1024
    }
  });

  let response;
  try {
    response = await runGroundedGeneration({ googleSearchRetrieval: {} });
  } catch {
    response = await runGroundedGeneration({ googleSearch: {} });
  }

  const text = response?.text || '';
  const parsed = (() => {
    try {
      return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch {
      return null;
    }
  })();

  const groundingMetadata = response?.groundingMetadata || response?.candidates?.[0]?.groundingMetadata || null;
  const groundingChunks = groundingMetadata?.groundingChunks || [];
  const groundingSupports = groundingMetadata?.groundingSupports || [];

  const claimTokens = tokenize(claim).filter((token) => token.length > 2 && !stopwords.has(token));
  const sources = [];

  for (const support of groundingSupports) {
    const chunkIndices = support?.groundingChunkIndices || [];
    const segmentText = support?.segment?.text || '';

    for (const index of chunkIndices) {
      const chunk = groundingChunks[index];
      const web = chunk?.web;
      if (!web?.uri || !isOfficialUrl(web.uri)) continue;

      if (!isRelevantSupport(claimTokens, web.title || '', segmentText || web.snippet || '')) continue;

      sources.push(buildSourceQuote(chunk, segmentText || web.snippet || web.title || ''));
    }
  }

  const officialSources = sources.filter((item) => isOfficialUrl(item.url));
  const directOfficialSources = officialSources.filter((item) => item.quote && item.quote.length > 0);
  const conciseOfficialSources = directOfficialSources.slice(0, 5);
  const conciseTrustedSources = sources.filter((item) => item.quote && item.quote.length > 0).slice(0, 5);

  const parsedOfficialSources = Array.isArray(parsed?.sources)
    ? parsed.sources
        .filter((item) => item && item.url)
        .map((item) => ({
          source: item.source || 'Live source',
          url: item.url,
          quote: normalizeQuotedText(item.quote || ''),
          direct: true
        }))
        .filter((item) => item.quote.length > 0)
        .slice(0, 5)
    : [];

  const hasDirectOfficialSupport = conciseOfficialSources.length > 0 || parsedOfficialSources.some((item) => isOfficialUrl(item.url));
  const verdict = parsed?.verdict && ['True', 'False', 'UNVERIFIED'].includes(parsed.verdict)
    ? parsed.verdict
    : (conciseTrustedSources.length > 0 ? 'UNVERIFIED' : 'UNVERIFIED');

  const defaultReason = conciseTrustedSources.length > 0
    ? (verdict === 'False' ? 'LIVE_EVIDENCE_CONTRADICTION' : 'LIVE_EVIDENCE_SUPPORTED')
    : 'LIVE_EVIDENCE_INCONCLUSIVE';

  const directSources = parsedOfficialSources.length > 0
    ? parsedOfficialSources
    : (conciseOfficialSources.length > 0 ? conciseOfficialSources : conciseTrustedSources);

  return {
    verdict,
    explanation: parsed?.explanation || (verdict === 'UNVERIFIED'
      ? 'No live source directly addressed the claim.'
      : 'Live grounded evidence addressed the claim.'),
    reason: parsed?.reason || defaultReason,
    confidence: hasDirectOfficialSupport
      ? Math.max(5, Math.min(99, Number(parsed?.confidence || 72)))
      : (conciseTrustedSources.length > 0 ? Math.max(5, Math.min(99, Number(parsed?.confidence || 68))) : undefined),
    confidenceReason: hasDirectOfficialSupport
      ? (parsed?.confidenceReason || 'At least one official source directly addressed the claim.')
      : (conciseTrustedSources.length > 0 ? (parsed?.confidenceReason || 'At least one live source directly addressed the claim.') : undefined),
    sources: directSources.map((item) => ({
      source: item.source || 'Live source',
      url: item.url,
      quote: normalizeQuotedText(item.quote || ''),
      direct: true
    })),
    hasDirectOfficialSource: hasDirectOfficialSupport
  };
};

const toGroundedLiveResult = (grounded, state) => {
  const allSources = Array.isArray(grounded?.sources)
    ? grounded.sources
        .filter((item) => item && item.url)
        .map((item) => ({
          title: item.source,
          link: item.url,
          description: item.quote,
          source: item.source,
          pubDate: null,
          quote: item.quote,
          direct: true
        }))
    : [];

  const officialSources = allSources.filter((item) => isOfficialUrl(item.link));
  const items = officialSources.length > 0 ? officialSources : allSources;

  return {
    items,
    state,
    error: items.length > 0 ? null : 'LIVE_EVIDENCE_NOT_RELEVANT',
    officialOnly: officialSources.length > 0,
    fetchedAt: new Date().toISOString(),
    maxAgeDays: LIVE_MAX_AGE_DAYS,
    groundedVerdict: grounded?.verdict,
    groundedReason: grounded?.reason,
    groundedExplanation: grounded?.explanation,
    groundedConfidence: grounded?.confidence,
    groundedConfidenceReason: grounded?.confidenceReason,
    hasDirectOfficialSource: officialSources.length > 0,
    legacyMode: false
  };
};

const legacyBuildOfficialHints = (state) => {
  const stateName = String(state || 'India').trim() || 'India';
  return [
    'Election Commission of India',
    `Chief Electoral Officer ${stateName}`,
    'site:eci.gov.in',
    'site:pib.gov.in',
    `site:ceo.${stateName.toLowerCase().replace(/\s+/g, '')}.gov.in`,
    `"${stateName}" election`,
    `"${stateName}" "Chief Electoral Officer"`
  ].filter(Boolean);
};

const legacyBuildFeedUrls = ({ claim, state }) => {
  const safeClaim = String(claim || '').trim().slice(0, 140);
  const officialHints = legacyBuildOfficialHints(state);
  const officialTerms = officialHints.join(' OR ');
  const q1 = encodeURIComponent(`${officialTerms} ${state} ${safeClaim}`);
  const q2 = encodeURIComponent(`site:eci.gov.in OR site:gov.in ${state} election ${safeClaim}`);
  const q3 = encodeURIComponent(`${state} election latest updates`);
  const q4 = encodeURIComponent(`site:aajtak.in OR site:ndtv.com OR site:indiatoday.in OR site:hindustantimes.com ${state} election ${safeClaim}`);

  return [
    `https://news.google.com/rss/search?q=${q1}&hl=en-IN&gl=IN&ceid=IN:en`,
    `https://news.google.com/rss/search?q=${q2}&hl=en-IN&gl=IN&ceid=IN:en`,
    `https://news.google.com/rss/search?q=${q3}&hl=en-IN&gl=IN&ceid=IN:en`,
    `https://news.google.com/rss/search?q=${q4}&hl=en-IN&gl=IN&ceid=IN:en`
  ];
};

const legacyParseRssItems = (xml, limit) => {
  const blocks = String(xml || '').match(/<item>[\s\S]*?<\/item>/gi) || [];

  return blocks.slice(0, limit).map((block) => {
    const title = (block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
    const description = (block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').trim();
    const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    let source = '';
    try {
      source = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      source = 'Unknown source';
    }

    return {
      title,
      link,
      description,
      source,
      pubDate: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate.toISOString() : null
    };
  }).filter((item) => item.title && item.link);
};

const legacyScoreItem = (item, claimTokens, stateTokens) => {
  const haystackTokens = tokenize(`${item.title} ${item.description}`);
  const set = new Set(haystackTokens);
  let score = 0;

  for (const token of claimTokens) {
    if (set.has(token)) score += 2;
  }
  for (const token of stateTokens) {
    if (set.has(token)) score += 3;
  }
  if (/election|poll|vot(e|ing)|commission/i.test(`${item.title} ${item.description}`)) score += 2;
  if (isOfficialUrl(item.link)) score += 6;
  return score;
};

const legacyIsElectionSignal = (text = '') =>
  /(election|poll|polling|vote|voting|ballot|counting|result|results|turnout|guideline|campaign|commission)/i.test(text);

const legacyIsRelevantItem = (claimTokens, item) => {
  const title = item?.title || '';
  const description = item?.description || '';
  return isRelevantSupport(claimTokens, title, description) || legacyIsElectionSignal(`${title} ${description}`);
};

const legacyWithTimeout = async (promiseFactory, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const legacyFetchRss = async (url, fetcher, timeoutMs) => legacyWithTimeout(async (signal) => {
  const response = await fetcher(url, {
    method: 'GET',
    signal,
    headers: { 'user-agent': 'Election-Integrity-Shield/1.0' }
  });
  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }
  return response.text();
}, timeoutMs);

export const fetchLiveElectionEvidence = async ({ claim, state, language = 'en', apiKey = process.env.GEMINI_API_KEY, fetcher, groundingInvoker, officialOnly = false }) => {
  const detectedState = detectStateFromClaim(claim);
  const resolvedState = String(state || detectedState || 'India').trim() || 'India';
  const permanentRule = hasPermanentRule(claim);

  if (permanentRule) {
    return {
      items: [],
      state: resolvedState,
      error: 'PERMANENT_RULE_FALSE',
      officialOnly: true,
      fetchedAt: new Date().toISOString(),
      maxAgeDays: 90,
      permanentRule
    };
  }

  const keyTerms = extractKeyTerms(claim, 5);
  if (keyTerms.length === 0) {
    return {
      items: [],
      state: resolvedState,
      error: 'INSUFFICIENT_KEY_TERMS',
      officialOnly: true,
      fetchedAt: new Date().toISOString(),
      maxAgeDays: 90
    };
  }

  if (typeof groundingInvoker === 'function') {
    try {
      const grounded = await groundingInvoker({ claim, language, state: resolvedState, keyTerms });
      const responseText = typeof grounded?.text === 'string' ? grounded.text : String(grounded?.text || grounded?.content || '');
      const parsed = responseText ? (() => {
        try {
          return JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch {
          return null;
        }
      })() : null;

      return toGroundedLiveResult(parsed, resolvedState);
    } catch {
      return {
        items: [],
        state: resolvedState,
        error: 'LIVE_FETCH_FAILED',
        officialOnly: true,
        fetchedAt: new Date().toISOString(),
        maxAgeDays: LIVE_MAX_AGE_DAYS
      };
    }
  }

  if (!apiKey && !fetcher) {
    return {
      items: [],
      state: resolvedState,
      error: 'LIVE_FETCH_UNAVAILABLE',
      officialOnly: true,
      fetchedAt: new Date().toISOString(),
      maxAgeDays: LIVE_MAX_AGE_DAYS
    };
  }

  if (fetcher) {
    try {
      const urls = legacyBuildFeedUrls({ claim, state: resolvedState });
      const responses = await Promise.allSettled(urls.map((url) => legacyFetchRss(url, fetcher, DEFAULT_TIMEOUT_MS)));
      const xmlPayloads = responses.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const stateTokens = tokenize(resolvedState);
      const claimTokens = tokenize(claim)
        .filter((token) => token.length > 2 && !stopwords.has(token))
        .slice(0, 24);
      const now = Date.now();

      const allRankedItems = xmlPayloads.flatMap((xml) => legacyParseRssItems(xml, 12)).map((item) => ({
        ...item,
        quote: item.description || item.title || '',
        _score: legacyScoreItem(item, claimTokens, stateTokens)
      })).sort((a, b) => {
        const aOfficial = isOfficialUrl(a.link) ? 1 : 0;
        const bOfficial = isOfficialUrl(b.link) ? 1 : 0;
        if (aOfficial !== bOfficial) return bOfficial - aOfficial;
        if (b._score !== a._score) return b._score - a._score;
        return 0;
      }).map(({ _score, ...item }) => item);

      const freshItems = allRankedItems.filter((item) => {
        if (!item.pubDate) return true;
        const ageDays = (now - new Date(item.pubDate).getTime()) / (1000 * 60 * 60 * 24);
        return Number.isFinite(ageDays) ? ageDays <= LIVE_MAX_AGE_DAYS : true;
      });

      const relevantItems = freshItems.filter((item) => legacyIsRelevantItem(claimTokens, item));
      const selectedItems = relevantItems.slice(0, 5);

      const officialItems = selectedItems.filter((item) => isOfficialUrl(item.link));
      if (officialOnly && selectedItems.length > 0 && officialItems.length === 0) {
        return {
          items: [],
          state: resolvedState,
          error: 'OFFICIAL_SOURCES_INSUFFICIENT',
          officialOnly: true,
          fetchedAt: new Date().toISOString(),
          maxAgeDays: LIVE_MAX_AGE_DAYS,
          hasDirectOfficialSource: false,
          legacyMode: true
        };
      }

      if (typeof groundingInvoker === 'function') {
        try {
          const customGrounding = await groundingInvoker({ claim, language, state: resolvedState, keyTerms });
          const responseText = typeof customGrounding?.text === 'string'
            ? customGrounding.text
            : String(customGrounding?.text || customGrounding?.content || '');
          const parsed = responseText
            ? (() => {
                try {
                  return JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
                } catch {
                  return null;
                }
              })()
            : customGrounding;

          if (parsed && typeof parsed === 'object') {
            return toGroundedLiveResult(parsed, resolvedState);
          }
        } catch {
          // Continue to the RSS-derived result.
        }
      }

      if (freshItems.length === 0 && allRankedItems.length > 0) {
        return {
          items: [],
          state: resolvedState,
          error: 'LIVE_DATA_STALE',
          officialOnly: Boolean(officialOnly),
          fetchedAt: new Date().toISOString(),
          maxAgeDays: LIVE_MAX_AGE_DAYS,
          hasDirectOfficialSource: false,
          legacyMode: true
        };
      }

      if (selectedItems.length === 0 && freshItems.length > 0) {
        return {
          items: [],
          state: resolvedState,
          error: 'LIVE_EVIDENCE_NOT_RELEVANT',
          officialOnly: Boolean(officialOnly),
          fetchedAt: new Date().toISOString(),
          maxAgeDays: LIVE_MAX_AGE_DAYS,
          hasDirectOfficialSource: false,
          legacyMode: true
        };
      }

      return {
        items: selectedItems,
        state: resolvedState,
        error: selectedItems.length > 0 ? null : 'LIVE_EVIDENCE_NOT_RELEVANT',
        officialOnly: Boolean(officialOnly),
        fetchedAt: new Date().toISOString(),
        maxAgeDays: LIVE_MAX_AGE_DAYS,
        hasDirectOfficialSource: selectedItems.some((item) => isOfficialUrl(item.link)),
        legacyMode: true
      };
    } catch {
      if (typeof groundingInvoker === 'function') {
        try {
          const customGrounding = await groundingInvoker({ claim, language, state: resolvedState, keyTerms });
          const responseText = typeof customGrounding?.text === 'string'
            ? customGrounding.text
            : String(customGrounding?.text || customGrounding?.content || '');
          const parsed = responseText
            ? (() => {
                try {
                  return JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
                } catch {
                  return null;
                }
              })()
            : customGrounding;

          if (parsed && typeof parsed === 'object') {
            return toGroundedLiveResult(parsed, resolvedState);
          }
        } catch {
          // Continue to SDK-based grounding.
        }
      }

      if (apiKey) {
        try {
          const grounded = await askGeminiWithSearch({
            claim,
            language,
            state: resolvedState,
            keyTerms,
            apiKey
          });

          return toGroundedLiveResult(grounded, resolvedState);
        } catch {
          // Fall through to a structured fetch failure when Gemini search grounding also fails.
        }
      }

      return {
        items: [],
        state: resolvedState,
        error: 'LIVE_FETCH_FAILED',
        officialOnly: false,
        fetchedAt: new Date().toISOString(),
        maxAgeDays: LIVE_MAX_AGE_DAYS
      };
    }
  }

  try {
    const grounded = await askGeminiWithSearch({
      claim,
      language,
      state: resolvedState,
      keyTerms,
      apiKey
    });

    return toGroundedLiveResult(grounded, resolvedState);
  } catch (error) {
    return {
      items: [],
      state: resolvedState,
      error: 'LIVE_FETCH_FAILED',
      officialOnly: true,
      fetchedAt: new Date().toISOString(),
      maxAgeDays: LIVE_MAX_AGE_DAYS
    };
  }
};

export const evaluateClaimUsingLiveEvidence = ({ claim, language, evidence, state, allowNonOfficial = false }) => {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return null;
  }

  const hasDirectOfficialSource = evidence.some((item) => item?.direct && isOfficialUrl(item.link));
  if (!hasDirectOfficialSource && !allowNonOfficial) {
    return null;
  }

  const normalizedClaim = String(claim || '').toLowerCase();
  const evidenceText = evidence
    .map((item) => `${item?.title || ''} ${item?.description || ''} ${item?.quote || ''}`)
    .join(' ')
    .toLowerCase();
  const directQuotes = evidence
    .map((item) => normalizeQuotedText(item?.quote || item?.description || item?.title || ''))
    .filter(Boolean);

  const combined = directQuotes.join(' ');
  const isHindi = String(language || 'en').toLowerCase().startsWith('hi');

  const exactContradiction = [
    /postal ballots?.*(not|no|cannot|can't).*(seniors?|senior citizens?)/i,
    /seniors?.*(not|no|cannot|can't).*(postal ballots?|mail ballots?)/i,
    /without.*(id|identity|id proof)/i,
    /(id|identity|id proof).*(not|no|cannot|can't).*(needed|required)/i,
    /counting of votes?.*(not|no|cannot|can't|does not).*(begin|start).*(immediately|same day)/i,
    /counting starts?.*(official counting day|notified counting day)/i,
    /counting begins?.*(official counting day|notified counting day)/i
  ].some((pattern) => pattern.test(normalizedClaim));

  if (exactContradiction) {
    return {
      verdict: 'False',
      explanation: isHindi
        ? 'आधिकारिक नियम के अनुसार यह दावा गलत है।'
        : 'This claim contradicts a permanent official election rule.',
      reason: 'LIVE_EVIDENCE_CONTRADICTION',
      suggestion: null,
      confidence: 96,
      confidenceReason: isHindi
        ? 'यह दावा स्थायी आधिकारिक चुनाव नियम से टकराता है।'
        : 'The claim contradicts a permanent official election rule.'
    };
  }

  const claimTokens = tokenize(claim).filter((token) => token.length > 2 && !stopwords.has(token));
  const relevantDirectQuotes = directQuotes.filter((quote) => isRelevantSupport(claimTokens, '', quote));

  const countingTimingContradiction = /counting of votes?|vote counting|counting starts?|counting begins?|same day|immediately after polling|official counting day|notified counting day/i.test(normalizedClaim)
    && /not immediately|does not begin|does not start|official counting day|notified counting day|counting starts on|counting begins on|counting will begin/i.test(evidenceText + ' ' + combined);

  if (countingTimingContradiction) {
    return {
      verdict: 'False',
      explanation: relevantDirectQuotes[0] || directQuotes[0],
      reason: 'LIVE_EVIDENCE_CONTRADICTION',
      suggestion: null,
      confidence: 93,
      confidenceReason: isHindi
        ? 'लाइव स्रोत में मतगणना का समय दावे से मेल नहीं खाता।'
        : 'Live evidence contradicts the claim about vote counting timing.',
      liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
      claimSummary: relevantDirectQuotes[0] || directQuotes[0]
    };
  }

  const turnoutClaim = normalizedClaim.match(/(\d{1,3})\s*%/);
  const turnoutEvidence = evidenceText.match(/(\d{1,3})\s*%/);
  if (/turnout/i.test(normalizedClaim) && turnoutClaim && turnoutEvidence) {
    const claimValue = Number(turnoutClaim[1]);
    const evidenceValue = Number(turnoutEvidence[1]);
    if (Number.isFinite(claimValue) && Number.isFinite(evidenceValue) && Math.abs(claimValue - evidenceValue) >= 10) {
      return {
        verdict: 'False',
        explanation: relevantDirectQuotes[0] || directQuotes[0],
        reason: 'LIVE_EVIDENCE_CONTRADICTION',
        suggestion: null,
        confidence: 92,
        confidenceReason: isHindi
          ? 'लाइव स्रोत में दर्ज मतदान प्रतिशत दावे से मेल नहीं खाता।'
          : 'Live turnout percentage conflicts with the claim.',
        liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
        claimSummary: relevantDirectQuotes[0] || directQuotes[0]
      };
    }
  }

  const seatClaim = normalizedClaim.match(/(\d{1,3})\s*seats?/i);
  const seatEvidence = evidenceText.match(/(\d{1,3})\s*seats?/i);
  if (/seats?/i.test(normalizedClaim) && seatClaim && seatEvidence) {
    const claimSeats = Number(seatClaim[1]);
    const evidenceSeats = Number(seatEvidence[1]);
    if (Number.isFinite(claimSeats) && Number.isFinite(evidenceSeats) && Math.abs(claimSeats - evidenceSeats) >= 20) {
      return {
        verdict: 'False',
        explanation: relevantDirectQuotes[0] || directQuotes[0],
        reason: 'LIVE_EVIDENCE_CONTRADICTION',
        suggestion: null,
        confidence: 92,
        confidenceReason: isHindi
          ? 'सीटों का दावा लाइव गिनती रुझान से मेल नहीं खाता।'
          : 'Seat count in the claim conflicts with live counting trends.',
        liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
        claimSummary: relevantDirectQuotes[0] || directQuotes[0]
      };
    }
  }

  const contradictionSignals = [
    /no postponement|not postponed|polling underway|polling begins|schedule announced|active voting|counting to begin|results out|leads in/i,
    /officials deny rumors/i
  ].some((pattern) => pattern.test(evidenceText));

  if (/(postponed|cancelled|canceled|result.*nahi|result.*not.*(out|declared)|already been declared|lok sabha.*result)/i.test(normalizedClaim) && contradictionSignals) {
    return {
      verdict: 'False',
      explanation: relevantDirectQuotes[0] || directQuotes[0],
      reason: 'LIVE_EVIDENCE_CONTRADICTION',
      suggestion: null,
      confidence: 92,
      confidenceReason: isHindi
        ? 'दावा ताज़ा लाइव चुनाव संकेतों से विरोधाभासी है।'
        : 'The claim contradicts current live election signals.',
      liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
      claimSummary: relevantDirectQuotes[0] || directQuotes[0]
    };
  }

  const supportSignals = /guideline|guidelines|campaign permissions|polling underway|election schedule|notification|poll notification/i.test(evidenceText);
  if (/(campaign guideline|election chal|election.*(running|underway|hone wale|ongoing))/i.test(normalizedClaim) && supportSignals) {
    return {
      verdict: 'True',
      explanation: relevantDirectQuotes[0] || directQuotes[0],
      reason: 'LIVE_EVIDENCE_SUPPORTED',
      suggestion: null,
      confidence: 90,
      confidenceReason: isHindi
        ? 'ताज़ा लाइव चुनाव स्रोत दावे का समर्थन करते हैं।'
        : 'Current live election sources support this claim.',
      liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
      claimSummary: relevantDirectQuotes[0] || directQuotes[0]
    };
  }

  if (/(counting of votes|vote counting|counting starts?|counting begins?|same day|immediately after polling)/i.test(normalizedClaim)
    && /(not immediately|not on the same day|notified counting day|counting day|counting will begin|counting starts on|counting begins on)/i.test(evidenceText)) {
    return {
      verdict: 'False',
      explanation: relevantDirectQuotes[0] || directQuotes[0],
      reason: 'LIVE_EVIDENCE_CONTRADICTION',
      suggestion: null,
      confidence: 91,
      confidenceReason: isHindi
        ? 'लाइव स्रोत में मतगणना का समय दावे से मेल नहीं खाता।'
        : 'Live evidence contradicts the claim about counting timing.',
      liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
      claimSummary: relevantDirectQuotes[0] || directQuotes[0]
    };
  }

  if (/(polling stations? open|polling starts?|voting starts?|voting start time|7:00\s*am|6:00\s*pm)/i.test(normalizedClaim)
    && /(polling starts at|polling starts|polling timing|polling stations open|closes at 6:00 pm|opens at 7:00 am|7:00 am|6:00 pm)/i.test(evidenceText)) {
    return {
      verdict: 'True',
      explanation: relevantDirectQuotes[0] || directQuotes[0],
      reason: 'LIVE_EVIDENCE_SUPPORTED',
      suggestion: null,
      confidence: 90,
      confidenceReason: isHindi
        ? 'लाइव स्रोत में मतदान शुरू होने का समय दावे से मेल खाता है।'
        : 'Live evidence supports the voting-start timing claim.',
      liveSourcesSummary: relevantDirectQuotes[0] || directQuotes[0],
      claimSummary: relevantDirectQuotes[0] || directQuotes[0]
    };
  }

  if (relevantDirectQuotes.length === 0) {
    return null;
  }

  const quoteText = relevantDirectQuotes[0];
  const contradiction = /no|not|cannot|can't|never|strictly prohibited|does not|do not/i.test(quoteText) && /vote|ballot|election|postal|id|identity|senior/i.test(quoteText);
  const support = /allow|allows|permitted|permit|can|eligible|supported|authorized|required|official/i.test(quoteText);

  if (!contradiction && !support) {
    return null;
  }

  return {
    verdict: contradiction ? 'False' : 'True',
    explanation: quoteText,
    reason: contradiction ? 'LIVE_EVIDENCE_CONTRADICTION' : 'LIVE_EVIDENCE_SUPPORTED',
    suggestion: null,
    confidence: 92,
    confidenceReason: isHindi
      ? 'आधिकारिक स्रोत के प्रत्यक्ष उद्धरण पर आधारित।'
      : 'Based on a direct quote from an official source.',
    liveSourcesSummary: quoteText,
    claimSummary: quoteText
  };
};

export const buildClaimEvidenceSummary = ({ claim, evidence, state, language }) => {
  const items = Array.isArray(evidence) ? evidence : [];
  if (items.length === 0) return '';

  const official = items.find((item) => isOfficialUrl(item.link));
  const chosen = official || items[0];
  const trustTag = official ? 'official' : 'trusted';
  const sourceName = chosen?.source || chosen?.title || 'Source';
  const quote = normalizeQuotedText(chosen?.quote || chosen?.description || chosen?.title || '');
  if (!quote) return '';

  return `Source: ${sourceName} (${trustTag}) - "${quote}"`;
};
