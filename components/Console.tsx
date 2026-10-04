"use client";
import { useEffect, useRef, useState } from "react";

/** Programiz-style output box: program output with an inline input line while the program waits on stdin. */
export default function Console({
  output,
  prevOutput,
  awaitingInput,
  onSubmit,
  onEof,
}: {
  output: string;
  prevOutput: string;
  awaitingInput: boolean;
  onSubmit: (line: string) => void;
  onEof: () => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const fresh = output.startsWith(prevOutput) ? output.slice(prevOutput.length) : output;
  const old = output.slice(0, output.length - fresh.length);

  useEffect(() => {
    if (awaitingInput) input.current?.focus();
  }, [awaitingInput]);

  const submit = () => {
    onSubmit(text);
    setText("");
  };

  return (
    <div className="relative">
      <span className="absolute -top-px left-0 z-10 rounded-t border border-b-0 border-red-400/40 bg-deep px-2 py-0.5 font-mono text-[11px] text-red-300">
        Output
      </span>
      <div className="mt-[22px] flex min-h-[104px] flex-col gap-2 rounded border border-white/10 bg-raised px-4 py-3">
        <pre className="max-h-40 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-white/90">
          <span>{old}</span>
          <span className="bg-emerald-400/20">{fresh}</span>
          {awaitingInput && (
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              aria-label="Program input"
              spellCheck={false}
              className="w-40 bg-transparent font-mono text-[13px] text-cyan-200 caret-cyan-300 outline-none"
            />
          )}
        </pre>
        {awaitingInput && (
          <div className="flex items-center justify-end gap-2">
            <button onClick={onEof} className="rounded px-2 py-1 text-[11px] text-white/45 hover:text-white/80" title="Tell the program there is no more input (EOF)">
              End input
            </button>
            <button
              onClick={submit}
              className="rounded border border-cyan-400/40 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-400/10"
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
