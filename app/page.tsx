"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import Console from "@/components/Console";
import MemoryView from "@/components/MemoryView";
import { Controls, Explain } from "@/components/StepPlayer";
import { EXAMPLES, STARTER, type Example } from "@/lib/examples";
import { runC } from "@/lib/c/interp";
import { pickStep } from "@/lib/steps";
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

interface Runs {
  /** the latest run (may be a compile error with no steps) */
  latest: RunResult;
  /** the latest run that produced steps — what we keep showing while the code is broken */
  shown: RunResult;
}

export default function Home() {
  const [code, setCode] = useState(STARTER);
  const [stdin, setStdin] = useState("");
  const [runs, setRuns] = useState<Runs>(() => {
    const r = runC(STARTER, "");
    return { latest: r, shown: r };
  });
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const restored = useRef(false);
  // line the caret is on; the visualization follows it while you type
  const [focusLine, setFocusLine] = useState<number | null>(null);

  const execute = useCallback((src: string, input: string) => {
    const r = runC(src, input);
    setRuns((s) => ({ latest: r, shown: r.steps.length ? r : s.shown }));
  }, []);

  // Live: re-run shortly after the code or input stops changing.
  useEffect(() => {
    const id = setTimeout(() => execute(code, stdin), 350);
    return () => clearTimeout(id);
  }, [code, stdin, execute]);

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

  const steps = runs.shown.steps;
  const total = steps.length;
  const idx = Math.max(0, Math.min(stepIdx, total - 1));
  const step = steps[idx];
  const prevOutput = idx > 0 ? steps[idx - 1].output : "";
  const compileError = runs.latest.steps.length === 0 ? runs.latest : null;
  const stale = runs.latest !== runs.shown;

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
      if (t && (t.closest(".cm-editor") || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        if (!(t.tagName === "INPUT" && (t as HTMLInputElement).type === "range")) return;
      }
      if (!total) return;
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
  }, [idx, total]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const load = (ex: Example) => {
    setCode(ex.code);
    setStdin(ex.stdin ?? "");
    execute(ex.code, ex.stdin ?? "");
    setFocusLine(null);
    setStepIdx(0);
    setPlaying(false);
    setMenu(false);
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

  const errorLine = useMemo(() => {
    if (compileError) return compileError.errorLine;
    return step?.kind === "error" ? step.line : null;
  }, [compileError, step]);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 font-mono text-sm font-black text-white shadow-[0_6px_20px_-6px_rgba(139,92,246,0.9)]">
            C
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight">
              <span className="gradient-text">C Visualizer</span>
            </h1>
            <p className="hidden text-[11px] text-white/45 sm:block">See exactly what your code does in memory</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex ${
              compileError ? "border-red-400/30 text-red-300" : "border-emerald-400/25 text-emerald-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${compileError ? "bg-red-400" : "animate-pulse bg-emerald-400"}`} />
            {compileError ? "Fix the error to continue" : "Live · runs as you type"}
          </span>
          <div className="relative">
            <button className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
              Examples
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M5.5 7.5 10 12l4.5-4.5z" />
              </svg>
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-30 cursor-default" aria-label="Close examples" onClick={() => setMenu(false)} />
                <div
                  role="menu"
                  className="rise absolute right-0 z-40 mt-2 max-h-[70vh] w-[min(92vw,360px)] overflow-auto rounded-2xl border border-white/12 bg-[#0d1224]/95 p-1.5 shadow-2xl backdrop-blur-xl"
                >
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.name}
                      role="menuitem"
                      onClick={() => load(ex)}
                      className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.07]"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {ex.name}
                        {ex.bug && <span className="rounded bg-red-400/15 px-1.5 text-[10px] font-semibold uppercase text-red-300">crash</span>}
                      </span>
                      <span className="text-xs text-white/45">{ex.blurb}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button className="btn" onClick={share}>
            Share
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              execute(code, stdin);
              setFocusLine(null);
              setStepIdx(0);
              setPlaying(false);
            }}
          >
            ↺ Restart
          </button>
        </div>
      </header>

      <div
        className={`rise flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 font-mono text-[13px] ${
          compileError ? "border-red-400/40 bg-red-500/10 text-red-100" : "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200"
        }`}
        role={compileError ? "alert" : "status"}
      >
        <span className="font-semibold">{compileError ? "✗ Compile failed" : "✓ Compiled"}</span>
        {compileError ? (
          <span>
            line {compileError.errorLine}: {compileError.error}
            {stale && <span className="ml-2 text-xs text-red-200/60">(showing the last version that worked)</span>}
          </span>
        ) : (
          <span className="text-emerald-200/70">
            no errors{runs.shown.warnings.length ? `, ${runs.shown.warnings.length} warning${runs.shown.warnings.length > 1 ? "s" : ""}` : ""}
          </span>
        )}
      </div>

      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="flex min-h-0 flex-col gap-3">
          <div className="glass flex min-h-[340px] flex-1 flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs text-white/50">
              <span className="flex gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <i className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
                <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              </span>
              <span className="font-mono">main.c</span>
              <span className="ml-auto">edit freely — the trace updates live</span>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor value={code} onChange={setCode} activeLine={step ? step.line : null} errorLine={errorLine} onCursorLine={setFocusLine} />
            </div>
          </div>
          <Explain step={step} warnings={runs.shown.warnings} truncated={runs.shown.truncated} />
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="glass rounded-2xl">
            <Controls idx={idx} total={total} setIdx={setStepIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
          </div>
          <div className={`glass min-h-[360px] flex-1 overflow-auto rounded-2xl transition-opacity ${stale ? "opacity-60" : ""}`}>
            {step ? (
              <MemoryView step={step} stepKey={idx} />
            ) : (
              <p className="p-8 text-center text-sm text-white/40">Nothing to show yet.</p>
            )}
          </div>
          <Console output={step?.output ?? ""} prevOutput={prevOutput} stdin={stdin} setStdin={setStdin} />
        </section>
      </main>

      {toast && (
        <div className="rise fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-[#10162b]/95 px-4 py-2 text-sm shadow-xl backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}
