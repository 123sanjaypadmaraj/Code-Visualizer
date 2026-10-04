import { NextResponse } from "next/server";
import { fixAllCode } from "@/lib/fix";
import { clientIp, limitFromEnv } from "@/lib/apiGuard";
import { logAiRequest } from "@/lib/log";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 30;

/** "/fix" in the editor: send the whole program to the AI and get the repaired program back. */
async function handle(req: Request, fail: { error?: string }): Promise<Response> {
  if (!checkRateLimit(`fixall:${clientIp(req)}`, limitFromEnv("FIX_RATE_LIMIT_PER_MIN", 20))) {
    return NextResponse.json({ error: "Too many requests, wait a moment and try again" }, { status: 429 });
  }
  let body: { code?: unknown; hint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  const hint = typeof body.hint === "string" ? body.hint.trim().slice(0, 300) : "";
  if (!code.trim()) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (code.length > 9000) return NextResponse.json({ error: "Code too long (max 9000 chars)" }, { status: 413 });
  try {
    const { code: fixed, warning } = await fixAllCode(code, hint, req.signal);
    if (!fixed) return NextResponse.json({ error: "The AI did not return any code, try again" }, { status: 422 });
    return NextResponse.json({ code: fixed, warning });
  } catch (e) {
    fail.error = e instanceof Error ? e.message : "Fix failed";
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fix failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const info: { error?: string } = {};
  const res = await handle(req, info);
  logAiRequest({ route: "fixall", status: res.status, ms: Date.now() - t0, error: info.error });
  return res;
}
