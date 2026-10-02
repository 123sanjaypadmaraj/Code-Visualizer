import { CError } from "./types";

export interface Token {
  k: "id" | "num" | "str" | "chr" | "p" | "eof";
  s: string;
  line: number;
  /** numeric literal payload */
  n?: { v: number; float: boolean; unsigned: boolean; long: boolean; single: boolean };
  /** decoded string / char literal */
  sv?: string;
}

const PUNCT = [
  "<<=", ">>=", "...", "->", "++", "--", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "+", "-", "*", "/", "%", "=", "<", ">", "!", "~", "&", "|", "^", "?", ":", ";", ",", ".", "(", ")",
  "{", "}", "[", "]",
];

interface Macro {
  params: string[] | null;
  body: Token[];
}

const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdChar = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

function readEscape(src: string, i: number, line: number): [string, number] {
  // src[i] is the char right after the backslash
  const c = src[i];
  const simple: Record<string, string> = {
    n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", "'": "'", '"': '"', a: "\x07", b: "\b", f: "\f", v: "\v", "?": "?",
  };
  if (c === "x") {
    let j = i + 1;
    let h = "";
    while (j < src.length && /[0-9a-fA-F]/.test(src[j])) h += src[j++];
    if (!h) throw new CError("Invalid \\x escape sequence", line);
    return [String.fromCharCode(parseInt(h, 16) & 0xff), j];
  }
  if (c >= "0" && c <= "7") {
    let j = i;
    let o = "";
    while (j < src.length && j < i + 3 && src[j] >= "0" && src[j] <= "7") o += src[j++];
    return [String.fromCharCode(parseInt(o, 8) & 0xff), j];
  }
  if (c in simple) return [simple[c], i + 1];
  return [c, i + 1];
}

function lexRaw(src: string, startLine: number, macros: Map<string, Macro>, allowDirectives: boolean): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = startLine;
  let lineStart = true;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      lineStart = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === "#" && lineStart && allowDirectives) {
      // preprocessor directive: consume the whole (possibly continued) line
      let j = i + 1;
      let text = "";
      const dirLine = line;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\" && src[j + 1] === "\n") {
          j += 2;
          line++;
          continue;
        }
        if (src[j] === "/" && src[j + 1] === "/") {
          while (j < src.length && src[j] !== "\n") j++;
          break;
        }
        if (src[j] === "/" && src[j + 1] === "*") {
          j += 2;
          while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
          j += 2;
          continue;
        }
        text += src[j++];
      }
      i = j;
      const m = text.match(/^\s*define\s+([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$/s);
      if (m) {
        const params = m[2] ? m[2].slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean) : null;
        const body = lexRaw(m[3], dirLine, macros, false).filter((t) => t.k !== "eof");
        macros.set(m[1], { params, body });
      } else {
        const u = text.match(/^\s*undef\s+([A-Za-z_]\w*)/);
        if (u) macros.delete(u[1]);
      }
      continue;
    }
    lineStart = false;
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdChar(src[j])) j++;
      toks.push({ k: "id", s: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i;
      let float = false;
      let v: number;
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        j = i + 2;
        while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++;
        v = parseInt(src.slice(i + 2, j), 16);
      } else if (c === "0" && (src[i + 1] === "b" || src[i + 1] === "B")) {
        j = i + 2;
        while (j < src.length && /[01]/.test(src[j])) j++;
        v = parseInt(src.slice(i + 2, j), 2);
      } else {
        while (j < src.length && isDigit(src[j])) j++;
        if (src[j] === ".") {
          float = true;
          j++;
          while (j < src.length && isDigit(src[j])) j++;
        }
        if ((src[j] === "e" || src[j] === "E") && /[0-9+-]/.test(src[j + 1] ?? "")) {
          float = true;
          j += 2;
          while (j < src.length && isDigit(src[j])) j++;
        }
        const body = src.slice(i, j);
        v = float ? parseFloat(body) : body.length > 1 && body[0] === "0" ? parseInt(body, 8) : parseInt(body, 10);
      }
      let unsigned = false;
      let long = false;
      let single = false;
      while (j < src.length && /[uUlLfF]/.test(src[j])) {
        const s = src[j].toLowerCase();
        if (s === "u") unsigned = true;
        else if (s === "l") long = true;
        else if (s === "f" && float) single = true;
        j++;
      }
      toks.push({ k: "num", s: src.slice(i, j), line, n: { v, float, unsigned, long, single } });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let sv = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\n") throw new CError("Unterminated string literal", line);
        if (src[j] === "\\") {
          const [ch, nj] = readEscape(src, j + 1, line);
          sv += ch;
          j = nj;
        } else sv += src[j++];
      }
      if (j >= src.length) throw new CError("Unterminated string literal", line);
      toks.push({ k: "str", s: src.slice(i, j + 1), line, sv });
      i = j + 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let sv = "";
      while (j < src.length && src[j] !== "'") {
        if (src[j] === "\n") throw new CError("Unterminated character literal", line);
        if (src[j] === "\\") {
          const [ch, nj] = readEscape(src, j + 1, line);
          sv += ch;
          j = nj;
        } else sv += src[j++];
      }
      if (j >= src.length || sv.length === 0) throw new CError("Invalid character literal", line);
      toks.push({ k: "chr", s: src.slice(i, j + 1), line, sv });
      i = j + 1;
      continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (!p) throw new CError(`Unexpected character '${c}'`, line);
    toks.push({ k: "p", s: p, line });
    i += p.length;
  }
  toks.push({ k: "eof", s: "", line });
  return toks;
}

function expand(toks: Token[], macros: Map<string, Macro>, active: Set<string>, depth = 0): Token[] {
  if (depth > 24) return toks;
  const out: Token[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const m = t.k === "id" ? macros.get(t.s) : undefined;
    if (!m || active.has(t.s)) {
      out.push(t);
      continue;
    }
    if (m.params === null) {
      const body = m.body.map((b) => ({ ...b, line: t.line }));
      out.push(...expand(body, macros, new Set(active).add(t.s), depth + 1));
      continue;
    }
    if (toks[i + 1]?.s !== "(" || toks[i + 1]?.k !== "p") {
      out.push(t);
      continue;
    }
    // collect arguments
    let j = i + 2;
    let nest = 1;
    const args: Token[][] = [[]];
    while (j < toks.length && toks[j].k !== "eof") {
      const a = toks[j];
      if (a.k === "p" && a.s === "(") nest++;
      if (a.k === "p" && a.s === ")") {
        nest--;
        if (nest === 0) break;
      }
      if (a.k === "p" && a.s === "," && nest === 1) args.push([]);
      else args[args.length - 1].push(a);
      j++;
    }
    if (nest !== 0) throw new CError(`Unterminated call to macro ${t.s}`, t.line);
    const body: Token[] = [];
    for (const b of m.body) {
      const pi = b.k === "id" ? m.params.indexOf(b.s) : -1;
      if (pi >= 0) body.push(...expand(args[pi] ?? [], macros, active, depth + 1));
      else body.push({ ...b, line: t.line });
    }
    out.push(...expand(body, macros, new Set(active).add(t.s), depth + 1));
    i = j;
  }
  return out;
}

export function lex(src: string): Token[] {
  const macros = new Map<string, Macro>();
  const raw = lexRaw(src, 1, macros, true);
  const eof = raw[raw.length - 1];
  const body = raw.slice(0, -1);
  return [...expand(body, macros, new Set()), eof];
}
