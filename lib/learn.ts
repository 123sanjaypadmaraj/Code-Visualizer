import type { TraceStep, ValView, VarView } from "./c/types";

/* ------------------------------ trace table ------------------------------ */

export interface TraceTable {
  columns: string[];
  rows: { step: number; line: number; cells: (string | null)[] }[];
}

/** Short one-cell summary of a value. */
export function cellText(v: ValView): string {
  switch (v.k) {
    case "scalar":
    case "ptr":
      return v.text;
    case "array": {
      if (v.str !== null) return JSON.stringify(v.str);
      const inner = v.items.map(cellText).join(", ");
      return `{${inner}${v.more ? ", …" : ""}}`;
    }
    case "struct":
      return `{${v.fields.map((f) => `${f.name}: ${cellText(f.v)}`).join(", ")}}`;
  }
}

function visibleVars(s: TraceStep): { key: string; v: VarView }[] {
  const out: { key: string; v: VarView }[] = s.globals.map((v) => ({ key: v.name, v }));
  for (const f of s.frames) for (const v of f.vars) out.push({ key: `${f.fn}.${v.name}`, v });
  return out;
}

/**
 * Classic "trace table": one column per variable, one row per step in which
 * at least one variable changed. Unchanged cells are null so the table reads
 * like a hand-written dry run.
 */
export function buildTraceTable(steps: TraceStep[], upTo = steps.length - 1): TraceTable {
  const columns: string[] = [];
  const last = new Map<string, string>();
  const snaps: { step: number; line: number; cur: Map<string, string> }[] = [];
  for (let i = 0; i <= upTo && i < steps.length; i++) {
    const cur = new Map<string, string>();
    for (const { key, v } of visibleVars(steps[i])) {
      if (v.v.k === "scalar" && v.v.uninit) continue;
      cur.set(key, cellText(v.v));
    }
    let changed = false;
    for (const [k, t] of cur) {
      if (last.get(k) !== t) {
        changed = true;
        if (!columns.includes(k)) columns.push(k);
      }
    }
    if (!changed) continue;
    snaps.push({ step: i, line: steps[i].line, cur });
    for (const [k, t] of cur) last.set(k, t);
  }
  const rows = snaps.map((r) => ({ step: r.step, line: r.line, cells: columns.map((c) => r.cur.get(c) ?? null) }));
  // blank out cells that did not change since the previous row
  for (let i = rows.length - 1; i > 0; i--) {
    rows[i].cells = rows[i].cells.map((c, j) => (c === rows[i - 1].cells[j] ? null : c));
  }
  return { columns, rows };
}

/* -------------------------------- stats -------------------------------- */

export interface RunStats {
  steps: number;
  calls: number;
  conditionChecks: number;
  maxDepth: number;
  peakHeapBytes: number;
  liveHeapBytes: number;
  /** execution count per source line, counting steps up to and including `upTo` */
  hits: Map<number, number>;
  /** lines sorted by how often they ran */
  hottest: { line: number; count: number }[];
}

export function computeStats(steps: TraceStep[], upTo = steps.length - 1): RunStats {
  const hits = new Map<number, number>();
  let calls = 0;
  let conds = 0;
  let maxDepth = 0;
  let peak = 0;
  let live = 0;
  for (let i = 0; i <= upTo && i < steps.length; i++) {
    const s = steps[i];
    // the synthetic start/end steps are not source lines being executed
    if (s.kind !== "start" && s.kind !== "end") hits.set(s.line, (hits.get(s.line) ?? 0) + 1);
    if (s.kind === "call") calls++;
    if (s.kind === "cond") conds++;
    maxDepth = Math.max(maxDepth, s.frames.length);
    live = s.heap.filter((b) => !b.freed).reduce((n, b) => n + b.size, 0);
    peak = Math.max(peak, live);
  }
  const hottest = [...hits.entries()].map(([line, count]) => ({ line, count })).sort((a, b) => b.count - a.count || a.line - b.line);
  return { steps: Math.min(upTo + 1, steps.length), calls, conditionChecks: conds, maxDepth, peakHeapBytes: peak, liveHeapBytes: live, hits, hottest };
}

/* -------------------------------- quiz -------------------------------- */

export type Question =
  | { kind: "value"; prompt: string; choices: string[]; answer: string; why: string }
  | { kind: "cond"; prompt: string; choices: string[]; answer: string; why: string };

function topVars(s: TraceStep): VarView[] {
  return s.frames.length ? s.frames[s.frames.length - 1].vars : [];
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let x = seed * 2654435761 + 12345;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a "predict the next step" question from the step you are looking at
 * (`idx`) and the one that follows. Returns null when nothing interesting
 * happens next. Deterministic: the same step always gives the same question.
 */
export function questionFor(steps: TraceStep[], idx: number, lineText: (line: number) => string): Question | null {
  const cur = steps[idx];
  const next = steps[idx + 1];
  if (!cur || !next || next.kind === "end" || next.kind === "error" || next.kind === "start") return null;
  const code = lineText(next.line).trim();

  if (next.kind === "cond") {
    const m = next.explain.match(/is (true|false) —/);
    if (!m) return null;
    return {
      kind: "cond",
      prompt: `Line ${next.line} (\`${code}\`) is about to be checked. Will the condition be true or false?`,
      choices: ["true", "false"],
      answer: m[1],
      why: next.explain,
    };
  }

  if (next.kind !== "stmt") return null;
  const before = new Map(topVars(cur).map((v) => [v.name, v]));
  for (const v of topVars(next)) {
    if (v.v.k !== "scalar" || !v.v.num || v.v.uninit || !v.v.changed) continue;
    const old = before.get(v.name);
    const oldText = old && old.v.k === "scalar" && !old.v.uninit ? old.v.text : null;
    if (oldText === v.v.text) continue;
    const n = Number(v.v.text);
    if (!Number.isFinite(n)) continue;
    const isInt = Number.isInteger(n);
    const fmt = (x: number) => (isInt ? String(x) : String(Math.round(x * 100) / 100));
    const pool = new Set<string>([fmt(n + 1), fmt(n - 1), fmt(n * 2), fmt(-n)]);
    if (oldText !== null) pool.add(oldText);
    pool.delete(v.v.text);
    const wrong = shuffle([...pool], idx).slice(0, 3);
    if (wrong.length < 2) continue;
    return {
      kind: "value",
      prompt: `Line ${next.line} (\`${code}\`) is about to run. What will \`${v.name}\` be afterwards?`,
      choices: shuffle([v.v.text, ...wrong], idx + 7),
      answer: v.v.text,
      why: next.explain,
    };
  }
  return null;
}
