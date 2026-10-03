export function encodeShare(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(b64: string): string | null {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** "#code=<b64>" or, when a trace is open, "#code=<b64>&step=<n>". */
export function buildShareHash(code: string, step?: number | null): string {
  const base = `#code=${encodeShare(code)}`;
  return step !== undefined && step !== null && Number.isInteger(step) && step >= 0 ? `${base}&step=${step}` : base;
}

/** Parse a share hash (old "#code=" links included). `step` is null when absent or not a non-negative integer. */
export function parseShareHash(hash: string): { code: string; step: number | null } | null {
  const m = hash.match(/^#code=([A-Za-z0-9_-]+)(?:&step=(.*))?$/);
  if (!m) return null;
  const code = decodeShare(m[1]);
  if (code === null) return null;
  const step = m[2] !== undefined && /^\d+$/.test(m[2]) ? Number(m[2]) : null;
  return { code, step };
}
