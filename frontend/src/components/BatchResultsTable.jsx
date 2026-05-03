const getVerdictClass = (verdict) => {
  if (verdict === 'True') return 'text-green-300 bg-green-900/30 border-green-600/40';
  if (verdict === 'False') return 'text-red-300 bg-red-900/30 border-red-600/40';
  return 'text-slate-300 bg-slate-700/40 border-slate-600/40';
};

const BatchResultsTable = ({ items }) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <section className="w-full max-w-4xl mx-auto glass-panel overflow-x-auto">
      <h3 className="text-xl font-bold mb-4 text-left">Batch Verification Results</h3>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="py-2 pr-3">Claim</th>
            <th className="py-2 pr-3">Verdict</th>
            <th className="py-2 pr-3">Confidence</th>
            <th className="py-2">Type</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.claimId || `${item.processedClaim}-${item.verdict}`} className="border-b border-slate-800">
              <td className="py-3 pr-3 text-slate-200">{item.processedClaim}</td>
              <td className="py-3 pr-3">
                <span className={`px-2 py-1 border rounded ${getVerdictClass(item.verdict)}`}>
                  {item.verdict}
                </span>
              </td>
              <td className="py-3 pr-3 text-slate-200">{item.confidence}%</td>
              <td className="py-3 text-slate-300 capitalize">{item.claimType}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default BatchResultsTable;
