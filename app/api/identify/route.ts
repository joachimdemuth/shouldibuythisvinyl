import { NextRequest, NextResponse } from "next/server";
import { fetchDiscogsContext } from "@/lib/discogs";
import { getEnvConfig } from "@/lib/env";
import { resolveArtworkInference } from "@/lib/artwork-candidates";
import {
  buildMergedVisionFromForm,
  canSearchDiscogs,
} from "@/lib/identify-merge";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchSpotifyPreview } from "@/lib/spotify";

function parseOptionalBarcode(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 14) {
    throw new Error("Barcode must be between 8 and 14 digits.");
  }
  return digitsOnly;
}

function parseOptionalLlmApiKey(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

    const env = getEnvConfig();
    const formData = await request.formData();

    const barcodeRaw = formData.get("barcode");
    const llmApiKeyRaw = formData.get("llmApiKey");
    const barcode = parseOptionalBarcode(
      typeof barcodeRaw === "string" ? barcodeRaw : undefined,
    );
    const llmApiKey = parseOptionalLlmApiKey(
      typeof llmApiKeyRaw === "string" ? llmApiKeyRaw : undefined,
    );
    const effectiveLlmApiKey = llmApiKey ?? env.llmApiKey;
    if (!effectiveLlmApiKey) {
      throw new Error(
        "No OpenAI key found. Add LLM_API_KEY to env or enter your key in the form.",
      );
    }

    const visionCtx = {
      effectiveLlmApiKey,
      llmBaseUrl: env.llmBaseUrl,
      llmModel: env.llmModel,
      llmVisionModel: env.llmVisionModel,
    };

    let vision;
    let coverBuffer: Uint8Array;
    let coverMime: string;
    try {
      const merged = await buildMergedVisionFromForm(formData, visionCtx);
      vision = merged.vision;
      coverBuffer = merged.coverBuffer;
      coverMime = merged.coverMime;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid identify request.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!canSearchDiscogs(vision, barcode)) {
      const resolved = await resolveArtworkInference({
        vision,
        coverBuffer,
        coverMime,
        ctx: visionCtx,
        discogsKey: env.discogsKey,
        discogsSecret: env.discogsSecret,
      });
      if (resolved.status === "merged") {
        vision = resolved.vision;
      } else if (resolved.status === "choose") {
        return NextResponse.json({
          chooseRelease: true,
          options: resolved.options,
          vision: resolved.baseVision,
        });
      }
    }

    if (!canSearchDiscogs(vision, barcode)) {
      return NextResponse.json(
        {
          error:
            "Could not identify this record yet: nothing to search Discogs with. Add a spine/back photo, type artist and album, scan a barcode—or use a very distinctive cover the model may recognize. Generic artwork cannot be matched automatically.",
        },
        { status: 404 },
      );
    }

    const matchHints = {
      artist: vision.artist,
      title: vision.title,
      year: vision.year,
    };

    const rawDiscogsPrimary = await fetchDiscogsContext({
      artist: vision.artist,
      title: vision.title,
      catalogNumber: vision.catalogNumber,
      barcode: barcode ?? vision.barcode,
      discogsKey: env.discogsKey,
      discogsSecret: env.discogsSecret,
      matchHints,
    });
    let discogs = rawDiscogsPrimary;

    if (!discogs.release && barcode && vision.barcode && vision.barcode !== barcode) {
      const visionBarcodeDiscogs = await fetchDiscogsContext({
        artist: vision.artist,
        title: vision.title,
        catalogNumber: vision.catalogNumber,
        barcode: vision.barcode,
        discogsKey: env.discogsKey,
        discogsSecret: env.discogsSecret,
        matchHints,
      });
      if (visionBarcodeDiscogs.release) discogs = visionBarcodeDiscogs;
    }

    if (!discogs.release && barcode) {
      const textOnlyDiscogs = await fetchDiscogsContext({
        artist: vision.artist,
        title: vision.title,
        catalogNumber: vision.catalogNumber,
        barcode: undefined,
        discogsKey: env.discogsKey,
        discogsSecret: env.discogsSecret,
        matchHints,
      });
      if (textOnlyDiscogs.release) discogs = textOnlyDiscogs;
    }

    if (!discogs.release) {
      return NextResponse.json(
        {
          error:
            discogs.searchNotes ??
            "Album could not be identified from the photo. Try a clearer image.",
        },
        { status: 404 },
      );
    }

    const spotify = await fetchSpotifyPreview({
      artist: discogs.release.artist,
      title: discogs.release.title,
      year: discogs.release.year,
    });

    return NextResponse.json({ vision, discogs, spotify });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error while identifying album.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
