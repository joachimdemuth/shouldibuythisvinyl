import { NextResponse } from "next/server";

/**
 * Lightweight readiness check for deploys and monitoring.
 * Does not expose secret values.
 */
export async function GET() {
  const hasDiscogs =
    Boolean(process.env.DISCOGS_KEY?.trim()) &&
    Boolean(process.env.DISCOGS_SECRET?.trim());
  const hasLlm = Boolean(process.env.LLM_API_KEY?.trim());
  const hasSpotify =
    Boolean(process.env.SPOTIFY_CLIENT_ID?.trim()) &&
    Boolean(process.env.SPOTIFY_CLIENT_SECRET?.trim());

  const ok = hasDiscogs;

  return NextResponse.json(
    {
      ok,
      status: ok ? "ready" : "misconfigured",
      checks: {
        discogs: hasDiscogs,
        llm: hasLlm,
        spotify: hasSpotify,
      },
    },
    { status: ok ? 200 : 503 },
  );
}
