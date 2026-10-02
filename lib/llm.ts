/* eslint-disable @typescript-eslint/no-explicit-any -- parsing untrusted LLM JSON */
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { Analysis, Step, Variable } from "./types";

export type Provider = "groq" | "gemini";

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function callGroq(code: string, signal?: AbortSignal): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      ...(GROQ_MODEL.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(code) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(code: string, signal?: AbortSignal): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(code) }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 12000,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

const str = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)) : []);
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function cleanVar(raw: any): Variable | null {
  if (!raw || typeof raw !== "object" || !raw.name) return null;
  const kinds = ["scalar", "array", "matrix", "string", "pointer", "struct"];
  const kind = kinds.includes(raw.kind) ? raw.kind : "scalar";
  const v: Variable = { name: str(raw.name), type: str(raw.type, "int"), kind };
  if (raw.value !== undefined) v.value = str(raw.value);
  if (Array.isArray(raw.items)) v.items = strArr(raw.items);
  if (Array.isArray(raw.rows)) v.rows = raw.rows.map(strArr);
  if (Array.isArray(raw.fields))
    v.fields = raw.fields.map((f: any) => ({ name: str(f?.name), value: str(f?.value) }));
  if (raw.target && raw.target.name)
    v.target = {
      name: str(raw.target.name),
      index: raw.target.index === undefined || raw.target.index === null ? undefined : num(raw.target.index),
    };
  if (raw.address) v.address = str(raw.address);
  if (Array.isArray(raw.changed)) v.changed = raw.changed.map((n: unknown) => num(n));
  v.isNew = !!raw.isNew;
  v.updated = !!raw.updated;
  v.region = raw.region === "heap" ? "heap" : "stack";
  return v;
}

export function parseAnalysis(text: string, provider: string): Analysis {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model did not return JSON");
  const raw = JSON.parse(text.slice(start, end + 1));
  const steps: Step[] = (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 60).map((s: any) => ({
    line: num(s?.line, 1),
    title: str(s?.title, "Step"),
    explain: str(s?.explain),
    output: str(s?.output),
    vars: (Array.isArray(s?.vars) ? s.vars : []).map(cleanVar).filter(Boolean) as Variable[],
  }));
  return {
    summary: str(raw.summary),
    concepts: strArr(raw.concepts).slice(0, 6),
    warnings: strArr(raw.warnings),
    lineNotes: (Array.isArray(raw.lineNotes) ? raw.lineNotes : []).map((n: any) => ({
      line: num(n?.line, 1),
      note: str(n?.note),
    })),
    steps,
    provider,
  };
}

export function providerTimeoutMs(): number {
  const n = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 25_000;
}

export async function analyze(
  code: string,
  preference: "auto" | Provider,
  signal?: AbortSignal,
): Promise<Analysis> {
  const order: Provider[] =
    preference === "groq" ? ["groq", "gemini"] : preference === "gemini" ? ["gemini", "groq"] : ["groq", "gemini"];
  const errors: string[] = [];
  const timeoutMs = providerTimeoutMs();
  for (const p of order) {
    // Only fall back automatically when the user did not pin a provider.
    if (preference !== "auto" && p !== preference) break;
    const label = p === "groq" ? "Groq" : "Gemini";
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const text = await (p === "groq" ? callGroq : callGemini)(code, combined);
      return parseAnalysis(text, p === "groq" ? `Groq · ${GROQ_MODEL}` : `Gemini · ${GEMINI_MODEL}`);
    } catch (e) {
      if (signal?.aborted) throw e; // client went away: stop, don't try the next provider
      if (timeout.aborted) {
        errors.push(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
      } else {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  throw new Error(errors.join(" | "));
}
