import {
  CError, CHAR, DOUBLE, FLOAT, INT, LLONG, LONG, UINT, ULONG, VOID,
  alignOf, ptrTo, sizeOf, typeStr,
  type CType, type FrameView, type HeapView, type RunResult, type TraceStep, type StepKind, type ValView, type VarView,
} from "./types";
import { exprStr, parseC, type DeclItem, type Expr, type FuncDef, type Program, type Stmt } from "./parser";

/* ----------------------------- memory layout ----------------------------- */
const MEM = 0x400000;
const TEXT = 0x1000;
const DATA = 0x2000;
const HEAP = 0x100000;
const HEAP_END = 0x200000;
const STACK_LIMIT = 0x200000;

const MAX_STEPS = 4000;
const MAX_TICKS = 4_000_000;
const MAX_DEPTH = 200;

type IntT = Extract<CType, { k: "int" }>;
type CallExpr = Extract<Expr, { t: "call" }>;

interface Val {
  t: CType;
  v: number;
  /** exact value for 64-bit integers that do not fit a double */
  big?: bigint;
  /** bytes of a struct value */
  b?: Uint8Array;
}
interface LV {
  t: CType;
  addr: number;
}
interface VarInfo {
  name: string;
  ty: CType;
  addr: number;
  born: number;
}
interface Scope {
  vars: VarInfo[];
  sp: number;
}
interface Frame {
  fd: FuncDef;
  scopes: Scope[];
  line: number;
  ret: string | null;
}
interface HeapBlock {
  id: number;
  addr: number;
  size: number;
  freed: boolean;
  type: CType | null;
  line: number;
  born: number;
}

class StopTrace extends Error {}
class ExitSignal extends Error {
  code: number;
  constructor(code: number) {
    super("exit");
    this.code = code;
  }
}

type Completion = null | { t: "break" } | { t: "continue" } | { t: "return"; v: Val | null };
const BRK: Completion = { t: "break" };
const CNT: Completion = { t: "continue" };

const VOIDV: Val = { t: VOID, v: 0 };
const I = (n: number): Val => ({ t: INT, v: n });
const num = (v: Val): number => (v.big !== undefined ? Number(v.big) : v.v);
const bigOf = (v: Val): bigint => (v.big !== undefined ? v.big : BigInt(Math.trunc(v.v)));
const hex = (a: number) => `0x${a.toString(16)}`;

function mkLong(t: CType, r: bigint): Val {
  const n = Number(r);
  return Number.isSafeInteger(n) ? { t, v: n } : { t, v: n, big: r };
}

function wrapInt(t: IntT, x: number): number {
  if (t.bool) return x !== 0 ? 1 : 0;
  switch (t.size) {
    case 1: return t.signed ? (x << 24) >> 24 : x & 0xff;
    case 2: return t.signed ? (x << 16) >> 16 : x & 0xffff;
    case 4: return t.signed ? x | 0 : x >>> 0;
    default: return x;
  }
}

function promote1(t: CType): IntT {
  if (t.k !== "int") return INT as IntT;
  return t.size < 4 ? (INT as IntT) : t;
}

function usual(a: CType, b: CType): IntT {
  const x = promote1(a);
  const y = promote1(b);
  if (x.size === 8 || y.size === 8) {
    const u = (x.size === 8 && !x.signed) || (y.size === 8 && !y.signed);
    return (u ? ULONG : LONG) as IntT;
  }
  return (!x.signed || !y.signed ? UINT : INT) as IntT;
}

const isCharT = (t: CType) => t.k === "int" && t.size === 1 && !t.bool;

function fmtFloat(x: number, single: boolean): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf";
  let s = String(Number(x.toPrecision(single ? 7 : 15)));
  if (/^-?\d+$/.test(s)) s += ".0";
  return s;
}

function charText(c: number): string {
  if (c === 0) return "'\\0'";
  if (c === 10) return "'\\n'";
  if (c === 9) return "'\\t'";
  if (c === 13) return "'\\r'";
  if (c === 39) return "'\\''";
  if (c === 92) return "'\\\\'";
  if (c >= 32 && c < 127) return `'${String.fromCharCode(c)}'`;
  return String(c);
}

const CONSTS: Record<string, () => Val> = {
  NULL: () => ({ t: ptrTo(VOID), v: 0 }),
  true: () => I(1),
  false: () => I(0),
  EOF: () => I(-1),
  EXIT_SUCCESS: () => I(0),
  EXIT_FAILURE: () => I(1),
  INT_MAX: () => I(2147483647),
  INT_MIN: () => I(-2147483648),
  UINT_MAX: () => ({ t: UINT, v: 4294967295 }),
  CHAR_BIT: () => I(8),
  CHAR_MAX: () => I(127),
  CHAR_MIN: () => I(-128),
  SHRT_MAX: () => I(32767),
  SHRT_MIN: () => I(-32768),
  RAND_MAX: () => I(2147483647),
  LONG_MAX: () => mkLong(LONG, 9223372036854775807n),
  LONG_MIN: () => mkLong(LONG, -9223372036854775808n),
  LLONG_MAX: () => mkLong(LLONG, 9223372036854775807n),
  LLONG_MIN: () => mkLong(LLONG, -9223372036854775808n),
  M_PI: () => ({ t: DOUBLE, v: Math.PI }),
  M_E: () => ({ t: DOUBLE, v: Math.E }),
  FLT_MAX: () => ({ t: FLOAT, v: 3.4028234663852886e38 }),
  DBL_MAX: () => ({ t: DOUBLE, v: Number.MAX_VALUE }),
  INFINITY: () => ({ t: DOUBLE, v: Infinity }),
  stdin: () => ({ t: ptrTo(VOID), v: 1 }),
  stdout: () => ({ t: ptrTo(VOID), v: 2 }),
  stderr: () => ({ t: ptrTo(VOID), v: 3 }),
};

/* ----------------------------- the machine ----------------------------- */
class Machine {
  buf = new ArrayBuffer(MEM);
  u8 = new Uint8Array(this.buf);
  dv = new DataView(this.buf);
  ini = new Uint8Array(MEM);
  dataTop = DATA;
  heapTop = HEAP;
  sp = MEM;
  globals = new Map<string, VarInfo>();
  frames: Frame[] = [];
  blocks: HeapBlock[] = [];
  strLits = new Map<string, number>();
  funcAddr = new Map<string, number>();
  funcAt = new Map<number, FuncDef>();
  statics = new Map<DeclItem, VarInfo>();
  steps: TraceStep[] = [];
  out = "";
  events: string[] = [];
  warnings: string[] = [];
  warned = new Set<string>();
  prev = new Map<number, string>();
  line = 1;
  ticks = 0;
  inPos = 0;
  /** index of the step whose statement tried to read input that isn't there yet */
  starved: number | null = null;
  randState = 12345;
  nextBlock = 1;

  constructor(
    public prog: Program,
    public stdin: string,
    public eof = false,
  ) {}

  starve() {
    if (this.starved === null && !this.eof) this.starved = this.steps.length;
  }

  tick() {
    if (++this.ticks > MAX_TICKS) this.err("The program ran for too long — is there an infinite loop?");
  }
  err(msg: string, line = this.line): never {
    throw new CError(msg, line);
  }

  /* ----------------------------- memory ----------------------------- */
  blockAt(addr: number, slack = 0): HeapBlock | undefined {
    return this.blocks.find((b) => addr >= b.addr && addr < b.addr + Math.max(b.size, 1) + slack);
  }

  check(addr: number, size: number) {
    if (addr < TEXT) {
      this.err(
        addr === 0
          ? "Segmentation fault: the program used a NULL pointer."
          : `Segmentation fault: invalid address ${hex(addr)}.`,
      );
    }
    if (addr + size > MEM) this.err(`Segmentation fault: invalid address ${hex(addr)}.`);
    if (addr < DATA) this.err("Cannot read or write the memory that holds function code.");
    if (addr >= HEAP && addr < HEAP_END) {
      const b = this.blockAt(addr);
      if (!b) this.err(`Invalid heap access at ${hex(addr)}: this address is not inside any malloc'd block.`);
      if (b.freed) this.err(`Use after free: block #${b.id} was already released by free() (allocated on line ${b.line}).`);
      if (addr + size > b.addr + b.size) {
        this.err(
          `Heap buffer overflow: touching byte ${addr + size - b.addr} of block #${b.id}, which only has ${b.size} bytes (allocated on line ${b.line}).`,
        );
      }
    } else if (addr >= HEAP_END && addr < STACK_LIMIT) {
      this.err(`Invalid memory access at ${hex(addr)}.`);
    } else if (addr >= STACK_LIMIT && addr < this.sp) {
      this.err("Dangling pointer: this stack memory belonged to a function that has already returned.");
    }
  }

  isInit(addr: number, size: number): boolean {
    for (let i = 0; i < size; i++) if (!this.ini[addr + i]) return false;
    return true;
  }

  loadRaw(t: CType, addr: number): Val {
    const d = this.dv;
    switch (t.k) {
      case "int":
        switch (t.size) {
          case 1: return { t, v: t.bool ? d.getUint8(addr) : t.signed ? d.getInt8(addr) : d.getUint8(addr) };
          case 2: return { t, v: t.signed ? d.getInt16(addr, true) : d.getUint16(addr, true) };
          case 4: return { t, v: t.signed ? d.getInt32(addr, true) : d.getUint32(addr, true) };
          default: return mkLong(t, t.signed ? d.getBigInt64(addr, true) : d.getBigUint64(addr, true));
        }
      case "float":
        return { t, v: t.size === 4 ? d.getFloat32(addr, true) : d.getFloat64(addr, true) };
      case "ptr":
        return { t, v: d.getUint32(addr + 4, true) * 4294967296 + d.getUint32(addr, true) };
      case "struct":
        return { t, v: 0, b: this.u8.slice(addr, addr + t.def.size) };
      default:
        return { t, v: addr };
    }
  }

  loadChecked(lv: LV, e: Expr): Val {
    const size = sizeOf(lv.t);
    this.check(lv.addr, size);
    if (lv.t.k !== "struct" && !this.isInit(lv.addr, size)) {
      const key = `${this.line}:${exprStr(e)}`;
      if (!this.warned.has(key)) {
        this.warned.add(key);
        this.warnings.push(
          `Line ${this.line}: ${exprStr(e)} is used before it was given a value, so it holds unpredictable "garbage".`,
        );
      }
      this.events.push(`⚠ ${exprStr(e)} was never given a value, so reading it gives garbage.`);
    }
    return this.loadRaw(lv.t, lv.addr);
  }

  writeVal(t: CType, addr: number, v: Val) {
    const d = this.dv;
    switch (t.k) {
      case "int":
        if (t.size === 1) d.setUint8(addr, v.v & 0xff);
        else if (t.size === 2) d.setUint16(addr, v.v & 0xffff, true);
        else if (t.size === 4) d.setInt32(addr, v.v | 0, true);
        else d.setBigInt64(addr, BigInt.asIntN(64, bigOf(v)), true);
        break;
      case "float":
        if (t.size === 4) d.setFloat32(addr, v.v, true);
        else d.setFloat64(addr, v.v, true);
        break;
      case "ptr":
        d.setUint32(addr, v.v % 4294967296, true);
        d.setUint32(addr + 4, Math.floor(v.v / 4294967296), true);
        break;
      case "struct":
        if (v.b) this.u8.set(v.b.subarray(0, t.def.size), addr);
        break;
      default:
        break;
    }
  }

  store(t: CType, addr: number, v: Val) {
    const size = sizeOf(t);
    this.check(addr, size);
    this.writeVal(t, addr, v);
    this.ini.fill(1, addr, addr + size);
  }

  zero(addr: number, size: number) {
    this.u8.fill(0, addr, addr + size);
    this.ini.fill(1, addr, addr + size);
  }

  allocStack(size: number, align: number): number {
    let a = this.sp - Math.max(size, 1);
    a -= a % Math.max(align, 1);
    if (a < STACK_LIMIT) this.err("Stack overflow: the program used up all of its stack memory.");
    this.sp = a;
    return a;
  }

  allocData(size: number, align: number): number {
    const a = Math.ceil(this.dataTop / align) * align;
    this.dataTop = a + Math.max(size, 1);
    if (this.dataTop > HEAP) this.err("Out of static memory.");
    return a;
  }

  strLit(s: string): number {
    const hit = this.strLits.get(s);
    if (hit !== undefined) return hit;
    const a = this.allocData(s.length + 1, 1);
    for (let i = 0; i < s.length; i++) this.u8[a + i] = s.charCodeAt(i) & 0xff;
    this.u8[a + s.length] = 0;
    this.ini.fill(1, a, a + s.length + 1);
    this.strLits.set(s, a);
    return a;
  }

  cstr(addr: number, max = 100000): string {
    if (addr === 0) this.err("Segmentation fault: tried to read a string through a NULL pointer.");
    let s = "";
    for (let i = 0; i < max; i++) {
      this.check(addr + i, 1);
      const c = this.u8[addr + i];
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }

  mallocBlock(size: number, zeroed: boolean): number {
    const n = Math.max(size, 0);
    const addr = Math.ceil(this.heapTop / 16) * 16;
    if (addr + n > HEAP_END) return 0;
    this.heapTop = addr + n + 16;
    const b: HeapBlock = { id: this.nextBlock++, addr, size: n, freed: false, type: null, line: this.line, born: this.steps.length };
    this.blocks.push(b);
    this.u8.fill(0, addr, addr + n);
    this.ini.fill(zeroed ? 1 : 0, addr, addr + n);
    return addr;
  }

  tagHeap(t: CType, addr: number) {
    if (t.k !== "ptr" || t.to.k === "void" || t.to.k === "func") return;
    const b = this.blocks.find((x) => x.addr === addr && !x.freed);
    if (b && !b.type) b.type = t.to;
  }

  /* ----------------------------- scopes & variables ----------------------------- */
  get frame(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  lookup(name: string): VarInfo | undefined {
    const f = this.frame;
    if (f) {
      for (let i = f.scopes.length - 1; i >= 0; i--) {
        const vars = f.scopes[i].vars;
        for (let j = vars.length - 1; j >= 0; j--) if (vars[j].name === name) return vars[j];
      }
    }
    return this.globals.get(name);
  }

  pushScope() {
    this.frame!.scopes.push({ vars: [], sp: this.sp });
  }
  popScope() {
    const s = this.frame!.scopes.pop()!;
    this.sp = s.sp;
  }

  /* ----------------------------- conversions ----------------------------- */
  truthy(v: Val): boolean {
    if (v.t.k === "struct") this.err("A struct cannot be used as a true/false condition.");
    return v.big !== undefined ? true : v.v !== 0;
  }

  convert(v: Val, to: CType): Val {
    switch (to.k) {
      case "int": {
        if (v.t.k === "struct" || v.t.k === "void") this.err(`Cannot convert ${typeStr(v.t)} to ${typeStr(to)}.`);
        if (to.bool) return { t: to, v: this.truthy(v) ? 1 : 0 };
        if (v.t.k === "float") {
          let x = Math.trunc(v.v);
          if (!Number.isFinite(x)) x = 0;
          if (to.size === 8) return mkLong(to, to.signed ? BigInt.asIntN(64, BigInt(x)) : BigInt.asUintN(64, BigInt(x)));
          return { t: to, v: wrapInt(to, x) };
        }
        if (to.size === 8) {
          const b = bigOf(v);
          return mkLong(to, to.signed ? BigInt.asIntN(64, b) : BigInt.asUintN(64, b));
        }
        const low = v.big !== undefined ? Number(BigInt.asIntN(32, v.big)) : v.v;
        return { t: to, v: wrapInt(to, low) };
      }
      case "float": {
        if (v.t.k === "struct" || v.t.k === "void") this.err(`Cannot convert ${typeStr(v.t)} to ${typeStr(to)}.`);
        const x = num(v);
        return { t: to, v: to.size === 4 ? Math.fround(x) : x };
      }
      case "ptr": {
        if (v.t.k === "float") this.err("Cannot convert a floating-point number to a pointer.");
        if (v.t.k === "struct" || v.t.k === "void") this.err(`Cannot convert ${typeStr(v.t)} to ${typeStr(to)}.`);
        const r: Val = { t: to, v: v.big !== undefined ? Number(BigInt.asUintN(64, v.big)) : v.v };
        this.tagHeap(to, r.v);
        return r;
      }
      case "struct":
        if (v.t.k !== "struct" || v.t.def !== to.def) this.err(`Cannot convert ${typeStr(v.t)} to ${typeStr(to)}.`);
        return v;
      case "void":
        return VOIDV;
      default:
        return this.err(`Cannot convert to ${typeStr(to)}.`);
    }
  }

  /* ----------------------------- expressions ----------------------------- */
  rvFromLv(lv: LV, e: Expr): Val {
    if (lv.t.k === "array") return { t: ptrTo(lv.t.of), v: lv.addr };
    if (lv.t.k === "func") return { t: ptrTo(lv.t), v: lv.addr };
    return this.loadChecked(lv, e);
  }

  isLvalueExpr(e: Expr): boolean {
    if (e.t === "id") return !!this.lookup(e.name);
    return e.t === "mem" || e.t === "idx" || (e.t === "un" && e.op === "*");
  }

  lv(e: Expr): LV {
    this.tick();
    this.line = e.line;
    switch (e.t) {
      case "id": {
        const v = this.lookup(e.name);
        if (v) return { t: v.ty, addr: v.addr };
        return this.err(`'${e.name}' is not declared — did you forget to declare it?`);
      }
      case "un": {
        if (e.op !== "*") break;
        const p = this.rv(e.e);
        if (p.t.k !== "ptr") return this.err(`Cannot dereference '${exprStr(e.e)}' because it is not a pointer.`);
        if (p.t.to.k === "void") return this.err("Cannot dereference a void* — cast it to a typed pointer first.");
        return { t: p.t.to, addr: p.v };
      }
      case "idx": {
        let base: number;
        let elem: CType;
        let len = -1;
        if (this.isLvalueExpr(e.a)) {
          const l = this.lv(e.a);
          if (l.t.k === "array") {
            base = l.addr;
            elem = l.t.of;
            len = l.t.len;
          } else if (l.t.k === "ptr") {
            base = this.loadChecked(l, e.a).v;
            elem = l.t.to;
          } else return this.err(`'${exprStr(e.a)}' is not an array or a pointer, so it cannot be indexed.`);
        } else {
          const p = this.rv(e.a);
          if (p.t.k !== "ptr") return this.err(`'${exprStr(e.a)}' is not an array or a pointer, so it cannot be indexed.`);
          base = p.v;
          elem = p.t.to;
        }
        const i = this.rv(e.i);
        if (i.t.k !== "int") return this.err("An array index must be an integer.");
        const idx = num(i);
        if (len >= 0 && (idx < 0 || idx >= len)) {
          return this.err(
            `Index ${idx} is out of bounds for '${exprStr(e.a)}' — valid indexes are 0 to ${len - 1}.`,
          );
        }
        if (elem.k === "void") return this.err("Cannot index a void* — cast it first.");
        return { t: elem, addr: base + idx * sizeOf(elem) };
      }
      case "mem": {
        let base: number;
        let st: CType;
        if (e.arrow) {
          const p = this.rv(e.o);
          if (p.t.k !== "ptr") return this.err(`'${exprStr(e.o)}' is not a pointer, so use '.' instead of '->'.`);
          base = p.v;
          st = p.t.to;
        } else {
          if (!this.isLvalueExpr(e.o)) return this.err(`Cannot take member '${e.name}' of this expression.`);
          const o = this.lv(e.o);
          if (o.t.k === "ptr") return this.err(`'${exprStr(e.o)}' is a pointer, so use '->' instead of '.'.`);
          base = o.addr;
          st = o.t;
        }
        if (st.k !== "struct") return this.err(`'${exprStr(e.o)}' is not a struct.`);
        const f = st.def.fields.find((x) => x.name === e.name);
        if (!f) return this.err(`${typeStr(st)} has no member named '${e.name}'.`);
        return { t: f.type, addr: base + f.offset };
      }
      case "str": {
        const a = this.strLit(e.v);
        return { t: { k: "array", of: CHAR, len: e.v.length + 1 }, addr: a };
      }
    }
    return this.err("This expression cannot be used on the left side of an assignment.");
  }

  rv(e: Expr): Val {
    this.tick();
    this.line = e.line;
    switch (e.t) {
      case "num":
        return { t: e.ty, v: e.v };
      case "str":
        return { t: ptrTo(CHAR), v: this.strLit(e.v) };
      case "id": {
        const v = this.lookup(e.name);
        if (v) return this.rvFromLv({ t: v.ty, addr: v.addr }, e);
        const fa = this.funcAddr.get(e.name);
        if (fa !== undefined) return { t: ptrTo(this.funcType(this.funcAt.get(fa)!)), v: fa };
        const c = CONSTS[e.name];
        if (c) return c();
        const en = this.prog.enums.get(e.name);
        if (en !== undefined) return I(en);
        return this.err(`'${e.name}' is not declared — did you forget to declare it?`);
      }
      case "un":
        return this.rvUn(e);
      case "bin":
        return this.rvBin(e);
      case "asg":
        return this.rvAsg(e);
      case "cond":
        return this.truthy(this.rv(e.c)) ? this.rv(e.a) : this.rv(e.b);
      case "call":
        return this.rvCall(e);
      case "idx":
      case "mem":
        return this.rvFromLv(this.lv(e), e);
      case "cast":
        return this.convert(this.rv(e.e), e.ty);
      case "sizeofT":
        return { t: ULONG, v: sizeOf(e.ty) };
      case "sizeofE":
        return { t: ULONG, v: sizeOf(this.staticType(e.e)) };
      case "init":
        return this.err("A brace list { ... } can only be used to initialize a variable.");
    }
  }

  funcType(fd: FuncDef): CType {
    return { k: "func", ret: fd.ret, params: fd.params, variadic: fd.variadic };
  }

  staticType(e: Expr): CType {
    switch (e.t) {
      case "id": {
        const v = this.lookup(e.name);
        return v ? v.ty : this.rv(e).t;
      }
      case "un": {
        if (e.op === "*") {
          const t = this.staticType(e.e);
          if (t.k === "ptr") return t.to;
          if (t.k === "array") return t.of;
          return this.err("Cannot dereference a non-pointer.");
        }
        if (e.op === "&") return ptrTo(this.staticType(e.e));
        return this.rv(e).t;
      }
      case "idx": {
        const t = this.staticType(e.a);
        if (t.k === "array") return t.of;
        if (t.k === "ptr") return t.to;
        return this.err("Cannot index a non-array.");
      }
      case "mem": {
        let t = this.staticType(e.o);
        if (e.arrow && t.k === "ptr") t = t.to;
        if (t.k !== "struct") return this.err("Not a struct.");
        const f = t.def.fields.find((x) => x.name === e.name);
        return f ? f.type : this.err(`No member named '${e.name}'.`);
      }
      case "str":
        return { k: "array", of: CHAR, len: e.v.length + 1 };
      case "cast":
        return e.ty;
      case "num":
        return e.ty;
      default:
        return this.rv(e).t;
    }
  }

  rvUn(e: Extract<Expr, { t: "un" }>): Val {
    switch (e.op) {
      case "&": {
        if (e.e.t === "id" && !this.lookup(e.e.name)) {
          const fa = this.funcAddr.get(e.e.name);
          if (fa !== undefined) return { t: ptrTo(this.funcType(this.funcAt.get(fa)!)), v: fa };
        }
        const l = this.lv(e.e);
        return { t: ptrTo(l.t), v: l.addr };
      }
      case "*": {
        const l = this.lv(e);
        return this.rvFromLv(l, e);
      }
      case "-":
      case "+":
      case "~": {
        const a = this.rv(e.e);
        if (a.t.k === "float") {
          if (e.op === "~") return this.err("'~' needs an integer operand.");
          return { t: a.t, v: e.op === "-" ? -a.v : a.v };
        }
        if (a.t.k !== "int") return this.err(`Cannot apply '${e.op}' to ${typeStr(a.t)}.`);
        const ty = promote1(a.t);
        const x = this.convert(a, ty);
        if (ty.size === 8) {
          const b = bigOf(x);
          const r = e.op === "-" ? -b : e.op === "~" ? ~b : b;
          return mkLong(ty, ty.signed ? BigInt.asIntN(64, r) : BigInt.asUintN(64, r));
        }
        const r = e.op === "-" ? -x.v : e.op === "~" ? ~x.v : x.v;
        return { t: ty, v: wrapInt(ty, r) };
      }
      case "!":
        return I(this.truthy(this.rv(e.e)) ? 0 : 1);
      default: {
        const delta = e.op.endsWith("++") ? 1 : -1;
        const l = this.lv(e.e);
        const old = this.loadChecked(l, e.e);
        let nv: Val;
        if (old.t.k === "ptr") nv = { t: old.t, v: old.v + delta * (sizeOf(old.t.to) || 1) };
        else if (old.t.k === "float") nv = this.convert({ t: DOUBLE, v: old.v + delta }, old.t);
        else if (old.t.k === "int") nv = this.convert(this.binop(delta > 0 ? "+" : "-", old, I(1)), old.t);
        else return this.err(`Cannot apply '${e.op.slice(-2)}' to ${typeStr(old.t)}.`);
        this.store(l.t, l.addr, nv);
        this.events.push(`${exprStr(e.e)} goes from ${this.fmtVal(old)} to ${this.fmtVal(nv)}.`);
        return e.op.startsWith("pre") ? nv : old;
      }
    }
  }

  rvBin(e: Extract<Expr, { t: "bin" }>): Val {
    if (e.op === "&&") return I(this.truthy(this.rv(e.l)) && this.truthy(this.rv(e.r)) ? 1 : 0);
    if (e.op === "||") return I(this.truthy(this.rv(e.l)) || this.truthy(this.rv(e.r)) ? 1 : 0);
    if (e.op === ",") {
      this.rv(e.l);
      return this.rv(e.r);
    }
    const a = this.rv(e.l);
    const b = this.rv(e.r);
    this.line = e.line;
    return this.binop(e.op, a, b);
  }

  binop(op: string, a: Val, b: Val): Val {
    if (a.t.k === "struct" || b.t.k === "struct" || a.t.k === "void" || b.t.k === "void") {
      return this.err(`Cannot use '${op}' with ${typeStr(a.t.k === "struct" || a.t.k === "void" ? a.t : b.t)}.`);
    }
    const pa = a.t.k === "ptr";
    const pb = b.t.k === "ptr";
    if (pa || pb) {
      const esA = pa ? sizeOf((a.t as Extract<CType, { k: "ptr" }>).to) || 1 : 1;
      const esB = pb ? sizeOf((b.t as Extract<CType, { k: "ptr" }>).to) || 1 : 1;
      if (op === "+" && pa && !pb && b.t.k === "int") return { t: a.t, v: a.v + num(b) * esA };
      if (op === "+" && pb && !pa && a.t.k === "int") return { t: b.t, v: b.v + num(a) * esB };
      if (op === "-" && pa && !pb && b.t.k === "int") return { t: a.t, v: a.v - num(b) * esA };
      if (op === "-" && pa && pb) return { t: LONG, v: Math.trunc((a.v - b.v) / esA) };
      switch (op) {
        case "==": return I(+(a.v === b.v));
        case "!=": return I(+(a.v !== b.v));
        case "<": return I(+(a.v < b.v));
        case ">": return I(+(a.v > b.v));
        case "<=": return I(+(a.v <= b.v));
        case ">=": return I(+(a.v >= b.v));
      }
      return this.err(`'${op}' is not allowed on pointers.`);
    }
    if (a.t.k === "float" || b.t.k === "float") {
      const x = num(a);
      const y = num(b);
      const dbl = (a.t.k === "float" && a.t.size === 8) || (b.t.k === "float" && b.t.size === 8);
      const ty = dbl ? DOUBLE : FLOAT;
      const fin = (r: number): Val => ({ t: ty, v: dbl ? r : Math.fround(r) });
      switch (op) {
        case "+": return fin(x + y);
        case "-": return fin(x - y);
        case "*": return fin(x * y);
        case "/": return fin(x / y);
        case "==": return I(+(x === y));
        case "!=": return I(+(x !== y));
        case "<": return I(+(x < y));
        case ">": return I(+(x > y));
        case "<=": return I(+(x <= y));
        case ">=": return I(+(x >= y));
      }
      return this.err(`'${op}' needs integer operands (use fmod() for floating-point remainders).`);
    }
    if (op === "<<" || op === ">>") {
      const ty = promote1(a.t);
      return this.intOp(op, ty, this.convert(a, ty), this.convert(b, INT));
    }
    const ty = usual(a.t, b.t);
    const x = this.convert(a, ty);
    const y = this.convert(b, ty);
    switch (op) {
      case "==": case "!=": case "<": case ">": case "<=": case ">=": {
        const p = ty.size === 8 ? bigOf(x) : x.v;
        const q = ty.size === 8 ? bigOf(y) : y.v;
        const r = op === "==" ? p === q : op === "!=" ? p !== q : op === "<" ? p < q : op === ">" ? p > q : op === "<=" ? p <= q : p >= q;
        return I(+r);
      }
    }
    return this.intOp(op, ty, x, y);
  }

  intOp(op: string, ty: IntT, x: Val, y: Val): Val {
    if (ty.size === 8) {
      const p = bigOf(x);
      const q = bigOf(y);
      let r: bigint;
      switch (op) {
        case "+": r = p + q; break;
        case "-": r = p - q; break;
        case "*": r = p * q; break;
        case "/": if (q === 0n) return this.err("Division by zero."); r = p / q; break;
        case "%": if (q === 0n) return this.err("Remainder by zero."); r = p % q; break;
        case "&": r = p & q; break;
        case "|": r = p | q; break;
        case "^": r = p ^ q; break;
        case "<<": r = p << (q & 63n); break;
        case ">>": r = p >> (q & 63n); break;
        default: return this.err(`Unsupported operator '${op}'.`);
      }
      return mkLong(ty, ty.signed ? BigInt.asIntN(64, r) : BigInt.asUintN(64, r));
    }
    const a = x.v;
    const b = y.v;
    switch (op) {
      case "+": return { t: ty, v: wrapInt(ty, a + b) };
      case "-": return { t: ty, v: wrapInt(ty, a - b) };
      case "*": return { t: ty, v: wrapInt(ty, Math.imul(a, b)) };
      case "/": if (b === 0) return this.err("Division by zero."); return { t: ty, v: wrapInt(ty, Math.trunc(a / b)) };
      case "%": if (b === 0) return this.err("Remainder by zero."); return { t: ty, v: wrapInt(ty, a % b) };
      case "&": return { t: ty, v: wrapInt(ty, a & b) };
      case "|": return { t: ty, v: wrapInt(ty, a | b) };
      case "^": return { t: ty, v: wrapInt(ty, a ^ b) };
      case "<<": return { t: ty, v: wrapInt(ty, a << (b & 31)) };
      case ">>": return { t: ty, v: wrapInt(ty, ty.signed ? a >> (b & 31) : a >>> (b & 31)) };
    }
    return this.err(`Unsupported operator '${op}'.`);
  }

  rvAsg(e: Extract<Expr, { t: "asg" }>): Val {
    const l = this.lv(e.l);
    if (l.t.k === "array") {
      return this.err(`Arrays cannot be assigned with '=' — copy the elements one by one (or use strcpy/memcpy).`);
    }
    const r = this.rv(e.r);
    let old: Val | null = null;
    try {
      const size = sizeOf(l.t);
      if (l.t.k !== "struct" && this.isInit(l.addr, size)) {
        this.check(l.addr, size);
        old = this.loadRaw(l.t, l.addr);
      }
    } catch {
      old = null;
    }
    let nv: Val;
    if (e.op === "=") nv = this.convert(r, l.t);
    else {
      const cur = this.loadChecked(l, e.l);
      nv = this.convert(this.binop(e.op.slice(0, -1), cur, r), l.t);
    }
    this.line = e.line;
    this.store(l.t, l.addr, nv);
    const name = exprStr(e.l);
    if (l.t.k === "struct") this.events.push(`Copies the whole struct into ${name}.`);
    else if (e.op === "=") {
      this.events.push(
        `Stores ${this.fmtVal(nv)} into ${name}${old && this.fmtVal(old) !== this.fmtVal(nv) ? ` (it was ${this.fmtVal(old)})` : ""}.`,
      );
    } else this.events.push(`${name} changes from ${old ? this.fmtVal(old) : "an unknown value"} to ${this.fmtVal(nv)}.`);
    return nv;
  }

  /* ----------------------------- calls ----------------------------- */
  rvCall(e: CallExpr): Val {
    if (e.f.t === "id" && !this.lookup(e.f.name)) {
      const name = e.f.name;
      const fd = this.prog.funcs.get(name);
      if (fd) return this.callUser(fd, e.args.map((a) => this.rv(a)), e.line);
      const bi = BUILTINS[name];
      if (bi) {
        const args = e.args.map((a) => this.rv(a));
        this.line = e.line;
        return bi(this, args, e);
      }
      return this.err(`Function '${name}' is not defined (and is not a library function this visualizer knows).`);
    }
    const fv = this.rv(e.f);
    if (fv.t.k === "ptr" && fv.t.to.k === "func") {
      const fd = this.funcAt.get(fv.v);
      if (!fd) return this.err("Called a function pointer that does not point to a function.");
      return this.callUser(fd, e.args.map((a) => this.rv(a)), e.line);
    }
    return this.err(`'${exprStr(e.f)}' is not a function.`);
  }

  callUser(fd: FuncDef, args: Val[], callLine: number): Val {
    this.line = callLine;
    if (this.frames.length >= MAX_DEPTH) {
      this.err(`Stack overflow: more than ${MAX_DEPTH} nested calls — does the recursion have a base case?`);
    }
    if (args.length < fd.params.length) {
      this.err(`Too few arguments to '${fd.name}': expected ${fd.params.length} but got ${args.length}.`);
    }
    if (args.length > fd.params.length && !fd.variadic) {
      this.err(`Too many arguments to '${fd.name}': expected ${fd.params.length} but got ${args.length}.`);
    }
    const savedEvents = this.events;
    const savedSp = this.sp;
    const frame: Frame = { fd, scopes: [{ vars: [], sp: savedSp }], line: fd.line, ret: null };
    const isMain = fd.name === "main" && this.frames.length === 0;
    this.frames.push(frame);
    const shown: string[] = [];
    fd.params.forEach((p, i) => {
      const v = this.convert(args[i], p.type);
      const addr = this.allocStack(sizeOf(p.type), alignOf(p.type));
      this.store(p.type, addr, v);
      frame.scopes[0].vars.push({ name: p.name, ty: p.type, addr, born: this.steps.length });
      shown.push(`${p.name} = ${this.fmtVal(v)}`);
    });
    this.events = [];
    const sig = `${fd.name}(${fd.params.map((p, i) => this.fmtVal(this.convert(args[i], p.type))).join(", ")})`;
    this.step(
      isMain ? "start" : "call",
      isMain ? "Program starts" : `Call ${sig}`,
      isMain
        ? "Every C program starts running at main(). It gets its own stack frame, where its local variables will live."
        : `Calls ${fd.name}. It gets a brand-new stack frame` +
            (shown.length ? ` and its parameters receive copies of the arguments: ${shown.join(", ")}.` : "."),
      fd.line,
    );
    const c = this.execBlock(fd.body, false);
    let ret: Val;
    if (c && c.t === "return" && c.v) ret = c.v;
    else {
      ret = fd.name === "main" ? I(0) : VOIDV;
      if (!(c && c.t === "return")) {
        frame.ret = fd.ret.k === "void" ? null : fd.name === "main" ? "0" : null;
        this.events = [];
        this.step(
          "return",
          `Return from ${fd.name}()`,
          fd.name === "main"
            ? "Reaching the end of main() returns 0, which means success."
            : `Reached the end of ${fd.name}(), so control goes back to the caller.`,
          fd.body.endLine,
        );
      }
    }
    this.frames.pop();
    this.sp = savedSp;
    this.events = savedEvents;
    this.line = callLine;
    return fd.ret.k === "void" ? VOIDV : this.convert(ret, fd.ret);
  }

  /* ----------------------------- declarations ----------------------------- */
  resolveType(ty: CType, init: Expr | null, name: string): CType {
    if (ty.k !== "array") return ty;
    const of = this.resolveType(ty.of, null, name);
    let len = ty.len;
    if (ty.lenExpr) {
      const n = this.rv(ty.lenExpr as Expr);
      len = num(n);
      if (len <= 0) this.err(`Array '${name}' must have a positive size (got ${len}).`);
    } else if (len < 0) {
      if (init && init.t === "str" && isCharT(of)) len = init.v.length + 1;
      else if (init && init.t === "init") {
        let idx = 0;
        let max = 0;
        for (const it of init.items) {
          if (it.index) idx = num(this.rv(it.index));
          idx++;
          max = Math.max(max, idx);
        }
        len = max;
      } else this.err(`Array '${name}' needs a size or an initializer.`);
    }
    return { k: "array", of, len };
  }

  bind(info: VarInfo, global: boolean) {
    if (global) this.globals.set(info.name, info);
    else this.frame!.scopes[this.frame!.scopes.length - 1].vars.push(info);
  }

  declare(item: DeclItem, global: boolean): string {
    const ty = this.resolveType(item.ty, item.init, item.name);
    if (item.isStatic && !global) {
      const ex = this.statics.get(item);
      if (ex) {
        this.bind(ex, false);
        return `Static variable ${item.name} already exists, so it keeps the value it had last time.`;
      }
    }
    const size = sizeOf(ty);
    const align = alignOf(ty);
    const permanent = global || item.isStatic;
    const addr = permanent ? this.allocData(size, align) : this.allocStack(size, align);
    const info: VarInfo = { name: item.name, ty, addr, born: this.steps.length };
    this.bind(info, global);
    if (item.isStatic) this.statics.set(item, info);
    if (permanent) this.zero(addr, size);
    if (item.init) this.applyInit(addr, ty, item.init, item.name);
    return this.declSentence(item.name, ty, addr, !!item.init || permanent);
  }

  applyInit(addr: number, ty: CType, init: Expr, name: string) {
    if (init.t === "init") {
      if (ty.k === "array") {
        this.zero(addr, sizeOf(ty));
        const es = sizeOf(ty.of);
        let idx = 0;
        for (const it of init.items) {
          if (it.field) this.err(`Cannot use .${it.field} when initializing an array.`);
          if (it.index) idx = num(this.rv(it.index));
          if (idx < 0 || idx >= ty.len) this.err(`Too many initializers for '${name}' (it holds only ${ty.len}).`);
          this.applyInit(addr + idx * es, ty.of, it.e, name);
          idx++;
        }
      } else if (ty.k === "struct") {
        this.zero(addr, sizeOf(ty));
        const fields = ty.def.fields;
        let fi = 0;
        for (const it of init.items) {
          if (it.field) {
            fi = fields.findIndex((f) => f.name === it.field);
            if (fi < 0) this.err(`${typeStr(ty)} has no member named '${it.field}'.`);
          }
          const f = fields[fi];
          if (!f || (ty.def.union && fi > 0)) this.err(`Too many initializers for ${typeStr(ty)}.`);
          this.applyInit(addr + f.offset, f.type, it.e, name);
          fi++;
        }
      } else if (init.items.length) this.applyInit(addr, ty, init.items[0].e, name);
      else this.zero(addr, sizeOf(ty));
      return;
    }
    if (ty.k === "array") {
      if (init.t === "str" && isCharT(ty.of)) {
        if (init.v.length > ty.len) this.err(`The string is too long for '${name}' (${ty.len} chars).`);
        this.zero(addr, ty.len);
        for (let i = 0; i < init.v.length; i++) this.u8[addr + i] = init.v.charCodeAt(i) & 0xff;
        return;
      }
      this.err(`Array '${name}' must be initialized with a brace list like { 1, 2, 3 }.`);
    }
    const v = this.rv(init);
    this.store(ty, addr, this.convert(v, ty));
  }

  declSentence(name: string, ty: CType, addr: number, hasInit: boolean): string {
    const tn = typeStr(ty);
    if (!hasInit) {
      return ty.k === "array"
        ? `Declares array ${name} (${tn}). Its ${ty.len} slots are uninitialized, so they hold garbage until you assign them.`
        : `Declares ${name} (${tn}). It has no value yet — until you assign one it holds garbage.`;
    }
    const s = this.summ(ty, addr);
    switch (ty.k) {
      case "ptr":
        return `Declares pointer ${name} (${tn}) and makes it point to ${this.ptrDesc(this.loadRaw(ty, addr).v)}.`;
      case "array":
        return isCharT(ty.of)
          ? `Declares ${name} (${tn}) holding the string ${s}. A hidden '\\0' marks where the string ends.`
          : `Declares array ${name} (${tn}): ${ty.len} ${typeStr(ty.of)} values stored side by side — ${s}.`;
      case "struct":
        return `Declares ${name} as a ${tn} with ${s}.`;
      default:
        return `Declares ${name} (${tn}) and stores ${s} in it.`;
    }
  }

  /* ----------------------------- value formatting ----------------------------- */
  fmtVal(v: Val): string {
    switch (v.t.k) {
      case "int":
        if (v.t.bool) return v.v ? "true" : "false";
        if (isCharT(v.t)) {
          const c = charText(v.v & 0xff);
          return c.startsWith("'") ? `${c} (${v.v})` : c;
        }
        return String(v.big !== undefined ? v.big : v.v);
      case "float":
        return fmtFloat(v.v, v.t.size === 4);
      case "ptr":
        return this.ptrDesc(v.v);
      case "struct":
        return "a struct";
      default:
        return "nothing";
    }
  }

  descend(path: string, ty: CType, base: number, addr: number): string | null {
    const size = sizeOf(ty);
    if (addr < base || addr >= base + Math.max(size, 1)) return null;
    if (ty.k === "array") {
      const es = sizeOf(ty.of) || 1;
      const i = Math.floor((addr - base) / es);
      return this.descend(`${path}[${i}]`, ty.of, base + i * es, addr);
    }
    if (ty.k === "struct") {
      for (const f of ty.def.fields) {
        const r = this.descend(`${path}.${f.name}`, f.type, base + f.offset, addr);
        if (r) return r;
      }
    }
    return path;
  }

  ptrDesc(addr: number): string {
    if (addr === 0) return "NULL";
    const fd = this.funcAt.get(addr);
    if (fd) return `function ${fd.name}`;
    for (let i = this.frames.length - 1; i >= -1; i--) {
      const vars = i >= 0 ? this.frames[i].scopes.flatMap((s) => s.vars) : [...this.globals.values()];
      for (const v of vars) {
        const p = this.descend(v.name, v.ty, v.addr, addr);
        if (p) return `&${p}`;
      }
    }
    if (addr >= HEAP && addr < HEAP_END) {
      const b = this.blockAt(addr, 0);
      if (b) {
        const off = addr - b.addr;
        const es = b.type ? sizeOf(b.type) || 1 : 1;
        return off === 0 ? `heap block #${b.id}` : `heap block #${b.id} [${Math.floor(off / es)}]`;
      }
    }
    for (const [s, a] of this.strLits) if (addr >= a && addr <= a + s.length) return `the string ${JSON.stringify(s)}`;
    return hex(addr);
  }

  summ(ty: CType, addr: number): string {
    if (!this.isInit(addr, Math.min(sizeOf(ty), 1))) return "?";
    switch (ty.k) {
      case "array": {
        if (isCharT(ty.of)) {
          let s = "";
          for (let i = 0; i < ty.len && this.u8[addr + i] !== 0; i++) s += String.fromCharCode(this.u8[addr + i]);
          return JSON.stringify(s);
        }
        const es = sizeOf(ty.of);
        const items: string[] = [];
        for (let i = 0; i < Math.min(ty.len, 8); i++) items.push(this.summ(ty.of, addr + i * es));
        return `{${items.join(", ")}${ty.len > 8 ? ", …" : ""}}`;
      }
      case "struct":
        return `{${ty.def.fields.map((f) => `${f.name} = ${this.summ(f.type, addr + f.offset)}`).join(", ")}}`;
      default:
        return this.fmtVal(this.loadRaw(ty, addr));
    }
  }

  /* ----------------------------- statements ----------------------------- */
  execBlock(b: Extract<Stmt, { t: "block" }>, newScope: boolean): Completion {
    if (newScope) this.pushScope();
    for (const s of b.body) {
      const c = this.exec(s);
      if (c) {
        if (newScope) this.popScope();
        return c;
      }
    }
    if (newScope) this.popScope();
    return null;
  }

  subFn = (x: Expr): string | null => {
    if (x.t === "id") {
      const v = this.lookup(x.name);
      if (v && (v.ty.k === "int" || v.ty.k === "float" || v.ty.k === "ptr") && this.isInit(v.addr, sizeOf(v.ty))) {
        const val = this.loadRaw(v.ty, v.addr);
        return v.ty.k === "ptr" ? (val.v === 0 ? "NULL" : hex(val.v)) : this.fmtVal(val).replace(/ \(\d+\)$/, "");
      }
    }
    return null;
  };

  condText(c: Expr, result: boolean): string {
    const plain = exprStr(c);
    const sub = exprStr(c, this.subFn);
    return `${plain === sub ? plain : `${plain}  →  ${sub}`}  is ${result ? "true" : "false"}`;
  }

  step(kind: StepKind, title: string, explain: string, line = this.line) {
    if (this.steps.length >= MAX_STEPS) throw new StopTrace();
    this.steps.push(this.snapshot(kind, title, explain, line));
  }

  text(...extra: string[]): string {
    return [...extra, ...this.events].filter(Boolean).join(" ");
  }

  exec(s: Stmt): Completion {
    this.tick();
    this.line = s.line;
    const fr = this.frame;
    if (fr) fr.line = s.line;
    switch (s.t) {
      case "decl": {
        this.events = [];
        const sentences = s.items.map((it) => this.declare(it, false));
        this.step("stmt", `Declare ${s.items.map((i) => i.name).join(", ")}`, this.text(...sentences), s.line);
        return null;
      }
      case "expr": {
        this.events = [];
        this.rv(s.e);
        const e = s.e;
        const title =
          e.t === "asg" ? "Assign" : e.t === "call" ? `Call ${exprStr(e.f)}()` : e.t === "un" ? "Update" : "Run expression";
        this.line = s.line;
        this.step("stmt", title, this.text() || `Runs ${exprStr(e)}.`, s.line);
        return null;
      }
      case "if": {
        this.events = [];
        const c = this.truthy(this.rv(s.c));
        this.step(
          "cond",
          "if condition",
          `${this.condText(s.c, c)} — ${c ? "so the if-branch runs." : s.b ? "so the else-branch runs." : "so the if-branch is skipped."}`,
          s.line,
        );
        const branch = c ? s.a : s.b;
        return branch ? this.exec(branch) : null;
      }
      case "while": {
        for (;;) {
          this.events = [];
          const c = this.truthy(this.rv(s.c));
          this.step("cond", "while condition", `${this.condText(s.c, c)} — ${c ? "so the loop body runs again." : "so the loop ends."}`, s.line);
          if (!c) return null;
          const r = this.exec(s.body);
          if (r) {
            if (r.t === "break") return null;
            if (r.t === "return") return r;
          }
        }
      }
      case "do": {
        for (;;) {
          const r = this.exec(s.body);
          if (r) {
            if (r.t === "break") return null;
            if (r.t === "return") return r;
          }
          this.events = [];
          const c = this.truthy(this.rv(s.c));
          this.step("cond", "do-while condition", `${this.condText(s.c, c)} — ${c ? "so the loop repeats." : "so the loop ends."}`, s.line);
          if (!c) return null;
        }
      }
      case "for": {
        this.pushScope();
        if (s.init) this.exec(s.init);
        for (;;) {
          this.line = s.line;
          if (fr) fr.line = s.line;
          let c = true;
          if (s.c) {
            this.events = [];
            c = this.truthy(this.rv(s.c));
            this.step("cond", "for condition", `${this.condText(s.c, c)} — ${c ? "so the loop body runs." : "so the loop ends."}`, s.line);
          }
          if (!c) break;
          const r = this.exec(s.body);
          if (r) {
            if (r.t === "break") break;
            if (r.t === "return") {
              this.popScope();
              return r;
            }
          }
          if (s.step) {
            this.line = s.line;
            if (fr) fr.line = s.line;
            this.events = [];
            this.rv(s.step);
            this.step("stmt", "for update", this.text() || `Runs ${exprStr(s.step)}.`, s.line);
          }
        }
        this.popScope();
        return null;
      }
      case "switch": {
        this.events = [];
        const v = this.rv(s.e);
        let start = -1;
        let def = -1;
        for (let i = 0; i < s.body.length && start < 0; i++) {
          const st = s.body[i];
          if (st.t !== "case") continue;
          if (st.e === null) def = i;
          else if (num(this.rv(st.e)) === num(v)) start = i;
        }
        if (start < 0) start = def;
        this.step(
          "cond",
          "switch",
          `switch (${exprStr(s.e)}) is ${this.fmtVal(v)} — ${start < 0 ? "no case matches, so nothing runs." : s.body[start].t === "case" && (s.body[start] as { e: Expr | null }).e === null ? "jumping to default." : `jumping to case ${exprStr((s.body[start] as { e: Expr }).e)}.`}`,
          s.line,
        );
        if (start < 0) return null;
        this.pushScope();
        for (let i = start; i < s.body.length; i++) {
          if (s.body[i].t === "case") continue;
          const r = this.exec(s.body[i]);
          if (r) {
            this.popScope();
            return r.t === "break" ? null : r;
          }
        }
        this.popScope();
        return null;
      }
      case "case":
      case "empty":
        return null;
      case "break":
        this.events = [];
        this.step("stmt", "break", "break jumps out of the nearest loop or switch.", s.line);
        return BRK;
      case "continue":
        this.events = [];
        this.step("stmt", "continue", "continue skips the rest of this loop iteration.", s.line);
        return CNT;
      case "return": {
        this.events = [];
        const fd = this.frame!.fd;
        let v: Val | null = null;
        if (s.e) {
          v = this.rv(s.e);
          if (fd.ret.k !== "void") v = this.convert(v, fd.ret);
        }
        this.frame!.ret = v && fd.ret.k !== "void" ? this.fmtVal(v) : null;
        this.line = s.line;
        this.step(
          "return",
          `Return from ${fd.name}()`,
          v && fd.ret.k !== "void"
            ? `${fd.name}() returns ${this.fmtVal(v)} to its caller, and its stack frame goes away.`
            : `${fd.name}() ends and control goes back to the caller.`,
          s.line,
        );
        return { t: "return", v };
      }
      case "block":
        return this.execBlock(s, true);
    }
  }

  /* ----------------------------- snapshots ----------------------------- */
  leaf(text: string, addr: number, next: Map<number, string>, uninit: boolean) {
    next.set(addr, text);
    return !uninit && this.prev.get(addr) !== text;
  }

  literalAt(addr: number): string | null {
    for (const [s, a] of this.strLits) if (addr >= a && addr <= a + s.length) return s.slice(addr - a, addr - a + 24);
    return null;
  }

  validTarget(v: number): boolean {
    if (v < DATA || v >= MEM) return v >= TEXT && v < DATA && this.funcAt.has(v);
    if (v >= HEAP && v < HEAP_END) {
      const b = this.blockAt(v, 1);
      return !!b && !b.freed;
    }
    if (v >= HEAP_END && v < STACK_LIMIT) return false;
    if (v >= STACK_LIMIT && v < this.sp) return false;
    return true;
  }

  view(ty: CType, addr: number, next: Map<number, string>): ValView {
    switch (ty.k) {
      case "array": {
        const es = sizeOf(ty.of);
        const n = Math.min(ty.len, 64);
        const items: ValView[] = [];
        for (let i = 0; i < n; i++) items.push(this.view(ty.of, addr + i * es, next));
        let str: string | null = null;
        if (isCharT(ty.of) && this.isInit(addr, 1)) {
          str = "";
          for (let i = 0; i < ty.len && this.u8[addr + i] !== 0 && this.ini[addr + i]; i++) str += String.fromCharCode(this.u8[addr + i]);
        }
        return { k: "array", addr, elem: typeStr(ty.of), len: ty.len, items, more: ty.len - n, str };
      }
      case "struct":
        return {
          k: "struct",
          addr,
          tag: typeStr(ty),
          fields: ty.def.fields.map((f) => ({ name: f.name, v: this.view(f.type, addr + f.offset, next) })),
        };
      case "ptr": {
        const init = this.isInit(addr, 8);
        const val = this.loadRaw(ty, addr).v;
        const text = !init ? "?" : val === 0 ? "NULL" : this.funcAt.has(val) ? this.funcAt.get(val)!.name : hex(val);
        return {
          k: "ptr",
          addr,
          text,
          changed: this.leaf(text, addr, next, !init),
          uninit: !init,
          target: init && val !== 0 && !this.funcAt.has(val) ? val : null,
          pointee: typeStr(ty.to),
          bad: init && val !== 0 && !this.validTarget(val),
          toStruct: ty.to.k === "struct",
          str: init && isCharT(ty.to) ? this.literalAt(val) : null,
        };
      }
      default: {
        const size = sizeOf(ty);
        const init = this.isInit(addr, size);
        const val = this.loadRaw(ty, addr);
        let text: string;
        if (!init) text = "?";
        else if (ty.k === "float") text = fmtFloat(val.v, ty.size === 4);
        else if (ty.k === "int" && ty.bool) text = val.v ? "true" : "false";
        else if (isCharT(ty)) text = charText(val.v & 0xff);
        else text = String(val.big !== undefined ? val.big : val.v);
        return { k: "scalar", addr, text, changed: this.leaf(text, addr, next, !init), uninit: !init, ch: isCharT(ty), num: !isCharT(ty) };
      }
    }
  }

  varView(v: VarInfo, idx: number, next: Map<number, string>): VarView {
    return { name: v.name, type: typeStr(v.ty), addr: v.addr, size: sizeOf(v.ty), isNew: v.born === idx, v: this.view(v.ty, v.addr, next) };
  }

  heapView(b: HeapBlock, idx: number, next: Map<number, string>): HeapView {
    let v: ValView | null = null;
    let type: string | null = null;
    if (b.type && b.type.k !== "void" && b.type.k !== "func") {
      const es = sizeOf(b.type) || 1;
      const count = Math.floor(b.size / es);
      type = typeStr(b.type);
      if (count > 1) v = this.view({ k: "array", of: b.type, len: count }, b.addr, next);
      else if (count === 1) v = this.view(b.type, b.addr, next);
    }
    return { id: b.id, addr: b.addr, size: b.size, freed: b.freed, type, line: b.line, isNew: b.born === idx, v };
  }

  snapshot(kind: StepKind, title: string, explain: string, line: number): TraceStep {
    const idx = this.steps.length;
    const next = new Map<number, string>();
    const frames: FrameView[] = this.frames.map((f) => ({
      fn: f.fd.name,
      line: f.line,
      ret: f.ret,
      vars: f.scopes.flatMap((sc) => sc.vars).map((v) => this.varView(v, idx, next)),
    }));
    const globals = [...this.globals.values()].map((v) => this.varView(v, idx, next));
    const heap = this.blocks.map((b) => this.heapView(b, idx, next));
    this.prev = next;
    return { line, kind, title, explain, frames, globals, heap, output: this.out };
  }

  /* ----------------------------- library helpers ----------------------------- */
  stdinPeek(): string {
    return this.stdin[this.inPos] ?? "";
  }

  formatPrintf(fmt: string, args: Val[]): string {
    let out = "";
    let ai = 0;
    const take = (): Val => {
      const a = args[ai++];
      if (!a) this.err("printf: the format string asks for more values than were passed in.");
      return a;
    };
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c !== "%") {
        out += c;
        continue;
      }
      i++;
      if (fmt[i] === "%") {
        out += "%";
        continue;
      }
      let flags = "";
      while (i < fmt.length && "-+ #0".includes(fmt[i])) flags += fmt[i++];
      let width = "";
      if (fmt[i] === "*") {
        width = String(num(take()));
        i++;
      } else while (i < fmt.length && fmt[i] >= "0" && fmt[i] <= "9") width += fmt[i++];
      let prec: number | null = null;
      if (fmt[i] === ".") {
        i++;
        let p = "";
        if (fmt[i] === "*") {
          p = String(num(take()));
          i++;
        } else while (i < fmt.length && fmt[i] >= "0" && fmt[i] <= "9") p += fmt[i++];
        prec = p === "" ? 0 : parseInt(p, 10);
      }
      let len = "";
      while (i < fmt.length && "hlLzjt".includes(fmt[i])) len += fmt[i++];
      const conv = fmt[i];
      if (conv === undefined) {
        out += "%";
        break;
      }
      const wide = len.includes("l") || len.includes("z") || len.includes("j") || len.includes("t");
      let s: string;
      let numeric = true;
      switch (conv) {
        case "d":
        case "i": {
          const a = take();
          let b = a.t.k === "float" ? BigInt(Math.trunc(a.v)) : bigOf(a);
          b = BigInt.asIntN(wide ? 64 : 32, b);
          s = (b < 0n ? -b : b).toString();
          if (prec !== null) s = s.padStart(prec, "0");
          s = (b < 0n ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "") + s;
          break;
        }
        case "u": {
          const a = take();
          s = BigInt.asUintN(wide ? 64 : 32, a.t.k === "float" ? BigInt(Math.trunc(a.v)) : bigOf(a)).toString();
          if (prec !== null) s = s.padStart(prec, "0");
          break;
        }
        case "x":
        case "X":
        case "o": {
          const a = take();
          const b = BigInt.asUintN(wide ? 64 : 32, bigOf(a));
          s = b.toString(conv === "o" ? 8 : 16);
          if (conv === "X") s = s.toUpperCase();
          if (prec !== null) s = s.padStart(prec, "0");
          if (flags.includes("#") && b !== 0n) s = (conv === "o" ? "0" : conv === "x" ? "0x" : "0X") + s;
          break;
        }
        case "c":
          s = String.fromCharCode(num(take()) & 0xff);
          numeric = false;
          break;
        case "s": {
          const a = take();
          s = a.v === 0 ? "(null)" : this.cstr(a.v);
          if (prec !== null) s = s.slice(0, prec);
          numeric = false;
          break;
        }
        case "f":
        case "F":
        case "e":
        case "E":
        case "g":
        case "G": {
          const x = num(take());
          if (!Number.isFinite(x)) {
            s = Number.isNaN(x) ? "nan" : x < 0 ? "-inf" : "inf";
            numeric = false;
          } else {
            const p = prec ?? 6;
            if (conv === "f" || conv === "F") s = x.toFixed(Math.min(p, 100));
            else if (conv === "e" || conv === "E") s = expFix(x.toExponential(Math.min(p, 100)));
            else {
              const P = p === 0 ? 1 : p;
              if (x === 0) s = "0";
              else {
                const ex = parseInt(x.toExponential(P - 1).split("e")[1], 10);
                if (ex < -4 || ex >= P) s = expFix(stripZeros(x.toExponential(P - 1)));
                else s = stripZeros(x.toFixed(Math.max(P - 1 - ex, 0)));
              }
            }
            if (conv === "E" || conv === "G") s = s.toUpperCase();
            if (x >= 0 && !Object.is(x, -0)) s = (flags.includes("+") ? "+" : flags.includes(" ") ? " " : "") + s;
          }
          break;
        }
        case "p": {
          const a = take();
          s = a.v === 0 ? "(nil)" : hex(a.v);
          numeric = false;
          break;
        }
        default:
          s = `%${conv}`;
          numeric = false;
      }
      const w = width ? parseInt(width, 10) : 0;
      if (s.length < w) {
        if (flags.includes("-")) s = s.padEnd(w, " ");
        else if (flags.includes("0") && numeric && !(prec !== null && "diuxXo".includes(conv))) {
          const m = s.match(/^([+\- ]|0[xX])?(.*)$/)!;
          s = (m[1] ?? "") + m[2].padStart(w - (m[1] ?? "").length, "0");
        } else s = s.padStart(w, " ");
      }
      out += s;
    }
    return out;
  }

  scanf(fmt: string, ptrs: Val[], e: CallExpr, fromIndex: number): Val {
    let assigned = 0;
    let pi = 0;
    const notes: string[] = [];
    const ws = () => {
      while (this.inPos < this.stdin.length && /\s/.test(this.stdin[this.inPos])) this.inPos++;
    };
    let sawInput = false;
    outer: for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (/\s/.test(c)) {
        ws();
        continue;
      }
      if (c !== "%") {
        if (this.stdinPeek() === c) this.inPos++;
        else break;
        continue;
      }
      i++;
      let suppress = false;
      if (fmt[i] === "*") {
        suppress = true;
        i++;
      }
      let width = "";
      while (fmt[i] >= "0" && fmt[i] <= "9") width += fmt[i++];
      let len = "";
      while ("hlLz".includes(fmt[i] ?? "~")) len += fmt[i++];
      const conv = fmt[i];
      if (conv === "%") {
        ws();
        if (this.stdinPeek() === "%") this.inPos++;
        else break;
        continue;
      }
      const target = suppress ? null : ptrs[pi++];
      if (!suppress && !target) this.err("scanf: more format specifiers than variables were passed.");
      const place = !suppress ? exprStr(e.args[fromIndex + pi - 1] ?? e) : "";
      const maxW = width ? parseInt(width, 10) : Infinity;
      switch (conv) {
        case "d": case "i": case "u": case "x": case "o": {
          ws();
          if (this.inPos >= this.stdin.length) {
            this.starve();
            if (assigned === 0 && !sawInput) return I(-1);
            break outer;
          }
          sawInput = true;
          const base = conv === "x" ? 16 : conv === "o" ? 8 : 10;
          const m = this.stdin.slice(this.inPos, this.inPos + Math.min(maxW, 64)).match(base === 16 ? /^[+-]?(0[xX])?[0-9a-fA-F]+/ : base === 8 ? /^[+-]?[0-7]+/ : /^[+-]?\d+/);
          if (!m) break outer;
          this.inPos += m[0].length;
          if (target) {
            const bt: CType = len.includes("l") || len.includes("z") ? LONG : len === "hh" ? CHAR : len === "h" ? { k: "int", size: 2, signed: true, name: "short" } : INT;
            const parsed = BigInt(base === 10 ? m[0].replace(/^\+/, "") : (m[0].startsWith("-") ? "-" : "") + (base === 16 ? "0x" : "0o") + m[0].replace(/^[+-]/, "").replace(/^0[xX]/, ""));
            this.store(bt, target.v, this.convert(mkLong(LONG, BigInt.asIntN(64, parsed)), bt));
            assigned++;
            notes.push(`${m[0]} → ${place.replace(/^&/, "")}`);
          }
          break;
        }
        case "f": case "e": case "g": case "E": case "G": {
          ws();
          if (this.inPos >= this.stdin.length) {
            this.starve();
            if (assigned === 0 && !sawInput) return I(-1);
            break outer;
          }
          sawInput = true;
          const m = this.stdin.slice(this.inPos).match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
          if (!m) break outer;
          this.inPos += m[0].length;
          if (target) {
            const bt = len.includes("l") || len.includes("L") ? DOUBLE : FLOAT;
            this.store(bt, target.v, this.convert({ t: DOUBLE, v: parseFloat(m[0]) }, bt));
            assigned++;
            notes.push(`${m[0]} → ${place.replace(/^&/, "")}`);
          }
          break;
        }
        case "c": {
          if (this.inPos >= this.stdin.length) {
            this.starve();
            if (assigned === 0 && !sawInput) return I(-1);
            break outer;
          }
          sawInput = true;
          const ch = this.stdin[this.inPos++];
          if (target) {
            this.store(CHAR, target.v, I(ch.charCodeAt(0) & 0xff));
            assigned++;
            notes.push(`${charText(ch.charCodeAt(0))} → ${place.replace(/^&/, "")}`);
          }
          break;
        }
        case "s": {
          ws();
          if (this.inPos >= this.stdin.length) {
            this.starve();
            if (assigned === 0 && !sawInput) return I(-1);
            break outer;
          }
          sawInput = true;
          let s = "";
          while (this.inPos < this.stdin.length && !/\s/.test(this.stdin[this.inPos]) && s.length < maxW) s += this.stdin[this.inPos++];
          if (target) {
            for (let k = 0; k <= s.length; k++) this.store(CHAR, target.v + k, I(k < s.length ? s.charCodeAt(k) & 0xff : 0));
            assigned++;
            notes.push(`${JSON.stringify(s)} → ${place.replace(/^&/, "")}`);
          }
          break;
        }
        default:
          break outer;
      }
    }
    if (notes.length) this.events.push(`scanf reads from the input: ${notes.join(", ")}.`);
    else if (this.stdin.length === 0) {
      const w = `Line ${this.line}: scanf wants input but the Input box is empty — type some input first.`;
      if (!this.warned.has(w)) {
        this.warned.add(w);
        this.warnings.push(w);
      }
      this.events.push("⚠ scanf found no input. Type some in the Input box and run again.");
    } else this.events.push("scanf could not read a value — the input did not match the format.");
    return I(assigned);
  }

  run(): RunResult {
    let error: string | null = null;
    let errorLine: number | null = null;
    let truncated = false;
    try {
      let idx = 0;
      for (const fd of this.prog.funcs.values()) {
        const a = TEXT + idx++ * 16;
        this.funcAddr.set(fd.name, a);
        this.funcAt.set(a, fd);
      }
      const main = this.prog.funcs.get("main");
      if (!main) throw new CError("Your program needs a main() function.", 1);
      this.line = main.line;
      for (const g of this.prog.globals) this.declare(g, true);
      const args: Val[] = [];
      if (main.params.length >= 1) {
        args.push(I(1));
        if (main.params.length >= 2) {
          const arr = this.allocData(16, 8);
          this.writeVal(ptrTo(CHAR), arr, { t: ptrTo(CHAR), v: this.strLit("./program") });
          this.ini.fill(1, arr, arr + 16);
          args.push({ t: ptrTo(ptrTo(CHAR)), v: arr });
        }
      }
      let code = 0;
      try {
        code = this.callUser(main, args, main.line).v | 0;
      } catch (e) {
        if (!(e instanceof ExitSignal)) throw e;
        code = e.code;
        this.frames = [];
        this.sp = MEM;
      }
      this.events = [];
      const leaks = this.blocks.filter((b) => !b.freed);
      let msg = `The program finished and returned ${code}.`;
      if (leaks.length) {
        const bytes = leaks.reduce((n, b) => n + b.size, 0);
        const w = `Memory leak: ${leaks.length} heap block${leaks.length > 1 ? "s" : ""} (${bytes} bytes) never released with free().`;
        this.warnings.push(w);
        msg += ` ⚠ ${w}`;
      }
      this.step("end", "Program finished", msg, this.prog.funcs.get("main")!.body.endLine);
    } catch (e) {
      if (e instanceof StopTrace) {
        truncated = true;
      } else if (e instanceof CError) {
        error = e.message;
        errorLine = e.line;
        this.steps.push(this.snapshot("error", "Runtime error", e.message, e.line));
      } else if (e instanceof RangeError && /call stack/i.test(e.message)) {
        error = "Stack overflow: the program recursed too deeply.";
        errorLine = this.line;
        this.steps.push(this.snapshot("error", "Runtime error", error, this.line));
      } else {
        error = `Internal error: ${e instanceof Error ? e.message : String(e)}`;
        errorLine = this.line;
      }
    }
    return { steps: this.steps, error, errorLine, warnings: this.warnings, truncated, inputNeededAt: this.starved };
  }
}

function expFix(s: string): string {
  return s.replace(/e([+-])(\d)$/, "e$10$2");
}
function stripZeros(s: string): string {
  if (s.includes("e")) {
    const [m, ex] = s.split("e");
    return `${m.includes(".") ? m.replace(/\.?0+$/, "") : m}e${ex}`;
  }
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/* ----------------------------- library functions ----------------------------- */
type Builtin = (m: Machine, a: Val[], e: CallExpr) => Val;

const shown = (s: string) => {
  const t = s.replace(/\n/g, "\\n");
  return JSON.stringify(t.length > 48 ? `${t.slice(0, 45)}…` : t).replace(/\\\\n/g, "\\n");
};

const mathFn = (f: (x: number, y: number) => number): Builtin => (_m, a) => ({ t: DOUBLE, v: f(num(a[0]), a[1] ? num(a[1]) : 0) });
const ctype = (f: (c: number) => boolean): Builtin => (_m, a) => I(f(num(a[0])) ? 1 : 0);

const BUILTINS: Record<string, Builtin> = {
  printf: (m, a) => {
    if (!a.length) return m.err("printf needs a format string.");
    const s = m.formatPrintf(m.cstr(a[0].v), a.slice(1));
    m.out += s;
    m.events.push(`Prints ${shown(s)} to the output.`);
    return I(s.length);
  },
  fprintf: (m, a) => {
    const s = m.formatPrintf(m.cstr(a[1].v), a.slice(2));
    m.out += s;
    m.events.push(`Prints ${shown(s)} to the ${num(a[0]) === 3 ? "error stream" : "output"}.`);
    return I(s.length);
  },
  sprintf: (m, a) => {
    const s = m.formatPrintf(m.cstr(a[1].v), a.slice(2));
    for (let i = 0; i <= s.length; i++) m.store(CHAR, a[0].v + i, I(i < s.length ? s.charCodeAt(i) & 0xff : 0));
    m.events.push(`Writes ${shown(s)} into a string buffer instead of the screen.`);
    return I(s.length);
  },
  snprintf: (m, a) => {
    const n = num(a[1]);
    const s = m.formatPrintf(m.cstr(a[2].v), a.slice(3));
    const cut = n > 0 ? s.slice(0, n - 1) : "";
    if (n > 0) for (let i = 0; i <= cut.length; i++) m.store(CHAR, a[0].v + i, I(i < cut.length ? cut.charCodeAt(i) & 0xff : 0));
    m.events.push(`Writes ${shown(cut)} into a string buffer.`);
    return I(s.length);
  },
  puts: (m, a) => {
    const s = `${m.cstr(a[0].v)}\n`;
    m.out += s;
    m.events.push(`Prints ${shown(s)} to the output.`);
    return I(1);
  },
  fputs: (m, a) => {
    const s = m.cstr(a[0].v);
    m.out += s;
    m.events.push(`Prints ${shown(s)} to the output.`);
    return I(1);
  },
  putchar: (m, a) => {
    const s = String.fromCharCode(num(a[0]) & 0xff);
    m.out += s;
    m.events.push(`Prints ${shown(s)} to the output.`);
    return I(num(a[0]));
  },
  fflush: () => I(0),
  getchar: (m) => {
    if (m.inPos >= m.stdin.length) {
      m.starve();
      m.events.push("getchar found no more input and returns EOF (-1).");
      return I(-1);
    }
    const c = m.stdin[m.inPos++];
    m.events.push(`getchar reads ${charText(c.charCodeAt(0))} from the input.`);
    return I(c.charCodeAt(0));
  },
  scanf: (m, a, e) => m.scanf(m.cstr(a[0].v), a.slice(1), e, 1),
  fgets: (m, a) => {
    const n = num(a[1]);
    if (m.inPos >= m.stdin.length) m.starve();
    if (m.inPos >= m.stdin.length || n <= 0) return { t: ptrTo(CHAR), v: 0 };
    let s = "";
    while (s.length < n - 1 && m.inPos < m.stdin.length) {
      const c = m.stdin[m.inPos++];
      s += c;
      if (c === "\n") break;
    }
    for (let i = 0; i <= s.length; i++) m.store(CHAR, a[0].v + i, I(i < s.length ? s.charCodeAt(i) & 0xff : 0));
    m.events.push(`fgets reads the line ${shown(s)} from the input.`);
    return a[0];
  },
  malloc: (m, a) => {
    const n = num(a[0]);
    const p = m.mallocBlock(n, false);
    const b = m.blocks[m.blocks.length - 1];
    m.events.push(
      p ? `malloc(${n}) reserves ${n} bytes on the heap (block #${b.id} at ${hex(p)}). Its contents are uninitialized.` : `malloc(${n}) failed and returns NULL.`,
    );
    return { t: ptrTo(VOID), v: p };
  },
  calloc: (m, a) => {
    const n = num(a[0]) * num(a[1]);
    const p = m.mallocBlock(n, true);
    const b = m.blocks[m.blocks.length - 1];
    m.events.push(p ? `calloc reserves ${n} bytes on the heap (block #${b.id} at ${hex(p)}) and fills them with zeros.` : "calloc failed and returns NULL.");
    return { t: ptrTo(VOID), v: p };
  },
  realloc: (m, a) => {
    const n = num(a[1]);
    if (a[0].v === 0) {
      const p = m.mallocBlock(n, false);
      m.events.push(`realloc(NULL, ${n}) acts like malloc and reserves ${n} bytes.`);
      return { t: ptrTo(VOID), v: p };
    }
    const old = m.blocks.find((b) => b.addr === a[0].v && !b.freed);
    if (!old) return m.err("realloc: this pointer was not returned by malloc, or was already freed.");
    const p = m.mallocBlock(n, false);
    if (!p) return { t: ptrTo(VOID), v: 0 };
    const nb = m.blocks[m.blocks.length - 1];
    nb.type = old.type;
    const keep = Math.min(old.size, n);
    m.u8.copyWithin(p, old.addr, old.addr + keep);
    m.ini.copyWithin(p, old.addr, old.addr + keep);
    old.freed = true;
    m.events.push(`realloc moves the data into a new ${n}-byte block #${nb.id} and frees the old block #${old.id}.`);
    return { t: ptrTo(VOID), v: p };
  },
  free: (m, a) => {
    const p = a[0].v;
    if (p === 0) {
      m.events.push("free(NULL) is allowed and does nothing.");
      return VOIDV;
    }
    const b = m.blocks.find((x) => x.addr === p);
    if (!b) return m.err(`Invalid free: ${hex(p)} was not returned by malloc/calloc/realloc.`);
    if (b.freed) return m.err(`Double free: block #${b.id} was already released.`);
    b.freed = true;
    m.events.push(`free releases heap block #${b.id} (${b.size} bytes). The pointer still holds the old address — it is now dangling.`);
    return VOIDV;
  },
  strlen: (m, a) => ({ t: ULONG, v: m.cstr(a[0].v).length }),
  strcpy: (m, a) => {
    const s = m.cstr(a[1].v);
    for (let i = 0; i <= s.length; i++) m.store(CHAR, a[0].v + i, I(i < s.length ? s.charCodeAt(i) & 0xff : 0));
    m.events.push(`strcpy copies ${shown(s)} (and the '\\0' end marker) into the destination.`);
    return a[0];
  },
  strncpy: (m, a) => {
    const n = num(a[2]);
    const s = m.cstr(a[1].v);
    for (let i = 0; i < n; i++) m.store(CHAR, a[0].v + i, I(i < s.length ? s.charCodeAt(i) & 0xff : 0));
    m.events.push(`strncpy copies up to ${n} characters of ${shown(s)}.`);
    return a[0];
  },
  strcat: (m, a) => {
    const d = m.cstr(a[0].v);
    const s = m.cstr(a[1].v);
    for (let i = 0; i <= s.length; i++) m.store(CHAR, a[0].v + d.length + i, I(i < s.length ? s.charCodeAt(i) & 0xff : 0));
    m.events.push(`strcat appends ${shown(s)} to the end of the destination.`);
    return a[0];
  },
  strncat: (m, a) => {
    const d = m.cstr(a[0].v);
    const s = m.cstr(a[1].v).slice(0, num(a[2]));
    for (let i = 0; i <= s.length; i++) m.store(CHAR, a[0].v + d.length + i, I(i < s.length ? s.charCodeAt(i) & 0xff : 0));
    return a[0];
  },
  strcmp: (m, a) => {
    const x = m.cstr(a[0].v);
    const y = m.cstr(a[1].v);
    return I(x === y ? 0 : x < y ? -1 : 1);
  },
  strncmp: (m, a) => {
    const n = num(a[2]);
    const x = m.cstr(a[0].v).slice(0, n);
    const y = m.cstr(a[1].v).slice(0, n);
    return I(x === y ? 0 : x < y ? -1 : 1);
  },
  strchr: (m, a) => {
    const s = m.cstr(a[0].v);
    const i = s.indexOf(String.fromCharCode(num(a[1]) & 0xff));
    return { t: ptrTo(CHAR), v: i < 0 ? 0 : a[0].v + i };
  },
  strrchr: (m, a) => {
    const s = m.cstr(a[0].v);
    const i = s.lastIndexOf(String.fromCharCode(num(a[1]) & 0xff));
    return { t: ptrTo(CHAR), v: i < 0 ? 0 : a[0].v + i };
  },
  strstr: (m, a) => {
    const i = m.cstr(a[0].v).indexOf(m.cstr(a[1].v));
    return { t: ptrTo(CHAR), v: i < 0 ? 0 : a[0].v + i };
  },
  memset: (m, a) => {
    const n = num(a[2]);
    if (n > 0) {
      m.check(a[0].v, n);
      m.u8.fill(num(a[1]) & 0xff, a[0].v, a[0].v + n);
      m.ini.fill(1, a[0].v, a[0].v + n);
    }
    m.events.push(`memset fills ${n} bytes with the value ${num(a[1])}.`);
    return a[0];
  },
  memcpy: (m, a) => {
    const n = num(a[2]);
    if (n > 0) {
      m.check(a[1].v, n);
      m.check(a[0].v, n);
      m.u8.copyWithin(a[0].v, a[1].v, a[1].v + n);
      m.ini.copyWithin(a[0].v, a[1].v, a[1].v + n);
    }
    m.events.push(`memcpy copies ${n} bytes.`);
    return a[0];
  },
  memcmp: (m, a) => {
    const n = num(a[2]);
    m.check(a[0].v, Math.max(n, 1));
    m.check(a[1].v, Math.max(n, 1));
    for (let i = 0; i < n; i++) {
      const d = m.u8[a[0].v + i] - m.u8[a[1].v + i];
      if (d) return I(d < 0 ? -1 : 1);
    }
    return I(0);
  },
  atoi: (m, a) => I(parseInt(m.cstr(a[0].v), 10) | 0 || 0),
  atol: (m, a) => ({ t: LONG, v: parseInt(m.cstr(a[0].v), 10) || 0 }),
  atof: (m, a) => ({ t: DOUBLE, v: parseFloat(m.cstr(a[0].v)) || 0 }),
  abs: (_m, a) => I(Math.abs(num(a[0])) | 0),
  labs: (_m, a) => ({ t: LONG, v: Math.abs(num(a[0])) }),
  rand: (m) => {
    m.randState = (Math.imul(m.randState, 1103515245) + 12345) & 0x7fffffff;
    return I(m.randState);
  },
  srand: (m, a) => {
    m.randState = num(a[0]) & 0x7fffffff;
    return VOIDV;
  },
  time: () => ({ t: LONG, v: 1700000000 }),
  clock: () => ({ t: LONG, v: 0 }),
  exit: (_m, a) => {
    throw new ExitSignal(num(a[0]) | 0);
  },
  assert: (m, a, e) => {
    if (!m.truthy(a[0])) m.err(`Assertion failed: ${exprStr(e.args[0])}`);
    return VOIDV;
  },
  sqrt: mathFn(Math.sqrt),
  pow: mathFn(Math.pow),
  fabs: mathFn(Math.abs),
  floor: mathFn(Math.floor),
  ceil: mathFn(Math.ceil),
  round: mathFn((x) => (x < 0 ? -Math.round(-x) : Math.round(x))),
  trunc: mathFn(Math.trunc),
  sin: mathFn(Math.sin),
  cos: mathFn(Math.cos),
  tan: mathFn(Math.tan),
  atan: mathFn(Math.atan),
  atan2: mathFn(Math.atan2),
  exp: mathFn(Math.exp),
  log: mathFn(Math.log),
  log10: mathFn(Math.log10),
  log2: mathFn(Math.log2),
  fmod: mathFn((x, y) => x % y),
  toupper: (_m, a) => I(num(a[0]) >= 97 && num(a[0]) <= 122 ? num(a[0]) - 32 : num(a[0])),
  tolower: (_m, a) => I(num(a[0]) >= 65 && num(a[0]) <= 90 ? num(a[0]) + 32 : num(a[0])),
  isalpha: ctype((c) => /[A-Za-z]/.test(String.fromCharCode(c))),
  isdigit: ctype((c) => c >= 48 && c <= 57),
  isalnum: ctype((c) => /[A-Za-z0-9]/.test(String.fromCharCode(c))),
  isspace: ctype((c) => c === 32 || (c >= 9 && c <= 13)),
  isupper: ctype((c) => c >= 65 && c <= 90),
  islower: ctype((c) => c >= 97 && c <= 122),
  ispunct: ctype((c) => c > 32 && c < 127 && !/[A-Za-z0-9]/.test(String.fromCharCode(c))),
  qsort: (m, a) => {
    const n = num(a[1]);
    const sz = num(a[2]);
    const fd = m.funcAt.get(a[3].v);
    if (!fd) return m.err("qsort needs a comparison function.");
    const base = a[0].v;
    m.check(base, Math.max(n * sz, 1));
    const tmp = new Uint8Array(sz);
    const tmpI = new Uint8Array(sz);
    for (let i = 1; i < n; i++) {
      for (let j = i; j > 0; j--) {
        const p = base + (j - 1) * sz;
        const q = base + j * sz;
        const r = m.callUser(fd, [{ t: ptrTo(VOID), v: p }, { t: ptrTo(VOID), v: q }], m.line);
        if (num(r) <= 0) break;
        tmp.set(m.u8.subarray(p, p + sz));
        tmpI.set(m.ini.subarray(p, p + sz));
        m.u8.copyWithin(p, q, q + sz);
        m.ini.copyWithin(p, q, q + sz);
        m.u8.set(tmp, q);
        m.ini.set(tmpI, q);
      }
    }
    m.events.push("qsort sorted the array by repeatedly calling your comparison function.");
    return VOIDV;
  },
};

export function runC(source: string, stdin = "", eof = false): RunResult {
  let prog: Program;
  try {
    prog = parseC(source);
  } catch (e) {
    if (e instanceof CError) return { steps: [], error: e.message, errorLine: e.line, warnings: [], truncated: false, inputNeededAt: null };
    throw e;
  }
  return new Machine(prog, stdin, eof).run();
}
