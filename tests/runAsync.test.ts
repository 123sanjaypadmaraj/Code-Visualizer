import { afterEach, describe, expect, it, vi } from "vitest";
import { runCAsync, TIMEOUT_MESSAGE } from "../lib/c/runAsync";

class FakeWorker {
  static last: FakeWorker;
  static behavior: "reply" | "silent" | "error" | "throw" = "reply";
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminated = false;
  constructor() {
    if (FakeWorker.behavior === "throw") throw new Error("no workers");
    FakeWorker.last = this;
  }
  postMessage() {
    if (FakeWorker.behavior === "reply") {
      const result = { steps: [], error: "from worker", errorLine: null, warnings: [], truncated: false, inputNeededAt: null };
      queueMicrotask(() => this.onmessage?.({ data: { ok: true, result } }));
    } else if (FakeWorker.behavior === "error") {
      queueMicrotask(() => this.onerror?.({ message: "boom" }));
    }
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runCAsync", () => {
  it("returns the worker's result and cleans up", async () => {
    FakeWorker.behavior = "reply";
    vi.stubGlobal("Worker", FakeWorker);
    expect((await runCAsync("x")).error).toBe("from worker");
    expect(FakeWorker.last.terminated).toBe(true);
  });

  it("gives up with the timeout message and terminates the worker", async () => {
    FakeWorker.behavior = "silent";
    vi.stubGlobal("Worker", FakeWorker);
    vi.useFakeTimers();
    const p = runCAsync("x", "", false, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    const r = await p;
    expect(r.error).toBe(TIMEOUT_MESSAGE);
    expect(r.steps).toEqual([]);
    expect(FakeWorker.last.terminated).toBe(true);
  });

  it("reports a worker error without the words 'Internal error'", async () => {
    FakeWorker.behavior = "error";
    vi.stubGlobal("Worker", FakeWorker);
    const r = await runCAsync("x");
    expect(r.error).toContain("boom");
    expect(r.error).not.toMatch(/internal error/i);
  });

  it("falls back to running on the main thread when no Worker can be created", async () => {
    FakeWorker.behavior = "throw";
    vi.stubGlobal("Worker", FakeWorker);
    const r = await runCAsync("int main() { return 0; }");
    expect(r.error).toBeNull();
    expect(r.steps.length).toBeGreaterThan(0);
  });
});
