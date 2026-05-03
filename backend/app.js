import express from 'express';
import cors from 'cors';
import verifyRoutes from './routes/verify.js';
import inspectRoutes from './routes/inspect.js';
import analyticsRoutes from './routes/analytics.js';
import { rateLimiter } from './middleware/rateLimiter.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(rateLimiter);

app.use('/api/verify', verifyRoutes);
app.use('/api/inspect', inspectRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/docs', (req, res) => {
  res.json({
    service: 'Election Misinformation Shield API',
    endpoints: [
      { method: 'GET', path: '/api/health', description: 'Service health check' },
      { method: 'POST', path: '/api/inspect', description: 'Single verification using text and optional image' },
      { method: 'POST', path: '/api/verify', description: 'Single text claim verification' },
      { method: 'POST', path: '/api/verify/batch', description: 'Batch text claim verification (up to 20 claims)' },
      { method: 'POST', path: '/api/verify/stream', description: 'Streaming NDJSON text verification with status events' },
      { method: 'GET', path: '/api/analytics/summary', description: 'Aggregate verification metrics' },
      { method: 'GET', path: '/api/analytics/history', description: 'Recent verification history' },
      { method: 'POST', path: '/api/analytics/feedback', description: 'Submit helpful/not-helpful feedback by claimId' }
    ],
    responseFields: [
      'claimId',
      'verdict',
      'confidence',
      'confidenceReason',
      'claimType',
      'sourceQuotes',
      'relatedMisconceptions',
      'reason',
      'suggestion',
      'liveEvidenceUsed',
      'liveState',
      'liveOfficialOnly',
      'liveFetchedAt',
      'sourceUrls',
      'contextLastUpdated',
      'fromCache'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'election-misinfo-shield' });
});

export default app;
