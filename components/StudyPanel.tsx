"use client";
import { useMemo, useState } from "react";
import type { TraceStep } from "@/lib/c/types";
import type { Lesson } from "@/lib/lessons";
import { buildTraceTable, questionFor, type RunStats } from "@/lib/learn";

type Tab = "lesson" | "table" | "quiz" | "stats";

const TABS: { id: Tab; label: string; needsRun: boolean }[] = [
  { id: "lesson", label: "Lesson", needsRun: false },
  { id: "table", label: "Trace table", needsRun: true },
  { id: "quiz", label: "Predict", needsRun: true },
  { id: "stats", label: "Stats", needsRun: true },
];

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/80">
        {items.map((t) => (
          <li key={t}>{renderTicks(t)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Render `code` spans inside plain text. */
function renderTicks(s: string) {
  return s.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") ? (
      <code key={i} className="rounded bg-white/10 px-1 font-mono text-[0.85em] text-cyan-200">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function LessonTab({ lesson }: { lesson: Lesson | undefined }) {
  if (!lesson) {
    return (
      <p className="text-sm text-white/55">
        Pick a program from <b>Examples…</b> to see its lesson: the idea, what to watch for while stepping, common mistakes and experiments to try. For your own
        code, use the Trace table, Predict and Stats tabs.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-white/85">{renderTicks(lesson.idea)}</p>
      <Bullets title="Key concepts" items={lesson.concepts} tone="text-cyan-300" />
      <Bullets title="Watch for" items={lesson.watch} tone="text-emerald-300" />
      <Bullets title="Common pitfalls" items={lesson.pitfalls} tone="text-amber-300" />
      <Bullets title="Try it yourself" items={lesson.tryIt} tone="text-fuchsia-300" />
      {lesson.complexity && (
        <p className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
          <b className="text-white">Complexity: </b>
          {lesson.complexity}
        </p>
      )}
    </div>
  );
}

function TableTab({ steps, idx, setIdx }: { steps: TraceStep[]; idx: number; setIdx: (i: number) => void }) {
  const t = useMemo(() => buildTraceTable(steps, idx), [steps, idx]);
  if (!t.rows.length) return <p className="text-sm text-white/55">No variables have changed yet. Step forward.</p>;
  const MAX = 150;
  const rows = t.rows.slice(-MAX);
  return (
    <div>
      <p className="mb-2 text-xs text-white/50">
        One row per step where something changed, like a hand-written dry run. A dot means the value stayed the same. Click a row to jump to that step.
        {t.rows.length > MAX && ` Showing the latest ${MAX} rows.`}
      </p>
      <div className="max-h-72 overflow-auto rounded border border-white/10">
        <table className="w-full border-collapse font-mono text-xs">
          <thead className="sticky top-0 bg-raised text-white/70">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">step</th>
              <th className="px-2 py-1.5 text-left font-semibold">line</th>
              {t.columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                  {c.replace(/^main\./, "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.step}
                onClick={() => setIdx(r.step)}
                className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${r.step === idx ? "bg-emerald-400/10" : ""}`}
              >
                <td className="px-2 py-1 text-white/45">{r.step + 1}</td>
                <td className="px-2 py-1 text-white/45">{r.line}</td>
                {r.cells.map((c, j) => (
                  <td key={j} className={`whitespace-nowrap px-2 py-1 ${c === null ? "text-white/20" : "font-semibold text-cyan-200"}`}>
                    {c ?? "·"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuizTab({
  steps,
  idx,
  lineText,
  setIdx,
}: {
  steps: TraceStep[];
  idx: number;
  lineText: (line: number) => string;
  setIdx: (i: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const q = useMemo(() => questionFor(steps, idx, lineText), [steps, idx, lineText]);
  const answered = Object.entries(answers);
  const correct = answered.filter(([i, a]) => questionFor(steps, Number(i), lineText)?.answer === a).length;
  const picked = answers[idx];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-white/55">
        <span>Predict before you step: think first, then answer.</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white/80">
          Score {correct}/{answered.length}
        </span>
      </div>
      {!q ? (
        <p className="text-sm text-white/55">No prediction for this step. Move forward to the next one.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[15px] leading-relaxed text-white/90">{renderTicks(q.prompt)}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Answer choices">
            {q.choices.map((c) => {
              const isPicked = picked === c;
              const isAnswer = q.answer === c;
              const style =
                picked === undefined
                  ? "border-white/15 bg-surface hover:bg-surface-hover"
                  : isAnswer
                    ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-100"
                    : isPicked
                      ? "border-red-400/70 bg-red-400/15 text-red-100"
                      : "border-white/10 bg-surface opacity-50";
              return (
                <button
                  key={c}
                  disabled={picked !== undefined}
                  onClick={() => setAnswers((a) => ({ ...a, [idx]: c }))}
                  className={`min-w-16 rounded border px-4 py-2 font-mono text-sm text-white transition-colors ${style}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {picked !== undefined && (
            <div
              className={`rounded border px-3 py-2 text-sm ${picked === q.answer ? "border-emerald-400/40 bg-emerald-400/10" : "border-red-400/40 bg-red-400/10"}`}
              aria-live="polite"
            >
              <b>{picked === q.answer ? "Correct. " : `Not quite, the answer is ${q.answer}. `}</b>
              <span className="text-white/80">{q.why}</span>
              <div className="mt-2">
                <button
                  onClick={() => setIdx(idx + 1)}
                  className="rounded border border-white/15 bg-surface px-3 py-1.5 text-xs font-semibold text-white hover:bg-surface-hover"
                >
                  Show the next step →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatsTab({
  stats,
  lineText,
  showHeat,
  setShowHeat,
  leakWarning,
}: {
  stats: RunStats;
  lineText: (line: number) => string;
  showHeat: boolean;
  setShowHeat: (v: boolean) => void;
  leakWarning: string | undefined;
}) {
  const tile = "rounded border border-white/10 bg-white/[0.04] px-3 py-2";
  const top = stats.hottest.slice(0, 5);
  const max = top[0]?.count ?? 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={tile}>
          <div className="text-xs text-white/50">Steps so far</div>
          <div className="text-lg font-semibold text-white">{stats.steps}</div>
        </div>
        <div className={tile}>
          <div className="text-xs text-white/50">Function calls</div>
          <div className="text-lg font-semibold text-white">{stats.calls}</div>
        </div>
        <div className={tile}>
          <div className="text-xs text-white/50">Max stack depth</div>
          <div className="text-lg font-semibold text-white">{stats.maxDepth}</div>
        </div>
        <div className={tile}>
          <div className="text-xs text-white/50">Heap now / peak</div>
          <div className="text-lg font-semibold text-white">
            {stats.liveHeapBytes} / {stats.peakHeapBytes} B
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Busiest lines</h4>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} />
            Show run counts in the editor
          </label>
        </div>
        {top.length === 0 ? (
          <p className="text-sm text-white/55">Nothing has run yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {top.map((h) => (
              <li key={h.line} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 font-mono text-white/50">line {h.line}</span>
                <span className="relative h-5 flex-1 overflow-hidden rounded bg-white/5">
                  <span className="absolute inset-y-0 left-0 bg-cyan-400/25" style={{ width: `${(h.count / max) * 100}%` }} />
                  <span className="absolute inset-0 truncate px-2 font-mono leading-5 text-white/80">{lineText(h.line).trim()}</span>
                </span>
                <span className="w-10 shrink-0 text-right font-semibold text-white">×{h.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-white/45">
          Lines that run many times are where the time goes. Nested loops multiply: an inner line of a loop in a loop runs n × n times, which is O(n²).
        </p>
      </div>

      {leakWarning && <p className="rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">⚠ {leakWarning}</p>}
    </div>
  );
}

export default function StudyPanel({
  lesson,
  steps,
  idx,
  setIdx,
  running,
  lineText,
  stats,
  showHeat,
  setShowHeat,
  warnings,
}: {
  lesson: Lesson | undefined;
  steps: TraceStep[];
  idx: number;
  setIdx: (i: number) => void;
  running: boolean;
  lineText: (line: number) => string;
  stats: RunStats | null;
  showHeat: boolean;
  setShowHeat: (v: boolean) => void;
  warnings: string[];
}) {
  const [tab, setTab] = useState<Tab>("lesson");
  const active = !running && tab !== "lesson" ? "lesson" : tab;
  const leak = warnings.find((w) => /leak/i.test(w));
  const atEnd = idx >= steps.length - 1;

  return (
    <section className="shrink-0 rounded border border-white/10 bg-deep" aria-label="Study panel">
      <div className="flex border-b border-white/10" role="tablist">
        {TABS.map((t) => {
          const disabled = t.needsRun && !running;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              disabled={disabled}
              onClick={() => setTab(t.id)}
              title={disabled ? "Press Start Visualizer first" : undefined}
              className={`px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                active === t.id ? "border-b-2 border-cyan-400 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="p-4" role="tabpanel">
        {active === "lesson" && <LessonTab lesson={lesson} />}
        {active === "table" && running && <TableTab steps={steps} idx={idx} setIdx={setIdx} />}
        {active === "quiz" && running && <QuizTab steps={steps} idx={idx} lineText={lineText} setIdx={setIdx} />}
        {active === "stats" && running && stats && (
          <StatsTab stats={stats} lineText={lineText} showHeat={showHeat} setShowHeat={setShowHeat} leakWarning={atEnd ? leak : undefined} />
        )}
      </div>
    </section>
  );
}
