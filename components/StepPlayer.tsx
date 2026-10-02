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

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);
const ICONS = {
  first: "M6 6h2v12H6zm3.5 6 8.5 6V6z",
  prev: "M15.4 6 9 12l6.4 6z",
  next: "M8.6 6 15 12l-6.4 6z",
  last: "M16 6h2v12h-2zM6 18l8.5-6L6 6z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
};

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
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <div className="flex items-center gap-1">
        <button className="btn !px-2" onClick={() => go(0)} disabled={idx === 0} aria-label="First step" title="First step (Home)">
          <Icon d={ICONS.first} />
        </button>
        <button className="btn !px-2" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous step" title="Previous (←)">
          <Icon d={ICONS.prev} />
        </button>
        <button
          className="btn btn-primary !px-3.5"
          onClick={() => {
            if (!playing && atEnd) setIdx(0);
            setPlaying(!playing);
          }}
          disabled={total === 0}
          aria-label={playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
        >
          <Icon d={playing ? ICONS.pause : ICONS.play} />
          {playing ? "Pause" : atEnd ? "Replay" : "Play"}
        </button>
        <button className="btn !px-2" onClick={() => go(idx + 1)} disabled={atEnd} aria-label="Next step" title="Next (→)">
          <Icon d={ICONS.next} />
        </button>
        <button className="btn !px-2" onClick={() => go(total - 1)} disabled={atEnd} aria-label="Last step" title="Last step (End)">
          <Icon d={ICONS.last} />
        </button>
      </div>
      <input
        type="range"
        className="timeline mx-1 min-w-24 flex-1"
        min={0}
        max={Math.max(total - 1, 0)}
        value={idx}
        onChange={(e) => go(Number(e.target.value))}
        disabled={total === 0}
        aria-label="Step position"
        style={{
          background: `linear-gradient(90deg, #8b5cf6 ${total > 1 ? (idx / (total - 1)) * 100 : 0}%, rgba(255,255,255,0.1) 0)`,
        }}
      />
      <span className="w-20 text-right font-mono text-xs tabular-nums text-white/55">
        {total ? `${idx + 1} / ${total}` : "–"}
      </span>
      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        aria-label="Playback speed"
        className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-xs text-white/80"
      >
        {[0.5, 1, 2, 4].map((s) => (
          <option key={s} value={s} className="bg-slate-900">
            {s}×
          </option>
        ))}
      </select>
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
