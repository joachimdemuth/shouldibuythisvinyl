import { NextRequest, NextResponse } from "next/server";
import { fetchDiscogsContext } from "@/lib/discogs";
import { getEnvConfig } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchSpotifyPreview } from "@/lib/spotify";
import { extractReleaseHintsFromImage } from "@/lib/vision";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

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
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image is required." }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Uploaded file must be an image." },
        { status: 400 },
      );
    }
    if (image.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Max size is 8MB." },
        { status: 400 },
      );
    }

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

    const imageBuffer = new Uint8Array(await image.arrayBuffer());
    const vision = await extractReleaseHintsFromImage({
      imageBytes: imageBuffer,
      mimeType: image.type,
      llmApiKey: effectiveLlmApiKey,
      llmBaseUrl: env.llmBaseUrl,
      llmModel: env.llmModel,
    });

    const rawDiscogsPrimary = await fetchDiscogsContext({
      artist: vision.artist,
      title: vision.title,
      catalogNumber: vision.catalogNumber,
      barcode: barcode ?? vision.barcode,
      discogsKey: env.discogsKey,
      discogsSecret: env.discogsSecret,
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
    });

    return NextResponse.json({ vision, discogs, spotify });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error while identifying album.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
