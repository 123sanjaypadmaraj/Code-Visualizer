import { askLLM } from "./complete";

export const GENERATE_SYSTEM = `You write C code for students inside a C learning tool.
You receive a REQUEST and the program so far (CODE, with <CURSOR> where the code will be inserted).
Reply with ONLY the C code to insert at the cursor.
Rules:
- Plain C (C99), standard library only. Match the existing indentation and style.
- Output raw code: no markdown fences, no explanations. Short comments inside the code are fine.
- If CODE is empty, write a complete program (with #include lines and main). Otherwise write only what belongs at the cursor.
- Do not repeat code that already exists in CODE.
- Keep it simple and readable, as a good teacher would write it.`;

export function buildGeneratePrompt(request: string, before: string, after: string): string {
  return `REQUEST: ${request}\n\nCODE:\n<<<\n${before}<CURSOR>${after}\n>>>\n\nInsert code at <CURSOR>:`;
}

const MAX_CHARS = 4000;
const MAX_LINES = 120;

/** Turn a raw model reply into code to insert (or "" when unusable). */
export function cleanGenerated(raw: string): string {
  let t = raw.replace(/\r/g, "");
  const fence = t.match(/```[a-zA-Z]*\n?([\s\S]*?)(```|$)/);
  if (fence) t = fence[1];
  t = t.replace(/^<<<\n?|\n?>>>$/g, "").replace(/<CURSOR>/g, "");
  t = t.split("\n").slice(0, MAX_LINES).join("\n").slice(0, MAX_CHARS);
  return t.replace(/^\n+/, "").replace(/\s+$/, "");
}

export async function generateCode(request: string, before: string, after: string, signal?: AbortSignal): Promise<string> {
  const raw = await askLLM(GENERATE_SYSTEM, buildGeneratePrompt(request, before, after), { maxTokens: 1200, timeoutMs: 20000, signal });
  return cleanGenerated(raw);
}
