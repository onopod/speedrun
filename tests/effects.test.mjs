import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RunEffects, FX_COLORS } from '../src/lib/run-effects.ts';
import { newRun, stepRun, guideInput, STEP, BOOST_PADS, speedMode } from '../src/lib/autorun.ts';
const anchor = { position: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, back: { x: 0, y: 0, z: 1 } };
const neutral = { steer: 0, jump: false, boost: false, slow: false };
const active = fx => fx.particles.filter(p => p.active);

test('seven effect scenes are distinct, with escalating jump and finish bursts', () => {
  for (const [event, color, shape] of [['coin', FX_COLORS.gold, 'star'], ['boost', FX_COLORS.star, 'ring'], ['pad', FX_COLORS.pad, 'ring'], ['jump', FX_COLORS.smoke, 'smoke'], ['finish', FX_COLORS.gold, 'confetti']]) {
    const fx = new RunEffects(192, () => .5); fx.event(event, anchor, 'great');
    assert.ok(active(fx).some(p => p.shape === shape)); assert.ok(active(fx).some(p => p.color === color));
  }
  const running = new RunEffects(), fast = new RunEffects();
  for (let i = 0; i < 120; i++) { running.advance(STEP, anchor, 'normal', true, true, 15.6); fast.advance(STEP, anchor, 'manual', true, true, 20.8); }
  assert.ok(running.count > 0); assert.ok(active(running).every(p => p.shape === 'smoke'));
  assert.ok(active(fast).some(p => p.shape === 'streak' && p.color === FX_COLORS.manual));
  const jump = new RunEffects(); jump.event('jump-medium', anchor); const medium = jump.count;
  jump.clear(); jump.event('jump-large', anchor); assert.ok(jump.count > medium);
  const counts = ['retry', 'good', 'great'].map(grade => { const fx = new RunEffects(); fx.event('finish', anchor, grade); return fx.count; });
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});
test('pause freezes effects, stopping acceleration drains trails, and restart/death clears the pool', () => {
  const fx = new RunEffects(80);
  fx.event('boost', anchor); fx.advance(.1, anchor, 'manual', true, true, 20.8);
  const frozen = JSON.stringify(fx.particles); fx.advance(0, anchor, 'manual', true, true, 20.8);
  assert.equal(JSON.stringify(fx.particles), frozen);
  for (let i = 0; i < 120; i++) fx.advance(STEP, anchor, 'normal', true, true, 15.6);
  assert.ok(active(fx).every(p => p.shape === 'smoke'));
  fx.event('pad', anchor); fx.event('hit', anchor); assert.equal(fx.count, 0);
  fx.event('finish', anchor, 'great'); for (let i = 0; i < 360; i++) fx.advance(STEP, anchor, 'normal', false, true, 0);
  assert.equal(fx.count, 0); fx.event('coin', anchor); fx.clear(); assert.equal(fx.count, 0);
});
test('particle budget stays bounded under bursts and no footsteps emit while airborne', () => {
  const fx = new RunEffects(24);
  for (let i = 0; i < 500; i++) { fx.event(i % 2 ? 'coin' : 'boost', anchor); fx.advance(STEP, anchor, 'manual', true, false, 35); assert.ok(fx.count <= 24); }
  assert.equal(fx.particles.length, 24);
  for (const p of active(fx)) for (const key of ['x', 'y', 'z', 'age', 'size']) assert.ok(Number.isFinite(p[key]));
  fx.clear(); for (let i = 0; i < 120; i++) fx.advance(STEP, anchor, 'normal', true, false, 15.6);
  assert.equal(fx.count, 0);
});
test('pads fire only on grounded entry, never stack speed, respect braking, and expire', () => {
  const pad = BOOST_PADS[0], r = newRun(); r.s = pad.s - 1.8; r.x = pad.x;
  assert.ok(stepRun(r, neutral).includes('pad')); assert.equal(r.lastPad, 0); assert.equal(r.padBoost, 1.2);
  assert.ok(!stepRun(r, neutral).includes('pad')); assert.equal(speedMode(r, neutral), 'pad');
  assert.equal(speedMode(r, { ...neutral, boost: true }), 'pad');
  assert.equal(speedMode(r, { ...neutral, slow: true }), 'slow');
  assert.equal(speedMode(r, { ...neutral, boost: true, slow: true }), 'normal');
  r.boost = 1; assert.equal(speedMode(r, neutral), 'star'); r.boost = 0;
  for (let i = 0; i < 180; i++) stepRun(r, neutral);
  assert.equal(r.padBoost, 0); assert.equal(speedMode(r, neutral), 'normal');
  const air = newRun(); air.s = pad.s - 1.8; air.x = pad.x; air.y = 3; air.grounded = false;
  assert.ok(!stepRun(air, neutral).includes('pad')); assert.equal(air.padBoost, 0);
});
test('effects and optional outer-lane pads preserve the full-star guide and run state', () => {
  const visual = newRun(), control = newRun(), fx = new RunEffects(80);
  let coins = 0, boosts = 0, finishes = 0;
  while (control.phase !== 'finished' && control.time < 60) {
    const input = guideInput(control); stepRun(control, input);
    const events = stepRun(visual, input);
    fx.advance(STEP, anchor, speedMode(visual, input), visual.phase === 'running', visual.grounded, visual.speed);
    events.forEach(event => { fx.event(event, anchor); if (event === 'coin') coins++; if (event === 'boost') boosts++; if (event === 'finish') finishes++; });
  }
  assert.equal(visual.phase, 'finished'); assert.equal(visual.coins, 60); assert.equal(visual.deaths, 0);
  assert.equal(visual.s, control.s); assert.equal(visual.time, control.time); assert.equal(visual.lastPad, -1);
  assert.equal(coins, 54); assert.equal(boosts, 6); assert.equal(finishes, 1);
});
test('bundled effect images match the original Kenney file checksums', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/vfx/manifest.json', import.meta.url), 'utf8'));
  for (const item of manifest) { const bytes = readFileSync(new URL(`../public/vfx/${item.file}`, import.meta.url)); assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256); assert.equal(bytes.length, item.bytes); }
});
