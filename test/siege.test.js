import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame } from './helpers.js';
import { REFERENCE_BUILD, applyReferenceBuild } from './fixtures/reference-build.js';
import { CONFIG } from '../src/config.js';

function simulateReference() {
  const game = createGame(123456);
  applyReferenceBuild(game);
  assert.equal(game.api.startSiege().ok, true);
  game.api.stepSeconds(420);
  return game;
}
function diagnosis(state) {
  return JSON.stringify({ phase: state.phase, time: state.time, keep: state.structures[0].hp,
    boss: state.enemies.find(e => e.type === 'boss'), stats: state.stats,
    living: state.enemies.filter(e => e.hp > 0).map(e => ({ type: e.type, hp: e.hp, x: e.x, y: e.y, target: e.attackTargetId })),
    breaches: state.eventLog.filter(e => e.type === 'structureDestroyed' || e.type === 'bossSlam'),
    towers: state.structures.filter(s => s.type === 'tower').map(s => ({ x: s.x, y: s.y, hp: s.hp })) });
}

test('retry restores the exact full preparation snapshot and replay starts identically', () => {
  const game = createGame(123);
  applyReferenceBuild(game);
  const before = structuredClone(game.state);
  assert.equal(game.api.startSiege().ok, true);
  game.api.stepSeconds(2);
  const replay = structuredClone(game.state);
  assert.equal(game.api.retrySiege(), true);
  assert.deepEqual(game.state, before);
  assert.equal(game.api.startSiege().ok, true);
  game.api.stepSeconds(2);
  assert.deepEqual(game.state, replay);
  assert.equal(game.api.setSpeed(4), true);
  assert.equal(game.api.setSpeed(3), false);
  assert.equal(game.api.setSpeed(0), true);
  game.api.restartCampaign();
  assert.deepEqual(game.state, createGame(123).state);
});

test('headless Siege 1: a sensible build wins, survives a breach, and is deterministic', () => {
  const game = simulateReference();
  const state = game.state;
  console.log(`Siege 1 reference: structuresDestroyed=${state.stats.buildingsDestroyed}, keepDamage=${CONFIG.structures.keep.hp - state.structures[0].hp}`);
  assert.equal(state.phase, 'victory', diagnosis(state));
  assert.equal(state.stats.bossDefeated, true);
  assert.equal(state.stats.enemiesDefeated, 46);
  assert.ok(state.structures.some(s => s.destroyed), 'reference build should have breach drama');
  assert.ok(CONFIG.startingGold - state.snapshot.gold <= 1000);
  assert.ok(REFERENCE_BUILD.length >= 5);
  const other = simulateReference();
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(hash(state.eventLog), hash(other.state.eventLog));
  assert.deepEqual(state, other.state);
  assert.equal(new Set(state.eventLog.map(e => e.id)).size, state.eventLog.length);
  const restored = structuredClone(state.snapshot);
  assert.equal(game.api.retrySiege(), true);
  assert.deepEqual(game.state, restored);
});

test('headless Siege 1: an empty build loses', () => {
  const game = createGame(123456);
  assert.equal(game.api.startSiege().ok, true);
  game.api.stepSeconds(420);
  assert.equal(game.state.phase, 'defeat', diagnosis(game.state));
  assert.ok(game.state.structures[0].hp === 0 || game.state.inhabitants.every(p => p.hp === 0));
  assert.equal(game.state.eventLog.filter(e => e.type === 'keepReached').length, 1);
});
