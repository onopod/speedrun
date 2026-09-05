// Simulation uses course distance/lateral offset, independent of the curved renderer.
export const COURSE_ID = "osaka-river-v2";
export const COURSE_LENGTH = 640;
export const ROAD_HALF_WIDTH = 5.2;
export const CHECKPOINTS = [160, 320, 480];
export const JUMP_SPEED = 13;
export const GRAVITY = 22;
export const STEP = 1 / 120;
export type RunPhase = "ready" | "running" | "respawning" | "finished";
export type Obstacle = { s: number; x: number; w: number; d: number; h: number; moving?: boolean };
export const OBSTACLES: Obstacle[] = [
  { s: 36, x: -3, w: 2.4, d: 2, h: 2 }, { s: 62, x: 0, w: 10.4, d: 1, h: 1.15 },
  { s: 115, x: 2.8, w: 2.6, d: 2, h: 2.3 }, { s: 138, x: 0, w: 2.2, d: 2, h: 1.8, moving: true },
  { s: 185, x: 0, w: 10.4, d: 1, h: 1.4 }, { s: 242, x: -2.8, w: 2.6, d: 2, h: 2.5 },
  { s: 268, x: 0, w: 2.5, d: 2, h: 2.1, moving: true }, { s: 296, x: 0, w: 10.4, d: 1, h: 1.5 },
  { s: 344, x: 2.8, w: 2.5, d: 2, h: 2.2 }, { s: 390, x: 0, w: 10.4, d: 1, h: 1.65 },
  { s: 420, x: 0, w: 2.4, d: 2, h: 2.2, moving: true }, { s: 450, x: -3, w: 2.4, d: 2, h: 2.4 },
  { s: 503, x: 0, w: 10.4, d: 1, h: 1.75 }, { s: 561, x: 0, w: 2.4, d: 2, h: 2.2, moving: true },
  { s: 595, x: 0, w: 10.4, d: 1, h: 1.8 },
];
export const GAPS = [{ start: 88, end: 93 }, { start: 213, end: 219 }, { start: 362, end: 368 }, { start: 532, end: 538 }];
export const ITEMS = Array.from({ length: 60 }, (_, i) => {
  const s = 20 + i * 10;
  // Raised diamonds trace a jump arc near barriers; other diamonds invite lane changes.
  const nearJump = GAPS.some(g => s > g.start - 6 && s < g.end + 5) || OBSTACLES.some(o => o.w > 8 && Math.abs(o.s - s) < 7);
  return { s, x: nearJump ? 0 : (Math.floor(i / 4) % 3 - 1) * 3, y: nearJump ? 3 : 1, boost: i % 10 === 6 };
});
export function coursePoint(s: number) {
  return { x: 26 * Math.sin(s / 65) + 12 * Math.sin(s / 32), y: 3 * Math.sin(s / 47) + 1.8 * Math.sin(s / 100), z: -s };
}
export function obstacleX(o: Obstacle, time: number) { return o.moving ? Math.sin(time * 1.5 + o.s) * 3.1 : o.x; }
export type RunState = {
  phase: RunPhase; s: number; x: number; y: number; vy: number; grounded: boolean;
  time: number; checkpoint: number; deaths: number; coins: number; boost: number;
  respawn: number; collected: Set<number>; jumpBuffer: number; coyote: number; speed: number;
};
export type Input = { steer: number; boost: boolean; slow: boolean; jump: boolean };
export type RunEvent = "jump" | "land" | "coin" | "boost" | "hit" | "respawn" | "checkpoint" | "finish";
export function newRun(): RunState {
  return { phase: "running", s: 0, x: 0, y: 0, vy: 0, grounded: true, time: 0, checkpoint: 0, deaths: 0, coins: 0, boost: 0, respawn: 0, collected: new Set(), jumpBuffer: 0, coyote: .1, speed: 12 };
}
export function stepRun(r: RunState, input: Input, dt = STEP): RunEvent[] {
  const events: RunEvent[] = [];
  if (r.phase === "finished" || r.phase === "ready") return events;
  r.time += dt;
  if (r.phase === "respawning") {
    r.respawn -= dt;
    if (r.respawn <= 0) { r.phase = "running"; events.push("respawn"); }
    return events;
  }
  r.boost = Math.max(0, r.boost - dt);
  r.speed = r.boost > 0 ? 18 : input.boost ? 16 : input.slow ? 10 : 12;
  r.s = Math.min(COURSE_LENGTH, r.s + r.speed * dt);
  r.x = Math.max(-ROAD_HALF_WIDTH + .4, Math.min(ROAD_HALF_WIDTH - .4, r.x + Math.max(-1, Math.min(1, input.steer)) * 7.5 * dt));
  r.jumpBuffer = input.jump ? .12 : Math.max(0, r.jumpBuffer - dt);
  r.coyote = r.grounded ? .1 : Math.max(0, r.coyote - dt);
  if (r.jumpBuffer > 0 && r.coyote > 0) {
    r.vy = JUMP_SPEED; r.grounded = false; r.coyote = 0; r.jumpBuffer = 0; events.push("jump");
  }
  const hasFloor = !GAPS.some(g => r.s > g.start && r.s < g.end);
  const previousY = r.y;
  if (!r.grounded || !hasFloor) {
    r.vy -= GRAVITY * dt; r.y += r.vy * dt; r.grounded = false;
    if (hasFloor && previousY >= 0 && r.y <= 0 && r.vy <= 0) {
      r.y = 0; r.vy = 0; r.grounded = true; events.push("land");
    }
  }
  const hit = OBSTACLES.some(o => Math.abs(r.s - o.s) < o.d / 2 + .32 && Math.abs(r.x - obstacleX(o, r.time)) < o.w / 2 + .32 && r.y < o.h && r.y > -1.8);
  if (hit || r.y < -5) {
    r.deaths++; r.s = r.checkpoint ? CHECKPOINTS[r.checkpoint - 1] + 2 : 0;
    r.x = 0; r.y = 0; r.vy = 0; r.grounded = true; r.boost = 0; r.jumpBuffer = 0; r.coyote = .1;
    r.phase = "respawning"; r.respawn = .85; events.push("hit");
    return events;
  }
  ITEMS.forEach((item, i) => {
    if (!r.collected.has(i) && Math.abs(r.s - item.s) < .85 && Math.abs(r.x - item.x) < 1 && Math.abs(r.y + 1 - item.y) < 1.35) {
      r.collected.add(i); r.coins++;
      if (item.boost) { r.boost = 2.2; events.push("boost"); } else events.push("coin");
    }
  });
  if (r.checkpoint < CHECKPOINTS.length && r.s >= CHECKPOINTS[r.checkpoint]) { r.checkpoint++; events.push("checkpoint"); }
  if (r.s >= COURSE_LENGTH) { r.phase = "finished"; events.push("finish"); }
  return events;
}
