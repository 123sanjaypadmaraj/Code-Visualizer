"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ValView } from "@/lib/c/types";

const PTR_COLORS = ["#a78bfa", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#fb7185"];
export const ptrColor = (addr: number) => PTR_COLORS[Math.floor(addr / 8) % PTR_COLORS.length];

const cellBase =
  "relative flex h-10 min-w-11 items-center justify-center rounded-lg border px-2.5 font-mono text-[13px] transition-colors";

function Leaf({ v, stepKey }: { v: Extract<ValView, { k: "scalar" | "ptr" }>; stepKey: number }) {
  if (v.k === "ptr") {
    const color = ptrColor(v.addr);
    const isNull = v.text === "NULL";
    return (
      <div
        key={v.changed ? `c${stepKey}` : "n"}
        data-addr={v.addr}
        title={v.uninit ? "uninitialized pointer" : `pointer to ${v.pointee}`}
        className={`${cellBase} gap-2 pr-1.5 ${v.changed ? "flash" : ""} ${
          v.uninit
            ? "border-dashed border-white/15 text-white/35"
            : v.bad
              ? "border-red-400/70 bg-red-500/10 text-red-200"
              : isNull
                ? "border-white/15 bg-white/[0.03] text-white/55"
                : "border-white/15 bg-white/[0.04] text-white/90"
        }`}
      >
        <span>{v.text}</span>
        {v.str !== null && <span className="max-w-32 truncate text-teal-300">&quot;{v.str}&quot;</span>}
        {v.bad && <span title="dangling pointer">⚠</span>}
        {!v.uninit && !isNull && (
          <span
            data-ptr=""
            data-target={v.target ?? 0}
            data-tostruct={v.toStruct ? "1" : "0"}
            data-bad={v.bad ? "1" : "0"}
            data-color={color}
            className="h-3 w-3 shrink-0 rounded-full border-2"
            style={{ borderColor: color, background: `${color}55` }}
          />
        )}
        {isNull && <span className="text-[10px] text-white/35">⌀</span>}
      </div>
    );
  }
  return (
    <div
      key={v.changed ? `c${stepKey}` : "n"}
      data-addr={v.addr}
      className={`${cellBase} ${v.changed ? "flash" : ""} ${
        v.uninit
          ? "border-dashed border-white/15 text-white/30"
          : "border-white/15 bg-white/[0.04] " + (v.ch ? "text-teal-300" : "text-sky-100")
      }`}
    >
      {v.text}
    </div>
  );
}

const isLeaf = (v: ValView): v is Extract<ValView, { k: "scalar" | "ptr" }> => v.k === "scalar" || v.k === "ptr";

interface Move {
  from: number;
  to: number;
}

export interface Peer {
  addr: number;
  text: string;
}

/** Array slots that got a value from another slot (`moves`) or from nowhere in the array (`fresh`, e.g. `a[j] = tmp`). */
function findChanges(items: ValView[], prev: ValView | undefined): { moves: Move[]; fresh: number[] } {
  if (!prev || prev.k !== "array" || prev.items.length !== items.length) return { moves: [], fresh: [] };
  const fresh: number[] = [];
  const text = (x: ValView) => (x.k === "scalar" || x.k === "ptr" ? x.text : null);
  const moves: Move[] = [];
  items.forEach((it, i) => {
    const now = text(it);
    if (now === null || now === text(prev.items[i]) || (it.k === "scalar" && it.uninit)) return;
    let best = -1;
    prev.items.forEach((p, k) => {
      if (k !== i && text(p) === now && (best < 0 || Math.abs(k - i) < Math.abs(best - i))) best = k;
    });
    if (best >= 0) moves.push({ from: best, to: i });
    else fresh.push(i);
  });
  return { moves, fresh };
}

function ArrayRow({ items, prev, more, stepKey, peers }: { items: ValView[]; prev?: ValView; more: number; stepKey: number; peers?: Peer[] }) {
  const root = useRef<HTMLDivElement>(null);
  const { moves, fresh } = findChanges(items, prev);
  // value came from a plain variable (like tmp): the last declared one holding that value
  const srcOf = (i: number) => {
    const it = items[i];
    const text = it.k === "scalar" || it.k === "ptr" ? it.text : null;
    return text === null ? undefined : [...(peers ?? [])].reverse().find((p) => p.text === text)?.addr;
  };
  const [arcs, setArcs] = useState<{ d: string; key: string }[]>([]);
  const sig = moves.map((m) => `${m.from}>${m.to}`).join(",");

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !sig) {
      setArcs([]);
      return;
    }
    const base = el.getBoundingClientRect();
    const next = sig.split(",").map((pair) => {
      const [from, to] = pair.split(">").map(Number);
      const rect = (i: number) => el.querySelector<HTMLElement>(`[data-cell="${i}"]`)?.getBoundingClientRect();
      const a = rect(from);
      const b = rect(to);
      if (!a || !b) return { d: "", key: pair };
      const x1 = a.left + a.width / 2 - base.left + el.scrollLeft;
      const x2 = b.left + b.width / 2 - base.left + el.scrollLeft;
      const y = 26;
      const lift = Math.min(22, 10 + Math.abs(x2 - x1) / 8);
      return { d: `M ${x1} ${y} C ${x1} ${y - lift}, ${x2} ${y - lift}, ${x2} ${y - 2}`, key: pair };
    });
    setArcs(next.filter((a) => a.d));
  }, [sig, stepKey]);

  return (
    <div ref={root} className="relative flex flex-nowrap items-end gap-x-1 overflow-x-auto pb-1 pt-7">
      {arcs.length > 0 && (
        <svg className="pointer-events-none absolute left-0 top-0 h-8 w-full overflow-visible" aria-hidden>
          <defs>
            <marker id="mv-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
            </marker>
          </defs>
          {arcs.map((a) => (
            <motion.path
              key={`${a.key}-${stepKey}`}
              d={a.d}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={2}
              strokeLinecap="round"
              markerEnd="url(#mv-ah)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          ))}
        </svg>
      )}
      {items.map((it, i) => (
        <div key={i} data-cell={i} data-srcaddr={fresh.includes(i) ? srcOf(i) : undefined} className="flex shrink-0 flex-col items-center gap-1">
          <ValueView v={it} stepKey={stepKey} />
          <span className="font-mono text-[11px] text-white/50">{i}</span>
        </div>
      ))}
      {more > 0 && <span className="self-center pl-1 text-xs text-white/40">… {more} more</span>}
    </div>
  );
}

export default function ValueView({ v, stepKey, prev, peers }: { v: ValView; stepKey: number; prev?: ValView; peers?: Peer[] }) {
  if (isLeaf(v)) return <Leaf v={v} stepKey={stepKey} />;

  if (v.k === "struct") {
    return (
      <div data-saddr={v.addr} className="overflow-hidden rounded-lg border border-white/12 bg-black/20">
        <div className="border-b border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/45">
          {v.tag}
        </div>
        <div className="divide-y divide-white/[0.06]">
          {v.fields.map((f) => (
            <div key={f.name} className="flex items-center justify-between gap-4 px-2.5 py-1.5">
              <span className="font-mono text-xs text-violet-300">.{f.name}</span>
              <ValueView v={f.v} stepKey={stepKey} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const nested = v.items.length > 0 && !isLeaf(v.items[0]);
  return (
    <div className="min-w-0">
      {v.str !== null && (
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-md bg-teal-400/10 px-2 py-0.5 font-mono text-xs text-teal-200">
          <span className="text-teal-300/60">string</span>&quot;{v.str}&quot;
        </div>
      )}
      {nested ? (
        <div className="flex flex-col gap-2">
          {v.items.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 w-8 shrink-0 text-right font-mono text-[10px] text-white/40">[{i}]</span>
              <ValueView v={it} stepKey={stepKey} />
            </div>
          ))}
          {v.more > 0 && <span className="text-xs text-white/40">… {v.more} more</span>}
        </div>
      ) : (
        <ArrayRow items={v.items} prev={prev} more={v.more} stepKey={stepKey} peers={peers} />
      )}
    </div>
  );
}
