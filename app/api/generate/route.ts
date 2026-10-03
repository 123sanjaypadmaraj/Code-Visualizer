import { NextResponse } from "next/server";
import { generateCode } from "@/lib/generate";
import { clientIp, limitFromEnv } from "@/lib/apiGuard";
import { logAiRequest } from "@/lib/log";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 30;

/** "/ai <what you need>" in the editor: write code from a plain-English request. */
async function handle(req: Request, fail: { error?: string }): Promise<Response> {
  if (!checkRateLimit(`generate:${clientIp(req)}`, limitFromEnv("GENERATE_RATE_LIMIT_PER_MIN", 15))) {
    return NextResponse.json({ error: "Too many requests, wait a moment and try again" }, { status: 429 });
  }
  let body: { prompt?: unknown; before?: unknown; after?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const before = typeof body.before === "string" ? body.before : "";
  const after = typeof body.after === "string" ? body.after : "";
  if (!prompt) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (prompt.length > 500 || before.length + after.length > 9000) {
    return NextResponse.json({ error: "Code too long" }, { status: 413 });
  }
  try {
    const { code, warning } = await generateCode(prompt, before, after, req.signal);
    if (!code) return NextResponse.json({ error: "The AI did not return any code, try rephrasing" }, { status: 422 });
    return NextResponse.json({ code, warning });
  } catch (e) {
    fail.error = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const info: { error?: string } = {};
  const res = await handle(req, info);
  logAiRequest({ route: "generate", status: res.status, ms: Date.now() - t0, error: info.error });
  return res;
}
