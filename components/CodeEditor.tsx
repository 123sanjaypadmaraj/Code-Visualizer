"use client";
import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { useEffect, useMemo, useRef } from "react";
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

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "#1d202a !important" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "transparent !important", border: "none", color: "rgba(255,255,255,0.28)" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "rgba(255,255,255,0.7)" },
  ".cm-content": { caretColor: "#67e8f9", padding: "10px 0" },
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
  ".cm-hit": { display: "inline-block", padding: "0 5px", margin: "1px 2px", borderRadius: "4px", fontSize: "11px", color: "#a5f3fc" },
  ".cm-ghost": { color: "rgba(255,255,255,0.32)", fontStyle: "italic", whiteSpace: "pre" },
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
  ".cm-tooltip.cm-tooltip-lint": { backgroundColor: "#262830", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "4px" },
  ".cm-diagnostic": { fontSize: "13px", padding: "6px 8px" },
  ".cm-diagnosticAction": { background: "#23262f", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "4px", color: "#a5f3fc", padding: "2px 8px", margin: "4px 4px 0 0", cursor: "pointer" },
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
      theme={oneDark}
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
