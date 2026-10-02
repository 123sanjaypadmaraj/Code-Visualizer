/** Short, human label for why an AI request failed (HTTP status + the route's error message). Kept short: it sits in a toolbar button. */
export function aiFailureReason(status: number, message: string): string {
  if (status === 429 && /too many/i.test(message)) return "slow down";
  if (status === 413) return "code too long";
  if (/not set|no ai provider/i.test(message)) return "no API key";
  if (/timed out/i.test(message) && !/\b(4\d\d|5\d\d)\b/.test(message)) return "timed out";
  if (/429|quota|rate/i.test(message)) return "rate limited";
  if (/\b(401|403)\b/.test(message)) return "key rejected";
  if (status >= 500) return "providers failed";
  return `error ${status}`;
}
