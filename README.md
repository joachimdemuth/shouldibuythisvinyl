# Should I Buy This Vinyl? (MVP)

Minimal single-user web app that:

1. Accepts a vinyl cover image (+ optional asking price and condition)
2. Extracts likely release hints with vision
3. Pulls Discogs market context
4. Generates a structured LLM recommendation (`buy`, `consider`, `skip`)

## Setup

1. Copy env template:

```bash
cp .env.example .env.local
```

1. Fill in keys in `.env.local`:

- `DISCOGS_KEY`
- `DISCOGS_SECRET`
- `LLM_API_KEY`

Optional:

- `DEBUG_SHOULD_I_BUY=true` — log `[should-i-buy:llm]`, `[should-i-buy:artwork]`, and `[should-i-buy:spotify]` lines to the server console (vision output, iconic-cover guesses, Discogs ranking, Spotify queries and failure reasons)

- `LLM_BASE_URL` (defaults to `https://api.openai.com/v1`)
- `LLM_MODEL` (defaults to `gpt-4o-mini`)
- `LLM_VISION_MODEL` — if set, used only for cover OCR (often `gpt-4o` for difficult sleeves; otherwise `LLM_MODEL` is used)
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for Spotify pre-listen embeds

1. Run app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Health check

`GET /api/health` returns JSON with `ok`, `status`, and booleans for configured services (`discogs`, `llm`, `spotify`). Use it after deploy to confirm `DISCOGS_KEY` / `DISCOGS_SECRET` are present (required). A `503` means Discogs credentials are missing.

## Artwork-only front cover

If the front has **no readable text**, the app tries **barcode**, **manual artist/title**, **spine/back OCR**, then a **vision pass** that returns **one or more candidate albums** (iconic-cover recognition—this is not a web search). Each candidate is **verified on Discogs** and ranked using LLM confidence plus catalog text match. If one release clearly wins, it is auto-selected; if several stay close, you **pick the release** in the UI. Generic artwork still needs barcode or typed/spine text. After you upload the front once, you can add details and **Search again** without a new photo.

## Wrong release on the details step

If the cover scan matched the wrong pressing, use **Search Discogs** on the details screen, open the correct release, copy the numeric ID from the URL, paste it into **Discogs release ID**, and **Load this release**. Analysis then uses that release’s market data.

## Pre-release verification

Run through this once before shipping or after changing APIs:

1. `npm run lint` and `npm run build` succeed locally (mirrors CI).
2. `GET /api/health` returns `"ok": true` in the target environment.
3. **Identify**: upload a clear cover image (or use the camera on HTTPS); you reach the details step with artist/title.
4. **Manual override** (optional): load a known Discogs release ID and confirm the header updates.
5. **Analyze**: submit with optional price/condition; you get a recommendation and market stats.
6. **Spotify** (optional): confirm an embed or the fallback “Open in Spotify” link if credentials are set.

CI runs `lint` and `build` on pushes and pull requests to `main` / `master`.