export function normalizeGuestName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim();
  if (!/^[\p{L}\p{N}_ー\-]{3,6}$/u.test(name)) return null;
  return name;
}
export function generateGuestName(a: number, b: number) {
  const prefixes = ["ソラ", "ネコ", "ユキ", "カゼ", "モチ", "ルナ", "ハル", "ミドリ"];
  const endings = ["マル", "ピョン", "ラン", "ポン", "タロ", "リン", "ノスケ", "キチ"];
  return prefixes[Math.abs(a) % prefixes.length] + endings[Math.abs(b) % endings.length];
}
export function parseRun(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { runId, timeMs, input, coins } = body as Record<string, unknown>;
  if (typeof runId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(runId)) return null;
  if (typeof timeMs !== "number" || !Number.isFinite(timeMs) || timeMs < 30_000 || timeMs > 3_600_000) return null;
  if (input !== "keyboard" && input !== "gamepad" && input !== "touch") return null;
  if (typeof coins !== "number" || !Number.isInteger(coins) || coins < 0 || coins > 60) return null;
  return { runId, timeMs: Math.round(timeMs), input, coins };
}
