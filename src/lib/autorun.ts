// Simulation uses course distance/lateral offset, independent of the curved renderer.
export const COURSE_ID = "osaka-river-v4";
export const COURSE_LENGTH = 640;
export const ROAD_HALF_WIDTH = 5.2;
export const CHECKPOINTS = [160, 320, 480];
export const GRAVITY = 22;
export const JUMP_HEIGHTS = [1.5, 3, 4.8] as const;
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHTS[2]);
export const MEDIUM_HOLD = .1;
export const LARGE_HOLD = .25;
export const LOOK_DURATION = .72;
export const FALL_GRAVITY = 30;
export const SPEED_SCALE = 1.3;
export const RUN_SPEED = 12 * SPEED_SCALE;
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
  jumpWasDown: boolean; jumpActive: boolean; jumpHold: number; jumpLevel: 0 | 1 | 2 | 3;
  lookTime: number; lookCooldown: number; lookDirection: number;
};
export type Input = { steer: number; boost: boolean; slow: boolean; jump: boolean; jumpPressed?: boolean; targetX?: number };
export type RunEvent = "jump" | "jump-medium" | "jump-large" | "miss" | "land" | "coin" | "boost" | "hit" | "respawn" | "checkpoint" | "finish";
export function newRun(): RunState {
  return { phase: "running", s: 0, x: 0, y: 0, vy: 0, grounded: true, time: 0, checkpoint: 0, deaths: 0, coins: 0, boost: 0, respawn: 0, collected: new Set(), jumpBuffer: 0, coyote: .1, speed: RUN_SPEED, jumpWasDown: false, jumpActive: false, jumpHold: 0, jumpLevel: 0, lookTime: 0, lookCooldown: 0, lookDirection: 0 };
}
export function jumpLevelForHold(seconds: number): 1 | 2 | 3 { return seconds + 1e-9 >= LARGE_HOLD ? 3 : seconds + 1e-9 >= MEDIUM_HOLD ? 2 : 1; }
export function headLookYaw(r: Pick<RunState, "lookTime" | "lookDirection">) {
  const elapsed = LOOK_DURATION - r.lookTime;
  const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
  return r.lookDirection * 1.5 * Math.min(ease(elapsed / .16), ease(r.lookTime / .28));
}
export function slideTarget(x: number, fraction: number) {
  return Math.max(-ROAD_HALF_WIDTH + .4, Math.min(ROAD_HALF_WIDTH - .4, x + fraction * (ROAD_HALF_WIDTH * 2 - .8)));
}
// Exact constant-acceleration integration, splitting a step that crosses the apex.
export function airborneMotion(y: number, velocity: number, dt: number) {
  const upTime = velocity > 0 ? Math.min(dt, velocity / GRAVITY) : 0;
  y += velocity * upTime - .5 * GRAVITY * upTime * upTime;
  velocity -= GRAVITY * upTime;
  const downTime = dt - upTime;
  y += velocity * downTime - .5 * FALL_GRAVITY * downTime * downTime;
  velocity -= FALL_GRAVITY * downTime;
  return { y, velocity };
}
export function stepRun(r: RunState, input: Input, dt = STEP): RunEvent[] {
  const events: RunEvent[] = [];
  if (r.phase === "finished" || r.phase === "ready") return events;
  const jumpPressed = Boolean(input.jumpPressed) || (input.jump && !r.jumpWasDown);
  r.jumpWasDown = input.jump;
  r.time += dt;
  if (r.phase === "respawning") {
    r.respawn -= dt;
    if (r.respawn <= 0) { r.phase = "running"; events.push("respawn"); }
    return events;
  }
  r.lookTime = Math.max(0, r.lookTime - dt); r.lookCooldown = Math.max(0, r.lookCooldown - dt);
  r.boost = Math.max(0, r.boost - dt);
  // Holding a direction selects one fixed speed; opposing inputs cancel.
  r.speed = (input.boost && input.slow ? 12 : input.slow ? 10 : r.boost > 0 ? 18 : input.boost ? 16 : 12) * SPEED_SCALE;
  const previousS = r.s;
  r.s = Math.min(COURSE_LENGTH, r.s + r.speed * dt);
  const lateral = input.targetX === undefined ? Math.max(-1, Math.min(1, input.steer)) * 7.5 * dt : Math.max(-14 * dt, Math.min(14 * dt, input.targetX - r.x));
  r.x = Math.max(-ROAD_HALF_WIDTH + .4, Math.min(ROAD_HALF_WIDTH - .4, r.x + lateral));
  r.jumpBuffer = jumpPressed ? .12 : Math.max(0, r.jumpBuffer - dt);
  r.coyote = r.grounded ? .1 : Math.max(0, r.coyote - dt);
  if (r.jumpBuffer > 0 && r.coyote > 0) {
    r.vy = JUMP_SPEED; r.grounded = false; r.coyote = 0; r.jumpBuffer = 0;
    r.jumpActive = true; r.jumpHold = 0; r.jumpLevel = 1; events.push("jump");
  }
  if (r.jumpActive) {
    // Immediate takeoff, then release limits the remaining upward energy.
    // Thresholds precede their smaller apex, so all three peaks are distinct.
    if (input.jump) {
      r.jumpHold += dt;
      const level = jumpLevelForHold(r.jumpHold);
      if (level !== r.jumpLevel) events.push(level === 3 ? "jump-large" : "jump-medium");
      r.jumpLevel = level;
    } else {
      const targetHeight = JUMP_HEIGHTS[Math.max(0, r.jumpLevel - 1)];
      if (r.vy > 0) r.vy = Math.min(r.vy, Math.sqrt(2 * GRAVITY * Math.max(0, targetHeight - r.y)));
      r.jumpActive = false;
    }
  }
  const hasFloor = !GAPS.some(g => r.s > g.start && r.s < g.end);
  const previousY = r.y;
  if (!r.grounded || !hasFloor) {
    const motion = airborneMotion(r.y, r.vy, dt);
    r.vy = motion.velocity; r.y = motion.y; r.grounded = false;
    if (hasFloor && previousY >= 0 && r.y <= 0 && r.vy <= 0) {
      r.y = 0; r.vy = 0; r.grounded = true; r.jumpActive = false; events.push("land");
    }
  }
  const hit = OBSTACLES.some(o => Math.abs(r.s - o.s) < o.d / 2 + .32 && Math.abs(r.x - obstacleX(o, r.time)) < o.w / 2 + .32 && r.y < o.h && r.y > -1.8);
  if (hit || r.y < -5) {
    r.deaths++; r.s = r.checkpoint ? CHECKPOINTS[r.checkpoint - 1] + 2 : 0;
    r.x = 0; r.y = 0; r.vy = 0; r.grounded = true; r.boost = 0; r.jumpBuffer = 0; r.coyote = .1;
    r.jumpActive = false; r.jumpHold = 0; r.jumpLevel = 0; r.lookTime = 0; r.lookCooldown = 0;
    r.phase = "respawning"; r.respawn = .85; events.push("hit");
    return events;
  }
  ITEMS.forEach((item, i) => {
    if (!r.collected.has(i) && Math.abs(r.s - item.s) < .85 && Math.abs(r.x - item.x) < 1 && Math.abs(r.y + 1 - item.y) < 1.35) {
      r.collected.add(i); r.coins++;
      if (item.boost) { r.boost = 2.2; events.push("boost"); } else events.push("coin");
    }
    if (!r.collected.has(i) && previousS <= item.s + .85 && r.s > item.s + .85 && r.lookCooldown === 0) {
      r.lookDirection = item.x <= r.x ? 1 : -1; r.lookTime = LOOK_DURATION; r.lookCooldown = 1.5; events.push("miss");
    }
  });
  if (r.checkpoint < CHECKPOINTS.length && r.s >= CHECKPOINTS[r.checkpoint]) { r.checkpoint++; events.push("checkpoint"); }
  if (r.s >= COURSE_LENGTH) { r.phase = "finished"; events.push("finish"); }
  return events;
}
