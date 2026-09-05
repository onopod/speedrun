import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, CLASSIC_COURSE, findCourse, getCollectionRoute, newRun, stepRun, STEP, guideInput, routeX, hillSpeedFactor, coursePoint } from '../src/lib/autorun.ts';
import { parseRun } from '../src/lib/guest-rules.ts';
import { spaceAction } from '../src/lib/run-keyboard.ts';

const neutral = { steer: 0, jump: false, boost: false, slow: false };
test('eight distinct unlocked layouts have graded difficulty and continuous terrain', () => {
  assert.equal(COURSES.length, 8); assert.equal(new Set(COURSES.map(c => c.id)).size, 8);
  assert.equal(new Set(COURSES.map(c => JSON.stringify([c.obstacles, c.gaps, c.curve, c.elevation]))).size, 8);
  assert.equal(findCourse('unknown'), undefined); assert.equal(findCourse(CLASSIC_COURSE.id), CLASSIC_COURSE);
  for (const c of COURSES) {
    assert.ok(c.difficulty >= 1 && c.difficulty <= 5); assert.equal(c.checkpoints.length, 3);
    for (const s of c.checkpoints) assert.ok(s > 0 && s < c.length && !c.gaps.some(g => s + 2 > g.start && s + 2 < g.end));
    for (let s = 0; s < c.length; s += .5) {
      const a = coursePoint(s, c), b = coursePoint(s + .001, c);
      assert.ok(Object.values(a).every(Number.isFinite)); assert.ok(Math.abs(a.y - b.y) < .01 && Math.abs(a.x - b.x) < .01);
    }
  }
});
for (const c of COURSES) test(`${c.name}: all 60 stars with timing tolerance, plus accelerated/braking clear`, () => {
  const route = getCollectionRoute(c); assert.equal(route.items.length, 60);
  for (const offset of [-1, 0, 1]) {
    const r = newRun(); let next = 0, hold = 0;
    while (r.phase !== 'finished' && r.time < 110) {
      if (next < route.launches.length && r.s >= route.launches[next].s + offset && r.grounded) { hold = .32; next++; }
      stepRun(r, { ...neutral, targetX: routeX(r.s, c), jump: hold > 0 }, STEP, route.items, c); hold -= STEP;
    }
    assert.equal(r.phase, 'finished'); assert.equal(r.s, c.length); assert.equal(r.coins, 60); assert.equal(r.deaths, 0); assert.equal(r.checkpoint, 3);
    assert.ok(parseRun({ runId: '7a1f50bf-e51c-40da-8842-a4b6b33769ef', timeMs: r.time * 1000, input: 'keyboard', coins: r.coins, course: c.id }));
  }
  for (const mode of ['fast', 'slow']) {
    const r = newRun();
    while (r.phase !== 'finished' && r.time < 110) stepRun(r, { ...guideInput(r, c), boost: mode === 'fast', slow: mode === 'slow' }, STEP, route.items, c);
    assert.equal(r.phase, 'finished', mode); assert.equal(r.deaths, 0, mode);
  }
  // The existing database's 25-second score floor remains valid for every course,
  // even with held acceleration and all six maximum-duration star boosts.
  let effort = 0; for (let s = 0; s < c.length; s += .1) effort += .1 / hillSpeedFactor(s, c);
  assert.ok((effort - 2.6 * 6 * 2.2) / 20.8 > 25);
  const crashed = newRun(); crashed.checkpoint = 2; crashed.s = c.checkpoints[1] + 20; crashed.y = -6; crashed.grounded = false;
  assert.ok(stepRun(crashed, neutral, STEP, route.items, c).includes('hit')); assert.equal(crashed.s, c.checkpoints[1] + 2);
  for (let i = 0; i < 110; i++) stepRun(crashed, neutral, STEP, route.items, c);
  assert.equal(crashed.phase, 'running'); assert.equal(crashed.deaths, 1);
});
test('course records stay separate and unknown course IDs are rejected', () => {
  const base = { runId: '7a1f50bf-e51c-40da-8842-a4b6b33769ef', timeMs: 60000, input: 'touch', coins: 60 };
  for (const c of COURSES) { assert.equal(parseRun({ ...base, course: c.id }).course, c.id); }
  assert.equal(parseRun({ ...base, course: 'made-up' }), null); assert.equal(parseRun(base), null);
  assert.equal(parseRun({ ...base, course: COURSES[1].id }, COURSES[0].id), null);
});
test('Space starts/restarts only outside pause and after the result action is visible', () => {
  assert.equal(spaceAction('ready', false, 0, false, false), 'start');
  assert.equal(spaceAction('finished', false, 2.8, false, false), 'start');
  assert.equal(spaceAction('finished', false, 2.79, false, false), 'none');
  assert.equal(spaceAction('running', false, 0, false, false), 'jump');
  for (const phase of ['ready', 'running', 'finished']) {
    assert.equal(spaceAction(phase, true, 10, false, false), 'none');
    assert.equal(spaceAction(phase, false, 10, true, false), 'none');
    assert.equal(spaceAction(phase, false, 10, false, true), 'none');
  }
});
