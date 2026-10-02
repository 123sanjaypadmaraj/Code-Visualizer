import {
  BOOL, CError, CHAR, DOUBLE, FLOAT, INT, LLONG, LONG, SHORT, UCHAR, UINT, ULLONG, ULONG, USHORT, VOID,
  alignOf, ptrTo, sizeOf,
  type CType, type FuncParam, type StructDef,
} from "./types";
import { lex, type Token } from "./lexer";

export type Expr =
  | { t: "num"; v: number; ty: CType; line: number }
  | { t: "str"; v: string; line: number }
  | { t: "id"; name: string; line: number }
  | { t: "un"; op: string; e: Expr; line: number }
  | { t: "bin"; op: string; l: Expr; r: Expr; line: number }
  | { t: "asg"; op: string; l: Expr; r: Expr; line: number }
  | { t: "cond"; c: Expr; a: Expr; b: Expr; line: number }
  | { t: "call"; f: Expr; args: Expr[]; line: number }
  | { t: "idx"; a: Expr; i: Expr; line: number }
  | { t: "mem"; o: Expr; name: string; arrow: boolean; line: number }
  | { t: "cast"; ty: CType; e: Expr; line: number }
  | { t: "sizeofT"; ty: CType; line: number }
  | { t: "sizeofE"; e: Expr; line: number }
  | { t: "init"; items: { field?: string; index?: Expr; e: Expr }[]; line: number };

export interface DeclItem {
  name: string;
  ty: CType;
  init: Expr | null;
  line: number;
  isStatic: boolean;
}

export type Stmt =
  | { t: "decl"; items: DeclItem[]; line: number }
  | { t: "expr"; e: Expr; line: number }
  | { t: "if"; c: Expr; a: Stmt; b: Stmt | null; line: number }
  | { t: "while"; c: Expr; body: Stmt; line: number }
  | { t: "do"; c: Expr; body: Stmt; line: number }
  | { t: "for"; init: Stmt | null; c: Expr | null; step: Expr | null; body: Stmt; line: number }
  | { t: "switch"; e: Expr; body: Stmt[]; line: number }
  | { t: "case"; e: Expr | null; line: number }
  | { t: "break"; line: number }
  | { t: "continue"; line: number }
  | { t: "return"; e: Expr | null; line: number }
  | { t: "block"; body: Stmt[]; line: number; endLine: number }
  | { t: "empty"; line: number };

export interface FuncDef {
  name: string;
  ret: CType;
  params: FuncParam[];
  variadic: boolean;
  body: Extract<Stmt, { t: "block" }>;
  line: number;
}

export interface Program {
  funcs: Map<string, FuncDef>;
  globals: DeclItem[];
  enums: Map<string, number>;
}

type IntT = Extract<CType, { k: "int" }>;

const QUALIFIERS = new Set(["const", "volatile", "register", "inline", "extern", "auto", "restrict", "_Noreturn"]);
const TYPE_WORDS = new Set([
  "void", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "_Bool", "struct", "union", "enum",
  "static", "typedef", ...QUALIFIERS,
]);
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);
const BIN_PREC: Record<string, number> = {
  "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7,
  "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10,
};

type Suffix =
  | { kind: "arr"; len: number; lenExpr?: Expr }
  | { kind: "fn"; params: FuncParam[]; variadic: boolean };

type DeclBuilder = (base: CType) => { name: string; type: CType; line: number };

class Parser {
  toks: Token[];
  p = 0;
  typedefs = new Map<string, CType>();
  structs = new Map<string, StructDef>();
  enums = new Map<string, number>();
  funcs = new Map<string, FuncDef>();
  globals: DeclItem[] = [];

  constructor(toks: Token[]) {
    this.toks = toks;
    const add = (n: string, t: CType) => this.typedefs.set(n, t);
    add("bool", BOOL);
    add("size_t", ULONG);
    add("ssize_t", LONG);
    add("ptrdiff_t", LONG);
    add("intptr_t", LONG);
    add("uintptr_t", ULONG);
    add("int8_t", { ...(CHAR as IntT), name: "int8_t" });
    add("uint8_t", { ...(UCHAR as IntT), name: "uint8_t" });
    add("int16_t", { ...(SHORT as IntT), name: "int16_t" });
    add("uint16_t", { ...(USHORT as IntT), name: "uint16_t" });
    add("int32_t", { ...(INT as IntT), name: "int32_t" });
    add("uint32_t", { ...(UINT as IntT), name: "uint32_t" });
    add("int64_t", { ...(LLONG as IntT), name: "int64_t" });
    add("uint64_t", { ...(ULLONG as IntT), name: "uint64_t" });
    add("FILE", { k: "struct", def: { tag: "FILE", union: false, plain: true, fields: [], size: 8, align: 8, complete: true } });
  }

  /* ----------------------------- token helpers ----------------------------- */
  peek(o = 0): Token {
    return this.toks[Math.min(this.p + o, this.toks.length - 1)];
  }
  next(): Token {
    const t = this.toks[this.p];
    if (this.p < this.toks.length - 1) this.p++;
    return t;
  }
  is(s: string, o = 0): boolean {
    const t = this.peek(o);
    return t.s === s && (t.k === "p" || t.k === "id");
  }
  accept(s: string): boolean {
    if (this.is(s)) {
      this.next();
      return true;
    }
    return false;
  }
  expect(s: string): Token {
    if (this.is(s)) return this.next();
    const t = this.peek();
    const prev = this.toks[Math.max(this.p - 1, 0)];
    const found = t.k === "eof" ? "end of file" : `'${t.s}'`;
    // a missing ';' or ')' is almost always noticed on the previous line
    const behind = (s === ";" || s === ")") && prev;
    const line = behind ? prev.line : t.line;
    // where to point: just after the previous token for a missing ';' / ')', else at the unexpected token
    const range =
      behind && prev.end !== undefined
        ? { from: Math.max(prev.end - 1, prev.off ?? 0), to: prev.end, fixAt: prev.end, insert: s }
        : { from: t.off, to: t.end, fixAt: s === ";" || s === ")" || s === "]" || s === "}" ? t.off : undefined, insert: s === ";" || s === ")" || s === "]" || s === "}" ? s : undefined };
    throw new CError(`Expected '${s}' but found ${found}`, line, range);
  }
  fail(msg: string, line = this.peek().line): never {
    const t = this.peek();
    throw new CError(msg, line, { from: t.off, to: t.end });
  }

  isTypeStart(o = 0): boolean {
    const t = this.peek(o);
    if (t.k !== "id") return false;
    return TYPE_WORDS.has(t.s) || this.typedefs.has(t.s);
  }

  /* ----------------------------- constant folding ----------------------------- */
  constEval(e: Expr): number | null {
    switch (e.t) {
      case "num":
        return e.v;
      case "id":
        return this.enums.get(e.name) ?? null;
      case "cast":
        return this.constEval(e.e);
      case "sizeofT":
        return sizeOf(e.ty);
      case "un": {
        const v = this.constEval(e.e);
        if (v === null) return null;
        if (e.op === "-") return -v;
        if (e.op === "+") return v;
        if (e.op === "!") return v ? 0 : 1;
        if (e.op === "~") return ~v;
        return null;
      }
      case "cond": {
        const c = this.constEval(e.c);
        const a = this.constEval(e.a);
        const b = this.constEval(e.b);
        return c === null || a === null || b === null ? null : c ? a : b;
      }
      case "bin": {
        const a = this.constEval(e.l);
        const b = this.constEval(e.r);
        if (a === null || b === null) return null;
        switch (e.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? null : Math.trunc(a / b);
          case "%": return b === 0 ? null : a % b;
          case "<<": return a << b;
          case ">>": return a >> b;
          case "&": return a & b;
          case "|": return a | b;
          case "^": return a ^ b;
          case "<": return +(a < b);
          case ">": return +(a > b);
          case "<=": return +(a <= b);
          case ">=": return +(a >= b);
          case "==": return +(a === b);
          case "!=": return +(a !== b);
          case "&&": return +(a !== 0 && b !== 0);
          case "||": return +(a !== 0 || b !== 0);
        }
        return null;
      }
      default:
        return null;
    }
  }

  /* ----------------------------- types ----------------------------- */
  parseSpecifiers(): { base: CType; isStatic: boolean; isTypedef: boolean } | null {
    let isStatic = false;
    let isTypedef = false;
    let sign: "signed" | "unsigned" | null = null;
    let shorts = 0;
    let longs = 0;
    let base: string | null = null;
    let ty: CType | null = null;
    let any = false;
    for (;;) {
      const t = this.peek();
      if (t.k !== "id") break;
      const s = t.s;
      if (QUALIFIERS.has(s)) {
        this.next();
        any = true;
      } else if (s === "static") {
        this.next();
        isStatic = true;
        any = true;
      } else if (s === "typedef") {
        this.next();
        isTypedef = true;
        any = true;
      } else if (s === "unsigned" || s === "signed") {
        this.next();
        sign = s;
        any = true;
      } else if (s === "short") {
        this.next();
        shorts++;
        any = true;
      } else if (s === "long") {
        this.next();
        longs++;
        any = true;
      } else if (s === "int" || s === "char" || s === "float" || s === "double" || s === "void" || s === "_Bool") {
        this.next();
        base = s;
        any = true;
      } else if (s === "struct" || s === "union") {
        ty = this.parseStructSpec();
        any = true;
      } else if (s === "enum") {
        ty = this.parseEnumSpec();
        any = true;
      } else if (this.typedefs.has(s) && !base && !ty && !sign && !shorts && !longs) {
        this.next();
        ty = this.typedefs.get(s)!;
        any = true;
      } else break;
    }
    if (!any) return null;
    if (ty) return { base: ty, isStatic, isTypedef };
    const uns = sign === "unsigned";
    let r: CType;
    switch (base) {
      case "char": r = uns ? UCHAR : CHAR; break;
      case "float": r = FLOAT; break;
      case "double": r = DOUBLE; break;
      case "void": r = VOID; break;
      case "_Bool": r = BOOL; break;
      default:
        if (shorts) r = uns ? USHORT : SHORT;
        else if (longs >= 2) r = uns ? ULLONG : LLONG;
        else if (longs === 1) r = uns ? ULONG : LONG;
        else r = uns ? UINT : INT;
    }
    return { base: r, isStatic, isTypedef };
  }

  parseStructSpec(): CType {
    const kw = this.next().s;
    const union = kw === "union";
    let tag = "";
    if (this.peek().k === "id" && !this.is("{")) tag = this.next().s;
    let def: StructDef | undefined;
    const key = `${union ? "u" : "s"}:${tag}`;
    if (tag) def = this.structs.get(key);
    if (!def) {
      def = { tag, union, plain: false, fields: [], size: 0, align: 1, complete: false };
      if (tag) this.structs.set(key, def);
    }
    if (this.accept("{")) {
      if (def.complete) this.fail(`Redefinition of '${kw} ${tag}'`);
      let offset = 0;
      let align = 1;
      let size = 0;
      while (!this.accept("}")) {
        const spec = this.parseSpecifiers();
        if (!spec) this.fail(`Expected a member declaration but found '${this.peek().s}'`);
        do {
          const d = this.declarator()(spec.base);
          const a = alignOf(d.type);
          const sz = sizeOf(d.type);
          align = Math.max(align, a);
          if (union) {
            def.fields.push({ name: d.name, type: d.type, offset: 0 });
            size = Math.max(size, sz);
          } else {
            offset = Math.ceil(offset / a) * a;
            def.fields.push({ name: d.name, type: d.type, offset });
            offset += sz;
          }
        } while (this.accept(","));
        this.expect(";");
      }
      if (!union) size = offset;
      def.align = align;
      def.size = Math.ceil(size / align) * align;
      def.complete = true;
    }
    return { k: "struct", def };
  }

  parseEnumSpec(): CType {
    this.next(); // enum
    if (this.peek().k === "id" && !this.is("{")) this.next();
    if (this.accept("{")) {
      let val = 0;
      while (!this.is("}")) {
        const name = this.next();
        if (name.k !== "id") this.fail("Expected an enumerator name", name.line);
        if (this.accept("=")) {
          const e = this.parseCond();
          const c = this.constEval(e);
          if (c === null) this.fail("Enumerator value must be a constant", name.line);
          val = c;
        }
        this.enums.set(name.s, val++);
        if (!this.accept(",")) break;
      }
      this.expect("}");
    }
    return INT;
  }

  declarator(): DeclBuilder {
    let nptr = 0;
    while (this.accept("*")) {
      nptr++;
      while (this.peek().k === "id" && QUALIFIERS.has(this.peek().s)) this.next();
    }
    let inner: DeclBuilder | null = null;
    let name = "";
    const line = this.peek().line;
    if (this.is("(") && this.is("*", 1)) {
      this.next();
      inner = this.declarator();
      this.expect(")");
    } else if (this.peek().k === "id" && !TYPE_WORDS.has(this.peek().s)) {
      name = this.next().s;
    }
    const suffixes: Suffix[] = [];
    for (;;) {
      if (this.accept("[")) {
        if (this.accept("]")) {
          suffixes.push({ kind: "arr", len: -1 });
        } else {
          const e = this.parseCond();
          this.expect("]");
          const c = this.constEval(e);
          suffixes.push(c === null ? { kind: "arr", len: -1, lenExpr: e } : { kind: "arr", len: c });
        }
      } else if (this.is("(")) {
        const { params, variadic } = this.parseParams();
        suffixes.push({ kind: "fn", params, variadic });
      } else break;
    }
    return (base) => {
      let t = base;
      for (let i = 0; i < nptr; i++) t = ptrTo(t);
      for (let i = suffixes.length - 1; i >= 0; i--) {
        const s = suffixes[i];
        t = s.kind === "arr" ? { k: "array", of: t, len: s.len, lenExpr: s.lenExpr } : { k: "func", ret: t, params: s.params, variadic: s.variadic };
      }
      return inner ? inner(t) : { name, type: t, line };
    };
  }

  parseParams(): { params: FuncParam[]; variadic: boolean } {
    this.expect("(");
    const params: FuncParam[] = [];
    let variadic = false;
    if (this.accept(")")) return { params, variadic };
    if (this.is("void") && this.is(")", 1)) {
      this.next();
      this.next();
      return { params, variadic };
    }
    do {
      if (this.accept("...")) {
        variadic = true;
        break;
      }
      const spec = this.parseSpecifiers();
      if (!spec) this.fail(`Expected a parameter type but found '${this.peek().s}'`);
      const d = this.declarator()(spec.base);
      let type = d.type;
      if (type.k === "array") type = ptrTo(type.of);
      else if (type.k === "func") type = ptrTo(type);
      params.push({ name: d.name, type });
    } while (this.accept(","));
    this.expect(")");
    return { params, variadic };
  }

  parseTypeName(): CType {
    const spec = this.parseSpecifiers();
    if (!spec) this.fail(`Expected a type but found '${this.peek().s}'`);
    return this.declarator()(spec.base).type;
  }

  /* ----------------------------- expressions ----------------------------- */
  parseExpr(): Expr {
    let e = this.parseAssign();
    while (this.is(",")) {
      const line = this.next().line;
      e = { t: "bin", op: ",", l: e, r: this.parseAssign(), line };
    }
    return e;
  }

  parseAssign(): Expr {
    const l = this.parseCond();
    const t = this.peek();
    if (t.k === "p" && ASSIGN_OPS.has(t.s)) {
      this.next();
      const r = this.parseAssign();
      return { t: "asg", op: t.s, l, r, line: t.line };
    }
    return l;
  }

  parseCond(): Expr {
    const c = this.parseBin(1);
    if (this.is("?")) {
      const line = this.next().line;
      const a = this.parseExpr();
      this.expect(":");
      const b = this.parseCond();
      return { t: "cond", c, a, b, line };
    }
    return c;
  }

  parseBin(min: number): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const prec = t.k === "p" ? BIN_PREC[t.s] : undefined;
      if (prec === undefined || prec < min) return l;
      this.next();
      const r = this.parseBin(prec + 1);
      l = { t: "bin", op: t.s, l, r, line: t.line };
    }
  }

  parseUnary(): Expr {
    const t = this.peek();
    if (t.k === "p") {
      if (t.s === "++" || t.s === "--") {
        this.next();
        return { t: "un", op: `pre${t.s}`, e: this.parseUnary(), line: t.line };
      }
      if (["-", "+", "!", "~", "*", "&"].includes(t.s)) {
        this.next();
        return { t: "un", op: t.s, e: this.parseUnary(), line: t.line };
      }
      if (t.s === "(" && this.isTypeStart(1)) {
        this.next();
        const ty = this.parseTypeName();
        this.expect(")");
        if (this.is("{")) this.fail("Compound literals are not supported yet", t.line);
        return { t: "cast", ty, e: this.parseUnary(), line: t.line };
      }
    }
    if (t.k === "id" && t.s === "sizeof") {
      this.next();
      if (this.is("(") && this.isTypeStart(1)) {
        this.next();
        const ty = this.parseTypeName();
        this.expect(")");
        return { t: "sizeofT", ty, line: t.line };
      }
      return { t: "sizeofE", e: this.parseUnary(), line: t.line };
    }
    return this.parsePostfix();
  }

  parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.k !== "p") return e;
      if (t.s === "[") {
        this.next();
        const i = this.parseExpr();
        this.expect("]");
        e = { t: "idx", a: e, i, line: t.line };
      } else if (t.s === "(") {
        this.next();
        const args: Expr[] = [];
        if (!this.is(")")) {
          do args.push(this.parseAssign());
          while (this.accept(","));
        }
        this.expect(")");
        e = { t: "call", f: e, args, line: t.line };
      } else if (t.s === "." || t.s === "->") {
        this.next();
        const n = this.next();
        if (n.k !== "id") this.fail(`Expected a member name after '${t.s}'`, n.line);
        e = { t: "mem", o: e, name: n.s, arrow: t.s === "->", line: t.line };
      } else if (t.s === "++" || t.s === "--") {
        this.next();
        e = { t: "un", op: `post${t.s}`, e, line: t.line };
      } else return e;
    }
  }

  parsePrimary(): Expr {
    const t = this.next();
    switch (t.k) {
      case "num": {
        const n = t.n!;
        if (n.float) return { t: "num", v: n.v, ty: n.single ? FLOAT : DOUBLE, line: t.line };
        let ty: CType = INT;
        if (n.long) ty = n.unsigned ? ULONG : LONG;
        else if (n.unsigned) ty = n.v > 0xffffffff ? ULONG : UINT;
        else if (n.v > 0x7fffffff) ty = LONG;
        return { t: "num", v: n.v, ty, line: t.line };
      }
      case "chr": {
        const c = t.sv!.charCodeAt(0) & 0xff;
        return { t: "num", v: c > 127 ? c - 256 : c, ty: INT, line: t.line };
      }
      case "str": {
        let v = t.sv!;
        while (this.peek().k === "str") v += this.next().sv!;
        return { t: "str", v, line: t.line };
      }
      case "id":
        if (TYPE_WORDS.has(t.s)) this.fail(`Unexpected type name '${t.s}' in an expression`, t.line);
        return { t: "id", name: t.s, line: t.line };
      case "p":
        if (t.s === "(") {
          const e = this.parseExpr();
          this.expect(")");
          return e;
        }
        break;
    }
    const found = t.k === "eof" ? "end of file" : `'${t.s}'`;
    return this.fail(`Unexpected ${found}`, t.line);
  }

  parseInitializer(): Expr {
    if (!this.is("{")) return this.parseAssign();
    const line = this.next().line;
    const items: { field?: string; index?: Expr; e: Expr }[] = [];
    while (!this.is("}")) {
      let field: string | undefined;
      let index: Expr | undefined;
      if (this.accept(".")) {
        field = this.next().s;
        this.expect("=");
      } else if (this.is("[")) {
        this.next();
        index = this.parseCond();
        this.expect("]");
        this.expect("=");
      }
      items.push({ field, index, e: this.parseInitializer() });
      if (!this.accept(",")) break;
    }
    this.expect("}");
    return { t: "init", items, line };
  }

  /* ----------------------------- statements ----------------------------- */
  registerTypedef(name: string, type: CType) {
    if (type.k === "struct") {
      if (type.def.tag === "") {
        type.def.tag = name;
        type.def.plain = true;
      } else if (type.def.tag === name) type.def.plain = true;
    }
    this.typedefs.set(name, type);
  }

  parseDeclStmt(): Stmt {
    const line = this.peek().line;
    const spec = this.parseSpecifiers()!;
    const items: DeclItem[] = [];
    if (!this.is(";")) {
      do {
        const d = this.declarator()(spec.base);
        if (!d.name) this.fail("Expected a variable name", d.line);
        if (spec.isTypedef) {
          this.registerTypedef(d.name, d.type);
          continue;
        }
        if (d.type.k === "func") continue; // local prototype
        const init = this.accept("=") ? this.parseInitializer() : null;
        items.push({ name: d.name, ty: d.type, init, line: d.line, isStatic: spec.isStatic });
      } while (this.accept(","));
    }
    this.expect(";");
    return items.length ? { t: "decl", items, line } : { t: "empty", line };
  }

  parseBlock(): Extract<Stmt, { t: "block" }> {
    const line = this.expect("{").line;
    const body: Stmt[] = [];
    while (!this.is("}")) {
      if (this.peek().k === "eof") this.fail("Missing closing '}' before end of file", line);
      body.push(this.parseStmt());
    }
    const endLine = this.next().line;
    return { t: "block", body, line, endLine };
  }

  parseStmt(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (t.k === "p") {
      if (t.s === "{") return this.parseBlock();
      if (t.s === ";") {
        this.next();
        return { t: "empty", line };
      }
    }
    if (t.k === "id") {
      switch (t.s) {
        case "if": {
          this.next();
          this.expect("(");
          const c = this.parseExpr();
          this.expect(")");
          const a = this.parseStmt();
          const b = this.accept("else") ? this.parseStmt() : null;
          return { t: "if", c, a, b, line };
        }
        case "while": {
          this.next();
          this.expect("(");
          const c = this.parseExpr();
          this.expect(")");
          return { t: "while", c, body: this.parseStmt(), line };
        }
        case "do": {
          this.next();
          const body = this.parseStmt();
          this.expect("while");
          this.expect("(");
          const c = this.parseExpr();
          this.expect(")");
          this.expect(";");
          return { t: "do", c, body, line };
        }
        case "for": {
          this.next();
          this.expect("(");
          let init: Stmt | null = null;
          if (this.accept(";")) init = null;
          else if (this.isTypeStart()) init = this.parseDeclStmt();
          else {
            const e = this.parseExpr();
            this.expect(";");
            init = { t: "expr", e, line };
          }
          const c = this.is(";") ? null : this.parseExpr();
          this.expect(";");
          const step = this.is(")") ? null : this.parseExpr();
          this.expect(")");
          return { t: "for", init, c, step, body: this.parseStmt(), line };
        }
        case "switch": {
          this.next();
          this.expect("(");
          const e = this.parseExpr();
          this.expect(")");
          const blk = this.parseBlock();
          return { t: "switch", e, body: blk.body, line };
        }
        case "case": {
          this.next();
          const e = this.parseCond();
          this.expect(":");
          return { t: "case", e, line };
        }
        case "default":
          this.next();
          this.expect(":");
          return { t: "case", e: null, line };
        case "break":
          this.next();
          this.expect(";");
          return { t: "break", line };
        case "continue":
          this.next();
          this.expect(";");
          return { t: "continue", line };
        case "return": {
          this.next();
          const e = this.is(";") ? null : this.parseExpr();
          this.expect(";");
          return { t: "return", e, line };
        }
        case "goto":
          return this.fail("'goto' is not supported by this visualizer", line);
      }
      if (this.isTypeStart()) return this.parseDeclStmt();
    }
    const e = this.parseExpr();
    this.expect(";");
    return { t: "expr", e, line };
  }

  /* ----------------------------- program ----------------------------- */
  parseProgram(): Program {
    while (this.peek().k !== "eof") {
      if (this.accept(";")) continue;
      const spec = this.parseSpecifiers();
      if (!spec) this.fail(`Unexpected '${this.peek().s}' — expected a declaration or function`);
      if (this.accept(";")) continue;
      let isFuncDef = false;
      do {
        const d = this.declarator()(spec.base);
        if (!d.name) this.fail("Expected a name in this declaration", d.line);
        if (spec.isTypedef) {
          this.registerTypedef(d.name, d.type);
        } else if (d.type.k === "func") {
          if (this.is("{")) {
            const body = this.parseBlock();
            this.funcs.set(d.name, {
              name: d.name, ret: d.type.ret, params: d.type.params, variadic: d.type.variadic, body, line: d.line,
            });
            isFuncDef = true;
            break;
          }
        } else {
          const init = this.accept("=") ? this.parseInitializer() : null;
          this.globals.push({ name: d.name, ty: d.type, init, line: d.line, isStatic: true });
        }
      } while (this.accept(","));
      if (!isFuncDef) this.expect(";");
    }
    return { funcs: this.funcs, globals: this.globals, enums: this.enums };
  }
}

export function parseC(src: string): Program {
  return new Parser(lex(src)).parseProgram();
}

/* ----------------------------- pretty printing ----------------------------- */
const PREC: Record<string, number> = { ",": 0, "=": 1, "?:": 2, ...BIN_PREC };

function ps(e: Expr): number {
  switch (e.t) {
    case "bin": return (PREC[e.op] ?? 5) + 2;
    case "asg": return 1;
    case "cond": return 2;
    case "cast":
    case "un":
      return e.t === "un" && e.op.startsWith("post") ? 15 : 14;
    default:
      return 20;
  }
}

export function exprStr(e: Expr, sub?: (e: Expr) => string | null): string {
  const go = (x: Expr): string => exprStr(x, sub);
  const wrap = (x: Expr, min: number) => (ps(x) < min ? `(${go(x)})` : go(x));
  if (sub) {
    const r = sub(e);
    if (r !== null) return r;
  }
  switch (e.t) {
    case "num":
      return String(e.v);
    case "str":
      return JSON.stringify(e.v);
    case "id":
      return e.name;
    case "un":
      if (e.op.startsWith("pre")) return `${e.op.slice(3)}${wrap(e.e, 14)}`;
      if (e.op.startsWith("post")) return `${wrap(e.e, 15)}${e.op.slice(4)}`;
      return `${e.op}${wrap(e.e, 14)}`;
    case "bin": {
      const p = (PREC[e.op] ?? 5) + 2;
      return `${wrap(e.l, p)}${e.op === "," ? ", " : ` ${e.op} `}${wrap(e.r, p + 1)}`;
    }
    case "asg":
      return `${wrap(e.l, 3)} ${e.op} ${wrap(e.r, 1)}`;
    case "cond":
      return `${wrap(e.c, 3)} ? ${go(e.a)} : ${wrap(e.b, 2)}`;
    case "call":
      return `${wrap(e.f, 15)}(${e.args.map(go).join(", ")})`;
    case "idx":
      return `${wrap(e.a, 15)}[${go(e.i)}]`;
    case "mem":
      return `${wrap(e.o, 15)}${e.arrow ? "->" : "."}${e.name}`;
    case "cast":
      return `(${castName(e.ty)})${wrap(e.e, 14)}`;
    case "sizeofT":
      return `sizeof(${castName(e.ty)})`;
    case "sizeofE":
      return `sizeof ${wrap(e.e, 14)}`;
    case "init":
      return `{${e.items.map((i) => (i.field ? `.${i.field} = ` : "") + go(i.e)).join(", ")}}`;
  }
}

function castName(t: CType): string {
  switch (t.k) {
    case "int":
    case "float":
      return t.name;
    case "ptr":
      return `${castName(t.to)}*`;
    case "struct":
      return t.def.plain ? t.def.tag : `struct ${t.def.tag}`;
    case "void":
      return "void";
    default:
      return "…";
  }
}
