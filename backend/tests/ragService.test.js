import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaim } from '../services/ragService.js';
import { fetchLiveElectionEvidence } from '../services/liveWebService.js';
import { __resetCacheForTests } from '../services/cacheService.js';
import { __resetStoreForTests } from '../services/storeService.js';

test('verifyClaim resolves a direct rules match locally', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const result = await verifyClaim('Voters must bring their official Voter ID (EPIC card).');

  assert.equal(result.verdict, 'True');
  assert.equal(result.reason, null);
  assert.equal(result.processedClaim, 'Voters must bring their official Voter ID (EPIC card).');
  assert.equal(Array.isArray(result.sourceQuotes), true);
  assert.equal(result.sourceQuotes.length > 0, true);
  assert.match(result.explanation, /Voter ID|approved alternative/i);
});

test('verifyClaim marks voting-by-text as false locally', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const result = await verifyClaim('Can I vote by text message?');

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'MISINFORMATION_POLICY');
  assert.equal(result.relatedMisconceptions.length > 0, true);
});

test('verifyClaim marks no-ID senior-citizen voting claim as false locally', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const result = await verifyClaim('persons can vote without any ID proof if they are above 60 years old.');

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'MISINFORMATION_POLICY');
  assert.equal(result.liveEvidenceUsed, undefined);
});

test('verifyClaim marks same-day immediate counting claim as false locally', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Counting will begin on notified counting day, not immediately after polling</title>
        <link>https://example.com/counting-day-notice</link>
        <description>Election authorities clarified counting timeline and denied same-day counting rumors.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Counting of votes begins immediately after polling ends on the same day', {
    language: 'en',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
  assert.match(result.explanation, /counting timeline|same-day counting rumors/i);
  assert.equal(Boolean(result.liveEvidenceUsed), true);
});

test('verifyClaim avoids unrelated supporting quotes for unverified claims', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const result = await verifyClaim('Election offices will stay open until midnight for all districts.');

  assert.equal(result.verdict, 'UNVERIFIED');
  assert.equal(Array.isArray(result.sourceQuotes), true);
  assert.equal(result.sourceQuotes.length, 0);
});

test('verifyClaim supports Hindi/Hinglish local misinformation match', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const result = await verifyClaim('kya mai whatsapp se vote kar sakta hu', { language: 'hi' });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'MISINFORMATION_POLICY');
  assert.equal(result.language, 'hi');
  assert.match(result.explanation, /मतदान|वोट|एसएमएस|ईमेल/);
});

test('verifyClaim caches per language', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const claim = 'Can I vote by text message?';
  const englishResult = await verifyClaim(claim, { language: 'en' });
  const hindiResult = await verifyClaim(claim, { language: 'hi' });

  assert.equal(englishResult.verdict, 'False');
  assert.equal(hindiResult.verdict, 'False');
  assert.equal(englishResult.explanation, 'Ballots cannot be submitted via text message, email, or social media.');
  assert.equal(hindiResult.explanation, 'मतदान एसएमएस, ईमेल या सोशल मीडिया के माध्यम से नहीं किया जा सकता।');
});

test('verifyClaim uses live evidence for postponement claims when enabled', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const fakeRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu election schedule announced by Election Commission</title>
        <link>https://example.com/tn-election-schedule</link>
        <description>Latest update confirms polling phase and official notification details.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>No postponement announced for Tamil Nadu election</title>
        <link>https://example.com/tn-no-postponement</link>
        <description>Officials deny rumors and reiterate poll schedule.</description>
        <pubDate>Sat, 26 Apr 2026 12:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => fakeRss
  });

  const result = await verifyClaim('Tamil Nadu elections are postponed till December.', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.liveEvidenceUsed, true);
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length > 0, true);
});

test('verifyClaim cache is separated between live and non-live requests', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const fakeRss = `
    <rss><channel>
      <item>
        <title>West Bengal election schedule announced</title>
        <link>https://example.com/wb-election-schedule</link>
        <description>Election Commission publishes official timeline.</description>
        <pubDate>Sat, 26 Apr 2026 08:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => fakeRss
  });

  const claim = 'West Bengal elections are postponed till December.';
  const localOnly = await verifyClaim(claim, { language: 'en', liveData: false });
  const liveResult = await verifyClaim(claim, {
    language: 'en',
    liveData: true,
    state: 'West Bengal',
    fetcher
  });

  assert.equal(localOnly.verdict, 'UNVERIFIED');
  assert.equal(liveResult.verdict, 'False');
  assert.equal(Boolean(liveResult.liveEvidenceUsed), true);
});

test('verifyClaim returns official-only fallback when official sources are insufficient', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const fakeRss = `
    <rss><channel>
      <item>
        <title>Election update from private portal</title>
        <link>https://example.com/private-election-update</link>
        <description>General election chatter and opinions.</description>
        <pubDate>Sat, 26 Apr 2030 08:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => fakeRss
  });

  const result = await verifyClaim('Tamil Nadu elections are postponed till December.', {
    language: 'en',
    liveData: true,
    officialOnly: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'UNVERIFIED');
  assert.equal(result.reason, 'OFFICIAL_SOURCES_INSUFFICIENT');
  assert.equal(result.liveOfficialOnly, true);
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length, 0);
});

test('verifyClaim flags stale live evidence when only old articles are returned', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const staleRss = `
    <rss><channel>
      <item>
        <title>Rajasthan election update archive</title>
        <link>https://example.com/rajasthan-archive-update</link>
        <description>Legacy election update for older cycle.</description>
        <pubDate>Mon, 01 Jan 2024 08:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => staleRss
  });

  const result = await verifyClaim('Rajasthan elections are running this June.', {
    language: 'en',
    liveData: true,
    state: 'Rajasthan',
    fetcher
  });

  assert.equal(result.verdict, 'UNVERIFIED');
  assert.equal(result.reason, 'LIVE_DATA_STALE');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length, 0);
});

test('verifyClaim marks ongoing election claim as true when live activity signals exist', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu assembly election 2026 schedule announced</title>
        <link>https://example.com/tn-election-schedule-2026</link>
        <description>Election Commission released phase and polling date notification.</description>
        <pubDate>Sat, 25 Apr 2026 08:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Polling underway in key Tamil Nadu constituencies</title>
        <link>https://example.com/tn-polling-underway</link>
        <description>Voters are participating as election phase continues.</description>
        <pubDate>Sat, 26 Apr 2026 08:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('kya tamilnadu mai election chal rha h', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'True');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length > 0, true);
});

test('verifyClaim supports arbitrary election claims via live reasoner', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Election Commission issues revised campaign guideline in Tamil Nadu</title>
        <link>https://example.com/tn-campaign-guideline</link>
        <description>Latest bulletin confirms new campaign permissions.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const liveReasoner = async ({ claim, evidence }) => {
    if (/campaign guideline/i.test(claim) && evidence.length > 0) {
      return {
        verdict: 'True',
        explanation: 'Recent live evidence confirms revised campaign guidelines were issued.',
        reason: 'LIVE_EVIDENCE_SUPPORTED',
        suggestion: null,
        confidence: 76,
        confidenceReason: 'Matched directly against latest live bulletin headlines.'
      };
    }

    return null;
  };

  const result = await verifyClaim('Has Tamil Nadu issued revised campaign guidelines for this election?', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher,
    liveReasoner
  });

  assert.equal(result.verdict, 'True');
  assert.equal(result.reason, 'LIVE_EVIDENCE_SUPPORTED');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length > 0, true);
});

test('fetchLiveElectionEvidence builds official search terms for any state', async () => {
  const requestedUrls = [];

  const fetcher = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      text: async () => `
        <rss><channel>
          <item>
            <title>Gujarat election commission update</title>
            <link>https://example.com/gujarat-official</link>
            <description>Official election update.</description>
            <pubDate>Sat, 26 Apr 2026 08:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `
    };
  };

  const evidence = await fetchLiveElectionEvidence({
    claim: 'What is the election update in Gujarat?',
    state: 'Gujarat',
    fetcher
  });

  assert.equal(Array.isArray(requestedUrls), true);
  assert.equal(requestedUrls.length >= 4, true);
  assert.equal(requestedUrls.some((url) => decodeURIComponent(url).includes('Gujarat')), true);
  assert.equal(evidence.state, 'Gujarat');
});

test('verifyClaim resolves campaign guideline claim when official live evidence exists', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Election Commission issues revised campaign guideline in Tamil Nadu</title>
        <link>https://eci.gov.in/tamil-nadu-revised-campaign-guideline</link>
        <description>Official bulletin confirms updated campaign permissions.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Tamil Nadu campaign update from a news channel</title>
        <link>https://example.com/tn-campaign-news</link>
        <description>News report about the campaign timeline.</description>
        <pubDate>Sat, 26 Apr 2026 11:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Has Tamil Nadu issued revised campaign guidelines for this election?', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'True');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(result.liveState, 'Tamil Nadu');
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls[0].includes('eci.gov.in'), true);
});

test('fetchLiveElectionEvidence prefers official pages ahead of news when available', async () => {
  const liveRss = `
    <rss><channel>
      <item>
        <title>Campaign news from television channel</title>
        <link>https://example.com/news-campaign</link>
        <description>News item.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Official campaign bulletin</title>
        <link>https://eci.gov.in/official-campaign-bulletin</link>
        <description>Official bulletin.</description>
        <pubDate>Sat, 26 Apr 2026 10:05:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const evidence = await fetchLiveElectionEvidence({
    claim: 'Tamil Nadu campaign guidelines update',
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(evidence.items.length > 0, true);
  assert.equal(evidence.items[0].link.includes('eci.gov.in'), true);
});

test('verifyClaim auto-detects state from claim text when state is omitted', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Rajasthan election schedule announced</title>
        <link>https://example.com/rajasthan-election-schedule</link>
        <description>Polling date and phase details updated.</description>
        <pubDate>Sat, 26 Apr 2026 08:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('kya rajasthan mai june mai election hone wale h', {
    language: 'en',
    liveData: true,
    fetcher
  });

  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(result.liveState, 'Rajasthan');
  assert.equal(result.liveStateSource, 'detected');
  assert.equal(result.verdict === 'True' || result.verdict === 'UNVERIFIED' || result.verdict === 'False', true);
});

test('verifyClaim marks Lok Sabha result-date claim false when live evidence is assembly-specific', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu assembly election 2026 polling begins</title>
        <link>https://example.com/tn-assembly-polling-2026</link>
        <description>Assembly election voting and phase updates for constituencies.</description>
        <pubDate>Sat, 26 Apr 2026 09:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Assembly election counting schedule update for Tamil Nadu</title>
        <link>https://example.com/tn-assembly-counting-update</link>
        <description>Election authorities shared counting details for assembly polls.</description>
        <pubDate>Sat, 26 Apr 2026 11:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('tamilnadu mai abhi ke lok sabha election ka result 30 june 2026 ko aane wala h', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
});

test('verifyClaim marks no-result-yet claim false when live sources report leads/results', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu election results out: party leads in 140 seats</title>
        <link>https://example.com/tn-results-out</link>
        <description>Counting update confirms major leads and near-final outcome.</description>
        <pubDate>Sat, 26 Apr 2026 12:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu result abhi tak nahi aaya hai', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
});

test('verifyClaim marks cancellation claim false when live sources show active polling', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Polling underway in Tamil Nadu constituencies</title>
        <link>https://example.com/tn-polling-live</link>
        <description>Election schedule continues with active voting and phase operations.</description>
        <pubDate>Sat, 26 Apr 2026 10:30:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu election has been cancelled', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
});

test('verifyClaim marks cancellation claim false even with one clear active election signal', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu polling underway</title>
        <link>https://example.com/tn-polling-underway-short</link>
        <description>Live voting activity is ongoing today.</description>
        <pubDate>Sat, 26 Apr 2026 11:30:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu election is cancelled', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
});

test('verifyClaim marks turnout percentage claim false on large mismatch', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu voter turnout stands at 41% by 11 am</title>
        <link>https://example.com/tn-turnout-41</link>
        <description>Officials reported turnout and constituency-wise polling percentage updates.</description>
        <pubDate>Sat, 26 Apr 2026 11:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu voter turnout is 85%', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
});

test('verifyClaim marks declared-result claim false when only counting stage is reported', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Counting to begin tomorrow for Tamil Nadu election</title>
        <link>https://example.com/tn-counting-tomorrow</link>
        <description>Election Commission says counting schedule has been announced.</description>
        <pubDate>Sat, 26 Apr 2026 09:15:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu election result has already been declared', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
});

test('verifyClaim marks seat-count claim false on large mismatch with live sources', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu results update: alliance leads in 142 seats</title>
        <link>https://example.com/tn-seats-142</link>
        <description>Counting trends show leads in 142 seats across constituencies.</description>
        <pubDate>Sat, 26 Apr 2026 12:15:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu results me alliance ne 220 seats jeeti hain', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
});

test('verifyClaim includes claimSummary from official source when available', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu election schedule update from private portal</title>
        <link>https://example.com/tn-private-update</link>
        <description>Private report mentions polling phase updates.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Election Commission of India releases Tamil Nadu poll notification</title>
        <link>https://eci.gov.in/tn-poll-notification</link>
        <description>Official notification confirms schedule and election process details.</description>
        <pubDate>Sat, 26 Apr 2026 10:05:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu election result has already been declared', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(typeof result.claimSummary, 'string');
  assert.equal(result.claimSummary.includes('Source:'), true);
  assert.equal(result.claimSummary.toLowerCase().includes('(official)'), true);
});

test('verifyClaim falls back to trusted summary when official source is unavailable', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>NDTV: Tamil Nadu election counting updates continue</title>
        <link>https://www.ndtv.com/india-news/tamil-nadu-election-counting-updates</link>
        <description>NDTV reports counting stage updates and seat lead trends.</description>
        <pubDate>Sat, 26 Apr 2026 11:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Tamil Nadu election result has already been declared', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(typeof result.claimSummary, 'string');
  assert.equal(result.claimSummary.includes('Source:'), true);
  assert.equal(result.claimSummary.toLowerCase().includes('(trusted)'), true);
});

test('verifyClaim returns not-relevant reason when live items are fresh but unrelated', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Rajasthan Rajya Vidyut Utpadan Nigam update</title>
        <link>https://example.com/rajasthan-power-update</link>
        <description>Energy project and utility operations bulletin.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Local celebrity profile from Jaipur</title>
        <link>https://example.com/jaipur-profile-news</link>
        <description>Biography and achievements article.</description>
        <pubDate>Sat, 26 Apr 2026 11:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('rajasthan mai 2026 assembly election hone wale h', {
    language: 'en',
    liveData: true,
    state: 'Rajasthan',
    fetcher
  });

  assert.equal(result.verdict, 'UNVERIFIED');
  assert.equal(result.reason, 'LIVE_EVIDENCE_NOT_RELEVANT');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length, 0);
});

test('verifyClaim falls back to Gemini grounding when live fetch fails', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const failingFetcher = async () => {
    throw new Error('network down');
  };

  const groundingInvoker = async () => ({
    text: JSON.stringify({
      verdict: 'False',
      explanation: 'Grounded search found that the election has not been postponed.',
      reason: 'LIVE_EVIDENCE_CONTRADICTION',
      confidence: 88,
      confidenceReason: 'Grounded live sources contradict the postponement claim.',
      sources: [
        {
          source: 'Trusted news',
          url: 'https://example.com/live-election-update',
          quote: 'Officials denied any postponement and confirmed the election schedule.',
          direct: true
        }
      ]
    })
  });

  const result = await verifyClaim('Voting in the 2026 general election has been postponed to December due to heavy rainfall predictions.', {
    language: 'en',
    liveData: true,
    state: 'Tamil Nadu',
    fetcher: failingFetcher,
    groundingInvoker
  });

  assert.equal(result.verdict, 'False');
  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
  assert.equal(Array.isArray(result.sourceUrls), true);
  assert.equal(result.sourceUrls.length > 0, true);
});

test('verifyClaim forces realtime for date-sensitive claim even when liveData is off', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Tamil Nadu election not postponed; polling continues as notified</title>
        <link>https://example.com/tn-not-postponed</link>
        <description>Election officials denied postponement to December and confirmed ongoing schedule.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Voting in the 2026 general election has been postponed to December due to heavy rainfall predictions.', {
    language: 'en',
    state: 'Tamil Nadu',
    fetcher
  });

  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(result.verdict, 'False');
  assert.equal(result.reason, 'LIVE_EVIDENCE_CONTRADICTION');
});

test('verifyClaim routes voting-start timing claim to realtime path', async () => {
  __resetCacheForTests();
  __resetStoreForTests();

  const liveRss = `
    <rss><channel>
      <item>
        <title>Election Commission polling timing advisory</title>
        <link>https://example.com/polling-timing-advisory</link>
        <description>Official polling starts at 7:00 AM and closes at 6:00 PM.</description>
        <pubDate>Sat, 26 Apr 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `;

  const fetcher = async () => ({
    ok: true,
    text: async () => liveRss
  });

  const result = await verifyClaim('Polling stations open at 7:00 AM and close at 6:00 PM.', {
    language: 'en',
    fetcher
  });

  assert.equal(Boolean(result.liveEvidenceUsed), true);
  assert.equal(result.verdict, 'True');
  assert.equal(result.reason, 'LIVE_EVIDENCE_SUPPORTED');
});