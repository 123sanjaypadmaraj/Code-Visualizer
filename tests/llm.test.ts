import { describe, it, expect, vi, afterEach } from "vitest";
import { parseAnalysis, analyze } from "../lib/llm";

const base = { summary: "s", concepts: [], warnings: [], lineNotes: [], steps: [] };

describe("parseAnalysis", () => {
  it("extracts JSON wrapped in prose and fences", () => {
    const a = parseAnalysis("Here you go:\n```json\n" + JSON.stringify(base) + "\n```", "t");
    expect(a.summary).toBe("s");
    expect(a.provider).toBe("t");
  });
  it("throws when there is no JSON", () => {
    expect(() => parseAnalysis("nope", "t")).toThrow();
  });
  it("tolerates missing fields", () => {
    const a = parseAnalysis("{}", "t");
    expect(a.steps).toEqual([]);
    expect(a.lineNotes).toEqual([]);
    expect(a.warnings).toEqual([]);
  });
  it("falls back to scalar for unknown kind and stack for region", () => {
    const a = parseAnalysis(
      JSON.stringify({ ...base, steps: [{ line: 1, vars: [{ name: "x", kind: "weird", value: 3 }] }] }),
      "t",
    );
    const v = a.steps[0].vars[0];
    expect(v.kind).toBe("scalar");
    expect(v.region).toBe("stack");
    expect(v.value).toBe("3");
  });
  it("keeps heap region and drops nameless vars", () => {
    const a = parseAnalysis(
      JSON.stringify({
        ...base,
        steps: [{ line: 1, vars: [{ kind: "array" }, { name: "p", kind: "array", region: "heap", items: [1, 2] }] }],
      }),
      "t",
    );
    expect(a.steps[0].vars).toHaveLength(1);
    expect(a.steps[0].vars[0].region).toBe("heap");
    expect(a.steps[0].vars[0].items).toEqual(["1", "2"]);
  });
  it("caps steps at 60 and concepts at 6", () => {
    const steps = Array.from({ length: 100 }, (_, i) => ({ line: i + 1 }));
    const concepts = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const a = parseAnalysis(JSON.stringify({ ...base, steps, concepts }), "t");
    expect(a.steps).toHaveLength(60);
    expect(a.concepts).toHaveLength(6);
  });
});

describe("analyze provider handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to Gemini when Groq times out", async () => {
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("GEMINI_API_KEY", "m");
    vi.stubEnv("LLM_TIMEOUT_MS", "50");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        if (url.includes("groq")) {
          return new Promise((_, reject) =>
            init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(base) }] } }] })),
        );
      }),
    );
    const a = await analyze("int x;", "auto");
    expect(a.provider).toContain("Gemini");
  });

  it("reports a readable timeout message when the only provider hangs", async () => {
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("LLM_TIMEOUT_MS", "50");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          ),
      ),
    );
    await expect(analyze("int x;", "groq")).rejects.toThrow(/Groq timed out after/);
  });

  it("stops immediately on client abort without trying the next provider", async () => {
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("GEMINI_API_KEY", "m");
    const ctrl = new AbortController();
    const fetchMock = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = analyze("int x;", "auto", ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
