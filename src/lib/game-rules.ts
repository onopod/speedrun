/** Collision coordinates are transformed into the rotating bar's local space. */
export function hitsSweeper(dx: number, dz: number, angle: number, width: number, y: number) {
  const localX = Math.cos(angle) * dx - Math.sin(angle) * dz;
  const localZ = Math.sin(angle) * dx + Math.cos(angle) * dz;
  return Math.abs(localX) < width / 2 + .4 && Math.abs(localZ) < .675 && y > .2 && y < 2.3;
}

export function canLand(previousY: number, nextY: number, velocityY: number, hasFloor: boolean) {
  return hasFloor && previousY >= 1.2 && nextY <= 1.2 && velocityY <= 0;
}

export function parseScore(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { name, timeMs, input } = body as Record<string, unknown>;
  if (typeof name !== "string" || typeof timeMs !== "number" || !Number.isFinite(timeMs)) return null;
  const playerName = name.normalize("NFKC").replace(/[^\p{L}\p{N}_\- ]/gu, "").trim().slice(0, 16);
  if (!playerName || timeMs < 15_000 || timeMs > 3_600_000 || (input !== "keyboard" && input !== "gamepad")) return null;
  return { playerName, timeMs: Math.round(timeMs), inputType: input };
}
