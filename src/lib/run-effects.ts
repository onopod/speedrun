import type { FinishGrade, RunEvent, SpeedMode } from "./autorun";

export type Vec = { x: number; y: number; z: number };
export type FxAnchor = { position: Vec; right: Vec; up: Vec; back: Vec };
export type FxShape = "smoke" | "light" | "star" | "ring" | "confetti" | "streak";
export type FxParticle = {
  active: boolean; shape: FxShape; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; growth: number; opacity: number; color: number;
  gravity: number; attract: boolean; angle: number; spin: number; nx: number; ny: number; nz: number;
};
export const FX_COLORS = { smoke: 0xd0e8e0, manual: 0xbaff50, star: 0x5effed, pad: 0xffba54, gold: 0xffdc70 };
const blank = (): FxParticle => ({ active: false, shape: "light", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, growth: 0, opacity: 1, color: 0xffffff, gravity: 0, attract: false, angle: 0, spin: 0, nx: 0, ny: 1, nz: 0 });

/** Bounded reusable particle pool. Its random stream never touches run physics. */
export class RunEffects {
  readonly particles: FxParticle[];
  private footClock = 0;
  private trailClock = 0;
  private foot = 1;
  readonly capacity: number;
  private random: () => number;
  private density: number;
  constructor(capacity = 192, random = Math.random, density = 1) {
    this.capacity = capacity; this.random = random; this.density = density;
    this.particles = Array.from({ length: capacity }, blank);
  }
  get count() { return this.particles.reduce((n, p) => n + Number(p.active), 0); }
  clear() { this.particles.forEach(p => { p.active = false; }); this.footClock = this.trailClock = 0; }
  private spawn(a: FxAnchor, shape: FxShape, color: number, offset: Vec, velocity: Vec, options: Partial<FxParticle> = {}) {
    // Bursts can replace the oldest trail/smoke, but never grow the pool.
    let p = this.particles.find(p => !p.active);
    if (!p) for (const candidate of this.particles) if ((candidate.shape === "smoke" || candidate.shape === "streak") && (!p || candidate.age > p.age)) p = candidate;
    if (!p) return;
    Object.assign(p, blank(), { active: true, shape, color, angle: this.random() * Math.PI * 2, ...options });
    for (const axis of ["x", "y", "z"] as const) {
      p[axis] = a.position[axis] + a.right[axis] * offset.x + a.up[axis] * offset.y + a.back[axis] * offset.z;
    }
    p.vx = a.right.x * velocity.x + a.up.x * velocity.y + a.back.x * velocity.z;
    p.vy = a.right.y * velocity.x + a.up.y * velocity.y + a.back.y * velocity.z;
    p.vz = a.right.z * velocity.x + a.up.z * velocity.y + a.back.z * velocity.z;
    p.nx = a.up.x; p.ny = a.up.y; p.nz = a.up.z;
  }
  private burst(a: FxAnchor, count: number, shape: FxShape, color: number, speed: number, options: Partial<FxParticle> = {}) {
    for (let i = 0; i < Math.ceil(count * this.density); i++) {
      const angle = this.random() * Math.PI * 2, radial = (.45 + this.random() * .55) * speed;
      this.spawn(a, shape, color, { x: 0, y: .08, z: 0 }, { x: Math.cos(angle) * radial, y: speed * (.2 + this.random()), z: Math.sin(angle) * radial }, { size: .2, life: .5, ...options });
    }
  }
  private ring(a: FxAnchor, color: number, growth: number, size = .2) {
    this.spawn(a, "ring", color, { x: 0, y: .08, z: 0 }, { x: 0, y: 0, z: 0 }, { size, growth, life: .55, opacity: .7 });
  }
  event(event: RunEvent, anchor: FxAnchor, grade: FinishGrade = "good") {
    switch (event) {
      case "coin":
        this.burst(anchor, 9, "star", FX_COLORS.gold, 4.5, { life: .75, size: .42, attract: true, spin: 2 });
        this.burst(anchor, 6, "light", FX_COLORS.manual, 3.5, { size: .5, life: .6, attract: true }); break;
      case "boost":
        this.burst(anchor, 20, "star", FX_COLORS.star, 3.5, { size: .4, life: .75, attract: true });
        this.ring(anchor, FX_COLORS.star, 6); break;
      case "pad":
        this.burst(anchor, 22, "streak", FX_COLORS.pad, 3, { size: .45, life: .6 });
        this.ring(anchor, FX_COLORS.pad, 8, .7); break;
      case "jump":
        this.burst(anchor, 8, "smoke", FX_COLORS.smoke, 2.8, { size: .45, growth: 1.1, life: .38, opacity: .35 });
        this.ring(anchor, 0xddffe8, 4.2); break;
      case "jump-medium": this.burst(anchor, 7, "star", FX_COLORS.manual, 1.8, { size: .24, life: .5 }); break;
      case "jump-large": this.burst(anchor, 14, "star", FX_COLORS.star, 2.4, { size: .36, life: .7 }); break;
      case "land": this.burst(anchor, 7, "smoke", FX_COLORS.smoke, 2, { size: .3, growth: 1.2, life: .3, opacity: .3 }); break;
      case "hit": this.clear(); break;
      case "finish": {
        this.clear();
        const count = grade === "great" ? 100 : grade === "good" ? 64 : 32;
        for (const side of [-1, 1]) {
          for (let i = 0; i < Math.ceil(count * this.density / 2); i++) {
            const colors = [FX_COLORS.gold, FX_COLORS.manual, FX_COLORS.star, 0xffffff];
            this.spawn(anchor, i % 4 === 0 ? "star" : "confetti", colors[i % colors.length], { x: side * 3.6, y: .2, z: -.5 }, { x: -side * (1 + this.random() * 2), y: 4 + this.random() * 4, z: (this.random() - .5) * 3 }, { size: i % 4 ? .17 : .45, life: 2.2 + this.random() * .6, gravity: 5, spin: (this.random() - .5) * 10 });
          }
        }
        this.ring(anchor, FX_COLORS.gold, 7, 1); break;
      }
    }
  }
  advance(dt: number, anchor: FxAnchor, mode: SpeedMode, running: boolean, grounded: boolean, speed: number) {
    if (dt <= 0) return; // Pausing freezes both lifetimes and emission clocks.
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) { p.active = false; continue; }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.angle += p.spin * dt;
      if (p.attract && p.age > .24) {
        const follow = 1 - Math.exp(-12 * dt);
        p.x += (anchor.position.x - p.x) * follow;
        p.y += (anchor.position.y + 1.1 - p.y) * follow;
        p.z += (anchor.position.z - p.z) * follow;
      }
    }
    if (!running) { this.footClock = this.trailClock = 0; return; }
    if (grounded) {
      this.footClock += dt * Math.max(.6, speed / 15.6);
      if (this.footClock >= .17 / this.density) {
        this.footClock = 0; this.foot *= -1;
        this.spawn(anchor, "smoke", FX_COLORS.smoke, { x: this.foot * .23, y: .08, z: .3 }, { x: this.foot * .15, y: .3, z: 1 }, { size: .28, growth: 1, life: .28, opacity: .25 });
      }
    } else this.footClock = 0;
    if (mode === "manual" || mode === "star" || mode === "pad") {
      this.trailClock += dt;
      if (this.trailClock >= .045 / this.density) {
        this.trailClock = 0;
        for (const side of [-1, 1]) {
          this.spawn(anchor, "streak", FX_COLORS[mode], { x: side * .25, y: .15, z: .4 }, { x: side * .12, y: .05, z: 2 }, { size: mode === "manual" ? .48 : .65, life: .3, opacity: .8 });
          this.spawn(anchor, "light", FX_COLORS[mode], { x: side * .26, y: .22, z: .35 }, { x: side * .25, y: .15, z: 1.5 }, { size: .45, growth: .2, life: .22, opacity: .5 });
        }
      }
    } else this.trailClock = 0;
  }
}
