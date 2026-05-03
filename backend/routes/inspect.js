import express from 'express';
import multer from 'multer';
import { verifyClaim } from '../services/ragService.js';
import { extractTextFromImage } from '../services/visionService.js';
import { logHandoff, logError } from '../utils/logger.js';
import { validateClaim, validateImageMimeType } from '../utils/validation.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), async (req, res) => {
  try {
    let claim = req.body.claim;
    const typedClaim = req.body.claim;
    const language = req.body.language;
    const liveData = req.body.liveData === 'true' || req.body.liveData === true;
    const officialOnly = req.body.officialOnly === 'true' || req.body.officialOnly === true;
    const state = req.body.state;
    const hasTypedClaim = Boolean(typedClaim && typedClaim.trim());

    // Logic Check: If image exists, extract text first when needed.
    if (req.file) {
      const imageValidation = validateImageMimeType(req.file.mimetype);
      if (!imageValidation.isValid) {
        return res.status(400).json({
          verdict: 'UNVERIFIED',
          error: imageValidation.message,
          reason: imageValidation.reason,
          suggestion: 'Upload a PNG, JPEG, or WEBP image with visible text.',
          steps: []
        });
      }

      if (hasTypedClaim) {
        // Prefer explicit user-provided claim to reduce failures and token cost.
        logHandoff('Hybrid Intake: Typed claim detected, skipping OCR and using typed input');
        claim = typedClaim;
      } else {
        logHandoff('Hybrid Intake: Image detected with no typed claim, running OCR extraction');
        try {
          const extractedClaim = await extractTextFromImage(req.file.buffer, req.file.mimetype);
          claim = extractedClaim || typedClaim;

          if (!extractedClaim && typedClaim) {
            logHandoff('Hybrid Intake: Vision returned empty text, falling back to typed claim');
          }
        } catch (visionError) {
          logError("Hybrid Intake: OCR parsing failed", visionError);

          if (typedClaim && typedClaim.trim()) {
            logHandoff('Hybrid Intake: Vision failed, falling back to typed claim');
            claim = typedClaim;
          } else {
            const isQuotaError = Number(visionError?.status) === 429 || /quota|rate limit/i.test(visionError?.message || '');

            // No fallback claim exists, so return image parsing guidance.
            return res.json({
              verdict: 'UNVERIFIED',
              explanation: isQuotaError
                ? 'Image analysis is temporarily unavailable due to AI API quota limits.'
                : 'Could not parse the image provided. Please ensure it is a clear photo of the claim.',
              reason: isQuotaError ? 'VISION_QUOTA_EXCEEDED' : 'VISION_PARSE_FAILURE',
              suggestion: isQuotaError
                ? 'Please type the claim in text, or retry after quota resets.'
                : 'Use a sharper image or type the claim directly in text.',
              steps: []
            });
          }
        }
      }
    }

    const claimValidation = validateClaim(claim);
    if (!claimValidation.isValid) {
      return res.status(400).json({
        error: claimValidation.message,
        reason: claimValidation.reason,
        suggestion: 'Provide a concise election-related factual claim to inspect.'
      });
    }

    logHandoff(`Hybrid Intake: Processing claim: "${claimValidation.sanitizedClaim.substring(0, 50)}..."`);
    const result = await verifyClaim(claimValidation.sanitizedClaim, {
      language,
      liveData,
      officialOnly,
      state
    });
    res.json(result);

  } catch (error) {
    logError("Hybrid Intake: Critical route failure", error);
    res.status(500).json({
      verdict: "UNVERIFIED",
      explanation: "An internal processing error occurred during hybrid analysis.",
      reason: 'INSPECT_ROUTE_FAILURE',
      suggestion: 'Try again in a few seconds or use plain text claim verification.',
      steps: []
    });
  }
});

export default router;
