import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, stepRun, STEP, OBSTACLES, GAPS, ITEMS, CHECKPOINTS, COURSE_LENGTH, COURSE_ID, JUMP_SPEED, JUMP_HEIGHTS, GRAVITY, FALL_GRAVITY, MEDIUM_HOLD, LARGE_HOLD, LOOK_DURATION, airborneMotion, headLookYaw, jumpLevelForHold, slideTarget } from '../src/lib/autorun.ts';
import { generateGuestName, normalizeGuestName, parseRun } from '../src/lib/guest-rules.ts';
import { createRunner } from '../src/lib/runner-model.ts';
const neutral = { steer: 0, boost: false, slow: false, jump: false };

test('every forward speed is exactly 1.3 times the prior release', () => {
  for (const [input, item, expected] of [[neutral, false, 15.6], [{ ...neutral, slow: true }, false, 13], [{ ...neutral, boost: true }, false, 20.8], [neutral, true, 23.4]]) {
    const r = newRun(); if (item) r.boost = 2;
    for (let i = 0; i < 120; i++) stepRun(r, input);
    assert.ok(Math.abs(r.s - expected) < 1e-8); assert.equal(r.phase, 'running');
  }
});
test('held forward/back selects only one speed, release restores normal and opposite inputs cancel', () => {
  for (const [input, speed] of [[{ ...neutral, boost: true }, 20.8], [{ ...neutral, slow: true }, 13]]) {
    const r = newRun();
    for (let i = 0; i < 60; i++) { stepRun(r, input); assert.ok(Math.abs(r.speed - speed) < 1e-9); }
    stepRun(r, neutral); assert.ok(Math.abs(r.speed - 15.6) < 1e-9);
    stepRun(r, { ...neutral, boost: true, slow: true }); assert.ok(Math.abs(r.speed - 15.6) < 1e-9);
  }
  const r = newRun(); r.boost = 2;
  stepRun(r, { ...neutral, slow: true }); assert.equal(r.speed, 13);
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
test('tap/medium/long hold produces three distinct heights and distances with immediate takeoff', () => {
  const distances = [];
  for (const [holdFrames, level] of [[1, 1], [18, 2], [40, 3]]) {
    const r = newRun(); let max = 0, landedAt = 0;
    for (let i = 0; i < 180; i++) {
      const events = stepRun(r, { ...neutral, jump: i < holdFrames }); max = Math.max(max, r.y);
      if (i === 0) assert.ok(r.y > 0);
      if (events.includes('land')) { landedAt = r.s; break; }
    }
    assert.equal(r.jumpLevel, level); assert.ok(Math.abs(max - JUMP_HEIGHTS[level - 1]) < .015, `${level}: ${max}`);
    assert.ok(landedAt > 0); distances.push(landedAt);
  }
  assert.ok(distances[1] > distances[0] + 2); assert.ok(distances[2] > distances[1] + 3);
  assert.equal(jumpLevelForHold(MEDIUM_HOLD - .001), 1); assert.equal(jumpLevelForHold(MEDIUM_HOLD), 2);
  assert.equal(jumpLevelForHold(LARGE_HOLD - .001), 2); assert.equal(jumpLevelForHold(LARGE_HOLD), 3);
});
test('a queued quick tap stays small and holding through landing never auto-jumps', () => {
  const tap = newRun(); stepRun(tap, { ...neutral, jumpPressed: true });
  let max = tap.y;
  for (let i = 0; i < 100; i++) { stepRun(tap, neutral); max = Math.max(max, tap.y); }
  assert.equal(tap.jumpLevel, 1); assert.ok(max < 1.51 && max > 1.49);
  const held = newRun(); let jumps = 0;
  for (let i = 0; i < 180; i++) jumps += Number(stepRun(held, { ...neutral, jump: true }).includes('jump'));
  assert.equal(jumps, 1); assert.equal(held.grounded, true);
  stepRun(held, neutral); assert.ok(stepRun(held, { ...neutral, jump: true }).includes('jump'));
});
test('all sections are finishable without deaths at normal, fast, and slow speeds', () => {
  for (const mode of ['normal', 'fast', 'slow']) {
    const r = newRun(); let holdUntil = 0;
    for (let i = 0; i < 120 * 90 && r.phase !== 'finished'; i++) {
      const hazard = Math.min(...OBSTACLES.filter(o => o.s > r.s - 1).map(o => o.s - o.d / 2), ...GAPS.filter(g => g.end > r.s).map(g => g.start));
      const distance = hazard - r.s;
      if (r.grounded && distance > 0 && distance < (mode === 'fast' ? 13 : mode === 'slow' ? 6.5 : 9.75)) holdUntil = i + 35;
      const jump = i < holdUntil;
      stepRun(r, { ...neutral, boost: mode === 'fast', slow: mode === 'slow', jump });
    }
    assert.equal(r.phase, 'finished', mode); assert.equal(r.deaths, 0, mode);
    assert.equal(r.checkpoint, 3); assert.equal(r.s, COURSE_LENGTH); assert.ok(r.time >= 25);
  }
});
test('missing an item triggers a brief glance toward it; collection and cooldown suppress false glances', () => {
  for (const x of [-4, 0]) {
    const r = newRun(); r.x = x; r.s = ITEMS[0].s + .8;
    assert.ok(stepRun(r, neutral).includes('miss'));
    assert.equal(r.lookDirection, x < ITEMS[0].x ? -1 : 1);
    assert.equal(Math.abs(headLookYaw(r)), 0);
    r.lookTime = LOOK_DURATION - .2; assert.ok(Math.abs(headLookYaw(r)) > 1.4);
    r.lookTime = .01; assert.ok(Math.abs(headLookYaw(r)) < .01);
    r.lookTime = 0; assert.equal(Math.abs(headLookYaw(r)), 0);
    r.s = ITEMS[1].s + .8; assert.ok(!stepRun(r, neutral).includes('miss'));
  }
  const collected = newRun(); collected.collected.add(0); collected.s = ITEMS[0].s + .8;
  assert.ok(!stepRun(collected, neutral).includes('miss'));
});
test('glance animation changes only the head bone, leaving the running body facing forward', () => {
  const runner = createRunner(); runner.animate(1, true, false, 0, 15.6);
  const rotations = [];
  runner.root.traverse(o => rotations.push([o, o.rotation.clone()]));
  runner.animate(1, true, false, 0, 15.6, 1.5);
  for (const [object, rotation] of rotations) {
    if (object.name === 'head') assert.equal(object.rotation.y, 1.5);
    else assert.ok(object.rotation.equals(rotation), object.name);
  }
  runner.animate(1, true, false, 0, 15.6, 0); assert.equal(runner.root.getObjectByName('head').rotation.y, 0);
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
