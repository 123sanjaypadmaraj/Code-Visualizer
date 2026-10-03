import { describe, expect, it } from "vitest";
import { buildShareHash, parseShareHash } from "../lib/share";

describe("share hash", () => {
  it("round-trips code with unicode, with and without a step", () => {
    const code = 'int main() { printf("héllo ✓"); }';
    expect(parseShareHash(buildShareHash(code))).toEqual({ code, step: null });
    expect(parseShareHash(buildShareHash(code, 7))).toEqual({ code, step: 7 });
    expect(parseShareHash(buildShareHash(code, 0))?.step).toBe(0);
  });
  it("omits invalid steps when building", () => {
    expect(buildShareHash("x", -1)).not.toContain("step");
    expect(buildShareHash("x", 1.5)).not.toContain("step");
    expect(buildShareHash("x", null)).not.toContain("step");
  });
  it("accepts legacy code-only links", () => {
    expect(parseShareHash("#code=aGk")).toEqual({ code: "hi", step: null });
  });
  it("ignores a negative or non-numeric step", () => {
    expect(parseShareHash("#code=aGk&step=-3")?.step).toBeNull();
    expect(parseShareHash("#code=aGk&step=abc")?.step).toBeNull();
  });
  it("rejects malformed hashes", () => {
    expect(parseShareHash("")).toBeNull();
    expect(parseShareHash("#other=1")).toBeNull();
    expect(parseShareHash("#code=!!!")).toBeNull();
  });
});
