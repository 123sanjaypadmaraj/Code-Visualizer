"use client";
import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import type { FrameView, HeapView, TraceStep, ValView, VarView } from "@/lib/c/types";
import ValueView, { type Peer } from "./ValueView";

interface ArrowPath {
  d: string;
  color: string;
  bad: boolean;
}

function Arrows({
  root,
  stepKey,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  stepKey: number;
}) {
  const [paths, setPaths] = useState<ArrowPath[]>([]);

  useLayoutEffect(() => {
    const measure = () => {
      const el = root.current;
      if (!el) return;
      const base = el.getBoundingClientRect();
      const next: ArrowPath[] = [];
      el.querySelectorAll<HTMLElement>("[data-ptr]").forEach((dot) => {
        const target = Number(dot.dataset.target);
        if (!target) return;
        const toStruct = dot.dataset.tostruct === "1";
        const dest = el.querySelector<HTMLElement>(
          toStruct
            ? `[data-saddr="${target}"], [data-addr="${target}"]`
            : `[data-addr="${target}"]`,
        );
        if (!dest || dest === dot.closest("[data-addr]")) return;
        const a = dot.getBoundingClientRect();
        const b = dest.getBoundingClientRect();
        const sx = a.right - base.left;
        const sy = a.top + a.height / 2 - base.top;
        const by = b.top + b.height / 2 - base.top;
        let d: string;
        if (b.left - base.left > sx + 28) {
          const ex = b.left - base.left - 3;
          const mx = sx + (ex - sx) / 2;
          d = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${by}, ${ex} ${by}`;
        } else {
          const ex = b.right - base.left + 3;
          const bulge = Math.max(sx, ex) + 46;
          d = `M ${sx} ${sy} C ${bulge} ${sy}, ${bulge} ${by}, ${ex} ${by}`;
        }
        next.push({
          d,
          color: dot.dataset.color ?? "#a78bfa",
          bad: dot.dataset.bad === "1",
        });
      });
      el.querySelectorAll<HTMLElement>("[data-srcaddr]").forEach((cell) => {
        const src = el.querySelector<HTMLElement>(`[data-addr="${cell.dataset.srcaddr}"]`);
        const dest = cell.querySelector<HTMLElement>("[data-addr]") ?? cell;
        if (!src) return;
        const a = src.getBoundingClientRect();
        const b = dest.getBoundingClientRect();
        const sx = a.left + a.width / 2 - base.left;
        const sy = a.top - base.top;
        const ex = b.left + b.width / 2 - base.left;
        const ey = b.bottom - base.top + 3;
        next.push({ d: `M ${sx} ${sy} C ${sx} ${sy - 36}, ${ex} ${ey + 36}, ${ex} ${ey}`, color: "#fbbf24", bad: false });
      });
      setPaths((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    // measuring the DOM after layout is exactly what this effect is for
    measure();
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 420);
    const el = root.current;
    const ro = el ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stepKey, root]);

  const colors = [...new Set(paths.map((p) => p.color))];
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        {colors.map((c) => (
          <marker
            key={c}
            id={`ah-${c.slice(1)}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => (
        <motion.path
          key={`${i}-${p.d}`}
          d={p.d}
          fill="none"
          stroke={p.color}
          strokeWidth={2}
          strokeDasharray={p.bad ? "5 4" : undefined}
          strokeLinecap="round"
          markerEnd={`url(#ah-${p.color.slice(1)})`}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.95 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 4px ${p.color}88)` }}
        />
      ))}
    </svg>
  );
}

function VarRow({ v, stepKey, prev, peers }: { v: VarView; stepKey: number; prev?: ValView; peers?: Peer[] }) {
  return (
    <div className={`px-3 py-2.5 ${v.v.k === "scalar" || v.v.k === "ptr" ? "" : "w-full"} ${v.isNew ? "rise" : ""}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm font-semibold text-white">
          {v.name}
        </span>
        <span className="rounded bg-white/[0.07] px-1.5 py-px font-mono text-[10px] text-white/55">
          {v.type}
        </span>
        {v.isNew && (
          <span className="rounded bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            new
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-white/30">
          0x{v.addr.toString(16)}
        </span>
      </div>
      <ValueView v={v.v} stepKey={stepKey} prev={prev} peers={peers} />
    </div>
  );
}

function FrameCard({
  f,
  top,
  stepKey,
  prevVars,
}: {
  f: FrameView;
  top: boolean;
  stepKey: number;
  prevVars: Map<number, ValView>;
}) {
  const peers: Peer[] = f.vars.flatMap((v) => (v.v.k === "scalar" ? [{ addr: v.v.addr, text: v.v.text }] : []));
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={`min-w-60 overflow-hidden rounded-2xl border ${
        f.vars.some((v) => v.v.k !== "scalar" && v.v.k !== "ptr") ? "w-full" : "flex-1"
      } ${
        top
          ? "border-violet-400/40 shadow-[0_8px_40px_-12px_rgba(139,92,246,0.55)]"
          : "border-white/10"
      } bg-white/[0.03]`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 ${top ? "bg-gradient-to-r from-violet-500/25 to-cyan-400/10" : "bg-white/[0.04]"}`}
      >
        <span
          className={`h-2 w-2 rounded-full ${top ? "bg-violet-400 shadow-[0_0_10px_#a78bfa]" : "bg-white/30"}`}
        />
        <span className="font-mono text-sm font-semibold">{f.fn}()</span>
        <span className="font-mono text-[11px] text-white/45">
          line {f.line}
        </span>
        {f.ret !== null && (
          <span className="ml-auto rounded-md bg-amber-400/15 px-2 py-0.5 font-mono text-[11px] text-amber-300">
            returns {f.ret}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-x-2">
        {f.vars.length ? (
          f.vars.map((v) => (
            <VarRow key={`${v.name}@${v.addr}`} v={v} stepKey={stepKey} prev={prevVars.get(v.addr)} peers={peers} />
          ))
        ) : (
          <p className="px-3 py-3 text-xs text-white/35">No variables yet</p>
        )}
      </div>
    </motion.div>
  );
}

function HeapCard({ h, stepKey }: { h: HeapView; stepKey: number }) {
  return (
    <div
      data-baddr={h.addr}
      className={`overflow-hidden rounded-2xl border bg-white/[0.03] ${h.isNew ? "rise" : ""} ${
        h.freed ? "border-red-400/25 opacity-55" : "border-amber-300/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-white/[0.04] px-3 py-2">
        <span className="rounded bg-amber-300/15 px-1.5 py-px font-mono text-[11px] font-semibold text-amber-200">
          #{h.id}
        </span>
        <span className="font-mono text-xs text-white/70">
          {h.type ? `${h.type}` : "untyped"}
        </span>
        <span className="font-mono text-[11px] text-white/40">
          {h.size} bytes
        </span>
        {h.freed && (
          <span className="rounded bg-red-400/20 px-1.5 py-px text-[10px] font-bold uppercase text-red-300">
            freed
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-white/30">
          0x{h.addr.toString(16)} · line {h.line}
        </span>
      </div>
      <div className="px-3 py-2.5">
        {h.v ? (
          <ValueView v={h.v} stepKey={stepKey} />
        ) : (
          <div data-addr={h.addr} className="font-mono text-xs text-white/40">
            {h.size} raw bytes — assign this pointer to a typed pointer (like
            int *p) to see the contents
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-xs text-white/35">
      {children}
    </div>
  );
}

export default function MemoryView({
  step,
  stepKey,
  prevStep,
}: {
  step: TraceStep;
  stepKey: number;
  prevStep?: TraceStep;
}) {
  // what each variable held one step ago, keyed by address (to draw arrows when array values move)
  const prevVars = new Map<number, ValView>();
  if (prevStep) for (const f of prevStep.frames) for (const v of f.vars) prevVars.set(v.addr, v.v);
  const root = useRef<HTMLDivElement>(null);
  const frames = [...step.frames].reverse();
  return (
    <div
      ref={root}
      className="relative flex flex-col gap-5 p-4 pr-8"
    >
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300">
          <span className="h-px flex-1 bg-gradient-to-r from-violet-400/40 to-transparent" />
          Call stack
        </h3>
        {step.globals.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-cyan-300/25 bg-white/[0.03]">
            <div className="bg-cyan-300/10 px-3 py-2 font-mono text-xs font-semibold text-cyan-200">
              global variables
            </div>
            <div className="divide-y divide-white/[0.06]">
              {step.globals.map((v) => (
                <VarRow key={v.name} v={v} stepKey={stepKey} />
              ))}
            </div>
          </div>
        )}
        {frames.length ? (
          <div className="flex flex-wrap items-start gap-3">
            {frames.map((f, i) => (
              <FrameCard
                key={`${f.fn}-${frames.length - i}`}
                f={f}
                top={i === 0}
                stepKey={stepKey}
                prevVars={prevVars}
              />
            ))}
          </div>
        ) : (
          <Empty>The stack is empty — the program has finished.</Empty>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
          <span className="h-px flex-1 bg-gradient-to-r from-amber-300/40 to-transparent" />
          Heap
        </h3>
        {step.heap.length ? (
          <div className="flex flex-wrap items-start gap-3">
            {step.heap.map((h) => (
              <div key={h.id} className="min-w-60 flex-1">
                <HeapCard h={h} stepKey={stepKey} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            Nothing on the heap.
            <br />
            Memory from <code className="text-amber-200">malloc()</code> shows
            up here.
          </Empty>
        )}
      </section>
      <Arrows root={root} stepKey={stepKey} />
    </div>
  );
}
