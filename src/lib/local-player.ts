import { generateGuestName, normalizeGuestName, parseRun } from "./guest-rules";
import type { RunResult } from "./autorun-scene";

type LocalPlayer = { id: string; name: string; needsSync: boolean };
let memoryPlayer: LocalPlayer | undefined;
const PLAYER_KEY = "speedrun.player.v2", RUNS_KEY = "speedrun.pending.v2";
function read(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } }
function write(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function localPlayer(): LocalPlayer {
  if (memoryPlayer) return memoryPlayer;
  const saved = read(PLAYER_KEY) as LocalPlayer | null;
  if (saved && typeof saved.id === "string" && normalizeGuestName(saved.name)) return memoryPlayer = saved;
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  memoryPlayer = { id: `local-${crypto.randomUUID()}`, name: generateGuestName(bytes[0], bytes[1]), needsSync: true };
  write(PLAYER_KEY, memoryPlayer); return memoryPlayer;
}
export function rememberPlayer(player: { id: string; name: string }, needsSync: boolean) {
  memoryPlayer = { ...player, needsSync }; return write(PLAYER_KEY, memoryPlayer);
}
export function queuedRuns(): RunResult[] {
  const saved = read(RUNS_KEY);
  return Array.isArray(saved) ? saved.filter(run => parseRun(run)).slice(-20) : [];
}
export function queueRun(run: RunResult) { return write(RUNS_KEY, [...queuedRuns().filter(r => r.runId !== run.runId), run].slice(-20)); }
export function removeQueuedRun(id: string) { write(RUNS_KEY, queuedRuns().filter(r => r.runId !== id)); }
