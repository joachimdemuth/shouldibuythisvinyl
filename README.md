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

2. Fill in keys in `.env.local`:

- `DISCOGS_KEY`
- `DISCOGS_SECRET`
- `LLM_API_KEY`

Optional:

- `LLM_BASE_URL` (defaults to `https://api.openai.com/v1`)
- `LLM_MODEL` (defaults to `gpt-4o-mini`)
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for Spotify pre-listen embeds

3. Run app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

