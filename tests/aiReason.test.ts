import { describe, expect, it } from "vitest";
import { aiFailureReason } from "../lib/aiReason";

describe("aiFailureReason", () => {
  it("maps common failures to short labels", () => {
    expect(aiFailureReason(429, "Too many suggestions requested")).toBe("slow down");
    expect(aiFailureReason(502, "Groq 429: rate limit | Gemini 429: quota")).toBe("rate limited");
    expect(aiFailureReason(502, "Groq timed out | Gemini timed out")).toBe("timed out");
    expect(aiFailureReason(502, "No AI provider API key is set (see .env.example)")).toBe("no API key");
    expect(aiFailureReason(502, "Groq 401: bad key")).toBe("key rejected");
    expect(aiFailureReason(413, "Code too long")).toBe("code too long");
    expect(aiFailureReason(500, "boom")).toBe("providers failed");
  });
});
