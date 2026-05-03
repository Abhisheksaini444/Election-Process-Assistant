const VerdictCard = ({ result, onFeedback }) => {
  if (!result) return null;

  const getHostName = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'Source';
    }
  };

  const reasonLabels = {
    LIVE_EVIDENCE_NOT_RELEVANT: 'No claim-relevant live source found',
    LIVE_EVIDENCE_INCONCLUSIVE: 'Live sources are mixed or inconclusive',
    LIVE_EVIDENCE_CONTRADICTION: 'Live sources contradict the claim',
    LIVE_EVIDENCE_SUPPORTED: 'Live sources support the claim',
    LIVE_FETCH_UNAVAILABLE: 'Realtime verification unavailable, Gemini grounding required',
    LIVE_FETCH_FAILED: 'Web fetch failed, trying Gemini grounding',
    LIVE_DATA_STALE: 'Fresh live updates are not available',
    OFFICIAL_SOURCES_INSUFFICIENT: 'Not enough official sources found',
    INSUFFICIENT_CONTEXT: 'No direct official rule match found in current data',
    AMBIGUOUS_CLAIM: 'Claim is too ambiguous to verify',
    NOT_IN_SCOPE: 'Claim is outside supported verification scope',
    MISINFORMATION_POLICY: 'Known misinformation pattern detected'
  };

  const {
    verdict,
    explanation,
    confidence,
    confidenceReason,
    claimType,
    sourceQuotes,
    relatedMisconceptions,
    claimId,
    suggestion,
    reason,
    sourceUrls,
    liveEvidenceUsed,
    liveState,
    liveOfficialOnly,
    liveStateSource,
    liveFetchedAt,
    liveMaxAgeDays,
    liveSourcesSummary,
    claimSummary,
    liveSourceDetails
  } = result;

  const readableReason = reason ? (reasonLabels[reason] || reason) : 'N/A';

  const liveSyncedAt = liveFetchedAt ? new Date(liveFetchedAt) : null;
  const isRealtimeCheck = Boolean(liveEvidenceUsed);
  const realtimeLabel = isRealtimeCheck
    ? (reason === 'LIVE_EVIDENCE_CONTRADICTION' || reason === 'LIVE_EVIDENCE_SUPPORTED'
      ? 'Realtime election timeline check'
      : 'Realtime live evidence check')
    : null;
  
  let headerColor = 'text-yellow-400';
  let bgGradient = "from-yellow-900/40 to-slate-800";
  let icon = "⚠️";
  let borderClass = 'border-l-yellow-500';

  if (verdict === "True") {
    headerColor = "text-green-400";
    bgGradient = "from-green-900/40 to-slate-800";
    icon = "✅";
    borderClass = 'border-l-green-500';
  } else if (verdict === "False") {
    headerColor = "text-red-400";
    bgGradient = "from-red-900/40 to-slate-800";
    icon = "❌";
    borderClass = 'border-l-red-500';
  } else {
    // UNVERIFIED
    headerColor = "text-slate-300";
    bgGradient = "from-slate-700/40 to-slate-800";
    icon = "🛡️";
    borderClass = 'border-l-slate-500';
  }

  return (
    <div className={`mt-8 w-full max-w-2xl mx-auto glass-panel bg-gradient-to-br ${bgGradient} border-l-4 ${borderClass} transform transition-all animate-fade-in-up overflow-hidden`}>
      <div className="flex items-start space-x-4 min-w-0">
        <div className="text-4xl">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-2xl font-bold uppercase tracking-wider mb-2 ${headerColor}`}>
            {verdict}
          </h3>
          <p className="text-slate-200 leading-relaxed text-lg break-words">
            {explanation}
          </p>

          {realtimeLabel && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
              {realtimeLabel}
            </div>
          )}

          <div className="mt-4 grid md:grid-cols-3 gap-2 text-sm">
            <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-2">
              <p className="text-slate-400">Confidence</p>
              <p className="font-semibold text-slate-200">{typeof confidence === 'number' ? `${confidence}%` : 'N/A'}</p>
            </div>
            <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-2">
              <p className="text-slate-400">Claim Type</p>
              <p className="font-semibold text-slate-200 capitalize">{claimType || 'unknown'}</p>
            </div>
            <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-2">
              <p className="text-slate-400">Reason</p>
              <p className="font-semibold text-slate-200">{readableReason}</p>
            </div>
          </div>

          {confidenceReason && <p className="mt-3 text-sm text-indigo-200 break-words">{confidenceReason}</p>}

          {claimSummary && (
            <div className="mt-3 p-3 rounded-lg bg-teal-900/20 border border-teal-600/30 text-teal-100 text-sm whitespace-pre-line break-words overflow-hidden">
              {claimSummary}
            </div>
          )}

          {liveSourcesSummary && reason === 'LIVE_EVIDENCE_INCONCLUSIVE' && (
            <div className="mt-3 p-3 rounded-lg bg-blue-900/20 border border-blue-600/30 text-blue-200 text-sm italic break-words overflow-hidden">
              <span className="text-blue-300 font-semibold">What the sources showed: </span>
              {liveSourcesSummary}
            </div>
          )}

          {liveEvidenceUsed && (
            <div className="mt-3 text-xs text-cyan-200 bg-cyan-900/20 border border-cyan-700/30 rounded-lg p-2">
              <p>
                Realtime evidence mode: {liveOfficialOnly ? 'Official sources only' : 'Trusted web feeds'}
                {liveState ? ` | State: ${liveState}` : ''}
              </p>
              {liveStateSource && (
                <p>
                  State source: {liveStateSource === 'user' ? 'selected by user' : 'auto-detected from claim'}
                </p>
              )}
              {liveSyncedAt && (
                <p>Last live sync: {liveSyncedAt.toLocaleString('en-IN')}</p>
              )}
              {typeof liveMaxAgeDays === 'number' && (
                <p>Freshness window: last {liveMaxAgeDays} day(s)</p>
              )}
            </div>
          )}

          {suggestion && (
            <div className="mt-3 p-3 rounded-lg bg-yellow-900/20 border border-yellow-600/30 text-yellow-200 text-sm">
              Suggestion: {suggestion}
            </div>
          )}

          {reason === 'LIVE_FETCH_FAILED' && (
            <div className="mt-3 p-3 rounded-lg bg-cyan-900/20 border border-cyan-600/30 text-cyan-100 text-sm">
              Realtime source fetch failed. The app will try Gemini Search Grounding next when enabled.
            </div>
          )}

          {Array.isArray(sourceQuotes) && sourceQuotes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Supporting Sources</h4>
              <ul className="space-y-2">
                {sourceQuotes.map((quote) => (
                  <li key={quote} className="text-sm text-slate-200 bg-slate-900/40 border border-slate-700 rounded-lg p-2 break-words overflow-hidden">
                    {quote}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(sourceUrls) && sourceUrls.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Live Source Links</h4>
              <ul className="space-y-2">
                {(Array.isArray(liveSourceDetails) && liveSourceDetails.length > 0
                  ? liveSourceDetails
                  : sourceUrls.map((url) => ({ url, resource: getHostName(url) }))
                ).map((item) => (
                  <li key={item.url} className="text-sm text-slate-200 bg-slate-900/40 border border-slate-700 rounded-lg p-2 overflow-hidden">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 w-full min-w-0 overflow-hidden"
                      title={`${item.resource}: ${item.url}`}
                    >
                      <span className="text-slate-300 shrink-0">{item.resource}:</span>
                      <span className="text-cyan-300 hover:text-cyan-200 underline truncate whitespace-nowrap block flex-1 min-w-0">{item.url}</span>
                    </a>
                    {item.quote && (
                      <p className="mt-1 text-xs text-slate-300 italic break-words overflow-hidden">“{item.quote}”</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(relatedMisconceptions) && relatedMisconceptions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Related Misconceptions</h4>
              <ul className="space-y-2">
                {relatedMisconceptions.map((item) => (
                  <li key={item.myth} className="text-sm bg-slate-900/40 border border-slate-700 rounded-lg p-2">
                    <p className="text-red-200">Myth: {item.myth}</p>
                    <p className="text-green-200">Fact: {item.fact}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {claimId && (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onFeedback?.(claimId, true)}
                className="px-3 py-1 rounded bg-emerald-700/40 border border-emerald-500/40 text-emerald-200 text-sm hover:bg-emerald-600/40"
              >
                Helpful
              </button>
              <button
                type="button"
                onClick={() => onFeedback?.(claimId, false)}
                className="px-3 py-1 rounded bg-rose-700/40 border border-rose-500/40 text-rose-200 text-sm hover:bg-rose-600/40"
              >
                Not Helpful
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerdictCard;
