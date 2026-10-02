import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit } from "../lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(resetRateLimit);
  it("blocks after the limit within the window", () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit("a", 3, 1000)).toBe(true);
    expect(checkRateLimit("a", 3, 1001)).toBe(false);
  });
  it("is per key", () => {
    checkRateLimit("a", 1, 0);
    expect(checkRateLimit("a", 1, 1)).toBe(false);
    expect(checkRateLimit("b", 1, 1)).toBe(true);
  });
  it("allows again once the window slides past", () => {
    checkRateLimit("a", 1, 0);
    expect(checkRateLimit("a", 1, 59_999)).toBe(false);
    expect(checkRateLimit("a", 1, 60_001)).toBe(true);
  });
});
