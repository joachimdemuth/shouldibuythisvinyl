import { convertDiscogsContextToCurrency } from "@/lib/currency";
import { NextRequest, NextResponse } from "next/server";
import { fetchDiscogsContext } from "@/lib/discogs";
import { getEnvConfig } from "@/lib/env";
import { evaluateBuyRecommendation } from "@/lib/evaluator";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchSpotifyPreview } from "@/lib/spotify";
import {
  CONDITIONS,
  IdentifyResult,
  RecordCondition,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "@/lib/types";
import { extractReleaseHintsFromImage } from "@/lib/vision";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function isValidCondition(value?: string): value is RecordCondition {
  return Boolean(value && CONDITIONS.includes(value as RecordCondition));
}

function parseOptionalPrice(value?: string): number | undefined {
  if (!value || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Asking price must be a positive number.");
  }
  return parsed;
}

function parseOptionalBarcode(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 14) {
    throw new Error("Barcode must be between 8 and 14 digits.");
  }
  return digitsOnly;
}

function parseCurrency(value?: string): SupportedCurrency {
  const normalized = (value ?? "USD").trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(normalized as SupportedCurrency)) {
    return normalized as SupportedCurrency;
  }
  throw new Error("Unsupported currency.");
}

function parseOptionalLlmApiKey(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalIdentified(value?: string): IdentifyResult | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as IdentifyResult;
    if (!parsed?.discogs?.release) return undefined;
    return parsed;
  } catch {
    throw new Error("Invalid identified album payload.");
  }
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.ANALYZE_DISABLED?.trim() === "true") {
      return NextResponse.json(
        {
          error:
            "Analysis is temporarily disabled. Please try again later.",
        },
        { status: 503 },
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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

    const priceRaw = formData.get("price");
    const conditionRaw = formData.get("condition");
    const barcodeRaw = formData.get("barcode");
    const currencyRaw = formData.get("currency");
    const llmApiKeyRaw = formData.get("llmApiKey");
    const identifiedRaw = formData.get("identified");
    const price = parseOptionalPrice(
      typeof priceRaw === "string" ? priceRaw : undefined,
    );
    const barcode = parseOptionalBarcode(
      typeof barcodeRaw === "string" ? barcodeRaw : undefined,
    );
    const currency = parseCurrency(
      typeof currencyRaw === "string" ? currencyRaw : undefined,
    );
    const llmApiKey = parseOptionalLlmApiKey(
      typeof llmApiKeyRaw === "string" ? llmApiKeyRaw : undefined,
    );
    const identified = parseOptionalIdentified(
      typeof identifiedRaw === "string" ? identifiedRaw : undefined,
    );
    const effectiveLlmApiKey = llmApiKey ?? env.llmApiKey;
    if (!effectiveLlmApiKey) {
      throw new Error(
        "No OpenAI key found. Add LLM_API_KEY to env or enter your key in the form.",
      );
    }

    const conditionValue =
      typeof conditionRaw === "string" && conditionRaw.trim() !== ""
        ? conditionRaw.trim()
        : undefined;
    if (conditionValue && !isValidCondition(conditionValue)) {
      return NextResponse.json({ error: "Invalid condition value." }, { status: 400 });
    }
    const condition = isValidCondition(conditionValue)
      ? conditionValue
      : undefined;

    let vision = identified?.vision;
    let rawDiscogs = identified?.discogs;
    let spotify = identified?.spotify;

    if (!vision || !rawDiscogs) {
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

      const imageBuffer = new Uint8Array(await image.arrayBuffer());
      console.info("[analyze] Request received", {
        hasPrice: typeof price === "number",
        hasCondition: Boolean(condition),
        hasBarcode: Boolean(barcode),
        hasRequestLlmKey: Boolean(llmApiKey),
        hasIdentifiedPayload: Boolean(identified),
        currency,
        imageSize: image.size,
        imageType: image.type,
      });

      vision = await extractReleaseHintsFromImage({
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
      rawDiscogs = rawDiscogsPrimary;

      if (!rawDiscogs.release && barcode && vision.barcode && vision.barcode !== barcode) {
        const visionBarcodeDiscogs = await fetchDiscogsContext({
          artist: vision.artist,
          title: vision.title,
          catalogNumber: vision.catalogNumber,
          barcode: vision.barcode,
          discogsKey: env.discogsKey,
          discogsSecret: env.discogsSecret,
        });
        if (visionBarcodeDiscogs.release) {
          rawDiscogs = visionBarcodeDiscogs;
        }
      }

      if (!rawDiscogs.release && barcode) {
        const textOnlyDiscogs = await fetchDiscogsContext({
          artist: vision.artist,
          title: vision.title,
          catalogNumber: vision.catalogNumber,
          barcode: undefined,
          discogsKey: env.discogsKey,
          discogsSecret: env.discogsSecret,
        });
        if (textOnlyDiscogs.release) {
          rawDiscogs = textOnlyDiscogs;
        }
      }

      spotify =
        (await fetchSpotifyPreview({
        artist: rawDiscogs.release?.artist ?? vision.artist,
        title: rawDiscogs.release?.title ?? vision.title,
        })) ?? undefined;
    }

    if (!vision) {
      throw new Error("Could not build release metadata from this image.");
    }
    if (!rawDiscogs) {
      throw new Error("Could not load release market data.");
    }
    const discogs = await convertDiscogsContextToCurrency({
      discogs: rawDiscogs,
      targetCurrency: currency,
    });
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

    const evaluation = await evaluateBuyRecommendation({
      askingPrice: price,
      currency,
      condition,
      vision,
      discogs,
      llmApiKey: effectiveLlmApiKey,
      llmBaseUrl: env.llmBaseUrl,
      llmModel: env.llmModel,
    });

    return NextResponse.json({
      input: {
        askingPrice: price,
        currency,
        condition,
        barcode,
      },
      vision,
      discogs,
      spotify,
      evaluation,
      disclaimer: "Informational only. Not financial advice.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while analyzing record.";
    console.error("[analyze] Failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
