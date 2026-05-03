import { useState, useRef } from 'react';

const DropZone = ({ onVerify, isLoading, stateValue, onStateValueChange }) => {
  const [claim, setClaim] = useState('');
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('en');
  const [liveData, setLiveData] = useState(true);
  const [officialOnly, setOfficialOnly] = useState(false);
  const fileInputRef = useRef(null);
  const state = typeof stateValue === 'string' ? stateValue : '';

  const claimsFromInput = claim
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const isBatchMode = claimsFromInput.length > 1 && !file;

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((claim.trim() || file) && !isLoading) {
      onVerify({
        claim: claim.trim(),
        file,
        claims: claimsFromInput,
        language,
        liveData,
        officialOnly,
          state: state.trim()
      });
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full max-w-2xl mx-auto glass-panel mt-12 transition-transform duration-300 hover:scale-[1.02]">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Verify Election Claims</h2>
        <p className="text-slate-300">Paste one claim for single verification, or multiple lines for batch verification. Image mode supports single claim extraction.</p>
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          aria-label="Claim input"
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          placeholder="e.g. Can I vote by text message?\nCan I carry a phone inside booth?"
          className="w-full h-32 p-4 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all"
          disabled={isLoading}
        ></textarea>

        {isBatchMode && (
          <p className="mt-2 text-left text-xs text-indigo-300">
            Batch mode active: {claimsFromInput.length} claims will be verified.
          </p>
        )}

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            State (optional)
            <input
              aria-label="Election state"
              type="text"
              value={state}
              onChange={(e) => onStateValueChange?.(e.target.value)}
              placeholder="e.g. Tamil Nadu or West Bengal"
              className="mt-1 w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-200"
              disabled={isLoading}
            />
          </label>

          <label className="text-xs text-slate-300 flex items-center gap-2 mt-5 md:mt-6">
            <input
              aria-label="Enable live web evidence"
              type="checkbox"
              checked={liveData}
              onChange={(e) => setLiveData(e.target.checked)}
              disabled={isLoading}
            />
            Use live web evidence (trusted news feeds)
          </label>

          <label className="text-xs text-slate-300 flex items-center gap-2 mt-0 md:mt-6">
            <input
              aria-label="Use official sources only"
              type="checkbox"
              checked={officialOnly}
              onChange={(e) => setOfficialOnly(e.target.checked)}
              disabled={isLoading || !liveData}
            />
            Official sources only (gov/ECI/CEO)
          </label>
        </div>
        
        {/* File Preview */}
        {file && (
          <div className="mt-3 flex items-center justify-between p-2 px-3 bg-indigo-900/40 border border-indigo-500/30 rounded-lg animate-fade-in">
            <div className="flex items-center space-x-2 truncate">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-indigo-200 truncate font-medium">{file.name}</span>
            </div>
            <button 
              type="button"
              onClick={removeFile}
              className="p-1 hover:bg-indigo-500/20 rounded-full text-indigo-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <button
              aria-label="Upload claim image"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg text-sm text-slate-300 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{file ? 'Change Image' : 'Upload Image'}</span>
            </button>

            <label className="text-xs text-slate-400">
              Language
              <select
                aria-label="Response language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="ml-2 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200"
                disabled={isLoading}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
          </div>

          <button
            aria-label={isBatchMode ? 'Verify batch claims' : 'Verify claim'}
            type="submit"
            disabled={isLoading || (!claim.trim() && !file)}
            className="px-8 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
          >
            {isLoading ? 'Scanning...' : isBatchMode ? 'Verify Batch' : 'Verify Shield'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DropZone;
