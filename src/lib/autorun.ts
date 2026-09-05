// Simulation uses course distance/lateral offset, independent of the curved renderer.
export const COURSE_ID = "sky-rush-v5";
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
// Jump hazards are spaced for the longest downhill flight; outer-lane blocks
// keep shortcut choices interesting without interrupting the collection route.
export const OBSTACLES: Obstacle[] = [
  ...[72, 225, 385, 545].map((s, i) => ({ s, x: 0, w: 10.4, d: 1, h: 1.3 + i * .15 })),
  ...[40, 110, 185, 270, 345, 420, 505, 575].map((s, i) => ({ s, x: i % 2 ? 3.8 : -3.8, w: 1.8, d: 2, h: 2.3, moving: i % 2 === 1 })),
];
export const GAPS = [{ start: 145, end: 151 }, { start: 305, end: 311 }, { start: 465, end: 471 }, { start: 605, end: 611 }];
export const BOOST_PADS = [28, 174, 330, 490].map((s, i) => ({ s, x: i % 2 ? -3.4 : 3.4, w: 2, d: 4 }));
export type SpeedMode = "normal" | "slow" | "manual" | "star" | "pad";
export function speedMode(r: Pick<RunState, "boost" | "padBoost">, input: Pick<Input, "boost" | "slow">): SpeedMode {
  if (input.boost && input.slow) return "normal";
  if (input.slow) return "slow";
  return r.boost > 0 ? "star" : r.padBoost > 0 ? "pad" : input.boost ? "manual" : "normal";
}
export type CourseItem = { s: number; x: number; y: number; boost: boolean };
// Smooth crests and valleys, with level starts/checkpoints/finish approaches.
const ELEVATION = [[0, 0], [25, 0], [82, 13], [158, 0], [215, 16], [318, 0], [380, 18], [478, 0], [540, 21], [630, 0], [660, 0]];
export function elevationAt(s: number) {
  const i = ELEVATION.findIndex(([distance]) => distance > s);
  if (i <= 0) return { height: i === 0 ? 0 : ELEVATION.at(-1)![1], slope: 0 };
  const [a, ya] = ELEVATION[i - 1], [b, yb] = ELEVATION[i], t = (s - a) / (b - a);
  return { height: ya + (yb - ya) * (1 - Math.cos(Math.PI * t)) / 2, slope: (yb - ya) * Math.PI * Math.sin(Math.PI * t) / (2 * (b - a)) };
}
export function hillSpeedFactor(s: number) {
  const { slope } = elevationAt(s);
  return slope >= 0 ? 1 - Math.min(.09, slope * .23) : 1 + Math.min(.7, -slope * 2);
}
export function coursePoint(s: number) {
  return { x: 26 * Math.sin(s / 65) + 12 * Math.sin(s / 32), y: elevationAt(s).height, z: -s };
}
export function obstacleX(o: Obstacle, time: number) { return o.moving ? o.x + Math.sin(time * 1.5 + o.s) * .4 : o.x; }
export type FinishGrade = "great" | "good" | "retry";
export function finishGrade(coins: number, deaths: number): FinishGrade {
  return coins >= 48 && deaths <= 2 ? "great" : coins >= 24 && deaths <= 6 ? "good" : "retry";
}
export type RunState = {
  phase: RunPhase; s: number; x: number; y: number; vy: number; grounded: boolean;
  time: number; checkpoint: number; deaths: number; coins: number; boost: number; padBoost: number; activePad: number; lastPad: number;
  respawn: number; collected: Set<number>; jumpBuffer: number; coyote: number; speed: number;
  jumpWasDown: boolean; jumpActive: boolean; jumpHold: number; jumpLevel: 0 | 1 | 2 | 3;
  lookTime: number; lookCooldown: number; lookDirection: number;
};
export type Input = { steer: number; boost: boolean; slow: boolean; jump: boolean; jumpPressed?: boolean; targetX?: number };
export type RunEvent = "jump" | "jump-medium" | "jump-large" | "miss" | "land" | "coin" | "boost" | "hit" | "respawn" | "checkpoint" | "finish" | "pad";
export function newRun(): RunState {
  return { phase: "running", s: 0, x: 0, y: 0, vy: 0, grounded: true, time: 0, checkpoint: 0, deaths: 0, coins: 0, boost: 0, padBoost: 0, activePad: -1, lastPad: -1, respawn: 0, collected: new Set(), jumpBuffer: 0, coyote: .1, speed: RUN_SPEED, jumpWasDown: false, jumpActive: false, jumpHold: 0, jumpLevel: 0, lookTime: 0, lookCooldown: 0, lookDirection: 0 };
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
export function stepRun(r: RunState, input: Input, dt = STEP, items: readonly CourseItem[] = ITEMS): RunEvent[] {
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
  r.padBoost = Math.max(0, r.padBoost - dt);
  // Holding a direction selects one fixed speed; opposing inputs cancel.
  r.speed = (input.boost && input.slow ? 12 : input.slow ? 10 : r.boost > 0 ? 18 : input.boost || r.padBoost > 0 ? 16 : 12) * SPEED_SCALE * hillSpeedFactor(r.s);
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
    r.x = 0; r.y = 0; r.vy = 0; r.grounded = true; r.boost = 0; r.padBoost = 0; r.activePad = -1; r.jumpBuffer = 0; r.coyote = .1;
    r.jumpActive = false; r.jumpHold = 0; r.jumpLevel = 0; r.lookTime = 0; r.lookCooldown = 0;
    r.phase = "respawning"; r.respawn = .85; events.push("hit");
    return events;
  }
  const pad = r.grounded ? BOOST_PADS.findIndex(p => Math.abs(r.s - p.s) < p.d / 2 && Math.abs(r.x - p.x) < p.w / 2 + .25) : -1;
  if (pad >= 0 && pad !== r.activePad) { r.padBoost = 1.2; r.lastPad = pad; events.push("pad"); }
  r.activePad = pad;
  items.forEach((item, i) => {
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


// A human-playable reference: follow the center ribbon and hold a large jump
// at each launch marker. Only normal forward speed is used, including pickups.
export function routeX(s: number) { return Math.sin(s / 39) * 1.15; }
export function nextJumpHazard(s: number) {
  return Math.min(...OBSTACLES.filter(o => o.w > 8 && o.s > s).map(o => o.s - o.d / 2), ...GAPS.filter(g => g.end > s).map(g => g.start));
}
export function guideInput(r: RunState): Input {
  const hazard = nextJumpHazard(r.s);
  const jump = r.jumpActive && r.jumpHold < .32 || r.grounded && hazard > r.s && hazard - r.s < r.speed * .53;
  return { steer: 0, targetX: routeX(r.s), boost: false, slow: false, jump };
}
export type GuidePoint = { s: number; x: number; y: number };
export type LaunchPoint = GuidePoint & { landing: number };
function traceRoute(items: readonly CourseItem[]) {
  const r = newRun(), points: GuidePoint[] = [], launches: LaunchPoint[] = [];
  for (let i = 0; i < 120 * 100 && r.phase !== "finished"; i++) {
    const events = stepRun(r, guideInput(r), STEP, items);
    points.push({ s: r.s, x: r.x, y: r.y });
    if (events.includes("jump")) launches.push({ s: r.s, x: r.x, y: 0, landing: r.s });
    if (events.includes("land") && launches.length) launches.at(-1)!.landing = r.s;
    if (r.deaths) throw new Error("The reference route hit a course hazard");
  }
  return { points, launches, run: r };
}
function buildCollectionRoute() {
  let items: CourseItem[] = Array.from({ length: 60 }, (_, i) => ({ s: 20 + i * 10, x: routeX(20 + i * 10), y: 1, boost: [0, 14, 21, 30, 46, 59].includes(i) }));
  // Refine the raised stars against the actual flight/boost trajectory. Wide
  // pickup windows make this converge, then replay the complete route in tests.
  for (let pass = 0; pass < 4; pass++) {
    const { points } = traceRoute(items);
    items = items.map(item => { const p = points.find(p => p.s >= item.s)!; return { ...item, x: p.x, y: p.y + 1 }; });
  }
  const trace = traceRoute(items);
  if (trace.run.coins !== items.length) throw new Error("The collection route must reach every star");
  return { items, points: trace.points.filter((_, i) => i % 4 === 0), launches: trace.launches };
}
const collectionRoute = buildCollectionRoute();
export const ITEMS = collectionRoute.items;
export const IDEAL_ROUTE = collectionRoute.points;
export const JUMP_MARKERS = collectionRoute.launches;
