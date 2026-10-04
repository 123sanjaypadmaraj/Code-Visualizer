"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES } from "@/lib/examples";

type Level = "Beginner" | "Intermediate" | "Advanced";

const META: Record<string, { topic: string; level: Level }> = {
  "Variables & types": { topic: "Basics", level: "Beginner" },
  "Arrays & pointers": { topic: "Pointers", level: "Beginner" },
  "Swap with pointers": { topic: "Pointers", level: "Beginner" },
  "Loop & sum": { topic: "Basics", level: "Beginner" },
  Recursion: { topic: "Recursion", level: "Intermediate" },
  Strings: { topic: "Strings", level: "Beginner" },
  Structs: { topic: "Structs", level: "Intermediate" },
  "malloc & free": { topic: "Memory", level: "Intermediate" },
  "Linked list": { topic: "Data structures", level: "Intermediate" },
  "Bubble sort": { topic: "Algorithms", level: "Intermediate" },
  "2D array": { topic: "Arrays", level: "Beginner" },
  "Reading input (scanf)": { topic: "Basics", level: "Beginner" },
  "Function pointers": { topic: "Pointers", level: "Advanced" },
  "Bug: out of bounds": { topic: "Debugging", level: "Beginner" },
  "Bug: use after free": { topic: "Debugging", level: "Intermediate" },
  "Binary search": { topic: "Algorithms", level: "Intermediate" },
  "Selection sort": { topic: "Algorithms", level: "Intermediate" },
  "Stack with array": { topic: "Data structures", level: "Intermediate" },
  "Binary search tree": { topic: "Data structures", level: "Advanced" },
  Fibonacci: { topic: "Recursion", level: "Intermediate" },
  "Pointer arithmetic": { topic: "Pointers", level: "Intermediate" },
  "Bit manipulation": { topic: "Basics", level: "Advanced" },
  "Bug: memory leak": { topic: "Debugging", level: "Intermediate" },
};

const LEVEL_STYLE: Record<Level, string> = {
  Beginner: "bg-emerald-400/15 text-emerald-200",
  Intermediate: "bg-amber-400/15 text-amber-200",
  Advanced: "bg-fuchsia-400/15 text-fuchsia-200",
};

export default function ExampleGallery({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("All");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const topics = useMemo(() => ["All", ...Array.from(new Set(EXAMPLES.map((e) => META[e.name]?.topic ?? "Other")))], []);
  const list = EXAMPLES.filter((e) => {
    const m = META[e.name];
    if (topic !== "All" && (m?.topic ?? "Other") !== topic) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${e.name} ${e.blurb} ${m?.topic ?? ""}`.toLowerCase().includes(needle);
  });

  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Example programs">
      <div className="pop-in flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/15 bg-raised shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Example programs</h2>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: pointers, sorting, recursion…"
            className="ml-2 h-9 flex-1 rounded border border-white/15 bg-deep px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-400/70"
          />
          <button onClick={onClose} className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-5 py-3">
          {topics.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                topic === t ? "border-cyan-400 bg-cyan-400/15 text-cyan-100" : "border-white/15 text-white/65 hover:border-white/30 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="grid gap-3 overflow-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((ex) => {
            const m = META[ex.name];
            return (
              <button
                key={ex.name}
                onClick={() => onPick(ex.name)}
                className="lift group flex flex-col items-start gap-2 rounded-lg border border-white/10 bg-raised p-4 text-left hover:border-cyan-400/50"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white group-hover:text-cyan-200">{ex.name}</span>
                  {ex.bug || ex.leak ? <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] font-semibold text-red-200">BUG</span> : null}
                </div>
                <span className="text-xs leading-relaxed text-white/60">{ex.blurb}</span>
                <span className="mt-auto flex gap-1.5 pt-1">
                  {m && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_STYLE[m.level]}`}>{m.level}</span>}
                  {m && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">{m.topic}</span>}
                </span>
              </button>
            );
          })}
          {list.length === 0 && <p className="col-span-full py-8 text-center text-sm text-white/50">No example matches “{q}”.</p>}
        </div>
      </div>
    </div>
  );
}
