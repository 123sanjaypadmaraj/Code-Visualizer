import { NextResponse } from "next/server";
import { suggestFix } from "@/lib/fix";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 20;

/** AI "fix this line" for a diagnostic the student clicked on. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkRateLimit(`fix:${ip}`, 20)) {
    return NextResponse.json({ error: "Too many requests, wait a moment and try again" }, { status: 429 });
  }
  let body: { code?: unknown; line?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  const message = typeof body.message === "string" ? body.message.slice(0, 300) : "";
  const line = Number(body.line);
  if (!code.trim() || !Number.isInteger(line) || line < 1 || line > code.split("\n").length) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (code.length > 6000) return NextResponse.json({ error: "Code too long (max 6000 chars)" }, { status: 413 });
  try {
    const fix = await suggestFix(code, line, message, req.signal);
    if (!fix) return NextResponse.json({ error: "The AI could not suggest a safe fix for this line" }, { status: 422 });
    return NextResponse.json(fix);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fix failed" }, { status: 502 });
  }
}
