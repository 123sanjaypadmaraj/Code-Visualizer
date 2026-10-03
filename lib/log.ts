export interface AiLog {
  route: string;
  status: number;
  ms: number;
  error?: string;
}

/** One JSON line per AI request. Deliberately takes no code, prompt or IP, so none can leak into logs. */
export function logAiRequest(entry: AiLog) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry, error: entry.error?.slice(0, 200) });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}
