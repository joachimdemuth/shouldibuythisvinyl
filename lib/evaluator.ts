import {
  DiscogsContext,
  EvaluationOutput,
  RecordCondition,
  SupportedCurrency,
  VisionHints,
} from "@/lib/types";

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

function fallbackEvaluation(reason: string): EvaluationOutput {
  return {
    recommendation: "consider",
    fairPriceRange: {},
    confidence: 0.35,
    keyReasons: [
      "Could not run full valuation, so this is a cautious fallback.",
      "Try again with a clearer cover photo and optional asking price.",
    ],
    risks: [reason],
  };
}

function normalizeEvaluation(value: unknown): EvaluationOutput | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  const recommendation = obj.recommendation;
  if (
    recommendation !== "buy" &&
    recommendation !== "consider" &&
    recommendation !== "skip"
  ) {
    return null;
  }

  const fairPriceRangeRaw =
    obj.fairPriceRange && typeof obj.fairPriceRange === "object"
      ? (obj.fairPriceRange as Record<string, unknown>)
      : {};

  const keyReasons = Array.isArray(obj.keyReasons)
    ? obj.keyReasons.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
  const risks = Array.isArray(obj.risks)
    ? obj.risks.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];

  return {
    recommendation,
    fairPriceRange: {
      min:
        typeof fairPriceRangeRaw.min === "number"
          ? fairPriceRangeRaw.min
          : undefined,
      max:
        typeof fairPriceRangeRaw.max === "number"
          ? fairPriceRangeRaw.max
          : undefined,
      currency:
        typeof fairPriceRangeRaw.currency === "string"
          ? fairPriceRangeRaw.currency
          : undefined,
    },
    confidence:
      typeof obj.confidence === "number"
        ? Math.min(Math.max(obj.confidence, 0), 1)
        : 0.4,
    keyReasons: keyReasons.length > 0 ? keyReasons : ["Limited data was available."],
    risks: risks.length > 0 ? risks : ["Metadata match may be imperfect."],
  };
}

export async function evaluateBuyRecommendation(args: {
  askingPrice?: number;
  currency: SupportedCurrency;
  condition?: RecordCondition;
  vision: VisionHints;
  discogs: DiscogsContext;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
}): Promise<EvaluationOutput> {
  const { askingPrice, currency, condition, vision, discogs, llmApiKey, llmBaseUrl, llmModel } =
    args;

  const url = `${llmBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const promptPayload = {
    askingPrice,
    currency,
    condition,
    vision,
    discogs,
  };

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
            "You evaluate whether buying a vinyl listing is sensible using available evidence. Return JSON only with keys: recommendation (buy|consider|skip), fairPriceRange {min,max,currency}, confidence (0-1), keyReasons (3-5 strings), risks (1-4 strings).",
        },
        {
          role: "user",
          content: `Evaluate this vinyl listing data:\n${JSON.stringify(promptPayload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return fallbackEvaluation(`Evaluator call failed (${response.status}).`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    return fallbackEvaluation("Evaluator returned no content.");
  }

  const parsed = safeJsonParse<unknown>(raw);
  const normalized = normalizeEvaluation(parsed);
  if (!normalized) {
    return fallbackEvaluation("Evaluator returned malformed JSON.");
  }

  return normalized;
}
