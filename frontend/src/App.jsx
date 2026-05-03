import React, { useState } from 'react';
import DropZone from './components/DropZone';
import ScanningAnimation from './components/ScanningAnimation';
import VerdictCard from './components/VerdictCard';
import InteractiveTimeline from './components/InteractiveTimeline';
import AnalyticsPanel from './components/AnalyticsPanel';
import BatchResultsTable from './components/BatchResultsTable';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [batchResults, setBatchResults] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [scanMessage, setScanMessage] = useState('Checking realtime election timeline and official evidence...');
  const [stateDraft, setStateDraft] = useState('');

  const loadAnalytics = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/analytics/summary`);
      if (!response.ok) return;
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Analytics fetch failed:', error);
    }
  };

  React.useEffect(() => {
    loadAnalytics();
  }, []);

  const handleVerify = async ({ claim, file, claims, language, liveData, officialOnly, state }) => {
    setIsLoading(true);
    setResult(null);
    setBatchResults([]);
    setScanMessage('Checking realtime election timeline and official evidence...');
    
    try {
      if (Array.isArray(claims) && claims.length > 1 && !file) {
        const response = await fetch(`${API_BASE}/api/verify/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claims, language, liveData, officialOnly, state }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Batch verification failed.');
        }

        setBatchResults(data.items || []);
        await loadAnalytics();
        return;
      }

      if (!file) {
        const response = await fetch(`${API_BASE}/api/verify/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claim, language, liveData, officialOnly, state }),
        });

        if (!response.ok) {
          const errorPayload = await response.json();
          throw new Error(errorPayload.error || 'Streaming verification failed.');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Streaming is not supported in this browser.');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const event = JSON.parse(trimmed);
            if (event.type === 'status' && event.message) {
              setScanMessage(event.message);
            }

            if (event.type === 'error') {
              throw new Error(event.message || 'Streaming verification failed.');
            }

            if (event.type === 'result' && event.data) {
              finalResult = event.data;
            }
          }
        }

        if (!finalResult) {
          throw new Error('Streaming finished without a result payload.');
        }

        setResult(finalResult);
        if (!state?.trim() && finalResult?.liveStateSource === 'detected' && finalResult?.liveState) {
          setStateDraft(finalResult.liveState);
        }
        await loadAnalytics();
        return;
      }

      const formData = new FormData();
      formData.append('claim', claim);
      formData.append('language', language || 'en');
      formData.append('liveData', String(Boolean(liveData)));
      formData.append('officialOnly', String(Boolean(officialOnly)));
      if (state) {
        formData.append('state', state);
      }
      if (file) {
        formData.append('image', file);
      }

      const response = await fetch(`${API_BASE}/api/inspect`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.explanation || 'Verification failed.');
      }

      setResult(data);
      if (!state?.trim() && data?.liveStateSource === 'detected' && data?.liveState) {
        setStateDraft(data.liveState);
      }
      await loadAnalytics();
    } catch (error) {
      console.error('Verification failed:', error);
      setResult({
        verdict: 'UNVERIFIED',
        explanation: error.message || 'Failed to connect to the verification server. Please try again.',
        reason: 'REQUEST_FAILURE',
        suggestion: 'Ensure backend is running and reachable from frontend.',
        steps: [],
        sourceQuotes: [],
        relatedMisconceptions: [],
        confidence: 0,
        confidenceReason: 'No confidence score available due to failed request.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (claimId, helpful) => {
    if (!claimId) return;

    try {
      await fetch(`${API_BASE}/api/analytics/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, helpful }),
      });
      await loadAnalytics();
    } catch (error) {
      console.error('Feedback failed:', error);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <header className="max-w-4xl mx-auto text-center mb-12">
        <div className="inline-block p-2 px-4 rounded-full bg-indigo-900/30 border border-indigo-500/30 text-indigo-300 text-sm font-semibold tracking-wide mb-4 animate-pulse">
          PromptWars Challenge 2
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-4 drop-shadow-sm">
          Election Anti-Misinfo Shield
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Your personal Election Integrity Assistant. Verify rumors, understand processes, and get factual timelines securely backed by RAG.
        </p>
      </header>

      <main className="flex flex-col items-center w-full max-w-4xl mx-auto">
        <DropZone
          onVerify={handleVerify}
          isLoading={isLoading}
          stateValue={stateDraft}
          onStateValueChange={setStateDraft}
        />
        
        <div className="w-full mt-8 flex flex-col items-center min-h-[260px]">
          {isLoading && <ScanningAnimation message={scanMessage} />}
          {!isLoading && result && (
            <div className="w-full animate-fade-in-up space-y-8">
              <VerdictCard result={result} onFeedback={handleFeedback} />
              <InteractiveTimeline steps={result.steps} />
            </div>
          )}
          {!isLoading && batchResults.length > 0 && <BatchResultsTable items={batchResults} />}
        </div>

        <div className="w-full mt-8">
          <AnalyticsPanel analytics={analytics} />
        </div>
      </main>
      
      <footer className="mt-20 text-center text-slate-500 text-sm">
        <p>© 2026 Election Anti-Misinfo Shield | Powered by Google Gemini & LangChain</p>
      </footer>
    </div>
  );
}

export default App;
