---
name: Vinyl MVP Plan
overview: Build a minimal single-user web app that accepts a vinyl photo plus optional price/condition, fetches Discogs market context, and returns an LLM-based buy/evaluate recommendation.
todos:
  - id: bootstrap-nextjs
    content: Initialize Next.js TypeScript project and env scaffold
    status: completed
  - id: build-upload-ui
    content: Implement minimal upload/price/condition form and results panel
    status: completed
  - id: create-analyze-route
    content: Build API route for multipart input validation and orchestration
    status: completed
  - id: add-vision-extraction
    content: Extract release hints from image using LLM vision
    status: completed
  - id: integrate-discogs
    content: Implement Discogs search and market data fetch utilities
    status: completed
  - id: implement-evaluator
    content: Create prompt + structured LLM recommendation output
    status: completed
  - id: wire-ui-results
    content: Render recommendation, confidence, reasons, and market stats
    status: completed
  - id: mvp-hardening
    content: Add basic error handling, lightweight rate limiting, and disclaimer
    status: completed
  - id: manual-test-deploy
    content: Run core manual tests and prepare deployment config
    status: in_progress
isProject: false
---

# Minimal Vinyl Evaluator MVP Plan

## Goal

Ship a tiny end-to-end prototype focused on **speed of validation**: upload photo, enrich with Discogs data, run LLM reasoning, and show a clear recommendation.

## Chosen Defaults

- Stack: **Next.js (TypeScript) full-stack** (fastest MVP path, one deploy unit).
- MVP mode: **no authentication**.
- Inputs: photo (required), asking price (optional), condition (optional dropdown).
- External keys you provide: Discogs API key/secret + LLM API key.

## Architecture (MVP)

```mermaid
flowchart TD
  User[User]
  WebForm[WebFormUploadPriceCondition]
  AnalyzeApi[ApiAnalyzeRoute]
  VisionStep[VisionExtractReleaseHints]
  DiscogsStep[DiscogsSearchAndMarketData]
  PromptBuilder[PromptBuilder]
  LlmStep[LlmEvaluation]
  ResultView[ResultRecommendationView]

  User --> WebForm
  WebForm --> AnalyzeApi
  AnalyzeApi --> VisionStep
  VisionStep --> DiscogsStep
  DiscogsStep --> PromptBuilder
  PromptBuilder --> LlmStep
  LlmStep --> ResultView
```



## Implementation Plan

1. Bootstrap app shell and environment setup

- Initialize Next.js TypeScript app.
- Add `.env.local` support and validation for required keys.
- Add a minimal home page with upload form and result panel.

1. Build the analysis API route

- Create a server route that accepts multipart form data (`image`, `price`, `condition`).
- Add input validation and simple error states for missing/invalid fields.

1. Add release identification from image (best-effort)

- Use LLM vision to extract likely `artist`, `title`, and optional `catalog_number` from cover photo.
- Return low-confidence fallback when extraction is uncertain.

1. Integrate Discogs data retrieval

- Use extracted hints to call Discogs search.
- Pick top candidate and fetch key fields for MVP:
  - release title/artist/year/label
  - community rating + want/have counts
  - marketplace stats (lowest/median/highest when available)
  - optionally recent sale history if endpoint access allows

1. Implement LLM evaluation layer

- Construct a strict prompt with:
  - user inputs (`asking_price`, `condition`)
  - extracted metadata + confidence
  - Discogs market data
- Ask for structured JSON output:
  - `recommendation` (`buy`, `consider`, `skip`)
  - `fair_price_range`
  - `confidence`
  - `key_reasons` (3-5 bullets)
  - `risks`

1. Build minimal result UI

- Display release match, market stats, and recommendation card.
- Show transparent “why” bullets and confidence label.
- Add fallback UI when matching fails (ask user to retry with clearer photo).

1. Add basic hardening for MVP trials

- Rate-limit analyze endpoint lightly.
- Add request/response logging (without sensitive key data).
- Add a short disclaimer: “informational, not financial advice.”

1. Test plan and launch

- Manual test cases: clear cover, blurry cover, missing price, unknown release.
- Verify Discogs quota/error handling.
- Deploy to Vercel (or equivalent) with env vars.

## Suggested Initial File Map

- `[/Users/joachimdemuth/Documents/apps/should-i-buy/package.json](/Users/joachimdemuth/Documents/apps/should-i-buy/package.json)`
- `[/Users/joachimdemuth/Documents/apps/should-i-buy/.env.example](/Users/joachimdemuth/Documents/apps/should-i-buy/.env.example)`
- `[/Users/joachimdemuth/Documents/apps/should-i-buy/src/app/page.tsx](/Users/joachimdemuth/Documents/apps/should-i-buy/src/app/page.tsx)`
- `[/Users/joachimdemuth/Documents/apps/should-i-buy/src/app/api/analyze/route.ts](/Users/joachimdemuth/Documents/apps/should-i-buy/src/app/api/analyze/route.ts)`
- `[/Users/joachimdemuth/Documents/apps/should-i-buy/src/lib/discogs.ts](/Users/joachimdemuth/Documents/apps/should-i-buy/src/lib/discogs.ts)`
- `[/Users/joachimdemuth/Documents/apps/should-i-buy/src/lib/evaluator.ts](/Users/joachimdemuth/Documents/apps/should-i-buy/src/lib/evaluator.ts)`
- `[/Users/joachimdemuth/Documents/apps/should-i-buy/src/lib/types.ts](/Users/joachimdemuth/Documents/apps/should-i-buy/src/lib/types.ts)`

## MVP Success Criteria

- User can upload a photo and get a recommendation in one flow.
- App surfaces Discogs-derived pricing context + rationale.
- Failures are understandable and recoverable (no blank errors).
- Setup is simple enough to run locally with only env keys configured.

