"use client";
import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "@/lib/theme";
import { aiGhost, aiPrompt, cCompletions, hitsGutter, liveDiagnostics, lineClick, setHitCounts, type AiOptions, type DiagOptions } from "./editorExtras";

interface Marks {
  active: number | null;
  error: number | null;
}

const setMarks = StateEffect.define<Marks>();
const activeMark = Decoration.line({ class: "cm-active-step" });
const errorMark = Decoration.line({ class: "cm-error-line" });

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const doc = tr.state.doc;
      const ranges: Range<Decoration>[] = [];
      const add = (line: number | null, mark: Decoration) => {
        if (line !== null && line >= 1 && line <= doc.lines) ranges.push(mark.range(doc.line(line).from));
      };
      const { active, error } = e.value;
      if (error !== null && error === active) add(error, errorMark);
      else {
        add(active, activeMark);
        add(error, errorMark);
      }
      return Decoration.set(ranges, true);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Both the chrome and the syntax colours read CSS variables from lib/themes.ts, so switching the
// page theme restyles the editor without reconfiguring it.
const ink = (pct: number) => `color-mix(in srgb, var(--ink) ${pct}%, transparent)`;
const tint = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--syn-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syn-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syn-fn)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type)" },
  { tag: [t.operator, t.punctuation, t.separator], color: "var(--syn-op)" },
  { tag: [t.processingInstruction, t.meta, t.macroName], color: "var(--syn-meta)" },
  { tag: [t.propertyName, t.definition(t.variableName)], color: "var(--ink)" },
  { tag: t.invalid, color: "var(--syn-meta)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", color: "var(--ink)", backgroundColor: "var(--editor-bg) !important" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "transparent !important", border: "none", color: ink(30) },
  ".cm-activeLine": { backgroundColor: ink(5) },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: ink(75) },
  ".cm-content": { caretColor: "var(--accent-2)", padding: "10px 0" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent-2)" },
  ".cm-selectionBackground": { background: `${tint("--accent", 22)} !important` },
  "&.cm-focused .cm-selectionBackground": { background: `${tint("--accent", 38)} !important` },
  ".cm-matchingBracket": { backgroundColor: tint("--accent-2", 25), outline: `1px solid ${tint("--accent-2", 55)}` },
  ".cm-active-step": {
    position: "relative",
    background: "rgba(76,175,80,0.1)",
    borderTop: "1px solid #4caf50",
    borderBottom: "1px solid #4caf50",
  },
  ".cm-active-step::after": {
    content: '"◀"',
    position: "absolute",
    right: "6px",
    top: "0",
    color: "#4caf50",
    fontSize: "13px",
  },
  ".cm-hits-gutter": { minWidth: "38px" },
  ".cm-hit": { display: "inline-block", padding: "0 5px", margin: "1px 2px", borderRadius: "4px", fontSize: "11px", color: "var(--accent-2)" },
  ".cm-ghost": { color: ink(35), fontStyle: "italic", whiteSpace: "pre" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    background: "rgba(248,113,113,0.22)",
    textDecoration: "underline wavy #f87171",
    textDecorationThickness: "1.5px",
    textUnderlineOffset: "3px",
    borderRadius: "2px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy #fbbf24",
    textDecorationThickness: "1.5px",
    textUnderlineOffset: "3px",
  },
  ".cm-tooltip": { backgroundColor: "var(--raised)", color: "var(--ink)", border: `1px solid ${ink(18)}`, borderRadius: "8px" },
  ".cm-tooltip.cm-tooltip-lint": { padding: "4px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: tint("--accent", 30), color: "var(--ink)" },
  ".cm-diagnostic": { fontSize: "13px", padding: "6px 8px" },
  ".cm-diagnosticAction": { background: "var(--surface)", border: `1px solid ${ink(20)}`, borderRadius: "4px", color: "var(--accent-2)", padding: "2px 8px", margin: "4px 4px 0 0", cursor: "pointer" },
  ".cm-error-line": {
    background: "linear-gradient(90deg, rgba(248,113,113,0.3), rgba(248,113,113,0.05) 70%, transparent)",
    boxShadow: "inset 3px 0 0 #f87171",
  },
});

export default function CodeEditor({
  value,
  onChange,
  activeLine,
  errorLine,
  onCursorLine,
  readOnly = false,
  hits = null,
  onLineClick,
  ai,
  diag,
}: {
  value: string;
  onChange: (v: string) => void;
  activeLine: number | null;
  errorLine: number | null;
  /** called with the 1-based line the caret is on whenever it moves or the text changes */
  onCursorLine?: (line: number) => void;
  /** lock editing (while the program is being visualized) */
  readOnly?: boolean;
  /** per-line execution counts shown in a gutter (null hides it) */
  hits?: Map<number, number> | null;
  /** called with the 1-based line when the user clicks a line */
  onLineClick?: (line: number) => void;
  /** AI ghost-text autocomplete (omit to disable) */
  ai?: AiOptions;
  /** live error underlines are always on; this adds the AI "fix this line" action */
  diag?: DiagOptions;
}) {
  const { kind } = useTheme();
  const view = useRef<EditorView | null>(null);
  // refs keep the extension list stable so the editor is not reconfigured on every render
  const clickRef = useRef(onLineClick);
  const aiRef = useRef(ai);
  const diagRef = useRef(diag);
  useEffect(() => {
    clickRef.current = onLineClick;
    aiRef.current = ai;
    diagRef.current = diag;
  });
  const extensions: Extension[] = useMemo(
    () => [
      cpp(),
      cCompletions,
      // eslint-disable-next-line react-hooks/refs -- refs are only read later, inside event callbacks
      liveDiagnostics(() => diagRef.current),
      hitsGutter,
      // eslint-disable-next-line react-hooks/refs -- refs are only read later, inside event callbacks
      lineClick((l) => clickRef.current?.(l)),
      // eslint-disable-next-line react-hooks/refs -- refs are only read later, inside event callbacks
      aiGhost({
        enabled: () => !!aiRef.current?.enabled(),
        fetchCompletion: (p, s, sig) => aiRef.current!.fetchCompletion(p, s, sig),
        onStatus: (st) => aiRef.current?.onStatus?.(st),
        onError: (e) => aiRef.current?.onError?.(e),
        delayMs: ai?.delayMs,
      }),
      // eslint-disable-next-line react-hooks/refs -- refs are only read later, inside event callbacks
      aiPrompt(() => aiRef.current),
      marksField,
      theme,
      syntaxHighlighting(highlight),
      EditorView.updateListener.of((u) => {
        if (!u.selectionSet && !u.docChanged) return;
        onCursorLine?.(u.state.doc.lineAt(u.state.selection.main.head).number);
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ai/click handlers are read through refs
    [onCursorLine],
  );

  useEffect(() => {
    view.current?.dispatch({ effects: setHitCounts(hits) });
  }, [hits]);

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of({ active: activeLine, error: errorLine }) });
  }, [activeLine, errorLine, value]);

  // keep the executing line in view while stepping
  useEffect(() => {
    const v = view.current;
    if (!v || activeLine === null || activeLine < 1 || activeLine > v.state.doc.lines) return;
    const pos = v.state.doc.line(activeLine).from;
    v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "nearest", yMargin: 48 }) });
  }, [activeLine]);

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={kind}
      extensions={extensions}
      onCreateEditor={(v) => {
        view.current = v;
        v.dispatch({ effects: [setMarks.of({ active: activeLine, error: errorLine }), setHitCounts(hits)] });
      }}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{ foldGutter: false, highlightActiveLine: true, autocompletion: false }}
      className="h-full"
    />
  );
}
