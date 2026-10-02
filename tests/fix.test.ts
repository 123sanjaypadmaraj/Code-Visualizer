import { describe, expect, it } from "vitest";
import { buildFixPrompt, parseFix } from "../lib/fix";

describe("parseFix", () => {
  it("accepts a single-line replacement wrapped in prose", () => {
    const f = parseFix('Sure! {"explanation":"Missing semicolon.","replacement":"    int x = 5;"} done', "    int x = 5");
    expect(f).toEqual({ explanation: "Missing semicolon.", replacement: "    int x = 5;" });
  });
  it("rejects multi-line, empty, unchanged or non-JSON replies", () => {
    expect(parseFix('{"replacement":"a;\nb;"}', "x")).toBeNull();
    expect(parseFix('{"replacement":"   "}', "x")).toBeNull();
    expect(parseFix('{"replacement":"x"}', "x")).toBeNull();
    expect(parseFix("no json here", "x")).toBeNull();
    expect(parseFix("{bad json}", "x")).toBeNull();
  });
  it("accepts a multi-line replacement only with a matching endLine", () => {
    const raw = JSON.stringify({ replacement: 'printf("%d\n", x);', endLine: 5, explanation: "Joined the broken string." });
    expect(parseFix(raw, 'printf("%d', 4, 10)).toEqual({ explanation: "Joined the broken string.", replacement: 'printf("%d\n", x);', endLine: 5 });
    expect(parseFix(JSON.stringify({ replacement: "a;\nb;" }), "x", 4, 10)).toBeNull(); // 2 lines but no endLine
    expect(parseFix(JSON.stringify({ replacement: "a;\nb;", endLine: 5 }), "x", 4, 10)?.endLine).toBe(5);
  });
  it("rejects out-of-range or oversized spans", () => {
    expect(parseFix('{"replacement":"a","endLine":3}', "x", 4, 10)).toBeNull(); // before the problem line
    expect(parseFix('{"replacement":"a","endLine":20}', "x", 4, 10)).toBeNull(); // past the end of the file
    expect(parseFix('{"replacement":"a","endLine":9}', "x", 4, 10)).toBeNull(); // span longer than 4 lines
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
