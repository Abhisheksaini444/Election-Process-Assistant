import express from 'express';
import { verifyClaim } from '../services/ragService.js';
import { logHandoff, logError } from '../utils/logger.js';
import { parseBatchClaims, validateClaim } from '../utils/validation.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { claim, language, liveData, state, officialOnly } = req.body;
    const validation = validateClaim(claim);

    if (!validation.isValid) {
      return res.status(400).json({
        error: validation.message,
        reason: validation.reason,
        suggestion: 'Provide a short, specific election-related factual claim.'
      });
    }

    logHandoff(`Received verification request for claim: "${validation.sanitizedClaim}"`);

    const result = await verifyClaim(validation.sanitizedClaim, {
      language,
      liveData: Boolean(liveData),
      officialOnly: Boolean(officialOnly),
      state
    });
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Route failure:', error.message);
    console.error(error.stack);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { claims, language, liveData, state, officialOnly } = req.body || {};
    const parsed = parseBatchClaims(claims);

    if (!parsed.isValid) {
      return res.status(400).json({
        error: parsed.message,
        reason: parsed.reason
      });
    }

    const items = await Promise.all(parsed.cleanedClaims.map((claim) => verifyClaim(claim, {
      language,
      liveData: Boolean(liveData),
        officialOnly: Boolean(officialOnly),
      state
    })));
    return res.json({
      total: items.length,
      items
    });
  } catch (error) {
    logError('Batch verification failed', error);
    return res.status(500).json({
      error: 'Internal server error during batch verification.',
      reason: 'BATCH_ROUTE_FAILURE'
    });
  }
});

router.post('/stream', async (req, res) => {
  const emit = (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const { claim, language, liveData, state, officialOnly } = req.body || {};
    const validation = validateClaim(claim);

    if (!validation.isValid) {
      return res.status(400).json({
        error: validation.message,
        reason: validation.reason,
        suggestion: 'Provide a short, specific election-related factual claim.'
      });
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    emit({
      type: 'status',
      stage: 'received',
      message: 'Claim received. Starting election rules analysis.'
    });

    emit({
      type: 'status',
      stage: 'classifying',
      message: 'Classifying claim and extracting potential misinformation patterns.'
    });

    const result = await verifyClaim(validation.sanitizedClaim, {
      language,
      liveData: Boolean(liveData),
      officialOnly: Boolean(officialOnly),
      state
    });

    emit({
      type: 'status',
      stage: 'completed',
      message: 'Analysis complete. Returning final verdict.'
    });

    emit({
      type: 'result',
      data: result
    });

    return res.end();
  } catch (error) {
    logError('Streaming verification failed', error);

    emit({
      type: 'error',
      message: 'Internal server error during streaming verification.',
      reason: 'STREAM_ROUTE_FAILURE'
    });

    return res.end();
  }
});

export default router;
