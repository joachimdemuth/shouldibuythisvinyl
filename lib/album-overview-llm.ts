import type { DiscogsContext, VisionHints } from "@/lib/types";

interface ChatCompletionChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeOverview(value: unknown): {
  albumReview: string;
  artistNote: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const albumReview =
    typeof obj.albumReview === "string" ? obj.albumReview.trim() : "";
  const artistNote =
    typeof obj.artistNote === "string" ? obj.artistNote.trim() : "";
  if (!albumReview && !artistNote) return null;
  return { albumReview, artistNote };
}

export async function generateAlbumOverviewText(args: {
  vision: VisionHints;
  discogs: DiscogsContext;
  spotifyTrackOrAlbumName?: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
}): Promise<{ albumReview: string; artistNote: string }> {
  const {
    vision,
    discogs,
    spotifyTrackOrAlbumName,
    llmApiKey,
    llmBaseUrl,
    llmModel,
  } = args;

  const url = `${llmBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const payload = {
    vision,
    discogs,
    spotifyMatchName: spotifyTrackOrAlbumName,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmApiKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write short, factual-sounding music context for a vinyl app. Do not give buying advice or mention price. Return JSON only with keys: albumReview (2-4 sentences about this album: style, reputation, why it matters), artistNote (2-3 sentences about the artist/band context). If unsure, stay generic and cautious.",
        },
        {
          role: "user",
          content: `Summarize this release for a collector browsing Discogs metadata:\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      albumReview: "",
      artistNote: "",
    };
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    return { albumReview: "", artistNote: "" };
  }

  const parsed = safeJsonParse<unknown>(raw);
  const normalized = normalizeOverview(parsed);
  if (!normalized) {
    return { albumReview: "", artistNote: "" };
  }

  return normalized;
}
