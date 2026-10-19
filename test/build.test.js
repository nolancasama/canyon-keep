import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { MAP, KEEP, SITES } from '../src/data/map.js';
import { damageStructure, structureAt, tileAt } from '../src/sim/grid.js';
import { capacity, repairCost } from '../src/sim/build.js';
import { nextStep, rebuildFlow } from '../src/sim/pathing.js';
import { createGame, tileOf, crossing } from './helpers.js';

test('terrain, occupancy, spawn buffer, and tower integration constrain placement', () => {
  const game = createGame();
  const cliff = tileOf('#');
  assert.equal(game.api.place('wall', cliff.x, cliff.y).ok, false);
  // Former rocky ledges are ordinary buildable canyon floor.
  assert.equal(game.api.place('wall', 8, 8).ok, true);
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

test('sealed construction is allowed, blocks siege start, and a replacement gate restores readiness', () => {
  const game = createGame();
  const points = crossing(5);
  assert.ok(points.length >= 3 && points.every(p => tileAt(p.x, p.y) === '.'));
  for (const p of points.slice(0, -1)) assert.equal(game.api.place('wall', p.x, p.y).ok, true);
  const last = points.at(-1);
  assert.equal(game.api.place('wall', last.x, last.y).ok, true);
  assert.equal(game.api.canStart().ok, false);
  assert.equal(game.api.readiness().find(r => r.id === 'tradeRoad').ok, false);
  const before = JSON.stringify(game.state);
  assert.equal(game.api.startSiege().ok, false);
  assert.equal(JSON.stringify(game.state), before);
  assert.equal(game.api.place('gate', last.x, last.y).ok, true);
  assert.equal(structureAt(game.state, last.x, last.y).type, 'gate');
  assert.equal(game.api.readiness().every(r => r.ok), true);
  assert.equal(game.api.startSiege().ok, true);
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

test('an already blocked road does not prohibit any ordinary construction tool', () => {
  for (const type of ['wall', 'barricade', 'tower', 'house', 'farm']) {
    const game = createGame();
    for (const {x,y} of crossing(5)) assert.equal(game.api.place('wall', x, y).ok, true);
    assert.equal(game.api.readiness().find(r => r.id === 'tradeRoad').ok, false);
    assert.equal(game.api.preview(type, 52, 10).valid, true);
    assert.equal(game.api.place(type, 52, 10).ok, true);
  }
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
  const refund = Math.round(wall.paidCost * wall.hp / wall.maxHp);
  const before = game.state.gold;
  assert.equal(game.api.demolish(p.x, p.y).ok, true);
  assert.equal(game.state.gold, before + refund);
});

test('needed houses and farms are free at placement, while surplus buildings retain normal prices', () => {
  const game = createGame();
  game.state.population = 14;
  for (const [type, locations, price, finalCapacity] of [
    ['house', [[52,10], [55,10], [58,10]], 80, 18],
    ['farm', [[52,13], [55,13], [58,13]], 70, 24],
  ]) {
    const initialGold = game.state.gold;
    for (const [index, [x, y]] of locations.entries()) {
      const expected = index < 2 ? 0 : price;
      assert.equal(game.api.price(type), expected);
      assert.equal(game.api.preview(type, x, y).cost, expected);
      const result = game.api.place(type, x, y);
      assert.equal(result.ok, true);
      assert.equal(result.structure.paidCost, expected);
      assert.equal(result.structure.cost, CONFIG.structures[type].cost, 'repair retains base price');
    }
    assert.equal(game.state.gold, initialGold - price);
    assert.equal(game.api.capacity()[type === 'house' ? 'housing' : 'food'], finalCapacity);
  }
  assert.equal(game.api.canStart().ok, true);
});

test('damaged civilian buildings still provide capacity; destroyed ones become free to replace', () => {
  for (const type of ['house', 'farm']) {
    const game = createGame();
    game.state.population = 10;
    const result = game.api.place(type, 52, 10);
    assert.equal(result.ok, true);
    const building = result.structure;
    building.hp = 1;
    assert.equal(game.api.price(type), CONFIG.structures[type].cost);
    assert.equal(repairCost(building), Math.ceil(building.cost * CONFIG.repairRate * (building.maxHp - 1) / building.maxHp));
    damageStructure(game.state, building, 1);
    assert.equal(game.api.price(type), 0);
    assert.equal(game.api.capacity()[type === 'house' ? 'housing' : 'food'], 6);
    assert.equal(game.api.canStart().ok, false);
    assert.equal(game.api.place(type, 52, 10).structure.paidCost, 0);
  }
});

test('free civilian buildings can be moved repeatedly without spending or generating gold', () => {
  const game = createGame();
  game.state.population = 10;
  const initial = game.state.gold;
  for (const type of ['house', 'farm']) for (const [x, y] of [[52,10], [55,13], [58,10]]) {
    assert.equal(game.api.place(type, x, y).ok, true);
    assert.equal(structureAt(game.state, x, y).paidCost, 0);
    assert.equal(game.api.demolish(x, y).refund, 0);
    assert.equal(game.state.gold, initial);
  }
});

test('required civilian infrastructure can be built with an empty treasury', () => {
  const game = createGame();
  game.state.population = 10;
  game.state.gold = 0;
  assert.equal(game.api.place('house', 52, 10).ok, true);
  assert.equal(game.api.place('farm', 55, 10).ok, true);
  assert.equal(game.state.gold, 0);
  assert.equal(game.api.canStart().ok, true);
  assert.equal(game.api.preview('house', 58, 10).valid, false);
  assert.equal(game.api.preview('farm', 58, 13).valid, false);
});

test('prep refunds return full paid wall/tower prices and half a damaged tower price', () => {
  for (const [type, fraction, expected] of [['wall',1,20], ['tower',1,120], ['tower',0.5,60]]) {
    const game = createGame();
    assert.equal(game.api.place(type, 52, 10).ok, true);
    const target = structureAt(game.state, 52, 10);
    target.hp *= fraction;
    const before = game.state.gold;
    assert.equal(game.api.demolish(52, 10).refund, expected);
    assert.equal(game.state.gold, before + expected);
  }
  const game = createGame();
  assert.equal(game.api.place('tower', 52, 10).ok, true);
  damageStructure(game.state, structureAt(game.state, 52, 10), 999);
  const before = game.state.gold;
  const result = game.api.demolish(52, 10);
  assert.equal(result.refund ?? 0, 0);
  assert.equal(game.state.gold, before, 'rubble never returns gold');
  const pendulumGame = createGame();
  assert.equal(pendulumGame.api.place('pendulum', SITES[0].x, SITES[0].y).ok, true);
  assert.equal(pendulumGame.api.demolish(SITES[0].x, SITES[0].y).refund, 400);
  assert.equal(pendulumGame.state.gold, CONFIG.startingGold);
});

test('gate replacement charges only the net cost and is atomic when unaffordable', () => {
  for (const gold of [40, 59]) {
    const game = createGame();
    assert.equal(game.api.place('wall', 52, 10).ok, true);
    game.state.gold = gold;
    assert.equal(game.api.preview('gate', 52, 10).cost, 40);
    const result = game.api.place('gate', 52, 10);
    assert.equal(result.ok, true);
    assert.equal(game.state.gold, gold - 40);
    const gate = structureAt(game.state, 52, 10);
    assert.equal(gate.type, 'gate');
    assert.equal(gate.hp, gate.maxHp);
    assert.equal(gate.paidCost, 60);
    assert.equal(game.api.demolish(52, 10).refund, 60);
    assert.equal(game.state.gold, gold + 20, 'recoverable original wall value is retained');
  }
  const game = createGame();
  assert.equal(game.api.place('wall', 52, 10).ok, true);
  game.state.gold = 39;
  const before = JSON.stringify(game.state);
  assert.equal(game.api.preview('gate', 52, 10).valid, false);
  assert.equal(game.api.place('gate', 52, 10).ok, false);
  assert.equal(JSON.stringify(game.state), before);
});

test('wall replacement refunds intact gates and charges for damaged gates', () => {
  for (const [fraction, expectedCost, expectedDelta] of [[1, -40, 40], [0.5, -10, 10]]) {
    const game = createGame();
    assert.equal(game.api.place('gate', 52, 10).ok, true);
    const gate = structureAt(game.state, 52, 10);
    gate.hp *= fraction;
    const before = game.state.gold;
    const preview = game.api.preview('wall', 52, 10);
    assert.equal(preview.valid, true);
    assert.equal(preview.cost, expectedCost);
    assert.equal(game.api.place('wall', 52, 10).ok, true);
    assert.equal(game.state.gold, before + expectedDelta);
    const wall = structureAt(game.state, 52, 10);
    assert.equal(wall.type, 'wall');
    assert.equal(wall.paidCost, CONFIG.structures.wall.cost);
  }
});

test('wall and gate drag lines replace their counterpart, skip their own type, and stop before an unaffordable tile', () => {
  const game = createGame();
  assert.equal(game.api.place('wall', 53, 10).ok, true);
  assert.equal(game.api.place('gate', 54, 10).ok, true);
  const before = game.state.gold;
  const preview = game.api.previewLine('wall', 52, 10, 55, 10);
  assert.equal(preview.cost, 0, 'floor costs offset the intact-gate refund');
  assert.equal(game.api.placeLine('wall', 52, 10, 55, 10).placed, 3);
  assert.equal(game.state.gold, before);
  for (let x = 52; x <= 55; x++) assert.equal(structureAt(game.state, x, 10).type, 'wall');

  const limited = createGame();
  assert.equal(limited.api.place('wall', 52, 10).ok, true);
  assert.equal(limited.api.place('wall', 53, 10).ok, true);
  limited.state.gold = 50;
  const result = limited.api.placeLine('gate', 52, 10, 54, 10);
  assert.equal(result.placed, 1);
  assert.equal(structureAt(limited.state, 52, 10).type, 'gate');
  assert.equal(structureAt(limited.state, 53, 10).type, 'wall', 'the unaffordable replacement is untouched');
  assert.equal(structureAt(limited.state, 54, 10), null, 'the line stops after the failed tile');
  assert.equal(limited.state.gold, 10);
});

test('gate-to-wall replacement may seal the road and readiness reports the blockage', () => {
  const game = createGame();
  const points = crossing(5);
  for (const point of points) assert.equal(game.api.place('wall', point.x, point.y).ok, true);
  const gatePoint = points[2];
  assert.equal(game.api.place('gate', gatePoint.x, gatePoint.y).ok, true);
  assert.equal(game.api.readiness().find(r => r.id === 'tradeRoad').ok, true);
  assert.equal(game.api.place('wall', gatePoint.x, gatePoint.y).ok, true);
  assert.equal(game.api.readiness().find(r => r.id === 'tradeRoad').ok, false);
});

test('damaged-wall replacement uses HP-scaled refund and leaves neighbours and tower support intact', () => {
  const game = createGame();
  const floor = crossing(8).find(p => tileAt(p.x, p.y) === '.' && tileAt(p.x - 1, p.y) === '.');
  assert.ok(floor);
  assert.equal(game.api.place('wall', floor.x - 1, floor.y).ok, true);
  assert.equal(game.api.place('tower', floor.x, floor.y).ok, true);
  const wall = structureAt(game.state, floor.x - 1, floor.y);
  wall.hp = wall.maxHp / 2;
  const neighbour = JSON.stringify(structureAt(game.state, floor.x, floor.y));
  const gold = game.state.gold;
  assert.equal(game.api.preview('gate', wall.x, wall.y).cost, 50);
  assert.equal(game.api.place('gate', wall.x, wall.y).ok, true);
  assert.equal(game.state.gold, gold - 50);
  assert.equal(JSON.stringify(structureAt(game.state, floor.x, floor.y)), neighbour);
  assert.equal(game.api.demolish(wall.x, wall.y).ok, false, 'gate continues supporting the canyon tower');
  assert.equal(game.api.place('gate', floor.x, floor.y).ok, false, 'only walls can be replaced');
});

test('replacement refreshes occupancy and invalidates the breach-cost flow field', () => {
  const game = createGame();
  const points = crossing(5);
  for (const p of points) assert.equal(game.api.place('wall', p.x, p.y).ok, true);
  const wall = structureAt(game.state, points[2].x, points[2].y);
  const oldFlow = rebuildFlow(game.state);
  const oldDistances = [...oldFlow.distances];
  assert.equal(game.api.place('gate', wall.x, wall.y).ok, true);
  const gate = structureAt(game.state, wall.x, wall.y);
  assert.equal(gate.type, 'gate');
  assert.notEqual(gate.id, wall.id);
  assert.equal(game.state.structures.some(s => s.id === wall.id && !s.destroyed), false);
  assert.ok(game.state.flowRevision > oldFlow.revision);
  nextStep(game.state, 3, points[2].y);
  assert.equal(game.state.flow.revision, game.state.flowRevision);
  assert.notDeepEqual(game.state.flow.distances, oldDistances);
});

test('seeded intact place/demolish/replace sequences conserve gold plus recoverable paid value', () => {
  const game = createGame();
  game.state.population = 14;
  const slots = [[52,10], [55,10], [58,10], [52,13], [55,13], [58,13]];
  const total = () => game.state.gold + game.state.structures.filter(s => !s.destroyed && s.hp > 0)
    .reduce((sum, s) => sum + Math.round((s.paidCost ?? s.cost) * s.hp / s.maxHp), 0);
  const initial = total();
  let seed = 0x51e9;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 0x100000000 * n); };
  const actions = { place: 0, demolish: 0, replace: 0 };
  for (let i = 0; i < 400; i++) {
    const [x, y] = slots[random(slots.length)];
    const existing = structureAt(game.state, x, y);
    if (!existing) {
      const type = ['wall', 'tower', 'house', 'farm', 'barricade'][random(5)];
      if (game.api.place(type, x, y).ok) actions.place++;
    } else if (existing.type === 'wall' && random(2) === 0) {
      if (game.api.place('gate', x, y).ok) actions.replace++;
    } else if (game.api.demolish(x, y).ok) actions.demolish++;
    assert.equal(total(), initial, `recoverable value after action ${i}`);
  }
  for (const count of Object.values(actions)) assert.ok(count > 0, 'sequence exercises each action');
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
