import { lex, type Token } from "./c/lexer";
import { parseC } from "./c/parser";
import { CError } from "./c/types";

/** One problem in the source, with an optional one-click fix (a text edit). */
export interface Diag {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
  /** 1-based line of the problem */
  line: number;
  fix?: { label: string; from: number; to: number; insert: string };
}

const lineOf = (src: string, off: number) => src.slice(0, off).split("\n").length;

/** [start, end) of the line that contains `off`, trimmed of leading/trailing whitespace. */
function trimmedLine(src: string, line: number): [number, number] {
  let start = 0;
  for (let n = 1; n < line; n++) {
    const nl = src.indexOf("\n", start);
    if (nl < 0) return [src.length, src.length];
    start = nl + 1;
  }
  let end = src.indexOf("\n", start);
  if (end < 0) end = src.length;
  const text = src.slice(start, end);
  const lead = text.length - text.trimStart().length;
  return [start + lead, start + text.trimEnd().length];
}

/** Find the innermost bracket that is never closed (skipping comments, strings and directives). */
function lastUnclosed(src: string): { ch: string; off: number } | null {
  const stack: { ch: string; off: number }[] = [];
  const close: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") while (i < src.length && src[i] !== "\n") i++;
    else if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
    } else if (c === "#" && /^\s*$/.test(src.slice(src.lastIndexOf("\n", i - 1) + 1, i))) {
      while (i < src.length && src[i] !== "\n") i++;
    } else if ("([{".includes(c)) stack.push({ ch: c, off: i });
    else if (close[c] && stack.length && stack[stack.length - 1].ch === close[c]) stack.pop();
  }
  return stack.length ? stack[stack.length - 1] : null;
}

function widen(src: string, from: number, to: number): [number, number] {
  from = Math.max(0, Math.min(from, src.length));
  to = Math.max(0, Math.min(to, src.length));
  if (to > from) return [from, to];
  // keep at least one character so there is something to underline
  return from > 0 && src[from - 1] !== "\n" ? [from - 1, from] : [from, Math.min(from + 1, src.length)];
}

function fromParseError(src: string, e: CError): Diag {
  let { from, to } = e;
  let message = e.message;
  let fix: Diag["fix"];
  if (/end of file/.test(message)) {
    // point at the bracket that was never closed instead of at the end of the file
    const open = lastUnclosed(src);
    if (open) {
      from = open.off;
      to = open.off + 1;
      const want = { "(": ")", "[": "]", "{": "}" }[open.ch] as string;
      message = `Unclosed '${open.ch}'. It is never closed with '${want}'.`;
      if (open.ch !== "(") fix = { label: `Add '${want}' at the end`, from: src.length, to: src.length, insert: `\n${want}` };
    }
  }
  if (from === undefined || to === undefined) [from, to] = trimmedLine(src, e.line);
  [from, to] = widen(src, from, to);
  if (!fix && e.insert !== undefined && e.fixAt !== undefined) {
    fix = { label: `Insert '${e.insert}'`, from: e.fixAt, to: e.fixAt, insert: e.insert };
  }
  return { from, to, severity: "error", message, line: lineOf(src, from), fix };
}

const HEADERS: Record<string, string[]> = {
  "stdio.h": ["printf", "scanf", "puts", "putchar", "getchar", "fprintf", "sprintf", "snprintf", "fopen", "fclose", "fgets"],
  "stdlib.h": ["malloc", "calloc", "realloc", "free", "exit", "abs", "rand", "srand", "atoi", "atof", "qsort"],
  "string.h": ["strlen", "strcpy", "strncpy", "strcat", "strcmp", "strncmp", "memset", "memcpy", "memmove", "strchr", "strstr"],
  "math.h": ["sqrt", "pow", "sin", "cos", "tan", "floor", "ceil", "fabs", "log", "exp"],
};

function warnings(src: string): Diag[] {
  let toks: Token[];
  try {
    toks = lex(src);
  } catch {
    return [];
  }
  const out: Diag[] = [];
  const warnedHeader = new Set<string>();

  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    if (t.off === undefined || t.end === undefined) continue;

    // call to a library function whose header is not included
    if (t.k === "id" && toks[i + 1].s === "(" && toks[i + 1].k === "p") {
      const header = Object.keys(HEADERS).find((h) => HEADERS[h].includes(t.s));
      const prev = toks[i - 1];
      const isCall = !(prev && prev.k === "id" && prev.s !== "return" && prev.s !== "else"); // skip declarations like `int printf(`
      if (header && isCall && !warnedHeader.has(header) && !new RegExp(`#\\s*include\\s*[<"]${header.replace(".", "\\.")}[>"]`).test(src)) {
        warnedHeader.add(header);
        out.push({
          from: t.off,
          to: t.end,
          severity: "warning",
          message: `'${t.s}' needs #include <${header}>. Without it, real C compilers warn or fail.`,
          line: t.line,
          fix: { label: `Add #include <${header}>`, from: 0, to: 0, insert: `#include <${header}>\n` },
        });
      }
    }

    // `if (x = 5)` is almost always a typo for `==`
    if (t.k === "id" && (t.s === "if" || t.s === "while") && toks[i + 1].s === "(") {
      let depth = 0;
      for (let j = i + 1; j < toks.length; j++) {
        const u = toks[j];
        if (u.k === "p" && u.s === "(") depth++;
        else if (u.k === "p" && u.s === ")") {
          depth--;
          if (depth === 0) break;
        } else if (depth === 1 && u.k === "p" && u.s === "=" && u.off !== undefined && u.end !== undefined) {
          out.push({
            from: u.off,
            to: u.end,
            severity: "warning",
            message: "This assigns instead of comparing. Did you mean '=='?",
            line: u.line,
            fix: { label: "Change '=' to '=='", from: u.off, to: u.end, insert: "==" },
          });
          break;
        }
      }
    }
  }
  return out;
}

/** Everything wrong with `src`, errors first. Cheap enough to run on every pause in typing. */
export function diagnose(src: string): Diag[] {
  if (!src.trim()) return [];
  try {
    parseC(src);
  } catch (e) {
    if (e instanceof CError) return [fromParseError(src, e)];
    return [];
  }
  return warnings(src);
}
