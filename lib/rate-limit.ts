const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;

const requestLog = new Map<string, number[]>();

export function checkRateLimit(key: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const prev = requestLog.get(key) ?? [];
  const active = prev.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - active[0])) / 1000);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  active.push(now);
  requestLog.set(key, active);
  return { ok: true };
}
