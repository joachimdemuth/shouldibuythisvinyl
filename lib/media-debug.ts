/**
 * Opt-in server logs for LLM vision, artwork candidates, and Spotify search.
 * Set `DEBUG_SHOULD_I_BUY=true` in `.env.local` to enable.
 */

export function isMediaDebugEnabled(): boolean {
  return process.env.DEBUG_SHOULD_I_BUY?.trim() === "true";
}

export function mediaDebug(
  channel: "llm" | "artwork" | "spotify",
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!isMediaDebugEnabled()) return;
  const payload = data ? { ...data } : {};
  console.info(`[should-i-buy:${channel}] ${message}`, payload);
}
