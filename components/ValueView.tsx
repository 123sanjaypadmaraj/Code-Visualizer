"use client";
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

export default function ValueView({ v, stepKey }: { v: ValView; stepKey: number }) {
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
        <div className="flex flex-wrap gap-x-1 gap-y-2">
          {v.items.map((it, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <ValueView v={it} stepKey={stepKey} />
              <span className="font-mono text-[10px] text-white/40">{i}</span>
            </div>
          ))}
          {v.more > 0 && <span className="self-center pl-1 text-xs text-white/40">… {v.more} more</span>}
        </div>
      )}
    </div>
  );
}
