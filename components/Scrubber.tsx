"use client";
import { useMemo } from "react";
import type { StepKind, TraceStep } from "@/lib/c/types";

const COLOR: Record<StepKind, string> = {
  start: "#a78bfa",
  stmt: "#38bdf8",
  cond: "#fbbf24",
  call: "#e879f9",
  return: "#34d399",
  end: "#34d399",
  error: "#f87171",
};

const MAX_SEGMENTS = 240;

/** Draggable timeline: one coloured segment per step (call = pink, condition = amber, return = green, error = red). */
export default function Scrubber({ steps, idx, setIdx }: { steps: TraceStep[]; idx: number; setIdx: (i: number) => void }) {
  const total = steps.length;
  // very long runs are bucketed so the bar stays readable; the most "interesting" kind in a bucket wins
  const segs = useMemo(() => {
    const n = Math.min(total, MAX_SEGMENTS);
    const per = total / n;
    const rank: StepKind[] = ["error", "call", "return", "cond", "stmt", "start", "end"];
    return Array.from({ length: n }, (_, i) => {
      const from = Math.floor(i * per);
      const to = Math.max(from + 1, Math.floor((i + 1) * per));
      const kinds = steps.slice(from, to).map((s) => s.kind);
      return rank.find((k) => kinds.includes(k)) ?? "stmt";
    });
  }, [steps, total]);
  if (total < 2) return null;
  const pct = (idx / (total - 1)) * 100;
  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-[#222329] px-6 py-2" aria-label="Execution timeline">
      <span className="w-16 shrink-0 text-xs text-white/45">Timeline</span>
      <div className="relative h-5 flex-1">
        <div className="absolute inset-x-0 top-1/2 flex h-2 -translate-y-1/2 gap-px overflow-hidden rounded-full">
          {segs.map((k, i) => (
            <span key={i} className="h-full flex-1 transition-opacity" style={{ background: COLOR[k], opacity: (i / segs.length) * total <= idx ? 0.95 : 0.28 }} />
          ))}
        </div>
        <span
          className="pointer-events-none absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.5),0_0_12px_rgba(103,232,249,0.9)] transition-[left] duration-150"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={total - 1}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label="Step position"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="hidden shrink-0 items-center gap-3 text-[10px] text-white/45 md:flex">
        <Legend color={COLOR.call} label="call" />
        <Legend color={COLOR.cond} label="condition" />
        <Legend color={COLOR.return} label="return" />
        <Legend color={COLOR.error} label="error" />
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
