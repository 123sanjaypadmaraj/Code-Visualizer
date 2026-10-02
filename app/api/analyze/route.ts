import { NextResponse } from "next/server";
import { analyze } from "@/lib/llm";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests, wait a moment and try again" }, { status: 429 });
  }
  let body: { code?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const code = (body.code ?? "").toString();
  if (!code.trim()) return NextResponse.json({ error: "No code provided" }, { status: 400 });
  if (code.length > 6000) return NextResponse.json({ error: "Code too long (max 6000 chars)" }, { status: 413 });

  const provider = body.provider === "groq" || body.provider === "gemini" ? body.provider : "auto";
  try {
    const analysis = await analyze(code, provider, req.signal);
    return NextResponse.json(analysis);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 502 });
  }
}
