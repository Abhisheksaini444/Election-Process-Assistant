const Stat = ({ label, value }) => (
  <div className="p-3 rounded-lg bg-slate-800/70 border border-slate-700">
    <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-xl font-bold text-slate-100">{value}</p>
  </div>
);

const AnalyticsPanel = ({ analytics }) => {
  if (!analytics) return null;

  const verdict = analytics.verdictCounts || {};

  return (
    <section className="w-full max-w-4xl mx-auto glass-panel">
      <h3 className="text-xl font-bold mb-4 text-left">Verification Analytics</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
        <Stat label="Total Checks" value={analytics.totalVerifications} />
        <Stat label="Avg Confidence" value={`${analytics.averageConfidence}%`} />
        <Stat label="Helpful Ratio" value={`${analytics.helpfulFeedbackRatio}%`} />
        <Stat label="Feedback" value={analytics.totalFeedback} />
      </div>

      <div className="grid md:grid-cols-3 gap-3 mt-4 text-left">
        <Stat label="True" value={verdict.True || 0} />
        <Stat label="False" value={verdict.False || 0} />
        <Stat label="Unverified" value={verdict.UNVERIFIED || 0} />
      </div>

      {Array.isArray(analytics.recentClaims) && analytics.recentClaims.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm uppercase tracking-wide text-slate-400 mb-2">Recent Claims</h4>
          <ul className="space-y-2">
            {analytics.recentClaims.map((item) => (
              <li key={item.id} className="text-sm bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-slate-200 truncate">{item.claim}</p>
                  <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-200">{item.verdict}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default AnalyticsPanel;
