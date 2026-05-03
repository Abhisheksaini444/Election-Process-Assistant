# Election Misinformation Shield - Complete Project Guide

## 1. Project Summary

Election Misinformation Shield is a full-stack AI-assisted verification system designed to detect and explain election-related misinformation claims.

The system supports:
- Single claim verification (text)
- Image-based claim extraction and verification
- Batch claim verification
- Streaming verification updates for better UX
- Confidence scoring, source quotes, and explanation metadata
- Claim analytics and user feedback loop
- Grounded live-evidence checks with official-domain filtering and direct quotes

Core objective:
Provide a transparent, explainable, and safe misinformation-checking workflow with auditable outputs.

---

## 2. High-Level Architecture

### Frontend
- React + Vite
- Tailwind CSS based interface
- Components for input, loading animation, verdict display, timeline, batch table, and analytics

### Backend
- Node.js + Express
- Routes for inspect, verify, analytics, and docs
- AI integrations:
  - Gemini text model for claim verification
  - Gemini vision for claim extraction from images
   - Gemini grounding with Google Search for live evidence
- Local context source: election_rules.txt

### Data/State Services
- In-memory + file-backed store for verification history and feedback
- Cache layer for repeated claims
- Claim enhancement layer for:
  - Classification
  - Misconception matching
  - Confidence scoring
  - Source quote extraction

---

## 3. End-to-End Workflow

### A) Single Text Claim (Streaming Path)
1. User enters one claim in UI.
2. Frontend calls POST /api/verify/stream.
3. Backend validates claim.
4. Backend emits NDJSON status events:
   - received
   - classifying
   - completed
5. Backend runs verifyClaim pipeline.
6. Backend emits final result event.
7. Frontend renders verdict, confidence, citations, and timeline.

### B) Image Claim Inspection
1. User uploads image (optional text also allowed).
2. Frontend sends multipart request to POST /api/inspect.
3. Backend validates image MIME type.
4. Vision service extracts core claim from image.
5. Extracted claim goes through same verification pipeline.
6. Response returned as enriched JSON.

### C) Batch Verification
1. User enters multiple claims line-by-line.
2. Frontend calls POST /api/verify/batch.
3. Backend validates array size and each claim.
4. Claims are verified in parallel.
5. Frontend displays results in batch table.

### D) Feedback and Analytics
1. User marks response as Helpful or Not Helpful.
2. Frontend calls POST /api/analytics/feedback.
3. Backend stores feedback and updates metrics.
4. Frontend refreshes analytics summary.

---

## 4. Important Concepts Used

### 4.1 Retrieval-Grounded Verification
The model is instructed to use election_rules.txt for local verification and Gemini grounding for live claims. Live search is restricted to official election domains when official-only mode is enabled.

### 4.2 Official Live Evidence
Live verification now prefers direct official evidence from:
- eci.gov.in
- pib.gov.in
- ceo.gov.in and related Chief Electoral Officer domains

The live path also extracts key terms from the claim first, limits retrieval to recent evidence, and surfaces direct quotes when evidence is relevant.

### 4.3 Explainable AI Output
Each verdict contains:
- Verdict label
- Explanation
- Confidence score
- Confidence reason
- Source quotes
- Claim type
- Related misconceptions
- Suggestion for unverified claims

### 4.4 Safety and Reliability Controls
- Input sanitization
- Claim length limits
- Image MIME restrictions
- Rate limiting
- Structured fallback responses on model failure
- Permanent-rule short-circuiting for obvious election misinformation such as voting without ID

### 4.5 Caching
Repeated claims return cached results for speed and lower model cost.

### 4.6 Persistence
Verification and feedback state is persisted to backend/data/verification_store.json.

### 4.7 Streaming UX
NDJSON stream improves perceived responsiveness and supports real-time status updates.

---

## 5. Backend API Reference

### Health
- GET /api/health
- Purpose: Service liveness check

### Docs
- GET /api/docs
- Purpose: Machine-readable endpoint and response-field summary

### Verify Single
- POST /api/verify
- Body: { claim, language?, liveData?, officialOnly?, state? }
- Returns: verdict, reason, confidence, sourceQuotes, liveEvidenceUsed, liveState, liveOfficialOnly, claimSummary when available

### Verify Batch
- POST /api/verify/batch
- Body: { claims: string[], language?, liveData?, officialOnly?, state? }

### Verify Stream
- POST /api/verify/stream
- Body: { claim, language?, liveData?, officialOnly?, state? }
- Response: NDJSON events

### Inspect (Text + Image)
- POST /api/inspect
- Multipart form:
  - claim (optional if image present)
  - image (optional if claim present)
  - language (optional)

### Analytics Summary
- GET /api/analytics/summary

### Analytics History
- GET /api/analytics/history?limit=20

### Feedback
- POST /api/analytics/feedback
- Body: { claimId, helpful, comment? }

### Live Verification Notes
- Permanent election-rule contradictions return False immediately.
- Strict official-only mode returns UNVERIFIED with OFFICIAL_SOURCES_INSUFFICIENT when no direct official source is found.
- Live evidence summaries prefer a short source label plus quoted excerpt.

---

## 6. Run Guide

## 6.1 Local Development

### Backend
1. Open backend folder.
2. Install dependencies:
   npm install
3. Add .env with required keys:
   GEMINI_API_KEY=your_key_here
4. Run backend:
   npm start
5. Run backend tests:
   npm test

### Frontend
1. Open frontend folder.
2. Install dependencies:
   npm install
3. Optional env for API base:
   VITE_API_BASE_URL=http://localhost:5000
4. Run frontend:
   npm run dev
5. Build for production:
   npm run build

### Default Local Ports
- Backend: 5000
- Frontend dev server: Vite default (usually 5173)

---

## 6.2 Docker Run

From the parent folder containing docker-compose.yml:

1. Build and start:
   docker compose up --build
2. Access:
   - Frontend: http://localhost:8080
   - Backend: http://localhost:5000

Notes:
- backend/.env is loaded by compose.
- Frontend production build is served via Nginx.

---

## 7. User Guide

### Step-by-Step
1. Open the app UI.
2. Enter a claim in the text area.
3. Optional: Upload an image of a claim.
4. Choose language (English/Hindi).
5. Click Verify.
6. Review:
   - Verdict
   - Confidence and reason
   - Supporting sources
   - Related misconceptions
   - Timeline steps (if procedural)
7. Submit feedback (Helpful/Not Helpful).
8. Use multi-line input for batch mode.

### Best Practices for Users
- Keep claims specific and factual.
- Use one claim per line for batch mode.
- Use clear, high-resolution images for OCR extraction.

---

## 8. Testing and Quality Checks

### Backend
- Test command:
  npm test
- Includes:
  - Validation tests
  - Enhancer logic tests
  - Store/analytics tests
  - Route tests

### Frontend
- Lint:
  npm run lint
- Production build check:
  npm run build

### CI Pipeline
GitHub Actions workflow runs:
- Backend tests
- Frontend lint
- Frontend build

---

## 9. Current Strengths

- Explainable AI outputs suitable for evaluation systems
- Stronger anti-hallucination prompt framing
- Multiple input modes (text, image, batch, stream)
- Safety controls and validation
- User feedback loop and analytics
- Deployment-ready via Docker and CI

---

## 10. Improvement Opportunities (Next Iteration)

### Technical
- Replace in-memory cache/history with Redis + database (Postgres/MongoDB)
- Add auth and role-based access for admin analytics
- Add API versioning and OpenAPI spec generation
- Add request tracing and observability (OpenTelemetry)

### Product
- Add benchmark mode for judges (auto-run claim suite + score output)
- Add multilingual UI beyond English/Hindi
- Add advanced filtering in analytics dashboard
- Add CSV/JSON export of verification history

### AI and Evaluation
- Add model ensemble cross-checking
- Add citation confidence by quote-level overlap scoring
- Add prompt-injection defense heuristics in vision/text intake
- Add offline evaluation harness with precision/recall metrics on labeled datasets

---

## 11. Security and Privacy Notes

- Never commit .env with real API keys.
- Rotate API keys periodically.
- Add strict CORS allowlist in production.
- Add content-size limits for uploads.
- Consider data retention policy for stored claims/feedback.

---

## 12. Troubleshooting

### Backend not starting
- Check Node version compatibility.
- Confirm GEMINI_API_KEY exists in backend/.env.
- Verify port 5000 is free.

### Frontend cannot reach backend
- Check VITE_API_BASE_URL.
- Confirm backend is running.
- Check CORS and firewall settings.

### Live verification returns UNVERIFIED in official-only mode
- This usually means no direct official source matched the claim closely enough.
- Try adding a more specific state, date, or election phase.
- If you want broader live signals, disable official-only mode for debugging only.

### Image verification fails
- Ensure format is PNG/JPEG/WEBP.
- Use clearer image with readable text.

### Stream does not return result
- Check browser support for streaming fetch response body.
- Fallback to non-stream endpoint if needed.

---

## 13. Suggested Demo Script (Hackathon)

1. Show single claim with streaming updates.
2. Show image claim extraction and verification.
3. Show a live official-only claim and compare it with a non-official live signal fallback.
3. Show batch verification with 3-5 lines.
4. Show explainability fields (citations/confidence/misconceptions).
5. Submit feedback and open analytics panel.
6. Show API docs endpoint and CI/Docker readiness.

This sequence highlights technical depth, reliability, UX quality, and evaluator-friendly transparency.

---

## 14. Final Notes

This project is now in a strong state for AI-evaluation-based hackathons because it combines:
- Transparency
- Safety
- Multi-modal support
- Reproducibility
- Deployment readiness

For maximum scoring, focus your final presentation on explainability, measured reliability, and practical user impact.
