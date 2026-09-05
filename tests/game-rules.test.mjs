import test from 'node:test';
import assert from 'node:assert/strict';
import { hitsSweeper, canLand, parseScore } from '../src/lib/game-rules.ts';

test('rotating collision follows the visible bar', () => {
  assert.equal(hitsSweeper(3, 0, 0, 9, 1.2), true);
  assert.equal(hitsSweeper(3, 0, Math.PI / 2, 9, 1.2), false);
  assert.equal(hitsSweeper(0, 3, Math.PI / 2, 9, 1.2), true);
  assert.equal(hitsSweeper(0, 0, 0, 9, 2.5), false);
});
test('landing cannot teleport a player up from beneath a platform', () => {
  assert.equal(canLand(1.3, 1.1, -2, true), true);
  assert.equal(canLand(-2, -3, -2, true), false);
  assert.equal(canLand(1.3, 1.1, -2, false), false);
});
test('invalid score payloads are rejected without exceptions', () => {
  for (const value of [null, [], 'x', {}, {name:'a',timeMs:NaN,input:'keyboard'}, {name:'a',timeMs:1000,input:'keyboard'}, {name:'a',timeMs:20000,input:'bad'}]) assert.equal(parseScore(value), null);
  assert.deepEqual(parseScore({name:' Ａ太郎! ',timeMs:20000.4,input:'gamepad'}), {playerName:'A太郎',timeMs:20000,inputType:'gamepad'});
});
