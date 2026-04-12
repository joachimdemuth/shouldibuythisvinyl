import { NextRequest, NextResponse } from "next/server";
import { generateAlbumOverviewText } from "@/lib/album-overview-llm";
import {
  fetchArtistOtherReleases,
  fetchPrimaryArtistIdForRelease,
} from "@/lib/discogs";
import { getEnvConfig } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ArtistReleaseSummary, IdentifyResult } from "@/lib/types";

function parseOptionalLlmApiKey(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseIdentifyPayload(value?: string): IdentifyResult | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as IdentifyResult;
    if (!parsed?.discogs?.release) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.ANALYZE_DISABLED?.trim() === "true") {
      return NextResponse.json(
        { error: "This action is temporarily disabled. Please try again later." },
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

    const env = getEnvConfig();
    const formData = await request.formData();
    const identifiedRaw = formData.get("identified");
    const llmApiKeyRaw = formData.get("llmApiKey");

    const identified = parseIdentifyPayload(
      typeof identifiedRaw === "string" ? identifiedRaw : undefined,
    );
    if (!identified?.discogs.release) {
      return NextResponse.json(
        { error: "Invalid or missing identified album payload." },
        { status: 400 },
      );
    }

    const release = identified.discogs.release;

    const llmApiKey = parseOptionalLlmApiKey(
      typeof llmApiKeyRaw === "string" ? llmApiKeyRaw : undefined,
    );
    const effectiveLlmKey = llmApiKey ?? env.llmApiKey;

    let artistId = release.primaryArtistId;
    if (!artistId && release.id) {
      artistId = await fetchPrimaryArtistIdForRelease({
        releaseId: release.id,
        discogsKey: env.discogsKey,
        discogsSecret: env.discogsSecret,
      });
    }

    let otherReleases: ArtistReleaseSummary[] = [];
    if (artistId) {
      otherReleases = await fetchArtistOtherReleases({
        artistId,
        excludeReleaseId: release.id,
        discogsKey: env.discogsKey,
        discogsSecret: env.discogsSecret,
        limit: 10,
      });
    }

    let albumReview: string | null = null;
    let artistNote: string | null = null;
    let overviewLlmError: string | undefined;

    if (effectiveLlmKey) {
      try {
        const text = await generateAlbumOverviewText({
          vision: identified.vision,
          discogs: identified.discogs,
          spotifyTrackOrAlbumName: identified.spotify?.name,
          llmApiKey: effectiveLlmKey,
          llmBaseUrl: env.llmBaseUrl,
          llmModel: env.llmModel,
        });
        albumReview = text.albumReview || null;
        artistNote = text.artistNote || null;
        if (!albumReview && !artistNote) {
          overviewLlmError = "We couldn’t write a short summary just now. You can try again in a moment.";
        }
      } catch {
        overviewLlmError = "Something went wrong while writing the summary.";
      }
    } else {
      overviewLlmError =
        "Add an API key where the field appears to unlock short album and artist notes.";
    }

    return NextResponse.json({
      albumReview,
      artistNote,
      overviewLlmError,
      otherReleases,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error while loading overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
