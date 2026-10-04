import { autocompletion, completionStatus, snippetCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { linter, lintGutter, type Action, type Diagnostic } from "@codemirror/lint";
import { diagnose } from "@/lib/diagnostics";
import { fixOutcome, fixStillApplies } from "@/lib/fix";
import { Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/* ------------------------- run-count gutter (heatmap) ------------------------- */

const setHits = StateEffect.define<Map<number, number> | null>();

class HitMarker extends GutterMarker {
  constructor(
    readonly count: number,
    readonly heat: number,
  ) {
    super();
  }
  eq(o: HitMarker) {
    return o.count === this.count && o.heat === this.heat;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-hit";
    el.textContent = `×${this.count}`;
    el.style.opacity = String(0.45 + 0.55 * this.heat);
    el.style.background = `rgba(34, 211, 238, ${0.08 + 0.3 * this.heat})`;
    return el;
  }
}

const hitsField = StateField.define<Map<number, number> | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setHits)) return e.value;
    return v;
  },
});

export const hitsGutter: Extension = [
  hitsField,
  gutter({
    class: "cm-hits-gutter",
    lineMarker(view, line) {
      const hits = view.state.field(hitsField);
      if (!hits) return null;
      const n = view.state.doc.lineAt(line.from).number;
      const c = hits.get(n);
      if (!c) return null;
      let max = 1;
      for (const x of hits.values()) max = Math.max(max, x);
      return new HitMarker(c, c / max);
    },
    lineMarkerChange: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setHits))),
    initialSpacer: () => new HitMarker(9999, 0),
  }),
];

export const setHitCounts = (hits: Map<number, number> | null) => setHits.of(hits);

/* ---------------------------- click a line to jump ---------------------------- */

export const lineClick = (cb: (line: number) => void): Extension =>
  EditorView.domEventHandlers({
    mouseup(_e, view) {
      // wait for the selection to settle, then report the clicked line
      setTimeout(() => {
        const sel = view.state.selection.main;
        if (sel.empty) cb(view.state.doc.lineAt(sel.head).number);
      }, 0);
      return false;
    },
  });

/** an editor command line: "/ai <request>" or "/fix [hint]" */
const CMD_LINE = /^\s*\/(ai|fix)(\s|$)/;

/* ----------------------------- offline C completions ----------------------------- */

const KEYWORDS = [
  "int", "char", "float", "double", "long", "short", "unsigned", "signed", "void", "struct", "union", "enum", "typedef",
  "const", "static", "sizeof", "return", "break", "continue", "if", "else", "while", "do", "for", "switch", "case", "default", "NULL",
];
const FUNCS: [string, string][] = [
  ["printf", 'printf("${%d}\\n", ${});'],
  ["scanf", 'scanf("${%d}", &${});'],
  ["malloc", "malloc(${n} * sizeof(${int}))"],
  ["calloc", "calloc(${n}, sizeof(${int}))"],
  ["realloc", "realloc(${ptr}, ${size})"],
  ["free", "free(${ptr});"],
  ["strlen", "strlen(${s})"],
  ["strcpy", "strcpy(${dest}, ${src});"],
  ["strcat", "strcat(${dest}, ${src});"],
  ["strcmp", "strcmp(${a}, ${b})"],
  ["memset", "memset(${ptr}, ${0}, ${n});"],
  ["memcpy", "memcpy(${dest}, ${src}, ${n});"],
  ["abs", "abs(${x})"],
];
const SNIPPETS: Completion[] = [
  snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", { label: "for", detail: "for loop", type: "keyword", boost: 5 }),
  snippetCompletion("while (${cond}) {\n\t${}\n}", { label: "while", detail: "while loop", type: "keyword", boost: 4 }),
  snippetCompletion("if (${cond}) {\n\t${}\n}", { label: "if", detail: "if statement", type: "keyword", boost: 4 }),
  snippetCompletion("if (${cond}) {\n\t${}\n} else {\n\t\n}", { label: "ifelse", detail: "if / else", type: "keyword" }),
  snippetCompletion("int main() {\n\t${}\n\treturn 0;\n}", { label: "main", detail: "main function", type: "function", boost: 3 }),
  snippetCompletion("struct ${Name} {\n\t${int x;}\n};", { label: "struct", detail: "struct definition", type: "keyword" }),
  snippetCompletion("typedef struct ${Node} {\n\tint ${value};\n\tstruct ${Node} *next;\n} ${Node};", { label: "node", detail: "linked list node", type: "keyword" }),
  snippetCompletion("#include <${stdio.h}>", { label: "#include", detail: "header", type: "keyword" }),
];

export const cCompletions: Extension = autocompletion({
  activateOnTyping: true,
  override: [
    (ctx: CompletionContext) => {
      if (CMD_LINE.test(ctx.state.doc.lineAt(ctx.pos).text)) return null;
      const w = ctx.matchBefore(/#?\w*/);
      if (!w || (w.from === w.to && !ctx.explicit)) return null;
      const options: Completion[] = [
        ...SNIPPETS,
        ...KEYWORDS.map((k) => ({ label: k, type: "keyword" })),
        ...FUNCS.map(([name, tpl]) => snippetCompletion(tpl, { label: name, type: "function", detail: "C library" })),
      ];
      // identifiers already used in the file, so variable names complete too
      const seen = new Set(options.map((o) => o.label));
      const text = ctx.state.doc.toString();
      for (const m of text.matchAll(/\b[A-Za-z_]\w{2,}\b/g)) {
        const id = m[0];
        if (id.length < 40 && !seen.has(id) && m.index !== w.from) {
          seen.add(id);
          options.push({ label: id, type: "variable", boost: -1 });
        }
      }
      return { from: w.from, options, validFor: /^#?\w*$/ };
    },
  ],
});

/* --------------------------------- AI ghost text --------------------------------- */

const setGhost = StateEffect.define<{ pos: number; text: string } | null>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: GhostWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-ghost";
    el.textContent = this.text;
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const ghostField = StateField.define<{ pos: number; text: string } | null>({
  create: () => null,
  update(g, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    // any edit or caret move invalidates the suggestion
    if (g && (tr.docChanged || tr.selection)) return null;
    return g;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (g): DecorationSet =>
      g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)]) : Decoration.none,
    ),
});

export type AiStatus ="idle" | "thinking" | "ready" | "error";

export interface AiOptions {
  enabled: () => boolean;
  fetchCompletion: (prefix: string, suffix: string, signal: AbortSignal) => Promise<string>;
  onStatus?: (s: AiStatus) => void;
  onError?: (e: unknown) => void;
  /** "/ai <request>" + Enter: write code from a plain-English request (before/after = code around the line) */
  generate?: (prompt: string, before: string, after: string, signal: AbortSignal) => Promise<{ code: string; warning?: string }>;
  /** "/fix [hint]" + Enter: send the whole program to the AI, get the repaired program back */
  fixAll?: (code: string, hint: string, signal: AbortSignal) => Promise<{ code: string; warning?: string }>;
  /** show a short message to the user (progress / errors of "/ai" and "/fix") */
  onNotice?: (msg: string) => void;
  delayMs?: number;
}

function aiPlugin(opts: AiOptions) {
  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      ctrl: AbortController | undefined;
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate) {
        if (!u.docChanged) return;
        this.cancel();
        if (!opts.enabled() || this.view.state.readOnly) return;
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        // only suggest when the caret is at the end of a line
        if (head !== line.to) return;
        // "/ai <request>" lines are prompts for the generator, not code to complete
        if (CMD_LINE.test(line.text)) return;
        if (!line.text.trim() && u.state.doc.lines === 1) return;
        this.timer = setTimeout(() => this.request(head), opts.delayMs ?? 650);
      }
      cancel() {
        clearTimeout(this.timer);
        this.ctrl?.abort();
        this.ctrl = undefined;
      }
      async request(pos: number) {
        const doc = this.view.state.doc;
        if (this.view.state.selection.main.head !== pos) return;
        const prefix = doc.sliceString(Math.max(0, pos - 3000), pos);
        const suffix = doc.sliceString(pos, Math.min(doc.length, pos + 800));
        const ctrl = new AbortController();
        this.ctrl = ctrl;
        opts.onStatus?.("thinking");
        try {
          const text = await opts.fetchCompletion(prefix, suffix, ctrl.signal);
          if (ctrl.signal.aborted || this.view.state.selection.main.head !== pos) return;
          if (!text) return opts.onStatus?.("idle");
          this.view.dispatch({ effects: setGhost.of({ pos, text }) });
          opts.onStatus?.("ready");
        } catch (e) {
          if (!ctrl.signal.aborted) {
            opts.onError?.(e);
            opts.onStatus?.("error");
          }
        }
      }
      destroy() {
        this.cancel();
      }
    },
  );
}

export function aiGhost(opts: AiOptions): Extension {
  return [
    ghostField,
    aiPlugin(opts),
    Prec.highest(
      keymap.of([
        {
          key: "Tab",
          run(view) {
            const g = view.state.field(ghostField);
            // let the completion menu keep Tab when it is open
            if (!g || completionStatus(view.state) === "active") return false;
            view.dispatch({
              changes: { from: g.pos, insert: g.text },
              selection: { anchor: g.pos + g.text.length },
              effects: setGhost.of(null),
              userEvent: "input.complete",
            });
            return true;
          },
        },
        {
          key: "Escape",
          run(view) {
            if (!view.state.field(ghostField)) return false;
            view.dispatch({ effects: setGhost.of(null) });
            return true;
          },
        },
      ]),
    ),
  ];
}

/* ------------------- "/ai <request>" and "/fix" rewrite the whole program ------------------- */

const cmdLine = Decoration.line({ class: "cm-ai-cmd" });

/** Colours the whole "/ai ..." or "/fix ..." line so it reads as a command, not as C code. */
const cmdHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const ranges = [];
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = view.state.doc.lineAt(pos);
          if (CMD_LINE.test(line.text)) ranges.push(cmdLine.range(line.from));
          pos = line.to + 1;
        }
      }
      return Decoration.set(ranges);
    }
  },
  { decorations: (v) => v.decorations },
);

const AI_LINE = /^(\s*)\/ai\s+(\S.*?)\s*$/;
const FIX_LINE = /^(\s*)\/fix(?:\s+(.*?))?\s*$/;

export function aiPrompt(opts: () => AiOptions | undefined): Extension {
  let busy = false;
  return [
    cmdHighlight,
    Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run(view) {
            const o = opts();
            if (!o || view.state.readOnly || busy) return false;
            const sel = view.state.selection.main;
            const line = view.state.doc.lineAt(sel.head);
            if (!sel.empty || sel.head !== line.to) return false;
            const ai = AI_LINE.exec(line.text);
            const fix = ai ? null : FIX_LINE.exec(line.text);
            const run = ai ? o.generate : fix ? o.fixAll : undefined;
            if (!run) return false;
            const original = line.text;
            const doc = view.state.doc;
            // the whole program (minus the command line itself) is the context; the reply replaces all of it
            const before = doc.sliceString(0, line.from);
            const after = doc.sliceString(line.to + 1, doc.length);
            const verb = ai ? "write a new program" : "fix your program";
            busy = true;
            o.onNotice?.(ai ? "AI is writing a new program… (Esc to cancel)" : "AI is fixing your program… (Esc to cancel)");
            const ctrl = new AbortController();
            const cancel = (e: KeyboardEvent) => {
              if (e.key === "Escape") ctrl.abort();
            };
            document.addEventListener("keydown", cancel);
            const job = ai ? o.generate!(ai[2], before, after, ctrl.signal) : o.fixAll!(before + after, fix![2] ?? "", ctrl.signal);
            job
              .then(({ code, warning }) => {
                // the user may have edited while waiting: make sure the command line is still there
                if (view.state.doc.toString().indexOf(original) < 0) return o.onNotice?.(`AI finished, but the ${ai ? "/ai" : "/fix"} line was changed, so nothing was replaced`);
                view.dispatch({
                  changes: { from: 0, to: view.state.doc.length, insert: code },
                  selection: { anchor: code.length },
                  userEvent: "input.complete",
                });
                o.onNotice?.(
                  warning
                    ? `${warning}. Undo (Ctrl+Z) to get your code back.`
                    : ai
                      ? "AI replaced your code with a new program. Undo (Ctrl+Z) if it is not what you wanted."
                      : "AI fixed your program. Undo (Ctrl+Z) to get your old code back.",
                );
              })
              .catch((e) => {
                o.onNotice?.(ctrl.signal.aborted ? "Cancelled" : e instanceof Error && e.message ? `AI could not ${verb}: ${e.message}` : `AI could not ${verb}`);
              })
              .finally(() => {
                busy = false;
                document.removeEventListener("keydown", cancel);
              });
            return true;
          },
        },
      ]),
    ),
  ];
}

/* ------------------------- live error underlines (like VS Code) ------------------------- */

export interface DiagOptions {
  /** ask the AI to rewrite one line; resolves with the new line text and a short explanation */
  fetchFix?: (code: string, line: number, message: string, signal?: AbortSignal) => Promise<{ replacement: string; explanation: string; endLine?: number }>;
  /** show a short message to the user (e.g. what the AI changed) */
  onNotice?: (msg: string) => void;
}

export function liveDiagnostics(opts: () => DiagOptions | undefined): Extension {
  return [
    linter(
      (view): Diagnostic[] =>
        diagnose(view.state.doc.toString()).map((d) => {
          const actions: Action[] = [];
          if (d.fix) {
            const fix = d.fix;
            actions.push({
              name: fix.label,
              apply(v, from) {
                // positions may have shifted since the check ran; keep the fix relative to the underlined range
                const delta = from - d.from;
                v.dispatch({ changes: { from: fix.from + delta, to: fix.to + delta, insert: fix.insert }, userEvent: "input.fix" });
              },
            });
          }
          if (d.severity === "error") {
            actions.push({
              name: "✨ Fix with AI",
              async apply(v, from) {
                const o = opts();
                if (!o?.fetchFix) return;
                const line = v.state.doc.lineAt(from);
                const sent = v.state.doc.toString();
                try {
                  o.onNotice?.("AI is looking at this line…");
                  const r = await o.fetchFix(sent, line.number, d.message, AbortSignal.timeout(20000));
                  const doc = v.state.doc;
                  const endNo = Math.min(Math.max(r.endLine ?? line.number, line.number), doc.lines);
                  const expected = sent.split("\n").slice(line.number - 1, endNo);
                  if (!fixStillApplies(doc.toString(), line.number, endNo, expected)) {
                    return o.onNotice?.("AI fix skipped: you changed that line while the AI was working");
                  }
                  v.dispatch({ changes: { from: doc.line(line.number).from, to: doc.line(endNo).to, insert: r.replacement }, userEvent: "input.fix" });
                  o.onNotice?.(fixOutcome(diagnose(v.state.doc.toString()), line.number, r.explanation));
                } catch (e) {
                  o.onNotice?.(e instanceof Error && e.message ? `AI fix failed: ${e.message}` : "AI fix failed");
                }
              },
            });
          }
          return { from: d.from, to: d.to, severity: d.severity, message: d.message, source: "C check", actions };
        }),
      { delay: 350 },
    ),
    lintGutter(),
  ];
}
