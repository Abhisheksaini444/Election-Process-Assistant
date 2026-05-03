import express from 'express';
import { addFeedback, getAnalyticsSummary, listHistory } from '../services/storeService.js';

const router = express.Router();

router.get('/summary', (req, res) => {
  res.json(getAnalyticsSummary());
});

router.get('/history', (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ items: listHistory(limit) });
});

router.post('/feedback', (req, res) => {
  const { claimId, helpful, comment } = req.body || {};

  if (!claimId) {
    return res.status(400).json({
      error: 'claimId is required.',
      reason: 'INVALID_FEEDBACK_PAYLOAD'
    });
  }

  const item = addFeedback({ claimId, helpful, comment });
  return res.status(201).json(item);
});

export default router;
