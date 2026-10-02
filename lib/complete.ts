/** AI code completion (inline "ghost text"). Separate from the trace-analysis calls in llm.ts. */

const GROQ_COMPLETE_MODEL = process.env.GROQ_COMPLETE_MODEL || "llama-3.1-8b-instant";
const GEMINI_COMPLETE_MODEL = process.env.GEMINI_COMPLETE_MODEL || "gemini-2.5-flash";

export const COMPLETE_SYSTEM = `You are the autocomplete engine inside a C learning tool used by college students.
You receive the code before the cursor (PREFIX) and after it (SUFFIX). Reply with ONLY the text to insert at the cursor.
Rules:
- Plain C (C99), standard library only. Match the existing indentation and style.
- Output raw code: no markdown fences, no explanations, no comments about what you did.
- Keep it short: finish the current statement, or at most one small block (max 8 lines).
- Never repeat text that already appears in the SUFFIX.
- If nothing sensible can be added, reply with an empty string.`;

export function buildCompletePrompt(prefix: string, suffix: string): string {
  return `PREFIX:\n<<<\n${prefix}\n>>>\nSUFFIX:\n<<<\n${suffix}\n>>>\nInsert text at the cursor (between PREFIX and SUFFIX):`;
}

const MAX_CHARS = 500;
const MAX_LINES = 8;

/** Turn a raw model reply into a safe, tidy insertion (or "" when it is not usable). */
export function cleanCompletion(raw: string, prefix = "", suffix = ""): string {
  let t = raw.replace(/\r/g, "");
  const fence = t.match(/```[a-zA-Z]*\n?([\s\S]*?)(```|$)/);
  if (fence) t = fence[1];
  t = t.replace(/^<<<\n?|\n?>>>$/g, "");
  // the model sometimes re-types the line the user is already on
  const lastLine = prefix.slice(prefix.lastIndexOf("\n") + 1);
  if (lastLine.trim() && t.startsWith(lastLine)) t = t.slice(lastLine.length);
  t = t.split("\n").slice(0, MAX_LINES).join("\n").slice(0, MAX_CHARS);
  t = t.replace(/\s+$/, "");
  if (!t.trim()) return "";
  // drop anything that just duplicates what follows the cursor
  const nextLine = suffix.split("\n")[0].trim();
  if (nextLine && t.trim() === nextLine) return "";
  return t;
}

async function callGroq(prefix: string, suffix: string, signal: AbortSignal): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_COMPLETE_MODEL,
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        { role: "system", content: COMPLETE_SYSTEM },
        { role: "user", content: buildCompletePrompt(prefix, suffix) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(prefix: string, suffix: string, signal: AbortSignal): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_COMPLETE_MODEL}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: COMPLETE_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: buildCompletePrompt(prefix, suffix) }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

export function completeTimeoutMs(): number {
  const n = Number(process.env.COMPLETE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}

/** Try Groq first (fast), then Gemini. Throws only if every configured provider failed. */
export async function completeCode(prefix: string, suffix: string, signal?: AbortSignal): Promise<string> {
  const errors: string[] = [];
  for (const [label, call] of [
    ["Groq", callGroq],
    ["Gemini", callGemini],
  ] as const) {
    const timeout = AbortSignal.timeout(completeTimeoutMs());
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      return cleanCompletion(await call(prefix, suffix, combined), prefix, suffix);
    } catch (e) {
      if (signal?.aborted) throw e;
      errors.push(timeout.aborted ? `${label} timed out` : e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join(" | "));
}
