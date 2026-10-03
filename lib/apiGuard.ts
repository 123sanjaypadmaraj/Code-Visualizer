/** First address in x-forwarded-for (or "unknown"). Used only as a rate-limit key, never logged. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

/** Positive number from an env var, else the fallback. */
export function limitFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
