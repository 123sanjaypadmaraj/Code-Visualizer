/// <reference lib="webworker" />
import { runC } from "./interp";

export interface WorkerRequest {
  source: string;
  stdin: string;
  eof: boolean;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { source, stdin, eof } = e.data;
  try {
    self.postMessage({ ok: true, result: runC(source, stdin, eof) });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
