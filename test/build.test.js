import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { MAP, KEEP, SITES } from '../src/data/map.js';
import { structureAt, tileAt } from '../src/sim/grid.js';
import { capacity, repairCost } from '../src/sim/build.js';
import { createGame, tileOf, crossing } from './helpers.js';

test('terrain, occupancy, spawn buffer, and tower integration constrain placement', () => {
  const game = createGame();
  for (const kind of ['#', ',']) {
    const { x, y } = tileOf(kind);
    assert.equal(game.api.place('wall', x, y).ok, false);
  }
  assert.equal(game.api.place('wall', KEEP.x, KEEP.y).ok, false);
  const sy = MAP.findIndex(row => row[0] === 'S');
  assert.equal(game.api.place('wall', 2, sy).ok, false);
  const floor = crossing(8).find(p => tileAt(p.x, p.y) === '.' && tileAt(p.x - 1, p.y) === '.');
  assert.ok(floor);
  assert.equal(game.api.place('tower', floor.x, floor.y).ok, false);
  assert.equal(game.api.place('wall', floor.x - 1, floor.y).ok, true);
  assert.equal(game.api.place('tower', floor.x, floor.y).ok, true);
  assert.equal(game.api.demolish(floor.x - 1, floor.y).ok, false);
  assert.equal(game.api.place('wall', floor.x, floor.y).ok, false);
  const castle = tileOf('C');
  assert.equal(game.api.place('tower', castle.x, castle.y).ok, true);
});

test('a sealed line requires an open trade-road gate; enemies still see the gate structure', () => {
  const game = createGame();
  const points = crossing(5);
  assert.ok(points.length >= 3 && points.every(p => tileAt(p.x, p.y) === '.'));
  for (const p of points.slice(0, -1)) assert.equal(game.api.place('wall', p.x, p.y).ok, true);
  const last = points.at(-1);
  const blocked = game.api.place('wall', last.x, last.y);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /trade road/i);
  assert.equal(game.api.place('gate', last.x, last.y).ok, true);
  assert.equal(structureAt(game.state, last.x, last.y).type, 'gate');
});

test('line previews simulate sequential spending and release stops at available gold', () => {
  const game = createGame();
  const start = tileOf('C');
  game.state.gold = CONFIG.structures.wall.cost * 2;
  const preview = game.api.previewLine('wall', start.x, start.y, start.x + 4, start.y);
  assert.ok(preview);
  game.api.placeLine('wall', start.x, start.y, start.x + 4, start.y);
  assert.equal(game.state.structures.filter(s => s.type === 'wall').length, 2);
  assert.equal(game.state.gold, 0);
});

test('damaged demolition refunds and prep repairs use specified rounding', () => {
  const game = createGame();
  const p = tileOf('C');
  assert.equal(game.api.place('wall', p.x, p.y).ok, true);
  const wall = structureAt(game.state, p.x, p.y);
  wall.hp = 81;
  const expected = Math.ceil(wall.cost * 0.5 * (1 - wall.hp / wall.maxHp));
  assert.equal(repairCost(wall), expected);
  const gold = game.state.gold;
  assert.equal(game.api.repair(p.x, p.y).ok, true);
  assert.equal(game.state.gold, gold - expected);
  assert.equal(wall.hp, wall.maxHp);
  wall.hp = 81;
  const refund = Math.round(wall.cost * 0.75 * wall.hp / wall.maxHp);
  const before = game.state.gold;
  assert.equal(game.api.demolish(p.x, p.y).ok, true);
  assert.equal(game.state.gold, before + refund);
});

test('capacity, prep-only construction, and one pendulum are enforced', () => {
  const game = createGame();
  assert.equal(capacity(game.state).housing, 6);
  assert.equal(capacity(game.state).food, 6);
  game.state.population = 7;
  assert.equal(game.api.startSiege().ok, false);
  game.state.population = 6;
  assert.equal(game.api.place('pendulum', SITES[0].x, SITES[0].y).ok, true);
  assert.equal(game.api.place('pendulum', SITES[1].x, SITES[1].y).ok, false);
  assert.equal(game.api.startSiege().ok, true);
  const p = tileOf('C');
  assert.equal(game.api.place('wall', p.x, p.y).ok, false);
  assert.equal(game.api.demolish(SITES[0].x, SITES[0].y).ok, false);
});
