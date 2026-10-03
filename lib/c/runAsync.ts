import type { RunResult } from "./types";

export const RUN_TIMEOUT_MS = 8000;
export const TIMEOUT_MESSAGE = "Your program took too long to trace. Is there an infinite loop?";

function failed(msg: string): RunResult {
  return { steps: [], error: msg, errorLine: null, warnings: [], truncated: false, inputNeededAt: null };
}

/** Run the interpreter in a Web Worker so a heavy program cannot freeze the page; give up after `timeoutMs`. */
export function runCAsync(source: string, stdin = "", eof = false, timeoutMs = RUN_TIMEOUT_MS): Promise<RunResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url));
    } catch {
      // no worker support: fall back to running on the main thread
      void import("./interp").then(({ runC }) => resolve(runC(source, stdin, eof)));
      return;
    }
    const done = (r: RunResult) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => done(failed(TIMEOUT_MESSAGE)), timeoutMs);
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: RunResult; error?: string }>) =>
      done(e.data.ok && e.data.result ? e.data.result : failed(`Internal error: ${e.data.error ?? "unknown"}`));
    worker.onerror = (e) => done(failed(`Internal error: ${e.message}`));
    worker.postMessage({ source, stdin, eof });
  });
}
