import { mediaDebug } from "@/lib/media-debug";
import { VisionHints } from "@/lib/types";

interface ChatCompletionChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

function normalizeBarcode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 14) return undefined;
  return digitsOnly;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseOptionalYear(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const y = Math.round(value);
    const current = new Date().getFullYear();
    if (y >= 1900 && y <= current + 1) return y;
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4})/);
    if (m) {
      const y = Number.parseInt(m[1], 10);
      const current = new Date().getFullYear();
      if (y >= 1900 && y <= current + 1) return y;
    }
  }
  return undefined;
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function normalizeVisionHints(value: unknown): VisionHints | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.min(Math.max(parsed.confidence, 0), 1)
      : 0.2;

  return {
    artist: optionalTrimmedString(parsed.artist),
    title: optionalTrimmedString(parsed.title),
    year: parseOptionalYear(parsed.year),
    catalogNumber: optionalTrimmedString(parsed.catalogNumber),
    barcode: normalizeBarcode(parsed.barcode),
    confidence,
    notes: optionalTrimmedString(parsed.notes),
  };
}

export async function extractReleaseHintsFromImage(args: {
  imageBytes: Uint8Array;
  mimeType: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  /** Overrides `llmModel` for this vision-only request when set (e.g. gpt-4o). */
  llmVisionModel?: string;
  /** Front cover vs spine/back — different prompts (text is often only on spine). */
  surface?: "cover" | "spine_or_back";
}): Promise<VisionHints> {
  const {
    imageBytes,
    mimeType,
    llmApiKey,
    llmBaseUrl,
    llmModel,
    llmVisionModel,
    surface = "cover",
  } = args;
  const modelForVision = llmVisionModel ?? llmModel;
  const isSpine = surface === "spine_or_back";

  const base64Image = Buffer.from(imageBytes).toString("base64");
  const url = `${llmBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmApiKey}`,
    },
    body: JSON.stringify({
      model: modelForVision,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: isSpine
            ? "You read vinyl packaging where the text usually appears: spine (often vertical), back cover, inner sleeve, or hype sticker. Reply with JSON only. Keys: artist (string|null), title (string|null), year (number|null), catalogNumber (string|null), barcode (string|null, digits only), confidence (0-1), notes (string|null). Infer artist and album title from spine or back even if rotated or stacked. Barcodes and catalog codes are often on the back. Never invent a barcode."
            : "You read the FRONT of a vinyl record sleeve. Reply with JSON only. Keys: artist (string|null), title (string|null), year (number|null), catalogNumber (string|null), barcode (string|null, digits only), confidence (0-1), notes (string|null). Rules: artist = primary credited performer as printed on the front. title = album title as printed on the front. If the front is only artwork or a photo with NO legible artist or album title on that face, set artist and title to null and briefly describe what you see in notes. If this is a soundtrack or Various Artists compilation, set artist accordingly. Never invent a barcode.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: isSpine
                ? "Read this image of a vinyl spine, back cover, inner sleeve, or sticker. Extract artist, album title, year if printed, catalog number, and barcode digits. Spine lettering may run top-to-bottom."
                : "Read this vinyl FRONT cover. Extract main artist and album title only if clearly printed on this face. If there is no title or artist on the front, leave those null.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    mediaDebug("llm", `extractReleaseHints ${surface}: chat HTTP ${response.status}`, {
      model: modelForVision,
    });
    return {
      confidence: 0.2,
      notes: `Vision extraction unavailable (${response.status}).`,
    };
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    mediaDebug("llm", `extractReleaseHints ${surface}: empty message`, {
      model: modelForVision,
    });
    return { confidence: 0.2, notes: "No vision result from model." };
  }

  const parsed = safeJsonParse<unknown>(raw);
  const normalized = normalizeVisionHints(parsed);
  if (!normalized) {
    mediaDebug("llm", `extractReleaseHints ${surface}: JSON parse failed`, {
      model: modelForVision,
    });
    return { confidence: 0.2, notes: "Could not parse vision result." };
  }

  if (!normalized.artist && !normalized.title) {
    const lowText = {
      ...normalized,
      confidence: Math.min(normalized.confidence, 0.3),
      notes: normalized.notes ?? "Model could not confidently identify this cover.",
    };
    mediaDebug("llm", `extractReleaseHints ${surface}: no artist/title on image`, {
      model: modelForVision,
      confidence: lowText.confidence,
      notesPreview: lowText.notes?.slice(0, 200),
    });
    return lowText;
  }

  mediaDebug("llm", `extractReleaseHints ${surface}: OK`, {
    model: modelForVision,
    artist: normalized.artist,
    title: normalized.title,
    year: normalized.year,
    confidence: normalized.confidence,
    hasBarcode: Boolean(normalized.barcode),
    catalogNumber: normalized.catalogNumber,
  });
  return normalized;
}

export interface ArtworkInferenceResult {
  artist?: string;
  title?: string;
  confidence: number;
  notes?: string;
}

export interface ArtworkCandidate {
  artist: string;
  title: string;
  confidence: number;
  briefReason?: string;
  year?: number;
}

function parseArtworkCandidatesJson(value: unknown): ArtworkCandidate[] {
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  const raw = o.candidates;
  if (!Array.isArray(raw)) return [];
  const out: ArtworkCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const artist = optionalTrimmedString(row.inferredArtist);
    const title = optionalTrimmedString(row.inferredTitle);
    const conf =
      typeof row.confidence === "number"
        ? Math.min(Math.max(row.confidence, 0), 1)
        : 0;
    if (!artist?.trim() || !title?.trim() || conf < 0.22) continue;
    out.push({
      artist: artist.trim(),
      title: title.trim(),
      confidence: conf,
      briefReason: optionalTrimmedString(row.briefReason),
      year: parseOptionalYear(row.year),
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 5);
}

/**
 * Iconic-cover pass: returns **ranked candidates** (often 1). Multiple rows when the
 * artwork could plausibly match more than one famous release.
 */
export async function inferReleaseCandidatesFromIconicArtwork(args: {
  imageBytes: Uint8Array;
  mimeType: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmVisionModel?: string;
}): Promise<ArtworkCandidate[]> {
  const {
    imageBytes,
    mimeType,
    llmApiKey,
    llmBaseUrl,
    llmModel,
    llmVisionModel,
  } = args;
  const modelForVision = llmVisionModel ?? llmModel;

  const base64Image = Buffer.from(imageBytes).toString("base64");
  const url = `${llmBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmApiKey}`,
    },
    body: JSON.stringify({
      model: modelForVision,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify music album covers from visual memory. The image is a vinyl FRONT that may have NO readable artist or album title (artwork or photo only). Reply with JSON only. Key: candidates (array, max 5). Each element: inferredArtist (string), inferredTitle (string), confidence (0-1), briefReason (string, optional). Rules: Include every DISTINCT famous commercial album this could reasonably be if you recognize iconic artwork; sort by confidence descending. If only one release matches, use an array of length 1. If the image is generic, abstract, or unknown, use an empty array []. Do not invent names—only releases you associate with this exact visual. Never read text from the image.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "List candidate albums this cover could be, from most to least likely. Empty array if none.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    mediaDebug("llm", `inferReleaseCandidates: chat HTTP ${response.status}`, {
      model: modelForVision,
    });
    return [];
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    mediaDebug("llm", "inferReleaseCandidates: empty message", {
      model: modelForVision,
    });
    return [];
  }

  const parsed = safeJsonParse<unknown>(raw);
  const list = parseArtworkCandidatesJson(parsed);
  mediaDebug("llm", "inferReleaseCandidates: iconic-cover guesses (before Discogs)", {
    model: modelForVision,
    count: list.length,
    candidates: list.map((c) => ({
      artist: c.artist,
      title: c.title,
      confidence: Math.round(c.confidence * 1000) / 1000,
      briefReason: c.briefReason,
    })),
  });
  return list;
}

/** @deprecated Prefer inferReleaseCandidatesFromIconicArtwork; kept for callers expecting one row. */
export async function inferReleaseFromIconicArtwork(args: {
  imageBytes: Uint8Array;
  mimeType: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmVisionModel?: string;
}): Promise<ArtworkInferenceResult | null> {
  const list = await inferReleaseCandidatesFromIconicArtwork(args);
  const first = list[0];
  if (!first || first.confidence < 0.52) return null;
  return {
    artist: first.artist,
    title: first.title,
    confidence: first.confidence,
    notes: first.briefReason,
  };
}
