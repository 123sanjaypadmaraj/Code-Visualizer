"use client";
import type { StepKind, TraceStep } from "@/lib/c/types";

export const KIND_STYLE: Record<StepKind, { label: string; dot: string; chip: string }> = {
  start: { label: "Start", dot: "bg-violet-400", chip: "bg-violet-400/15 text-violet-200" },
  stmt: { label: "Statement", dot: "bg-sky-400", chip: "bg-sky-400/15 text-sky-200" },
  cond: { label: "Condition", dot: "bg-amber-400", chip: "bg-amber-400/15 text-amber-200" },
  call: { label: "Function call", dot: "bg-fuchsia-400", chip: "bg-fuchsia-400/15 text-fuchsia-200" },
  return: { label: "Return", dot: "bg-emerald-400", chip: "bg-emerald-400/15 text-emerald-200" },
  end: { label: "Finished", dot: "bg-emerald-400", chip: "bg-emerald-400/15 text-emerald-200" },
  error: { label: "Error", dot: "bg-red-400", chip: "bg-red-400/20 text-red-200" },
};

const SPEEDS = [1, 2, 4, 0.5];

export function Controls({
  idx,
  total,
  setIdx,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: {
  idx: number;
  total: number;
  setIdx: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
}) {
  const go = (i: number) => {
    setPlaying(false);
    setIdx(Math.max(0, Math.min(total - 1, i)));
  };
  const atEnd = idx >= total - 1;
  const pct = total > 1 ? (idx / (total - 1)) * 100 : 0;
  const box = "flex h-10 items-center gap-2 rounded border border-white/15 bg-[#23262f] px-4 text-sm font-medium text-white transition-colors hover:bg-[#2c303b] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button className={box} onClick={() => go(idx - 1)} disabled={idx === 0} title="Previous (←)">
        <span aria-hidden>⏮</span> Prev Step
      </button>
      <button
        className="flex h-10 min-w-44 items-stretch overflow-hidden rounded border border-white/15 bg-[#23262f] text-left disabled:opacity-40"
        onClick={() => {
          if (!playing && atEnd) setIdx(0);
          setPlaying(!playing);
        }}
        disabled={total === 0}
        aria-label={playing ? "Pause" : "Play"}
        title="Play / pause (Space)"
      >
        <span className="grid w-10 place-items-center bg-cyan-400 text-[#10151c]" aria-hidden>
          {playing ? "❚❚" : "▶"}
        </span>
        <span className="flex flex-1 flex-col justify-center gap-1 px-3">
          <span className="text-xs text-white/70">
            Step <b className="text-white">{total ? idx + 1 : 0}</b> of {total}
          </span>
          <span className="h-1 rounded bg-white/15">
            <span className="block h-1 rounded bg-cyan-400" style={{ width: `${pct}%` }} />
          </span>
        </span>
      </button>
      <button
        className="h-10 w-12 rounded border border-white/15 bg-[#23262f] text-sm font-semibold text-white hover:bg-[#2c303b]"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        title="Playback speed"
      >
        {speed}x
      </button>
      <button className={box} onClick={() => go(idx + 1)} disabled={atEnd} title="Next (→)">
        Next Step <span aria-hidden>⏭</span>
      </button>
    </div>
  );
}

export function Explain({ step, warnings, truncated }: { step: TraceStep | undefined; warnings: string[]; truncated: boolean }) {
  if (!step) {
    return (
      <div className="glass rounded-2xl p-4 text-sm text-white/50">
        Write some C on the left — the visualizer runs it as you type and lets you step through every line.
      </div>
    );
  }
  const k = KIND_STYLE[step.kind];
  const isErr = step.kind === "error";
  return (
    <div
      className={`glass rounded-2xl p-4 ${isErr ? "!border-red-400/40 !bg-red-500/[0.08]" : ""}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${k.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
          {k.label}
        </span>
        <span className="font-mono text-xs text-white/45">line {step.line}</span>
        <h2 className="text-sm font-semibold text-white">{step.title}</h2>
      </div>
      <p className="text-[15px] leading-relaxed text-white/85">{step.explain}</p>
      {(warnings.length > 0 || truncated) && (
        <ul className="mt-3 space-y-1 border-t border-white/10 pt-2.5 text-xs text-amber-200/90">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
          {truncated && <li>⏱ The trace stopped after 4000 steps (a very long or infinite loop).</li>}
        </ul>
      )}
    </div>
  );
}
