"use client";
import { useState } from "react";

export default function Console({
  output,
  prevOutput,
  stdin,
  setStdin,
}: {
  output: string;
  prevOutput: string;
  stdin: string;
  setStdin: (s: string) => void;
}) {
  const [tab, setTab] = useState<"out" | "in">("out");
  const fresh = output.startsWith(prevOutput) ? output.slice(prevOutput.length) : output;
  const old = output.slice(0, output.length - fresh.length);
  return (
    <div className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 pt-1.5">
        {(
          [
            ["out", "Output"],
            ["in", "Input (stdin)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === id ? "bg-black/30 text-white" : "text-white/45 hover:text-white/75"
            }`}
          >
            {label}
            {id === "in" && stdin && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" />}
          </button>
        ))}
      </div>
      {tab === "out" ? (
        <pre className="h-28 flex-1 overflow-auto whitespace-pre-wrap bg-black/30 px-4 py-3 font-mono text-[13px] leading-relaxed">
          {output ? (
            <>
              <span className="text-emerald-300/80">{old}</span>
              <span className="rounded bg-emerald-400/20 text-emerald-200">{fresh}</span>
            </>
          ) : (
            <span className="text-white/30">$ program output appears here</span>
          )}
        </pre>
      ) : (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Type what scanf() / getchar() / fgets() should read, e.g.  7  or  3 4"
          spellCheck={false}
          className="h-28 flex-1 resize-none bg-black/30 px-4 py-3 font-mono text-[13px] leading-relaxed text-cyan-100 placeholder:text-white/30"
        />
      )}
    </div>
  );
}
