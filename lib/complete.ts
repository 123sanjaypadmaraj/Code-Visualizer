/** Small, fast LLM calls (inline autocomplete, one-line fixes). */

const GROQ_COMPLETE_MODEL = process.env.GROQ_COMPLETE_MODEL || "qwen/qwen3.8-27b";
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
  const typed = lastLine.trimStart();
  if (typed && t.trimStart().startsWith(typed)) t = t.trimStart().slice(typed.length);
  t = t.split("\n").slice(0, MAX_LINES).join("\n").slice(0, MAX_CHARS);
  t = t.replace(/\s+$/, "");
  if (!t.trim()) return "";
  // drop anything that just duplicates what follows the cursor
  const nextLine = suffix.split("\n")[0].trim();
  if (nextLine && t.trim() === nextLine) return "";
  return t;
}

export function completeTimeoutMs(): number {
  const n = Number(process.env.COMPLETE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}

type Call = (system: string, user: string, maxTokens: number, signal: AbortSignal) => Promise<string>;

/** Providers that speak the OpenAI chat-completions format (all have a free tier). */
function openAICompat(url: string, keyEnv: string, model: string, label: string, extraHeaders: Record<string, string> = {}): Call | null {
  const key = process.env[keyEnv];
  if (!key) return null;
  return async (system, user, maxTokens, signal) => {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  };
}

const callGemini: Call = async (system, user, maxTokens, signal) => {
  const key = process.env.GEMINI_API_KEY!;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_COMPLETE_MODEL}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
};

/** Configured providers, fastest first. Each is skipped when its API key is not set. */
function providers(): [string, Call][] {
  const list: [string, Call | null][] = [
    ["Groq", openAICompat("https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY", GROQ_COMPLETE_MODEL, "Groq")],
    ["Cerebras", openAICompat("https://api.cerebras.ai/v1/chat/completions", "CEREBRAS_API_KEY", process.env.CEREBRAS_MODEL || "llama3.1-8b", "Cerebras")],
    ["Gemini", process.env.GEMINI_API_KEY ? callGemini : null],
    [
      "OpenRouter",
      openAICompat("https://openrouter.ai/api/v1/chat/completions", "OPENROUTER_API_KEY", process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", "OpenRouter"),
    ],
  ];
  return list.filter((e): e is [string, Call] => e[1] !== null);
}

/** Ask a fast model, trying each configured provider in turn. Throws only if every one of them failed. */
export async function askLLM(
  system: string,
  user: string,
  opts: { maxTokens?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const list = providers();
  if (!list.length) throw new Error("No AI provider API key is set (see .env.example)");
  const errors: string[] = [];
  for (const [label, call] of list) {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? completeTimeoutMs());
    const combined = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      return await call(system, user, opts.maxTokens ?? 200, combined);
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      errors.push(timeout.aborted ? `${label} timed out` : e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join(" | "));
}

export async function completeCode(prefix: string, suffix: string, signal?: AbortSignal): Promise<string> {
  const raw = await askLLM(COMPLETE_SYSTEM, buildCompletePrompt(prefix, suffix), { maxTokens: 200, signal });
  return cleanCompletion(raw, prefix, suffix);
}
