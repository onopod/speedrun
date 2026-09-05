import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, stepRun, STEP, OBSTACLES, GAPS, CHECKPOINTS, COURSE_LENGTH } from '../src/lib/autorun.ts';
import { generateGuestName, normalizeGuestName, parseRun } from '../src/lib/guest-rules.ts';
const neutral = { steer: 0, boost: false, slow: false, jump: false };

test('forward movement needs no input; holding S still moves forward', () => {
  for (const slow of [false, true]) {
    const r = newRun(); for (let i = 0; i < 120; i++) stepRun(r, { ...neutral, slow });
    assert.ok(r.s >= 9.9); assert.equal(r.phase, 'running');
  }
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
      const jump = r.grounded && distance > 0 && distance < (mode === 'fast' ? 10 : mode === 'slow' ? 5 : 7.5);
      stepRun(r, { ...neutral, boost: mode === 'fast', slow: mode === 'slow', jump });
    }
    assert.equal(r.phase, 'finished', mode); assert.equal(r.deaths, 0, mode);
    assert.equal(r.checkpoint, 3); assert.equal(r.s, COURSE_LENGTH); assert.ok(r.time >= 30);
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
  const valid = { runId: '7a1f50bf-e51c-40da-8842-a4b6b33769ef', timeMs: 51000, input: 'touch', coins: 19 };
  assert.ok(parseRun(valid));
  for (const bad of [null, [], { ...valid, timeMs: NaN }, { ...valid, timeMs: 29999 }, { ...valid, coins: 61 }, { ...valid, runId: 'bad' }, { ...valid, input: 'bot' }]) assert.equal(parseRun(bad), null);
});
