export type VarKind = "scalar" | "array" | "matrix" | "string" | "pointer" | "struct";

export interface Variable {
  name: string;
  type: string;
  kind: VarKind;
  /** scalar value, or pointer value/address */
  value?: string;
  /** array elements or string characters */
  items?: string[];
  /** 2D array rows */
  rows?: string[][];
  /** struct members */
  fields?: { name: string; value: string }[];
  /** pointer target: which variable (and optional index) it points to */
  target?: { name: string; index?: number };
  address?: string;
  /** array/string indexes modified in this step */
  changed?: number[];
  /** true if a scalar/pointer/struct changed in this step */
  isNew?: boolean;
  updated?: boolean;
  /** "stack" (default) or "heap" */
  region?: "stack" | "heap";
}

export interface Step {
  line: number;
  title: string;
  explain: string;
  vars: Variable[];
  output: string;
}

export interface LineNote {
  line: number;
  note: string;
}

export interface Analysis {
  summary: string;
  concepts: string[];
  lineNotes: LineNote[];
  steps: Step[];
  warnings: string[];
  provider: string;
}
