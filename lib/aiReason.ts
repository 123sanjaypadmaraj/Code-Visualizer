/** Short, human label for why /api/complete failed (HTTP status + the route's error message). */
export function aiFailureReason(status: number, message: string): string {
  if (status === 429 && /too many/i.test(message)) return "too many requests, slow down";
  if (status === 413) return "code too long";
  if (/not set/i.test(message)) return "API key missing, restart dev server";
  if (/timed out/i.test(message) && !/\b(4\d\d|5\d\d)\b/.test(message)) return "timed out";
  if (/429|quota|rate/i.test(message)) return "AI provider rate limit";
  if (/\b(401|403)\b/.test(message)) return "API key rejected";
  if (status >= 500) return "AI providers failed";
  return `error ${status}`;
}
