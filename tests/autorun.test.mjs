import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, stepRun, STEP, OBSTACLES, GAPS, CHECKPOINTS, COURSE_LENGTH, COURSE_ID, JUMP_SPEED, GRAVITY, FALL_GRAVITY, airborneMotion, slideTarget } from '../src/lib/autorun.ts';
import { generateGuestName, normalizeGuestName, parseRun } from '../src/lib/guest-rules.ts';
const neutral = { steer: 0, boost: false, slow: false, jump: false };

test('every forward speed is exactly 1.3 times the prior release', () => {
  for (const [input, item, expected] of [[neutral, false, 15.6], [{ ...neutral, slow: true }, false, 13], [{ ...neutral, boost: true }, false, 20.8], [neutral, true, 23.4]]) {
    const r = newRun(); if (item) r.boost = 2;
    for (let i = 0; i < 120; i++) stepRun(r, input);
    assert.ok(Math.abs(r.s - expected) < 1e-8); assert.equal(r.phase, 'running');
  }
});
test('gravity slows ascent to an apex and accelerates descent consistently across time steps', () => {
  const first = airborneMotion(0, JUMP_SPEED, .2), second = airborneMotion(first.y, first.velocity, .2);
  assert.ok(first.y > second.y - first.y); assert.ok(second.velocity < first.velocity);
  const apex = airborneMotion(0, JUMP_SPEED, JUMP_SPEED / GRAVITY);
  assert.ok(Math.abs(apex.velocity) < 1e-9);
  const down1 = airborneMotion(apex.y, apex.velocity, .1), down2 = airborneMotion(down1.y, down1.velocity, .1);
  assert.ok(down2.velocity < down1.velocity); assert.ok(down1.y - down2.y > apex.y - down1.y);
  assert.ok(Math.abs(down2.velocity + FALL_GRAVITY * .2) < 1e-8);
  const whole = airborneMotion(0, JUMP_SPEED, .8); let split = { y: 0, velocity: JUMP_SPEED };
  for (let i = 0; i < 96; i++) split = airborneMotion(split.y, split.velocity, STEP);
  assert.ok(Math.abs(whole.y - split.y) < 1e-8); assert.ok(Math.abs(whole.velocity - split.velocity) < 1e-8);
});
test('swipe follows finger distance, reverses, holds position and stays on the road', () => {
  const r = newRun(), target = slideTarget(0, .3);
  assert.ok(target > 0);
  for (let i = 0; i < 30; i++) stepRun(r, { ...neutral, targetX: target });
  assert.equal(r.x, target);
  for (let i = 0; i < 10; i++) stepRun(r, neutral);
  assert.equal(r.x, target);
  const left = slideTarget(target, -.6);
  for (let i = 0; i < 60; i++) stepRun(r, { ...neutral, targetX: left });
  assert.equal(r.x, left); assert.ok(r.x < 0);
  assert.equal(slideTarget(0, 100), 4.8); assert.equal(slideTarget(0, -100), -4.8);
});
test('jump clears the tallest obstacles with over 3.7 metres of height', () => {
  const r = newRun(); let max = 0;
  stepRun(r, { ...neutral, jump: true });
  for (let i = 0; i < 180; i++) { stepRun(r, neutral); max = Math.max(max, r.y); }
  assert.ok(max > 3.7 && max < 4); assert.ok(max > Math.max(...OBSTACLES.map(o => o.h))); assert.equal(r.grounded, true);
});
test('all sections are finishable without deaths at normal, fast, and slow speeds', () => {
  for (const mode of ['normal', 'fast', 'slow']) {
    const r = newRun();
    for (let i = 0; i < 120 * 90 && r.phase !== 'finished'; i++) {
      const hazard = Math.min(...OBSTACLES.filter(o => o.s > r.s - 1).map(o => o.s - o.d / 2), ...GAPS.filter(g => g.end > r.s).map(g => g.start));
      const distance = hazard - r.s;
      const jump = r.grounded && distance > 0 && distance < (mode === 'fast' ? 13 : mode === 'slow' ? 6.5 : 9.75);
      stepRun(r, { ...neutral, boost: mode === 'fast', slow: mode === 'slow', jump });
    }
    assert.equal(r.phase, 'finished', mode); assert.equal(r.deaths, 0, mode);
    assert.equal(r.checkpoint, 3); assert.equal(r.s, COURSE_LENGTH); assert.ok(r.time >= 25);
  }
});
test('collision resets to the last checkpoint and resumes automatically; collected items cannot be farmed', () => {
  const r = newRun(); r.checkpoint = 2; r.s = 389; r.y = 0; r.collected.add(2); r.coins = 1;
  let events = [];
  for (let i = 0; i < 20 && r.phase !== 'respawning'; i++) events = stepRun(r, neutral);
  assert.ok(events.includes('hit')); assert.equal(r.s, CHECKPOINTS[1] + 2);
  for (let i = 0; i < 121; i++) stepRun(r, neutral);
  assert.equal(r.phase, 'running'); assert.ok(r.s > CHECKPOINTS[1] + 2);
  assert.equal(r.deaths, 1); assert.ok(r.collected.has(2)); assert.equal(r.coins, 1);
});
test('short guest names and anonymous run validation reject malformed records', () => {
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) assert.ok(normalizeGuestName(generateGuestName(a, b)));
  assert.equal(normalizeGuestName('カゼマル'), 'カゼマル'); assert.equal(normalizeGuestName('a'), null); assert.equal(normalizeGuestName('<img>'), null);
  assert.equal(normalizeGuestName('ながすぎるなまえ'), null);
  const valid = { runId: '7a1f50bf-e51c-40da-8842-a4b6b33769ef', timeMs: 51000, input: 'touch', coins: 19, course: COURSE_ID };
  assert.ok(parseRun(valid, COURSE_ID)); assert.ok(parseRun({ ...valid, timeMs: 28000 }, COURSE_ID));
  for (const bad of [null, [], { ...valid, timeMs: NaN }, { ...valid, timeMs: 24999 }, { ...valid, coins: 61 }, { ...valid, runId: 'bad' }, { ...valid, input: 'bot' }, { ...valid, course: 'osaka-river-v2' }, { ...valid, course: undefined }]) assert.equal(parseRun(bad, COURSE_ID), null);
});
