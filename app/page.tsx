"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import Console from "@/components/Console";
import MemoryView from "@/components/MemoryView";
import { Controls, Explain } from "@/components/StepPlayer";
import { EXAMPLES, STARTER } from "@/lib/examples";
import { runC } from "@/lib/c/interp";
import type { RunResult } from "@/lib/c/types";

const STORAGE_KEY = "c-visualizer:code";

function encodeShare(code: string) {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeShare(b64: string): string | null {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

interface Typed {
  /** step index (in the run) at which the program was waiting */
  atStep: number;
  /** length of the program output at that moment */
  outLen: number;
  text: string;
}

/** Insert the lines the user typed into the program output, where a terminal would echo them. */
function withEchoes(output: string, stepIdx: number, typed: Typed[]): string {
  let out = output;
  let shift = 0;
  for (const t of typed) {
    if (t.atStep > stepIdx) break;
    const pos = Math.min(out.length, t.outLen + shift);
    out = `${out.slice(0, pos)}${t.text}
${out.slice(pos)}`;
    shift += t.text.length + 1;
  }
  return out;
}

export default function Home() {
  const [code, setCode] = useState(STARTER);
  const [mode, setMode] = useState<"edit" | "run">("edit");
  const [run, setRun] = useState<RunResult | null>(null);
  const [compileErr, setCompileErr] = useState<{ line: number | null; msg: string } | null>(null);
  const [typed, setTyped] = useState<Typed[]>([]);
  const [eof, setEof] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [toast, setToast] = useState("");
  const restored = useRef(false);

  const stdin = typed.map((t) => `${t.text}
`).join("");

  // Restore from a share link (priority) or localStorage, once on mount.
  useEffect(() => {
    let fromHash: string | null = null;
    const m = window.location.hash.match(/^#code=(.+)$/);
    if (m) fromHash = decodeShare(m[1]);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    const initial = fromHash ?? saved;
    if (initial && initial !== STARTER) {
      // localStorage/hash only exist in the browser, so restoring must happen after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(initial);
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {}
    }, 500);
    return () => clearTimeout(id);
  }, [code]);

  // Steps the user may see: up to (and including) the one waiting for input.
  const steps = useMemo(() => {
    if (!run) return [];
    return run.inputNeededAt === null ? run.steps : run.steps.slice(0, run.inputNeededAt + 1);
  }, [run]);
  const total = steps.length;
  const idx = Math.max(0, Math.min(stepIdx, total - 1));
  const step = steps[idx];
  const awaitingInput = !!run && run.inputNeededAt !== null && idx === total - 1;
  const shownOutput = step ? withEchoes(step.output, idx, typed) : "";
  const prevOutput = idx > 0 ? withEchoes(steps[idx - 1].output, idx - 1, typed) : "";

  const start = () => {
    const r = runC(code, "", false);
    if (!r.steps.length) {
      setCompileErr({ line: r.errorLine, msg: r.error ?? "Could not compile." });
      return;
    }
    setCompileErr(null);
    setTyped([]);
    setEof(false);
    setRun(r);
    setStepIdx(0);
    setPlaying(false);
    setMode("run");
  };

  const reset = () => {
    setMode("edit");
    setRun(null);
    setTyped([]);
    setEof(false);
    setPlaying(false);
    setStepIdx(0);
    setCompileErr(null);
  };

  const submitInput = (text: string) => {
    if (!run || run.inputNeededAt === null) return;
    const at = run.inputNeededAt;
    const next = [...typed, { atStep: at, outLen: run.steps[at].output.length, text }];
    const r = runC(code, next.map((t) => `${t.text}
`).join(""), eof);
    setTyped(next);
    setRun(r);
    setStepIdx(at + 1 < r.steps.length ? at + 1 : at);
  };

  const closeInput = () => {
    if (!run) return;
    const at = run.inputNeededAt;
    const r = runC(code, stdin, true);
    setEof(true);
    setRun(r);
    if (at !== null && at + 1 < r.steps.length) setStepIdx(at + 1);
  };

  // playback
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStepIdx((i) => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 900 / speed);
    return () => clearInterval(id);
  }, [playing, speed, total]);

  // keyboard shortcuts (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest(".cm-editor") || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (mode !== "run" || !total) return;
      if (e.key === "ArrowRight") {
        setPlaying(false);
        setStepIdx(Math.min(total - 1, idx + 1));
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setStepIdx(Math.max(0, idx - 1));
      } else if (e.key === "Home") {
        setPlaying(false);
        setStepIdx(0);
      } else if (e.key === "End") {
        setPlaying(false);
        setStepIdx(total - 1);
      } else if (e.key === " " && !(t && t.tagName === "BUTTON")) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else return;
      if (e.key !== " ") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, total, mode]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const load = (name: string) => {
    const ex = EXAMPLES.find((e) => e.name === name);
    if (!ex) return;
    reset();
    setCode(ex.code);
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#code=${encodeShare(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied to clipboard");
    } catch {
      window.location.hash = `code=${encodeShare(code)}`;
      flash("Link is in the address bar");
    }
  };

  const errorLine = compileErr ? compileErr.line : step?.kind === "error" ? step.line : null;
  const bar = "flex h-10 items-center gap-2 rounded border border-white/15 bg-[#23262f] px-3 text-sm text-white/90 hover:bg-[#2c303b]";

  return (
    <div className="flex min-h-screen flex-col bg-[#1f1f20] lg:h-screen">
      <header className="flex h-[58px] items-center gap-3 border-b border-white/10 bg-[#2e2f35] px-7">
        <span className="font-mono text-lg font-black text-cyan-300">C</span>
        <h1 className="text-sm font-semibold tracking-tight text-white">C Code Visualizer</h1>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/10 bg-[#27282c] px-6 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded border border-white/15 bg-[#23262f] px-2.5 py-2 font-mono text-xs font-bold text-white">C</span>
          <span className="text-white/40">/</span>
          <select
            aria-label="Example program"
            value=""
            onChange={(e) => load(e.target.value)}
            className={`${bar} max-w-56`}
          >
            <option value="" disabled className="bg-slate-900">
              Examples…
            </option>
            {EXAMPLES.map((ex) => (
              <option key={ex.name} value={ex.name} className="bg-slate-900">
                {ex.name}
              </option>
            ))}
          </select>
          <button className={`${bar} hidden sm:flex`} onClick={share}>
            Share
          </button>
        </div>

        <div className="flex justify-center">
          {mode === "edit" ? (
            <button
              onClick={start}
              className="flex h-10 items-stretch overflow-hidden rounded border border-white/15 bg-[#23262f] text-sm font-medium text-white hover:bg-[#2c303b]"
            >
              <span className="grid w-10 place-items-center bg-cyan-400 text-[#10151c]" aria-hidden>
                ▶
              </span>
              <span className="grid place-items-center px-6">Start Visualizer</span>
            </button>
          ) : (
            <Controls idx={idx} total={total} setIdx={setStepIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
          )}
        </div>

        <div className="flex justify-end">
          {mode === "run" && (
            <button
              onClick={reset}
              className="flex h-10 items-center gap-2 rounded border border-red-400/40 bg-[#2a2024] px-4 text-sm font-medium text-red-300 hover:bg-[#35252a]"
            >
              <span aria-hidden>⊘</span> Reset
            </button>
          )}
        </div>
      </div>

      <main className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className="min-h-[340px] min-w-0 border-r border-white/10 bg-[#1d202a]">
          <CodeEditor value={code} onChange={setCode} activeLine={mode === "run" && step ? step.line : null} errorLine={errorLine} readOnly={mode === "run"} />
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto bg-[#1f1f20] p-4">
          {compileErr && (
            <div className="rounded border border-red-400/40 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-100" role="alert">
              <b>Compile error{compileErr.line ? ` (line ${compileErr.line})` : ""}:</b> {compileErr.msg}
            </div>
          )}
          {mode === "run" && step ? (
            <>
              <Console output={shownOutput} prevOutput={prevOutput} awaitingInput={awaitingInput} onSubmit={submitInput} onEof={closeInput} />
              <div className="shrink-0 rounded border border-white/10 bg-[#1f1f20]">
                <MemoryView step={step} stepKey={idx} prevStep={idx > 0 ? steps[idx - 1] : undefined} />
              </div>
              <Explain step={step} warnings={run?.warnings ?? []} truncated={run?.truncated ?? false} />
            </>
          ) : (
            !compileErr && <p className="m-auto max-w-xs text-center text-sm text-white/40">Press “Start Visualizer” to run your code step by step.</p>
          )}
        </section>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-[#10162b]/95 px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
