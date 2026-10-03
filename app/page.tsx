"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExampleGallery from "@/components/ExampleGallery";
import Scrubber from "@/components/Scrubber";
import StudyPanel from "@/components/StudyPanel";
import { aiFailureReason } from "@/lib/aiReason";
import { buildShareHash, parseShareHash } from "@/lib/share";
import type { AiOptions, AiStatus } from "@/components/editorExtras";
import { LESSONS } from "@/lib/lessons";
import { computeStats } from "@/lib/learn";
import { diagnose } from "@/lib/diagnostics";
import type { DiagOptions } from "@/components/editorExtras";
import CodeEditor from "@/components/CodeEditor";
import Console from "@/components/Console";
import MemoryView from "@/components/MemoryView";
import PanelBoundary from "@/components/PanelBoundary";
import { Controls, Explain } from "@/components/StepPlayer";
import { EXAMPLES, STARTER } from "@/lib/examples";
import { runC } from "@/lib/c/interp";
import type { RunResult } from "@/lib/c/types";

const STORAGE_KEY = "c-visualizer:code";
const AI_KEY = "c-visualizer:ai-complete";

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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [aiOn, setAiOn] = useState(true);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiReason, setAiReason] = useState("");
  const aiOnRef = useRef(true);

  const stdin = typed.map((t) => `${t.text}
`).join("");

  // Restore from a share link (priority) or localStorage, once on mount.
  useEffect(() => {
    const shared = parseShareHash(window.location.hash);
    const fromHash = shared?.code ?? null;
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
    // a link that points at a step opens the trace there
    if (shared && shared.step !== null) {
      const r = runC(shared.code, "", false);
      if (r.steps.length) {
        const visible = r.inputNeededAt === null ? r.steps.length : r.inputNeededAt + 1;
        setRun(r);
        setStepIdx(Math.min(shared.step, visible - 1));
        setMode("run");
      }
    }
    try {
      const pref = localStorage.getItem(AI_KEY);
      if (pref === "off") {
        aiOnRef.current = false;
        // preference is only readable in the browser, after mount
        setAiOn(false);
      }
    } catch {}
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

  const lines = useMemo(() => code.split("\n"), [code]);
  const lineText = useCallback((n: number) => lines[n - 1] ?? "", [lines]);
  const stats = useMemo(() => (steps.length ? computeStats(steps, idx) : null), [steps, idx]);
  const lesson = LESSONS[EXAMPLES.find((e) => e.code === code)?.name ?? ""];

  const aiOptions: AiOptions = useMemo(
    () => ({
      enabled: () => aiOnRef.current,
      onStatus: setAiStatus,
      onError: (e) => setAiReason(e instanceof Error ? e.message : "request failed"),
      onNotice: (m) => flash(m, 6000),
      generate: async (prompt, before, after, signal) => {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, before, after }),
          signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(aiFailureReason(res.status, typeof body?.error === "string" ? body.error : ""));
        return { code: typeof body?.code === "string" ? body.code : "", warning: typeof body?.warning === "string" ? body.warning : undefined };
      },
      fetchCompletion: async (prefix, suffix, signal) => {
        const res = await fetch("/api/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix, suffix }),
          signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(aiFailureReason(res.status, typeof body?.error === "string" ? body.error : ""));
        }
        const data = await res.json();
        return typeof data.completion === "string" ? data.completion : "";
      },
    }),
    [],
  );

  const problems = useMemo(() => diagnose(code), [code]);
  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warnCount = problems.length - errorCount;

  const diagOptions: DiagOptions = useMemo(
    () => ({
      onNotice: (m) => flash(m, 6000),
      fetchFix: async (c, line, message, signal) => {
        const res = await fetch("/api/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: c, line, message }),
          signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
        return data;
      },
    }),
    [],
  );

  const toggleAi = () => {
    const next = !aiOn;
    aiOnRef.current = next;
    setAiOn(next);
    setAiStatus("idle");
    try {
      localStorage.setItem(AI_KEY, next ? "on" : "off");
    } catch {}
    flash(next ? "AI autocomplete on: pause typing, then press Tab to accept" : "AI autocomplete off");
  };

  /** clicking a line in the editor while visualizing jumps to the next time that line runs */
  const jumpToLine = (line: number) => {
    if (mode !== "run" || !total) return;
    const after = steps.findIndex((s, i) => i > idx && s.line === line);
    const any = after >= 0 ? after : steps.findIndex((s) => s.line === line);
    if (any >= 0) {
      setPlaying(false);
      setStepIdx(any);
    }
  };

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

  const flash = (msg: string, ms = 2400) => {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  };

  const load = (name: string) => {
    const ex = EXAMPLES.find((e) => e.name === name);
    if (!ex) return;
    reset();
    setCode(ex.code);
    setGalleryOpen(false);
  };

  const share = async () => {
    const hash = buildShareHash(code, mode === "run" ? stepIdx : null);
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied to clipboard");
    } catch {
      window.location.hash = hash;
      flash("Link is in the address bar");
    }
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      if (text.length > 20000) return flash("File too large for the visualizer (max 20000 characters)");
      reset();
      setCode(text);
    } catch {
      flash("Could not read that file");
    }
  };
  const downloadFile = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/x-csrc" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "program.c";
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorLine = compileErr ? compileErr.line : step?.kind === "error" ? step.line : null;
  const bar = "flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white/90 backdrop-blur transition hover:border-violet-400/40 hover:bg-white/[0.1]";

  return (
    <div className="app-bg flex min-h-screen flex-col lg:h-screen">
      <header className="glass-bar flex h-[58px] items-center gap-3 border-b border-white/10 px-7">
        <span className="logo-chip grid h-8 w-8 place-items-center rounded-lg font-mono text-base font-black text-white">C</span>
        <h1 className="gradient-text text-base font-bold tracking-tight">C Code Visualizer</h1>
        <span
          className={`ml-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            errorCount ? "border-red-400/50 bg-red-500/10 text-red-200" : warnCount ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          }`}
          title={problems[0] ? `Line ${problems[0].line}: ${problems[0].message}` : "Your code parses cleanly"}
          aria-live="polite"
        >
          {errorCount ? `✕ ${errorCount} error${errorCount > 1 ? "s" : ""}` : warnCount ? `⚠ ${warnCount} warning${warnCount > 1 ? "s" : ""}` : "✓ No problems"}
        </span>
        {problems[0] && <span className="hidden max-w-md truncate text-xs text-white/50 lg:inline">Line {problems[0].line}: {problems[0].message}</span>}
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 glass-bar border-b border-white/10 px-6 py-2.5">
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
          <button className={`${bar} lift`} onClick={() => setGalleryOpen(true)}>
            <span aria-hidden>▦</span> Browse
          </button>
          <button className={`${bar} lift hidden sm:flex`} onClick={share}>
            Share
          </button>
          <input ref={fileInput} type="file" accept=".c,.h,.txt" className="hidden" aria-label="Open a C file" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button className={`${bar} lift hidden lg:flex`} aria-label="Open a .c file" onClick={() => fileInput.current?.click()}>
            Open
          </button>
          <button className={`${bar} lift hidden lg:flex`} aria-label="Download code as program.c" onClick={downloadFile}>
            Download
          </button>
          <button
            className={`${bar} lift hidden md:flex whitespace-nowrap ${aiOn ? "ai-glow" : ""}`}
            onClick={toggleAi}
            aria-pressed={aiOn}
            title={aiOn && aiStatus === "error" && aiReason ? `AI autocomplete failed: ${aiReason}` : "AI autocomplete: pause typing to get a suggestion, Tab accepts, Esc dismisses. Type /ai <request> and press Enter to generate code."}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                !aiOn ? "bg-white/30" : aiStatus === "thinking" ? "animate-pulse bg-amber-400" : aiStatus === "error" ? "bg-red-400" : aiStatus === "ready" ? "bg-emerald-400" : "bg-cyan-400"
              }`}
            />
            AI autocomplete{aiOn ? (aiStatus === "thinking" ? " …" : aiStatus === "error" ? ` (${aiReason || "unavailable"})` : "") : " off"}
          </button>
        </div>

        <div className="flex justify-center">
          {mode === "edit" ? (
            <button
              onClick={start}
              className="btn-primary pulse-glow flex h-10 items-stretch overflow-hidden rounded-xl text-sm font-semibold text-white transition hover:brightness-110"
            >
              <span className="grid w-10 place-items-center bg-black/25" aria-hidden>
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
              className="flex h-10 items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
            >
              <span aria-hidden>⊘</span> Reset
            </button>
          )}
        </div>
      </div>

      {mode === "run" && total > 1 && <Scrubber steps={steps} idx={idx} setIdx={(i) => { setPlaying(false); setStepIdx(i); }} />}

      <main className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className="min-h-[340px] min-w-0 border-r border-white/10 bg-black/30 backdrop-blur">
          <CodeEditor value={code} onChange={setCode} activeLine={mode === "run" && step ? step.line : null} errorLine={errorLine}
            readOnly={mode === "run"}
            hits={mode === "run" && showHeat && stats ? stats.hits : null}
            onLineClick={jumpToLine}
            ai={aiOptions}
            diag={diagOptions}
          />
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto bg-transparent p-4">
          {compileErr && (
            <div className="rounded border border-red-400/40 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-100" role="alert">
              <b>Compile error{compileErr.line ? ` (line ${compileErr.line})` : ""}:</b> {compileErr.msg}
            </div>
          )}
          {mode === "run" && step ? (
            <>
              <Console output={shownOutput} prevOutput={prevOutput} awaitingInput={awaitingInput} onSubmit={submitInput} onEof={closeInput} />
              <div className="glass shrink-0 rounded-2xl">
                <PanelBoundary resetKey={idx}>
                  <MemoryView step={step} stepKey={idx} prevStep={idx > 0 ? steps[idx - 1] : undefined} />
                </PanelBoundary>
              </div>
              <Explain step={step} warnings={run?.warnings ?? []} truncated={run?.truncated ?? false} />
              <StudyPanel
                lesson={lesson}
                steps={steps}
                idx={idx}
                setIdx={(i) => {
                  setPlaying(false);
                  setStepIdx(i);
                }}
                running
                lineText={lineText}
                stats={stats}
                showHeat={showHeat}
                setShowHeat={setShowHeat}
                warnings={run?.warnings ?? []}
              />
            </>
          ) : (
            <>
              {!compileErr && (
                <div className="fade-in m-auto flex max-w-sm flex-col items-center gap-3 py-6 text-center">
                  <div className="float-y grid h-14 w-14 place-items-center logo-chip rounded-2xl font-mono text-2xl font-black text-white">C</div>
                  <p className="text-sm text-white/55">
                    Press <b className="text-white">Start Visualizer</b> to watch your code run step by step.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {["Recursion", "Linked list", "Bubble sort"].map((n) => (
                      <button key={n} onClick={() => load(n)} className="lift rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs text-white/80 hover:border-violet-400/60">
                        {n}
                      </button>
                    ))}
                    <button onClick={() => setGalleryOpen(true)} className="lift rounded-full border border-cyan-400/40 px-3 py-1 text-xs text-cyan-200">
                      More examples →
                    </button>
                  </div>
                  <p className="text-[11px] text-white/35">Tip: pause typing for AI suggestions (Tab to accept). Type &quot;/ai your request&quot; + Enter to replace everything with AI-written code.</p>
                </div>
              )}
              <StudyPanel lesson={lesson} steps={[]} idx={0} setIdx={() => {}} running={false} lineText={lineText} stats={null} showHeat={showHeat} setShowHeat={setShowHeat} warnings={[]} />
            </>
          )}
        </section>
      </main>

      <ExampleGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} onPick={load} />

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 glass rounded-full px-4 py-2 text-sm shadow-2xl shadow-violet-500/20 backdrop-blur-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
