interface EnvConfig {
  discogsKey: string;
  discogsSecret: string;
  llmApiKey?: string;
  llmBaseUrl: string;
  llmModel: string;
  /** If set, used only for cover vision extraction (often `gpt-4o` for harder sleeves). */
  llmVisionModel?: string;
}

const missingEnvMessage =
  "Missing required env vars. Set DISCOGS_KEY and DISCOGS_SECRET.";

export function getEnvConfig(): EnvConfig {
  const discogsKey = process.env.DISCOGS_KEY?.trim() ?? "";
  const discogsSecret = process.env.DISCOGS_SECRET?.trim() ?? "";
  const llmApiKey = process.env.LLM_API_KEY?.trim() ?? "";
  const llmBaseUrl =
    process.env.LLM_BASE_URL?.trim() ?? "https://api.openai.com/v1";
  const llmModel = process.env.LLM_MODEL?.trim() ?? "gpt-4o-mini";
  const llmVisionModel = process.env.LLM_VISION_MODEL?.trim();

  if (!discogsKey || !discogsSecret) {
    throw new Error(missingEnvMessage);
  }

  return {
    discogsKey,
    discogsSecret,
    llmApiKey,
    llmBaseUrl,
    llmModel,
    llmVisionModel: llmVisionModel || undefined,
  };
}
