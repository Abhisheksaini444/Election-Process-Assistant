# Election Misinformation Shield Frontend

This is the React + Vite frontend for the Election Misinformation Shield app. It provides a guided interface for single-claim verification, batch verification, image-based inspection, and analytics review.

## What It Does

The UI lets users:
- Submit a single election-related claim for verification
- Upload an image and extract a claim for inspection
- Verify multiple claims in batch mode
- Review a verdict card with confidence, source quotes, and reasoning
- See a timeline when the backend returns procedural steps
- Send feedback on a verification result
- View analytics for recent usage and outcomes

The frontend supports the backend live-evidence flow, including:
- `liveData`
- `officialOnly`
- optional `state` selection or automatic state detection from the response

## Main UI Flow

1. A claim is entered in the drop zone panel.
2. The app sends the request to the backend verify or inspect endpoint.
3. While the backend works, a scanning animation is shown.
4. The result is rendered as a verdict card with explanation, confidence, source quotes, and live-evidence metadata.
5. If the result contains timeline steps, they are shown below the verdict.
6. Analytics refresh after each successful verification.

## Project Structure

- `src/App.jsx` - application shell and API wiring
- `src/components/DropZone.jsx` - claim input, file upload, and action controls
- `src/components/VerdictCard.jsx` - verdict rendering, sources, confidence, and feedback
- `src/components/InteractiveTimeline.jsx` - step timeline for procedural claims
- `src/components/ScanningAnimation.jsx` - in-progress loading UI
- `src/components/BatchResultsTable.jsx` - batch verification results
- `src/components/AnalyticsPanel.jsx` - dashboard summary for verification activity

## Environment

The frontend reads the backend base URL from:

- `VITE_API_BASE_URL`

If it is not set, the app defaults to:

- `http://localhost:5000`

## Available Scripts

From the `frontend` directory:

- `npm install` - install dependencies
- `npm run dev` - start the Vite dev server
- `npm run build` - create a production build
- `npm run lint` - run ESLint

## Local Development

1. Start the backend first.
2. Set `VITE_API_BASE_URL` if the backend is not on `http://localhost:5000`.
3. Run `npm run dev` in the frontend directory.
4. Open the Vite URL shown in the terminal.

## Backend Endpoints Used By The UI

- `POST /api/verify/stream` - single claim streaming verification
- `POST /api/verify/batch` - multi-claim verification
- `POST /api/inspect` - image + text verification
- `GET /api/analytics/summary` - analytics dashboard data
- `POST /api/analytics/feedback` - helpful/not helpful feedback

## Live Verification Notes

- Strict official-only mode can return `UNVERIFIED` with `OFFICIAL_SOURCES_INSUFFICIENT` when no direct official source is found.
- The UI displays source labels, compact links, and quote snippets returned by the backend.
- If the backend auto-detects a state from the claim text, the UI can populate the state field from the response.

## Production Build

Run:

```bash
npm run build
```

This produces a static frontend bundle in `dist/`.

## Notes

- The app is built with React 18 and Vite.
- Styling is handled with Tailwind CSS utility classes and component-level styling.
- The frontend is designed to work with the current grounded live-evidence backend flow.
