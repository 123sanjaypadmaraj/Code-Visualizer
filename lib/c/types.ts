export interface StructDef {
  tag: string;
  union: boolean;
  /** print the tag without the `struct` keyword (typedef'd names) */
  plain: boolean;
  fields: { name: string; type: CType; offset: number }[];
  size: number;
  align: number;
  complete: boolean;
}

export interface FuncParam {
  name: string;
  type: CType;
}

export type CType =
  | { k: "int"; size: 1 | 2 | 4 | 8; signed: boolean; name: string; bool?: boolean }
  | { k: "float"; size: 4 | 8; name: string }
  | { k: "void" }
  | { k: "ptr"; to: CType }
  | { k: "array"; of: CType; len: number; lenExpr?: unknown }
  | { k: "struct"; def: StructDef }
  | { k: "func"; ret: CType; params: FuncParam[]; variadic: boolean };

export class CError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

export const CHAR: CType = { k: "int", size: 1, signed: true, name: "char" };
export const UCHAR: CType = { k: "int", size: 1, signed: false, name: "unsigned char" };
export const SHORT: CType = { k: "int", size: 2, signed: true, name: "short" };
export const USHORT: CType = { k: "int", size: 2, signed: false, name: "unsigned short" };
export const INT: CType = { k: "int", size: 4, signed: true, name: "int" };
export const UINT: CType = { k: "int", size: 4, signed: false, name: "unsigned int" };
export const LONG: CType = { k: "int", size: 8, signed: true, name: "long" };
export const ULONG: CType = { k: "int", size: 8, signed: false, name: "unsigned long" };
export const LLONG: CType = { k: "int", size: 8, signed: true, name: "long long" };
export const ULLONG: CType = { k: "int", size: 8, signed: false, name: "unsigned long long" };
export const BOOL: CType = { k: "int", size: 1, signed: false, name: "bool", bool: true };
export const FLOAT: CType = { k: "float", size: 4, name: "float" };
export const DOUBLE: CType = { k: "float", size: 8, name: "double" };
export const VOID: CType = { k: "void" };

export const ptrTo = (to: CType): CType => ({ k: "ptr", to });

export function sizeOf(t: CType): number {
  switch (t.k) {
    case "int":
    case "float":
      return t.size;
    case "ptr":
      return 8;
    case "array":
      return Math.max(t.len, 0) * sizeOf(t.of);
    case "struct":
      return t.def.size;
    default:
      return 1;
  }
}

export function alignOf(t: CType): number {
  switch (t.k) {
    case "int":
    case "float":
      return t.size;
    case "ptr":
      return 8;
    case "array":
      return alignOf(t.of);
    case "struct":
      return t.def.align;
    default:
      return 1;
  }
}

export function typeStr(t: CType): string {
  switch (t.k) {
    case "int":
    case "float":
      return t.name;
    case "void":
      return "void";
    case "struct":
      return t.def.plain ? t.def.tag : `${t.def.union ? "union" : "struct"} ${t.def.tag}`;
    case "ptr": {
      if (t.to.k === "func") return `${typeStr(t.to.ret)} (*)(${t.to.params.map((p) => typeStr(p.type)).join(", ")})`;
      const inner = typeStr(t.to);
      return t.to.k === "ptr" ? `${inner}*` : `${inner} *`;
    }
    case "array": {
      const dims: string[] = [];
      let b: CType = t;
      while (b.k === "array") {
        dims.push(b.len >= 0 ? String(b.len) : "");
        b = b.of;
      }
      return `${typeStr(b)}[${dims.join("][")}]`;
    }
    case "func":
      return `${typeStr(t.ret)} (${t.params.map((p) => typeStr(p.type)).join(", ")})`;
  }
}

export const isInt = (t: CType) => t.k === "int";
export const isFloat = (t: CType) => t.k === "float";
export const isScalar = (t: CType) => t.k === "int" || t.k === "float" || t.k === "ptr";

/* ----------------------------- trace output ----------------------------- */

export type ValView =
  | { k: "scalar"; addr: number; text: string; changed: boolean; uninit: boolean; ch: boolean; num: boolean }
  | {
      k: "ptr";
      addr: number;
      text: string;
      changed: boolean;
      uninit: boolean;
      target: number | null;
      pointee: string;
      bad: boolean;
      toStruct: boolean;
      str: string | null;
    }
  | { k: "array"; addr: number; elem: string; len: number; items: ValView[]; more: number; str: string | null }
  | { k: "struct"; addr: number; tag: string; fields: { name: string; v: ValView }[] };

export interface VarView {
  name: string;
  type: string;
  addr: number;
  size: number;
  isNew: boolean;
  v: ValView;
}

export interface FrameView {
  fn: string;
  line: number;
  vars: VarView[];
  ret: string | null;
}

export interface HeapView {
  id: number;
  addr: number;
  size: number;
  freed: boolean;
  type: string | null;
  line: number;
  isNew: boolean;
  v: ValView | null;
}

export type StepKind = "start" | "stmt" | "cond" | "call" | "return" | "end" | "error";

export interface TraceStep {
  line: number;
  kind: StepKind;
  title: string;
  explain: string;
  frames: FrameView[];
  globals: VarView[];
  heap: HeapView[];
  output: string;
}

export interface RunResult {
  steps: TraceStep[];
  error: string | null;
  errorLine: number | null;
  warnings: string[];
  truncated: boolean;
}
