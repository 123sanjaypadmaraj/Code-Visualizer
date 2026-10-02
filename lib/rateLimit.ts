/**
 * Simple in-memory sliding-window rate limiter.
 * NOTE: state lives in one server instance. On Vercel each serverless instance has its own
 * counters, so this is best-effort protection against casual abuse, not a hard guarantee.
 */
const hits = new Map<string, number[]>();

export function limitPerMinute(): number {
  const n = Number(process.env.RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function checkRateLimit(key: string, limit = limitPerMinute(), now = Date.now(), windowMs = 60_000): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // keep the map from growing forever
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

export function resetRateLimit() {
  hits.clear();
}
