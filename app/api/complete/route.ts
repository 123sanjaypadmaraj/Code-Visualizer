import { NextResponse } from "next/server";
import { completeCode } from "@/lib/complete";
import { clientIp, limitFromEnv } from "@/lib/apiGuard";
import { logAiRequest } from "@/lib/log";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 20;

/** Inline AI autocomplete. Has its own (higher) per-IP budget so typing does not eat the trace-analysis quota. */
async function handle(req: Request, fail: { error?: string }): Promise<Response> {
  if (!checkRateLimit(`complete:${clientIp(req)}`, limitFromEnv("COMPLETE_RATE_LIMIT_PER_MIN", 40))) {
    return NextResponse.json({ error: "Too many suggestions requested, slow down for a moment" }, { status: 429 });
  }
  let body: { prefix?: unknown; suffix?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const prefix = typeof body.prefix === "string" ? body.prefix : "";
  const suffix = typeof body.suffix === "string" ? body.suffix : "";
  if (!prefix.trim()) return NextResponse.json({ completion: "" });
  if (prefix.length > 6000 || suffix.length > 2000) return NextResponse.json({ error: "Code too long" }, { status: 413 });
  try {
    return NextResponse.json({ completion: await completeCode(prefix, suffix, req.signal) });
  } catch (e) {
    fail.error = e instanceof Error ? e.message : "Completion failed";
    return NextResponse.json({ error: e instanceof Error ? e.message : "Completion failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const info: { error?: string } = {};
  const res = await handle(req, info);
  logAiRequest({ route: "complete", status: res.status, ms: Date.now() - t0, error: info.error });
  return res;
}
