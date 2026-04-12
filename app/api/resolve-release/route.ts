import { NextRequest, NextResponse } from "next/server";
import { fetchDiscogsContextByReleaseId } from "@/lib/discogs";
import { getEnvConfig } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchSpotifyPreview } from "@/lib/spotify";
import type { IdentifyResult, VisionHints } from "@/lib/types";

function visionFromManualRelease(
  artist: string,
  title: string,
): VisionHints {
  return {
    artist,
    title,
    confidence: 1,
    notes: "Release selected manually via Discogs release ID.",
  };
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.ANALYZE_DISABLED?.trim() === "true") {
      return NextResponse.json(
        { error: "Analysis is temporarily disabled. Please try again later." },
        { status: 503 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const rate = checkRateLimit(ipAddress);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait and try again." },
        {
          status: 429,
          headers: rate.retryAfter
            ? { "Retry-After": String(rate.retryAfter) }
            : undefined,
        },
      );
    }

    getEnvConfig();

    const formData = await request.formData();
    const raw = formData.get("discogsReleaseId");
    const idString = typeof raw === "string" ? raw.trim() : "";
    const releaseId = Number.parseInt(idString, 10);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return NextResponse.json(
        { error: "Enter a valid Discogs release ID (positive number)." },
        { status: 400 },
      );
    }

    const discogs = await fetchDiscogsContextByReleaseId(releaseId);
    if (!discogs.release) {
      return NextResponse.json(
        {
          error:
            discogs.searchNotes ??
            "Could not load that Discogs release. Check the ID and try again.",
        },
        { status: 404 },
      );
    }

    const vision = visionFromManualRelease(
      discogs.release.artist,
      discogs.release.title,
    );

    const spotify = await fetchSpotifyPreview({
      artist: discogs.release.artist,
      title: discogs.release.title,
      year: discogs.release.year,
    });

    const payload: IdentifyResult = {
      vision,
      discogs,
      spotify: spotify ?? undefined,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while loading release.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
