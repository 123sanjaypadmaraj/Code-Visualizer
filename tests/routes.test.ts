import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimit } from "../lib/rateLimit";
import { completeCode } from "../lib/complete";
import { suggestFix } from "../lib/fix";
import { generateCode } from "../lib/generate";
import { POST as complete } from "../app/api/complete/route";
import { POST as fix } from "../app/api/fix/route";
import { POST as generate } from "../app/api/generate/route";
import { logAiRequest } from "../lib/log";

vi.mock("../lib/complete", () => ({ completeCode: vi.fn(), askLLM: vi.fn() }));
vi.mock("../lib/fix", () => ({ suggestFix: vi.fn() }));
vi.mock("../lib/generate", () => ({ generateCode: vi.fn() }));
vi.mock("../lib/log", () => ({ logAiRequest: vi.fn() }));

const post = (body: unknown, ip = "1.2.3.4") =>
  new Request("http://x/api", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  resetRateLimit();
  vi.mocked(completeCode).mockReset();
  vi.mocked(suggestFix).mockReset();
  vi.mocked(generateCode).mockReset();
  vi.mocked(logAiRequest).mockReset();
});

const routes = [
  { name: "complete", run: complete, ok: { prefix: "int x" }, big: { prefix: "a".repeat(7000) } },
  { name: "fix", run: fix, ok: { code: "int x", line: 1, message: "m" }, big: { code: "a".repeat(7000), line: 1, message: "m" } },
  { name: "generate", run: generate, ok: { prompt: "hi" }, big: { prompt: "hi", before: "a".repeat(10000) } },
];

describe.each(routes)("/api/$name", ({ name, run, ok, big }) => {
  const mockOk = () => {
    vi.mocked(completeCode).mockResolvedValue("x;");
    vi.mocked(suggestFix).mockResolvedValue({ explanation: "e", replacement: "int x;" });
    vi.mocked(generateCode).mockResolvedValue({ code: "int main() {}" });
  };

  it("400 on invalid JSON", async () => {
    expect((await run(post("{nope"))).status).toBe(400);
  });
  it("413 on oversize input", async () => {
    expect((await run(post(big))).status).toBe(413);
  });
  it("200 on a good request, logging once without the body", async () => {
    mockOk();
    expect((await run(post(ok))).status).toBe(200);
    expect(logAiRequest).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(logAiRequest).mock.calls[0][0];
    expect(entry.route).toBe(name);
    expect(Object.keys(entry).sort()).not.toEqual(expect.arrayContaining(["code"]));
  });
  it("502 with the thrown message when the provider fails", async () => {
    vi.mocked(completeCode).mockRejectedValue(new Error("boom"));
    vi.mocked(suggestFix).mockRejectedValue(new Error("boom"));
    vi.mocked(generateCode).mockRejectedValue(new Error("boom"));
    const res = await run(post(ok));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("boom");
  });
  it("429 after the per-IP limit", async () => {
    mockOk();
    let last = 200;
    for (let i = 0; i < 60; i++) last = (await run(post(ok, "9.9.9.9"))).status;
    expect(last).toBe(429);
    expect((await run(post(ok, "8.8.8.8"))).status).toBe(200);
  });
});

describe("422 on empty AI result", () => {
  it("fix and generate", async () => {
    vi.mocked(suggestFix).mockResolvedValue(null);
    vi.mocked(generateCode).mockResolvedValue({ code: "" });
    expect((await fix(post({ code: "int x", line: 1, message: "m" }))).status).toBe(422);
    expect((await generate(post({ prompt: "hi" }))).status).toBe(422);
  });
});
