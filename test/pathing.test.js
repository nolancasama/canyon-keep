import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP, KEEP, SPAWNS, WIDTH } from '../src/data/map.js';
import { isWalkable } from '../src/sim/grid.js';
import { rebuildFlow, nextStep } from '../src/sim/pathing.js';
import { spawnEnemy, stepEnemies } from '../src/sim/enemies.js';
import { createGame, crossing, structure, advance } from './helpers.js';

test('flow reaches the keep without ever selecting cliffs', () => {
  const state = createGame().state;
  rebuildFlow(state);
  let p = { ...SPAWNS[Math.floor(SPAWNS.length / 2)] };
  let steps = 0;
  while (!(p.x >= KEEP.x && p.x < KEEP.x + 3 && p.y >= KEEP.y && p.y < KEEP.y + 3) && steps++ < WIDTH * MAP.length) {
    p = nextStep(state, p.x, p.y);
    assert.ok(p, 'keep must be reachable from spawn');
    assert.equal(isWalkable(p.x, p.y), true);
  }
  assert.ok(steps < WIDTH * MAP.length);
});

test('breach cost makes a complete wall line route through the weaker wall', () => {
  const state = createGame().state;
  const points = crossing(8);
  const weak = points.at(-1);
  points.forEach(p => structure(state, 'wall', p.x, p.y, p.y === weak.y ? 1 : 200));
  rebuildFlow(state);
  let p = { x: 7, y: points[0].y };
  for (let i = 0; i < 50 && p.x < 8; i++) p = nextStep(state, p.x, p.y);
  assert.equal(p.x, 8);
  assert.equal(p.y, weak.y);
});

test('an attacker destroys a blocking wall then continues toward the keep', () => {
  const state = createGame().state;
  state.phase = 'siege';
  const points = crossing(8);
  const weak = points[Math.floor(points.length / 2)];
  points.forEach(p => structure(state, 'wall', p.x, p.y, p.y === weak.y ? 8 : 200));
  rebuildFlow(state);
  const enemy = spawnEnemy(state, 'foot', 7.5, weak.y + 0.5);
  advance(state, stepEnemies, 5);
  assert.ok(state.structures.some(s => s.type === 'wall' && s.destroyed));
  assert.ok(enemy.x > 9, `enemy continued: ${enemy.x}`);
});
