import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import fs from 'fs/promises';
import { logHandoff, logInfo, logError } from "../utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import { getCachedResult, setCachedResult } from './cacheService.js';
import {
  buildUnverifiedSuggestion,
  classifyClaimType,
  extractSourceQuotes,
  findRelatedMisconceptions,
  scoreConfidence
} from './claimEnhancer.js';
import { saveVerification } from './storeService.js';
import { fetchLiveElectionEvidence, evaluateClaimUsingLiveEvidence, buildClaimEvidenceSummary } from './liveWebService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let electionContext = '';
let contextLastUpdated = null;

const readElectionContext = async () => {
  const dataPath = path.join(__dirname, "../data/election_rules.txt");
  const stats = await fs.stat(dataPath);
  const latestMtime = stats.mtime.toISOString();

  if (electionContext && contextLastUpdated === latestMtime) {
    return electionContext;
  }

  contextLastUpdated = latestMtime;
  electionContext = await fs.readFile(dataPath, 'utf8');
  return electionContext;
};

const parseModelResponse = (raw) => {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('Model did not return parseable JSON.');
  }
};

const MODEL_VERIFICATION_TIMEOUT_MS = 4000;
const LIVE_MODEL_REASONING_TIMEOUT_MS = Number(process.env.LIVE_MODEL_REASONING_TIMEOUT_MS || 5000);
const HINDI_CONFIDENCE_REASONS = {
  high: 'आधिकारिक चुनाव दिशानिर्देशों से सीधे मेल होने के कारण उच्च विश्वास।',
  moderate: 'नियम मिलान के आधार पर मध्यम विश्वास।',
  low: 'सीमित या अप्रत्यक्ष संदर्भ मेल के कारण कम विश्वास।'
};

const isHindiLanguage = (language) => String(language || 'en').toLowerCase().startsWith('hi');

const DATE_CLAIM_PATTERNS = [
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  /\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/,
  /\b\d{4}\b/,
  /\b(date|deadline|schedule|scheduled|postponed|postpone|rescheduled|reschedule|counting day|result date|poll date|polling date|same day|today|tomorrow|yesterday|tonight|polling starts?|voting starts?|polling stations? open|voting start time|7:00\s*am|6:00\s*pm)\b/i,
  /\b(तारीख|अंतिम तिथि|शेड्यूल|स्थगित|मतगणना दिवस|परिणाम की तारीख|आज|कल)\b/i
];

const isDateSensitiveClaim = (claim) => DATE_CLAIM_PATTERNS.some((pattern) => pattern.test(String(claim || '')));

const buildCacheVariant = ({ liveData, state, officialOnly, rulesVersion }) => {
  const normalizedState = String(state || '').toLowerCase().trim();
  const normalizedRulesVersion = String(rulesVersion || 'na').trim();
  return `live:${liveData ? '1' : '0'}:official:${officialOnly ? '1' : '0'}:state:${normalizedState || 'na'}:rules:${normalizedRulesVersion}`;
};

const getLiveStateSource = (state) => (state && String(state).trim() ? 'user' : 'detected');
const buildLiveSourceDetails = (items = []) => items.map((item) => ({
  url: item.link,
  resource: item.source || 'Unknown source',
  title: item.title || ''
}));

const getLocalizedUnverifiedSuggestion = (claimType, language) => {
  if (!isHindiLanguage(language)) {
    return buildUnverifiedSuggestion(claimType);
  }

  if (claimType === 'procedural') {
    return 'पंजीकरण की अंतिम तिथि, मतदान समय, या आवश्यक पहचान पत्र जैसे स्पष्ट कीवर्ड के साथ पूछें।';
  }

  return 'मतदाता पंजीकरण, मतदान दिवस नियम, या आधिकारिक घोषणा समय से जुड़ा स्पष्ट तथ्यात्मक दावा लिखें।';
};

const getLocalizedRuleExplanation = (rule, language) => {
  if (isHindiLanguage(language) && rule.explanationHi) {
    return rule.explanationHi;
  }

  return rule.explanation;
};

const getLocalizedUnverifiedExplanation = (language) => {
  if (isHindiLanguage(language)) {
    return 'यह दावा उपलब्ध आधिकारिक नियम-डेटा में स्पष्ट रूप से नहीं मिलता।';
  }

  return 'This claim is not explicitly covered in the currently available official election-rule data.';
};

const getLocalizedConfidenceReason = (confidence, language) => {
  if (!isHindiLanguage(language)) {
    return null;
  }

  if (confidence >= 85) {
    return HINDI_CONFIDENCE_REASONS.high;
  }

  if (confidence <= 40) {
    return HINDI_CONFIDENCE_REASONS.low;
  }

  return HINDI_CONFIDENCE_REASONS.moderate;
};

const buildLiveEvidencePrompt = ({ claim, language, state, evidence }) => {
  const renderedEvidence = evidence
    .map((item, index) => {
      const date = item.pubDate || 'unknown';
      return `${index + 1}. title: ${item.title}\n   source: ${item.source}\n   date: ${date}\n   url: ${item.link}\n   summary: ${item.description}`;
    })
    .join('\n\n');

  return `
You are an election fact-checking assistant.
Decide whether the USER CLAIM is True, False, or UNVERIFIED using only the LIVE EVIDENCE snippets.

STATE: ${state}
USER CLAIM: "${claim}"
RESPONSE LANGUAGE: ${language}

LIVE EVIDENCE:
${renderedEvidence}

RULES:
1. Use only the evidence shown above.
2. If evidence is insufficient or mixed, return UNVERIFIED.
3. Do not hallucinate dates, events, or names.
4. Keep explanation short.
5. Return confidence 0-100.

Respond strictly JSON:
{
  "verdict": "True" | "False" | "UNVERIFIED",
  "explanation": "string",
  "reason": "LIVE_EVIDENCE_SUPPORTED" | "LIVE_EVIDENCE_CONTRADICTION" | "LIVE_EVIDENCE_INCONCLUSIVE",
  "liveSourcesSummary": "",
  "confidence": number,
  "confidenceReason": "string"
}
`;
};

const evaluateClaimUsingLiveModel = async ({ claim, language, state, evidence, modelInvoker, liveReasoner }) => {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return null;
  }

  try {
    if (liveReasoner) {
      const custom = await liveReasoner({ claim, language, state, evidence });
      if (custom && typeof custom === 'object' && custom.verdict) {
        return custom;
      }
    }

    if (!process.env.GEMINI_API_KEY && !modelInvoker) {
      return null;
    }

    const prompt = buildLiveEvidencePrompt({ claim, language, state, evidence });
    const response = await invokeWithTimeout(
      modelInvoker
        ? modelInvoker(prompt)
        : new ChatGoogleGenerativeAI({
            model: "gemini-2.0-flash",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
          }).invoke(prompt),
      LIVE_MODEL_REASONING_TIMEOUT_MS
    );

    let text = response.content || response.text || response.lc_kwargs?.content;
    if (typeof text !== 'string') {
      text = JSON.stringify(text);
    }

    if (!text) {
      return null;
    }

    const parsed = parseModelResponse(text);
    if (!parsed || !parsed.verdict) {
      return null;
    }

    const normalizedVerdict = ['True', 'False', 'UNVERIFIED'].includes(parsed.verdict)
      ? parsed.verdict
      : 'UNVERIFIED';

    const normalizedReason = parsed.reason || (normalizedVerdict === 'UNVERIFIED' ? 'LIVE_EVIDENCE_INCONCLUSIVE' : null);
    const normalizedConfidence = Number.isFinite(Number(parsed.confidence))
      ? Math.max(5, Math.min(99, Number(parsed.confidence)))
      : (normalizedVerdict === 'UNVERIFIED' ? 55 : 72);

    return {
      verdict: normalizedVerdict,
      explanation: parsed.explanation || (normalizedVerdict === 'UNVERIFIED'
        ? 'Live evidence is not conclusive for this claim.'
        : 'Live evidence supports this claim.'),
      reason: normalizedReason,
      suggestion: normalizedVerdict === 'UNVERIFIED'
        ? (String(language || 'en').toLowerCase().startsWith('hi')
          ? 'राज्य, तारीख और घटना का नाम जोड़कर दावा और स्पष्ट लिखें।'
          : 'Add state, date, and event details to make the claim more specific.')
        : null,
      confidence: normalizedConfidence,
      confidenceReason: parsed.confidenceReason || 'Confidence based on live evidence consistency.'
    };
  } catch {
    return null;
  }
};

const LOCAL_RULE_MATCHERS = [
  {
    verdict: 'True',
    explanation: 'The official polling date is announced by the Election Commission through official notifications.',
    explanationHi: 'आधिकारिक मतदान तिथि चुनाव आयोग द्वारा आधिकारिक अधिसूचना के माध्यम से घोषित की जाती है।',
    reason: null,
    patterns: [
      /official polling date/i,
      /polling date.*announced/i,
      /election date.*official notification/i,
      /मतदान तिथि.*आधिकारिक/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'Polling stations open at 7:00 AM and close at 6:00 PM.',
    explanationHi: 'मतदान केंद्र सुबह 7:00 बजे खुलते हैं और शाम 6:00 बजे बंद होते हैं।',
    reason: null,
    patterns: [
      /polling stations?.*(7:00\s*am|7\s*am).*(6:00\s*pm|6\s*pm)/i,
      /open.*7:00\s*am.*close.*6:00\s*pm/i,
      /7:00\s*am.*6:00\s*pm/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'New voter registrations must be completed before the deadline announced by election authorities.',
    explanationHi: 'नए मतदाता पंजीकरण चुनाव प्राधिकरण द्वारा घोषित अंतिम तिथि से पहले पूरे होने चाहिए।',
    reason: null,
    patterns: [
      /registration deadline/i,
      /new voter registrations?.*deadline/i,
      /deadline.*voter registration/i,
      /मतदाता पंजीकरण.*अंतिम तिथि/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'Voters must bring a Voter ID or one of the approved alternative ID documents.',
    explanationHi: 'मतदाताओं को वोटर आईडी या स्वीकृत वैकल्पिक पहचान दस्तावेजों में से कोई एक लाना आवश्यक है।',
    reason: null,
    patterns: [
      /voter id.*approved id/i,
      /bring.*(voter id|epic card).*(approved id|alternative)/i,
      /epic card/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'Mobile phones, cameras, and electronic devices are strictly prohibited inside the polling booth.',
    explanationHi: 'मतदान बूथ के अंदर मोबाइल फोन, कैमरा और इलेक्ट्रॉनिक उपकरण सख्ती से प्रतिबंधित हैं।',
    reason: null,
    patterns: [
      /mobile phones?.*prohibited.*polling booth/i,
      /cameras?.*prohibited.*polling booth/i,
      /electronic devices?.*prohibited.*polling booth/i,
      /strictly prohibited inside the polling booth/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'If a voter is in the queue at 6:00 PM, they are allowed to vote even if it continues past closing time.',
    explanationHi: 'यदि मतदाता शाम 6:00 बजे तक कतार में है, तो उसे मतदान करने की अनुमति है, भले ही समय आगे बढ़ जाए।',
    reason: null,
    patterns: [
      /queue at 6:00\s*pm/i,
      /in the queue at 6:00\s*pm/i,
      /allowed to vote.*past the closing time/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'You can find your polling booth by texting 1950 or using the Voter Portal.',
    explanationHi: 'आप 1950 पर संदेश भेजकर या वोटर पोर्टल का उपयोग करके अपना मतदान केंद्र पता कर सकते हैं।',
    reason: null,
    patterns: [
      /sms to 1950/i,
      /know your polling station/i,
      /polling booth/i
    ]
  },
  {
    verdict: 'True',
    explanation: 'Official election results are announced only by the Election Commission on the notified counting schedule.',
    explanationHi: 'आधिकारिक चुनाव परिणाम केवल चुनाव आयोग द्वारा अधिसूचित मतगणना कार्यक्रम के अनुसार घोषित किए जाते हैं।',
    reason: null,
    patterns: [
      /results?.*announced.*only.*election commission/i,
      /official results?.*election commission/i,
      /आधिकारिक परिणाम.*चुनाव आयोग/i
    ]
  },
  {
    verdict: 'False',
    explanation: 'Counting does not begin immediately after polling closes. It starts on the official counting day notified by the Election Commission.',
    explanationHi: 'मतदान समाप्त होते ही उसी दिन मतगणना शुरू नहीं होती। यह चुनाव आयोग द्वारा अधिसूचित आधिकारिक मतगणना दिवस पर शुरू होती है।',
    reason: 'MISINFORMATION_POLICY',
    patterns: [
      /count(?:ing)? of votes?.*immediately.*after polling ends?.*same day/i,
      /counting.*starts?.*same day.*after polling/i,
      /votes?.*counted.*same day.*polling/i,
      /मतगणना.*तुरंत.*मतदान.*उसी दिन/i,
      /counting.*immediately.*polling.*ends/i
    ]
  },
  {
    verdict: 'False',
    explanation: 'Ballots cannot be submitted via text message, email, or social media.',
    explanationHi: 'मतदान एसएमएस, ईमेल या सोशल मीडिया के माध्यम से नहीं किया जा सकता।',
    reason: 'MISINFORMATION_POLICY',
    patterns: [
      /vote.*text message/i,
      /ballot.*text message/i,
      /vote.*email/i,
      /vote.*social media/i,
      /direct voting app/i,
      /vote.*whatsapp/i,
      /whatsapp.*vote/i,
      /whatsapp\s*se\s*vote/i,
      /sms\s*se\s*vote/i,
      /email\s*se\s*vote/i,
      /व्हाट्सएप.*वोट/i,
      /एसएमएस.*वोट/i,
      /ईमेल.*वोट/i
    ]
  },
  {
    verdict: 'False',
    explanation: 'There is no app for direct voting.',
    explanationHi: 'सीधे वोट डालने के लिए कोई आधिकारिक ऐप नहीं है।',
    reason: 'MISINFORMATION_POLICY',
    patterns: [
      /direct vote/i,
      /vote directly through an app/i,
      /app.*direct voting/i,
      /voting app/i
    ]
  },
  {
    verdict: 'False',
    explanation: 'Voters cannot vote without valid identity proof; there is no age-based exemption from ID requirements.',
    explanationHi: 'बिना वैध पहचान पत्र के मतदान नहीं किया जा सकता; आयु के आधार पर आईडी की छूट नहीं है।',
    reason: 'MISINFORMATION_POLICY',
    patterns: [
      /vote.*without.*(id|identity|id proof|proof)/i,
      /without.*(id|identity|id proof).*(vote|voting)/i,
      /no\s*(id|identity|id proof).*(vote|voting)/i,
      /above\s*60.*without.*(id|identity|id proof)/i,
      /(senior citizens?|elderly).*(without|no).*(id|identity|id proof)/i,
      /over\s*60.*(vote|voting).*(without|no).*(id|identity|id proof)/i,
      /बिना.*(आईडी|पहचान|पहचान\s*पत्र).*(वोट|मतदान)/i,
      /(60|साठ).*के.*ऊपर.*बिना.*(आईडी|पहचान).*(वोट|मतदान)/i
    ]
  }
];

const buildLocalMatch = (claim) => {
  for (const rule of LOCAL_RULE_MATCHERS) {
    if (rule.patterns.some((pattern) => pattern.test(claim))) {
      return rule;
    }
  }

  return null;
};

const buildLocalVerificationResult = ({ claim, context, language }) => {
  const claimType = classifyClaimType(claim);
  const relatedMisconceptions = findRelatedMisconceptions(claim);
  const dateSensitiveClaim = isDateSensitiveClaim(claim);
  const localMatch = dateSensitiveClaim ? null : buildLocalMatch(claim);
  const sourceQuotes = extractSourceQuotes(claim, context, localMatch ? localMatch.verdict : 'UNVERIFIED');

  let verdict = 'UNVERIFIED';
  let explanation = getLocalizedUnverifiedExplanation(language);
  let reason = 'INSUFFICIENT_CONTEXT';
  let suggestion = getLocalizedUnverifiedSuggestion(claimType, language);
  let steps = [];

  if (localMatch) {
    verdict = localMatch.verdict;
    explanation = getLocalizedRuleExplanation(localMatch, language);
    reason = localMatch.reason;
    suggestion = null;
  }

  if (verdict === 'UNVERIFIED' && claimType === 'procedural' && sourceQuotes.length > 0) {
    steps = sourceQuotes
      .filter((quote) => quote.startsWith('- Step'))
      .map((quote, index) => ({
        title: `Step ${index + 1}`,
        description: quote.replace(/^[-\s]*/, '')
      }));
  }

  const confidenceData = scoreConfidence({
    verdict,
    sourceQuotes,
    claimType,
    hasModelError: false
  });

  const localizedConfidenceReason = getLocalizedConfidenceReason(confidenceData.confidence, language);

  return {
    verdict,
    explanation,
    reason,
    suggestion,
    steps,
    sourceQuotes,
    claimType,
    relatedMisconceptions,
    ...confidenceData,
    confidenceReason: localizedConfidenceReason || confidenceData.confidenceReason,
    processedClaim: claim,
    language,
    contextLastUpdated,
    fromCache: false
  };
};

const invokeWithTimeout = async (promise, timeoutMs) => {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Model request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

// Dummy initialization to keep index.js happy
export const initializeRAG = async () => {
  await readElectionContext();
  logInfo("RAG initialized (Direct File Mode)");
};

export const verifyClaim = async (claim, options = {}) => {
  const modelInvoker = options.modelInvoker;
  const language = options.language || 'en';
  const liveData = Boolean(options.liveData);
  const officialOnly = Boolean(options.officialOnly);
  const state = options.state;
  const fetcher = options.fetcher;
  const groundingInvoker = options.groundingInvoker;
  const liveReasoner = options.liveReasoner;
  const remoteVerificationEnabled = process.env.ENABLE_REMOTE_VERIFICATION === 'true';

  try {
    const context = await readElectionContext();
    const cacheVariant = buildCacheVariant({
      liveData,
      state,
      officialOnly,
      rulesVersion: contextLastUpdated
    });
    const cached = getCachedResult(claim, language, cacheVariant);
    if (cached) {
      return {
        ...cached,
        fromCache: true
      };
    }

    const localResult = buildLocalVerificationResult({ claim, context, language });
    const forceRealtimeForDateClaim = isDateSensitiveClaim(claim);
    const shouldAttemptRealtime = localResult.verdict === 'UNVERIFIED'
      && (forceRealtimeForDateClaim || liveData || remoteVerificationEnabled || typeof fetcher === 'function' || typeof liveReasoner === 'function' || typeof modelInvoker === 'function');

    if (shouldAttemptRealtime) {
        const liveFeed = await fetchLiveElectionEvidence({ claim, state, officialOnly, fetcher, groundingInvoker });
        const liveSourceDetails = buildLiveSourceDetails(liveFeed.items);
        const claimSummary = buildClaimEvidenceSummary({
          claim,
          evidence: liveFeed.items,
          state: liveFeed.state,
          language
        });
        if (liveFeed.error === 'PERMANENT_RULE_FALSE') {
          const permanentFallback = {
            ...localResult,
            verdict: 'False',
            explanation: 'This claim contradicts a permanent official election rule.',
            reason: 'MISINFORMATION_POLICY',
            suggestion: null,
            confidence: undefined,
            confidenceReason: undefined,
            claimSummary,
            liveSourceDetails: [],
            sourceQuotes: [],
            liveEvidenceUsed: false,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: true,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            sourceUrls: []
          };

          const saved = saveVerification({
            claim,
            verdict: permanentFallback.verdict,
            explanation: permanentFallback.explanation,
            confidence: permanentFallback.confidence,
            claimType: permanentFallback.claimType,
            sourceQuotes: permanentFallback.sourceQuotes
          });

          const result = { claimId: saved.id, ...permanentFallback };
          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        const hasDirectOfficialSource = Boolean(liveFeed.hasDirectOfficialSource);
        let liveDecision = null;

        if (typeof liveReasoner === 'function') {
          try {
            const customDecision = await liveReasoner({
              claim,
              language,
              state: liveFeed.state,
              evidence: liveFeed.items
            });
            if (customDecision && typeof customDecision === 'object' && customDecision.verdict) {
              liveDecision = customDecision;
            }
          } catch {
            // Ignore custom reasoner failures and continue with built-in live evaluation.
          }
        }

        if (!liveDecision) {
          liveDecision = liveFeed.groundedVerdict
            ? {
                verdict: liveFeed.groundedVerdict,
                explanation: liveFeed.groundedExplanation,
                reason: liveFeed.groundedReason,
                suggestion: null,
                confidence: hasDirectOfficialSource ? liveFeed.groundedConfidence : undefined,
                confidenceReason: hasDirectOfficialSource ? liveFeed.groundedConfidenceReason : undefined,
                claimSummary,
                liveSourcesSummary: liveFeed.items[0]?.quote || ''
              }
            : evaluateClaimUsingLiveEvidence({
                claim,
                language,
                evidence: liveFeed.items,
                state: liveFeed.state,
                allowNonOfficial: Boolean(liveFeed.legacyMode)
              });
        }

        if (!liveDecision) {
          const normalizedClaim = String(claim || '').toLowerCase();
          const liveEvidenceText = liveFeed.items
            .map((item) => `${item?.quote || item?.description || item?.title || ''}`)
            .join(' ')
            .toLowerCase();

          const countingTimingClaim = /counting of votes?|vote counting|counting starts?|counting begins?|same day|immediately after polling|counting day|official counting day|notified counting day/i.test(normalizedClaim);
          const countingTimingContradiction = countingTimingClaim
            && /not immediately|does not begin|does not start|not on the same day|official counting day|notified counting day|counting starts on|counting begins on|counting will begin/i.test(liveEvidenceText);

          if (countingTimingContradiction) {
            const directSummary = liveFeed.items[0]?.quote || claimSummary || '';
            liveDecision = {
              verdict: 'False',
              explanation: directSummary || 'Live evidence contradicts the claim about vote counting timing.',
              reason: 'LIVE_EVIDENCE_CONTRADICTION',
              suggestion: null,
              confidence: 93,
              confidenceReason: isHindiLanguage(language)
                ? 'लाइव स्रोत में मतगणना का समय दावे से मेल नहीं खाता।'
                : 'Live evidence contradicts the claim about vote counting timing.',
              claimSummary: directSummary,
              liveSourcesSummary: directSummary
            };
          }
        }

      if (liveDecision) {
        const liveSourceQuotes = liveFeed.items.map((item) => {
          const directQuote = item.quote || item.description || item.title;
          return `- ${item.source}: "${directQuote}"`;
        });

        const liveResult = {
          ...localResult,
          verdict: liveDecision.verdict,
          explanation: liveDecision.explanation,
          reason: liveDecision.reason,
          suggestion: liveDecision.suggestion,
          confidence: hasDirectOfficialSource ? liveDecision.confidence : undefined,
          confidenceReason: hasDirectOfficialSource ? liveDecision.confidenceReason : undefined,
          claimSummary: liveDecision.claimSummary || claimSummary,
          liveSourcesSummary: liveDecision.liveSourcesSummary || '',
          sourceQuotes: liveSourceQuotes.length > 0 ? liveSourceQuotes : localResult.sourceQuotes,
          liveSourceDetails,
          sourceUrls: liveFeed.items.map((item) => item.link),
          liveEvidenceUsed: true,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
              liveFetchedAt: liveFeed.fetchedAt,
              liveMaxAgeDays: liveFeed.maxAgeDays
        };

        const saved = saveVerification({
          claim,
          verdict: liveResult.verdict,
          explanation: liveResult.explanation,
          confidence: liveResult.confidence,
          claimType: liveResult.claimType,
          sourceQuotes: liveResult.sourceQuotes
        });

        const result = {
          claimId: saved.id,
          ...liveResult
        };

        setCachedResult(claim, result, language, cacheVariant);
        return result;
      }

      // Ensure liveSourcesSummary is passed through
      if (liveDecision && liveDecision.liveSourcesSummary) {
        // Keep it in the decision for later processing
      }

        if (!liveDecision && liveFeed.error === 'OFFICIAL_SOURCES_INSUFFICIENT') {
          const officialFallback = {
            ...localResult,
            reason: 'OFFICIAL_SOURCES_INSUFFICIENT',
            suggestion: isHindiLanguage(language)
              ? 'अधिक सटीक राज्य/तारीख के साथ दोबारा प्रयास करें या official-only विकल्प बंद करें।'
              : 'Try again with a more specific state/date or disable official-only mode.',
            liveEvidenceUsed: true,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: true,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            claimSummary,
            liveSourceDetails: [],
            sourceUrls: []
          };

          const saved = saveVerification({
            claim,
            verdict: officialFallback.verdict,
            explanation: officialFallback.explanation,
            confidence: officialFallback.confidence,
            claimType: officialFallback.claimType,
            sourceQuotes: officialFallback.sourceQuotes
          });

          const result = {
            claimId: saved.id,
            ...officialFallback
          };

          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        if (!liveDecision && liveFeed.error === 'LIVE_DATA_STALE') {
          const staleFallback = {
            ...localResult,
            reason: 'LIVE_DATA_STALE',
            suggestion: isHindiLanguage(language)
              ? 'ताज़ा अपडेट उपलब्ध नहीं हैं। कृपया अधिक विशिष्ट वर्तमान तारीख/घटना जोड़कर दोबारा प्रयास करें।'
              : 'Fresh updates are unavailable right now. Try again with a more specific current date/event.',
            liveEvidenceUsed: true,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            claimSummary,
            liveSourceDetails: [],
            sourceUrls: []
          };

          const saved = saveVerification({
            claim,
            verdict: staleFallback.verdict,
            explanation: staleFallback.explanation,
            confidence: staleFallback.confidence,
            claimType: staleFallback.claimType,
            sourceQuotes: staleFallback.sourceQuotes
          });

          const result = {
            claimId: saved.id,
            ...staleFallback
          };

          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        if (!liveDecision && liveFeed.error === 'LIVE_FETCH_UNAVAILABLE') {
          const unavailableFallback = {
            ...localResult,
            explanation: isHindiLanguage(language)
              ? 'रीयल-टाइम सत्यापन इस समय उपलब्ध नहीं है। कृपया Gemini API कुंजी कॉन्फ़िगर करें।'
              : 'Real-time verification is currently unavailable. Configure a valid Gemini API key to enable it.',
            reason: 'LIVE_FETCH_UNAVAILABLE',
            suggestion: isHindiLanguage(language)
              ? 'सिस्टम सेटिंग्स में Gemini API key जोड़ें और दोबारा प्रयास करें।'
              : 'Add a valid Gemini API key in backend environment settings and try again.',
            liveEvidenceUsed: false,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            claimSummary,
            liveSourceDetails: [],
            sourceUrls: [],
            sourceQuotes: []
          };

          const saved = saveVerification({
            claim,
            verdict: unavailableFallback.verdict,
            explanation: unavailableFallback.explanation,
            confidence: unavailableFallback.confidence,
            claimType: unavailableFallback.claimType,
            sourceQuotes: unavailableFallback.sourceQuotes
          });

          const result = {
            claimId: saved.id,
            ...unavailableFallback
          };

          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        if (!liveDecision && liveFeed.error === 'LIVE_FETCH_FAILED') {
          const recoveredMatch = buildLocalMatch(claim);
          if (recoveredMatch) {
            const recoveredConfidence = scoreConfidence({
              verdict: recoveredMatch.verdict,
              sourceQuotes: localResult.sourceQuotes,
              claimType: localResult.claimType,
              hasModelError: false
            });

            const recoveredResult = {
              ...localResult,
              verdict: recoveredMatch.verdict,
              explanation: getLocalizedRuleExplanation(recoveredMatch, language),
              reason: recoveredMatch.reason,
              suggestion: null,
              steps: [],
              ...recoveredConfidence,
              confidenceReason: getLocalizedConfidenceReason(recoveredConfidence.confidence, language) || recoveredConfidence.confidenceReason,
              liveEvidenceUsed: false,
              liveState: liveFeed.state,
              liveStateSource: getLiveStateSource(state),
              liveOfficialOnly: officialOnly,
              liveFetchedAt: liveFeed.fetchedAt,
              liveMaxAgeDays: liveFeed.maxAgeDays,
              liveSourceDetails: [],
              sourceUrls: []
            };

            const recoveredSaved = saveVerification({
              claim,
              verdict: recoveredResult.verdict,
              explanation: recoveredResult.explanation,
              confidence: recoveredResult.confidence,
              claimType: recoveredResult.claimType,
              sourceQuotes: recoveredResult.sourceQuotes
            });

            const recoveredFinal = {
              claimId: recoveredSaved.id,
              ...recoveredResult
            };

            setCachedResult(claim, recoveredFinal, language, cacheVariant);
            return recoveredFinal;
          }

          const failedFallback = {
            ...localResult,
            explanation: isHindiLanguage(language)
              ? 'रीयल-टाइम स्रोतों तक पहुंचने में समस्या आई।'
              : 'Unable to fetch real-time sources right now.',
            reason: 'LIVE_FETCH_FAILED',
            suggestion: isHindiLanguage(language)
              ? 'नेटवर्क की जांच करें और कुछ समय बाद दोबारा प्रयास करें।'
              : 'Check network connectivity and try again in a moment.',
            liveEvidenceUsed: false,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            claimSummary,
            liveSourceDetails: [],
            sourceUrls: [],
            sourceQuotes: []
          };

          const saved = saveVerification({
            claim,
            verdict: failedFallback.verdict,
            explanation: failedFallback.explanation,
            confidence: failedFallback.confidence,
            claimType: failedFallback.claimType,
            sourceQuotes: failedFallback.sourceQuotes
          });

          const result = {
            claimId: saved.id,
            ...failedFallback
          };

          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        if (!liveDecision && liveFeed.error === 'LIVE_EVIDENCE_NOT_RELEVANT') {
          const irrelevantFallback = {
            ...localResult,
            explanation: isHindiLanguage(language)
              ? `${liveFeed.state} के लिए ताज़ा लाइव अपडेट मिले, लेकिन वे आपके दावे से सीधे संबंधित नहीं हैं।`
              : `Fresh live updates were found for ${liveFeed.state}, but they are not directly related to this claim.`,
            reason: 'LIVE_EVIDENCE_NOT_RELEVANT',
            suggestion: isHindiLanguage(language)
              ? 'दावे में चुनाव प्रकार, तारीख, और विशिष्ट घटना जोड़कर दोबारा प्रयास करें।'
              : 'Try again with election type, date, and specific event details in the claim.',
            liveEvidenceUsed: true,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            liveSourceDetails: [],
            sourceUrls: [],
            sourceQuotes: []
          };

          const saved = saveVerification({
            claim,
            verdict: irrelevantFallback.verdict,
            explanation: irrelevantFallback.explanation,
            confidence: irrelevantFallback.confidence,
            claimType: irrelevantFallback.claimType,
            sourceQuotes: irrelevantFallback.sourceQuotes
          });

          const result = {
            claimId: saved.id,
            ...irrelevantFallback
          };

          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        if (!liveDecision && liveFeed.items.length > 0) {
          const recoveredMatch = buildLocalMatch(claim);
          if (recoveredMatch) {
            const recoveredConfidence = scoreConfidence({
              verdict: recoveredMatch.verdict,
              sourceQuotes: localResult.sourceQuotes,
              claimType: localResult.claimType,
              hasModelError: false
            });

            const recoveredResult = {
              ...localResult,
              verdict: recoveredMatch.verdict,
              explanation: getLocalizedRuleExplanation(recoveredMatch, language),
              reason: recoveredMatch.reason,
              suggestion: null,
              steps: [],
              ...recoveredConfidence,
              confidenceReason: getLocalizedConfidenceReason(recoveredConfidence.confidence, language) || recoveredConfidence.confidenceReason,
              liveEvidenceUsed: true,
              liveState: liveFeed.state,
              liveStateSource: getLiveStateSource(state),
              liveOfficialOnly: officialOnly,
              liveFetchedAt: liveFeed.fetchedAt,
              liveMaxAgeDays: liveFeed.maxAgeDays,
              liveSourceDetails,
              sourceUrls: liveFeed.items.map((item) => item.link)
            };

            const recoveredSaved = saveVerification({
              claim,
              verdict: recoveredResult.verdict,
              explanation: recoveredResult.explanation,
              confidence: recoveredResult.confidence,
              claimType: recoveredResult.claimType,
              sourceQuotes: recoveredResult.sourceQuotes
            });

            const recoveredFinal = {
              claimId: recoveredSaved.id,
              ...recoveredResult
            };

            setCachedResult(claim, recoveredFinal, language, cacheVariant);
            return recoveredFinal;
          }

          const inconclusiveFallback = {
            ...localResult,
            reason: 'LIVE_EVIDENCE_INCONCLUSIVE',
            suggestion: isHindiLanguage(language)
              ? 'दावे में अधिक स्पष्ट तारीख, चरण या आधिकारिक आदेश का संदर्भ जोड़ें।'
              : 'Add a specific date, election phase, or official order reference for a clearer check.',
            claimSummary,
            liveEvidenceUsed: true,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
            liveFetchedAt: liveFeed.fetchedAt,
            liveMaxAgeDays: liveFeed.maxAgeDays,
            liveSourceDetails,
            sourceUrls: liveFeed.items.map((item) => item.link),
            sourceQuotes: []
          };

          const saved = saveVerification({
            claim,
            verdict: inconclusiveFallback.verdict,
            explanation: inconclusiveFallback.explanation,
            confidence: inconclusiveFallback.confidence,
            claimType: inconclusiveFallback.claimType,
            sourceQuotes: inconclusiveFallback.sourceQuotes
          });

          const result = {
            claimId: saved.id,
            ...inconclusiveFallback
          };

          setCachedResult(claim, result, language, cacheVariant);
          return result;
        }

        if (!liveDecision) {
          const recoveredMatch = buildLocalMatch(claim);
          if (recoveredMatch) {
            const recoveredConfidence = scoreConfidence({
              verdict: recoveredMatch.verdict,
              sourceQuotes: localResult.sourceQuotes,
              claimType: localResult.claimType,
              hasModelError: false
            });

            const recoveredResult = {
              ...localResult,
              verdict: recoveredMatch.verdict,
              explanation: getLocalizedRuleExplanation(recoveredMatch, language),
              reason: recoveredMatch.reason,
              suggestion: null,
              steps: [],
              ...recoveredConfidence,
              confidenceReason: getLocalizedConfidenceReason(recoveredConfidence.confidence, language) || recoveredConfidence.confidenceReason,
              liveEvidenceUsed: Boolean(liveFeed.items.length),
              liveState: liveFeed.state,
              liveStateSource: getLiveStateSource(state),
              liveOfficialOnly: officialOnly,
              liveFetchedAt: liveFeed.fetchedAt,
              liveMaxAgeDays: liveFeed.maxAgeDays,
              liveSourceDetails,
              sourceUrls: liveFeed.items.map((item) => item.link)
            };

            const recoveredSaved = saveVerification({
              claim,
              verdict: recoveredResult.verdict,
              explanation: recoveredResult.explanation,
              confidence: recoveredResult.confidence,
              claimType: recoveredResult.claimType,
              sourceQuotes: recoveredResult.sourceQuotes
            });

            const recoveredFinal = {
              claimId: recoveredSaved.id,
              ...recoveredResult
            };

            setCachedResult(claim, recoveredFinal, language, cacheVariant);
            return recoveredFinal;
          }
        }

      if (liveDecision) {
        const liveSourceQuotes = liveFeed.items.map((item) => {
          const directQuote = item.quote || item.description || item.title;
          return `- ${item.source}: "${directQuote}"`;
        });

        const liveResult = {
          ...localResult,
          verdict: liveDecision.verdict,
          explanation: liveDecision.explanation,
          reason: liveDecision.reason,
          suggestion: liveDecision.suggestion,
          confidence: liveDecision.confidence,
          confidenceReason: liveDecision.confidenceReason,
          claimSummary: liveDecision.claimSummary || claimSummary,
          liveSourcesSummary: liveDecision.liveSourcesSummary || '',
          sourceQuotes: liveSourceQuotes.length > 0 ? liveSourceQuotes : localResult.sourceQuotes,
          liveSourceDetails,
          sourceUrls: liveFeed.items.map((item) => item.link),
          liveEvidenceUsed: true,
            liveState: liveFeed.state,
            liveStateSource: getLiveStateSource(state),
            liveOfficialOnly: officialOnly,
              liveFetchedAt: liveFeed.fetchedAt,
              liveMaxAgeDays: liveFeed.maxAgeDays
        };

        const saved = saveVerification({
          claim,
          verdict: liveResult.verdict,
          explanation: liveResult.explanation,
          confidence: liveResult.confidence,
          claimType: liveResult.claimType,
          sourceQuotes: liveResult.sourceQuotes
        });

        const result = {
          claimId: saved.id,
          ...liveResult
        };

        setCachedResult(claim, result, language, cacheVariant);
        return result;
      }
    }

    if (localResult.verdict !== 'UNVERIFIED' || !remoteVerificationEnabled) {
      const saved = saveVerification({
        claim,
        verdict: localResult.verdict,
        explanation: localResult.explanation,
        confidence: localResult.confidence,
        claimType: localResult.claimType,
        sourceQuotes: localResult.sourceQuotes
      });

      const result = {
        claimId: saved.id,
        ...localResult
      };

      setCachedResult(claim, result, language, cacheVariant);
      return result;
    }

    const claimType = localResult.claimType;
    const relatedMisconceptions = localResult.relatedMisconceptions;

    const prompt = `
You are an Election Integrity Assistant.
Your ONLY source of truth is the CONTEXT provided below.

CONTEXT:
${context}

USER CLAIM:
"${claim}"

RESPONSE LANGUAGE:
${language}

INSTRUCTIONS:
1. Strict Fact-Checking: Verify if the user's claim is True, False, or UNVERIFIED based ONLY on the CONTEXT.
2. Zero Hallucination: Never generate or guess dates, candidate names, or procedures. If the CONTEXT does not contain the answer, the verdict MUST be "UNVERIFIED".
3. Provide a brief explanation.
4. If applicable, provide a chronological list of steps related to the process they asked about to form an interactive timeline (e.g., if they asked about registration, return the registration steps). If there are no clear steps, return an empty array for steps.
5. Include a short reason code when verdict is UNVERIFIED.

Respond strictly in the following JSON format:
{
  "verdict": "True" | "False" | "UNVERIFIED",
  "explanation": "string",
  "reason": "INSUFFICIENT_CONTEXT" | "AMBIGUOUS_CLAIM" | "NOT_IN_SCOPE" | null,
  "steps": [
    { "title": "Step title", "description": "Step description" }
  ]
}
`;

    logHandoff("Sending prompt to Gemini for verification...");
    const response = await invokeWithTimeout(
      modelInvoker
        ? modelInvoker(prompt)
        : new ChatGoogleGenerativeAI({
            model: "gemini-2.0-flash",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
          }).invoke(prompt),
      MODEL_VERIFICATION_TIMEOUT_MS
    );
    
    let text = response.content || response.text || response.lc_kwargs?.content;
    if (typeof text !== 'string') {
      text = JSON.stringify(text);
    }
    
    if (!text) {
      throw new Error("AI returned an empty response content.");
    }
    
    const parsedResponse = parseModelResponse(text);
    const sourceQuotes = extractSourceQuotes(claim, context, parsedResponse.verdict);
    const confidenceData = scoreConfidence({
      verdict: parsedResponse.verdict,
      sourceQuotes,
      claimType,
      hasModelError: false
    });

    const enriched = {
      verdict: parsedResponse.verdict || 'UNVERIFIED',
      explanation: parsedResponse.explanation || 'No explanation was returned by the model.',
      reason: parsedResponse.reason || (parsedResponse.verdict === 'UNVERIFIED' ? 'INSUFFICIENT_CONTEXT' : null),
      suggestion: parsedResponse.verdict === 'UNVERIFIED' ? buildUnverifiedSuggestion(claimType) : null,
      steps: Array.isArray(parsedResponse.steps) ? parsedResponse.steps : [],
      sourceQuotes,
      claimType,
      relatedMisconceptions,
      ...confidenceData,
      processedClaim: claim,
      language,
      contextLastUpdated,
      fromCache: false
    };

    const saved = saveVerification({
      claim,
      verdict: enriched.verdict,
      explanation: enriched.explanation,
      confidence: enriched.confidence,
      claimType: enriched.claimType,
      sourceQuotes: enriched.sourceQuotes
    });

    const result = {
      claimId: saved.id,
      ...enriched
    };

    setCachedResult(claim, result, language, cacheVariant);
    return result;
  } catch (error) {
    console.error('[ERROR] verifyClaim failed:', error.message);
    console.error(error.stack);

    const context = electionContext || (await readElectionContext());
    const fallback = buildLocalVerificationResult({ claim, context, language });
    const saved = saveVerification({
      claim,
      verdict: fallback.verdict,
      explanation: fallback.explanation,
      confidence: fallback.confidence,
      claimType: fallback.claimType,
      sourceQuotes: fallback.sourceQuotes
    });

    return {
      claimId: saved.id,
      ...fallback
    };
  }
};
