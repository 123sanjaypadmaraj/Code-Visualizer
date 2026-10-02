import { describe, expect, it } from "vitest";
import { buildFixPrompt, parseFix } from "../lib/fix";

describe("parseFix", () => {
  it("accepts a single-line replacement wrapped in prose", () => {
    const f = parseFix('Sure! {"explanation":"Missing semicolon.","replacement":"    int x = 5;"} done', "    int x = 5");
    expect(f).toEqual({ explanation: "Missing semicolon.", replacement: "    int x = 5;" });
  });
  it("rejects multi-line, empty, unchanged or non-JSON replies", () => {
    expect(parseFix('{"replacement":"a;\\nb;"}', "x")).toBeNull();
    expect(parseFix('{"replacement":"   "}', "x")).toBeNull();
    expect(parseFix('{"replacement":"x"}', "x")).toBeNull();
    expect(parseFix("no json here", "x")).toBeNull();
    expect(parseFix("{bad json}", "x")).toBeNull();
  });
  it("falls back to a default explanation", () => {
    expect(parseFix('{"replacement":"y;"}', "x")?.explanation).toMatch(/fix/i);
  });
});

describe("buildFixPrompt", () => {
  it("marks the problem line and includes the message", () => {
    const p = buildFixPrompt("a\nb\nc\nd", 3, "Expected ';'");
    expect(p).toContain("3> c");
    expect(p).toContain("Expected ';'");
  });
});
