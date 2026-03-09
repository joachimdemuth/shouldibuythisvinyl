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

function normalizeVisionHints(value: unknown): VisionHints | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.min(Math.max(parsed.confidence, 0), 1)
      : 0.2;

  return {
    artist: typeof parsed.artist === "string" ? parsed.artist : undefined,
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    catalogNumber:
      typeof parsed.catalogNumber === "string" ? parsed.catalogNumber : undefined,
    barcode: normalizeBarcode(parsed.barcode),
    confidence,
    notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
  };
}

export async function extractReleaseHintsFromImage(args: {
  imageBytes: Uint8Array;
  mimeType: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
}): Promise<VisionHints> {
  const { imageBytes, mimeType, llmApiKey, llmBaseUrl, llmModel } = args;

  const base64Image = Buffer.from(imageBytes).toString("base64");
  const url = `${llmBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmApiKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Identify likely record metadata from a vinyl cover image. Respond only as JSON with keys artist, title, catalogNumber, barcode, confidence (0-1), notes.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract best-effort artist, title, catalog number, and visible barcode from this vinyl cover. If uncertain, lower confidence.",
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
    return {
      confidence: 0.2,
      notes: `Vision extraction unavailable (${response.status}).`,
    };
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    return { confidence: 0.2, notes: "No vision result from model." };
  }

  const parsed = safeJsonParse<unknown>(raw);
  const normalized = normalizeVisionHints(parsed);
  if (!normalized) {
    return { confidence: 0.2, notes: "Could not parse vision result." };
  }

  if (!normalized.artist && !normalized.title) {
    return {
      ...normalized,
      confidence: Math.min(normalized.confidence, 0.3),
      notes: normalized.notes ?? "Model could not confidently identify this cover.",
    };
  }

  return normalized;
}
