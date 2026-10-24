import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { MAP, KEEP, SITES } from '../src/data/map.js';
import { blockingAt, damageStructure, structureAt, tileAt } from '../src/sim/grid.js';
import { spawnEnemy, stepEnemies } from '../src/sim/enemies.js';
import { capacity, repairCost } from '../src/sim/build.js';
import { nextStep, rebuildFlow } from '../src/sim/pathing.js';
import { settlementOutside } from '../src/sim/settlement.js';
import { createGame, tileOf, crossing, structure } from './helpers.js';

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
  for (const type of ['wall', 'barricade', 'tower']) {
    const game = createGame();
    game.state.population = 14;
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

test('civilian construction is unavailable to player placement, previews, and drag tools', () => {
  for (const type of ['house', 'farm']) for (const population of [6, 14]) {
    const game = createGame();
    game.state.population = population;
    const before = structuredClone(game.state);
    const preview = game.api.preview(type, 52, 10);
    assert.equal(preview.valid, false);
    assert.match(preview.reason, /settlement|civilian|authority|automatic/i);
    assert.equal(game.api.place(type, 52, 10).ok, false);
    const line = game.api.placeLine(type, 52, 10, 55, 10);
    assert.equal(line.ok, false);
    assert.match(line.reason, /settlement|civilian|authority|automatic/i);
    assert.deepEqual(game.state, before);
  }
});

test('civilian buildings and keep resist all player demolition, repair, and replacement tools', () => {
  for (const type of ['house', 'farm', 'keep']) for (const destroyed of [false, true]) {
    const game = createGame();
    const target = type === 'keep' ? game.state.structures[0] : structure(game.state, type, 52, 10);
    target.hp = 1;
    if (destroyed) damageStructure(game.state, target, 1);
    const before = structuredClone(game.state);
    assert.equal(game.api.demolish(target.x, target.y).ok, false);
    assert.equal(game.api.repair(target.x, target.y).ok, false);
    for (const replacement of ['wall', 'gate', 'tower', 'barricade']) {
      assert.equal(game.api.preview(replacement, target.x, target.y).valid, false);
      assert.equal(game.api.place(replacement, target.x, target.y).ok, false);
    }
    assert.deepEqual(game.state, before);
  }
});

test('repair all charges for military repairs only and leaves civilian buildings and keep untouched', () => {
  const game = createGame(), keep = game.state.structures[0];
  const house = structure(game.state, 'house', 52, 10, 1);
  const farm = structure(game.state, 'farm', 55, 10, 1);
  keep.hp -= 100;
  assert.equal(game.api.place('tower', 52, 13).ok, true);
  const tower = structureAt(game.state, 52, 13);
  tower.hp = 1;
  const cost = repairCost(tower), gold = game.state.gold;
  assert.equal(game.api.repairCost(), cost);
  game.api.repairAll();
  assert.equal(game.state.gold, gold - cost);
  assert.equal(tower.hp, tower.maxHp);
  assert.equal(house.hp, 1);
  assert.equal(farm.hp, 1);
  assert.equal(keep.hp, keep.maxHp - 100);
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

test('ordinary wall-to-tower replacement charges the health-adjusted net cost exactly once', () => {
  for (const [fraction, refund, cost] of [[1, 20, 100], [0.5, 10, 110]]) {
    const game = createGame();
    assert.equal(game.api.place('wall', 52, 10).ok, true);
    const old = structureAt(game.state, 52, 10);
    old.hp *= fraction;
    const index = game.state.structures.indexOf(old), count = game.state.structures.length;
    game.state.gold = cost;
    const preview = game.api.preview('tower', 52, 10);
    assert.equal(preview.valid, true);
    assert.equal(preview.replacement, true);
    assert.equal(preview.replacedId, old.id);
    assert.equal(preview.replacedType, 'wall');
    assert.equal(preview.refund, refund);
    assert.equal(preview.cost, cost);
    assert.equal(game.api.place('tower', 52, 10).ok, true);
    const tower = structureAt(game.state, 52, 10);
    assert.equal(tower.type, 'tower');
    assert.equal(tower.paidCost, 120);
    assert.equal(tower.hp, tower.maxHp);
    assert.equal(game.state.gold, 0);
    assert.equal(game.state.structures.length, count);
    assert.equal(game.state.structures[index], tower, 'replacement keeps its structure-list slot');
    assert.equal(game.state.structures.some(s => s.id === old.id), false);
    const before = structuredClone(game.state);
    assert.equal(game.api.place('tower', 52, 10).ok, false);
    assert.equal(game.api.placeLine('tower', 52, 10, 54, 10).ok, false);
    assert.deepEqual(game.state, before, 'repeat clicks and drag cannot duplicate or credit the tower');
    assert.equal(game.api.demolish(52, 10).refund, 120);
    assert.equal(game.state.gold, 120, 'demolition refunds full tower paid value, without another wall refund');
  }
});

test('unaffordable wall-to-tower replacement leaves the wall and all state unchanged', () => {
  for (const [fraction, gold, cost] of [[1, 99, 100], [0.5, 109, 110]]) {
    const game = createGame();
    assert.equal(game.api.place('wall', 52, 10).ok, true);
    structureAt(game.state, 52, 10).hp *= fraction;
    game.state.gold = gold;
    const before = structuredClone(game.state);
    const preview = game.api.preview('tower', 52, 10);
    assert.equal(preview.valid, false);
    assert.equal(preview.cost, cost);
    assert.match(preview.reason, /gold/i);
    assert.equal(game.api.place('tower', 52, 10).ok, false);
    assert.deepEqual(game.state, before);
  }
});

test('tower replacements reject special walls, gates, towers and non-player ordinary walls atomically', () => {
  for (const type of ['gate', 'spiked', 'golem', 'launcher', 'retractable', 'tower', 'house', 'farm', 'barricade']) {
    const game = createGame(), target = structure(game.state, type, 52, 10);
    const before = structuredClone(game.state);
    const preview = game.api.preview('tower', target.x, target.y);
    assert.equal(preview.valid, false, type);
    assert.equal(game.api.place('tower', target.x, target.y).ok, false, type);
    assert.deepEqual(game.state, before, type);
  }
  for (const ownership of [{ owner: 'client' }, { npcOwned: true }, { enemy: true }]) {
    const game = createGame();
    Object.assign(structure(game.state, 'wall', 52, 10), ownership);
    const before = structuredClone(game.state);
    assert.equal(game.api.preview('tower', 52, 10).valid, false);
    assert.equal(game.api.place('tower', 52, 10).ok, false);
    assert.deepEqual(game.state, before);
  }
});

test('wall-to-tower replacement requires its own support and preserves support for existing canyon towers', () => {
  const isolated = createGame();
  assert.equal(isolated.api.place('wall', 8, 5).ok, true);
  const before = structuredClone(isolated.state);
  assert.equal(isolated.api.preview('tower', 8, 5).valid, false);
  assert.match(isolated.api.place('tower', 8, 5).reason, /support|adjoin/i);
  assert.deepEqual(isolated.state, before);
  assert.equal(isolated.api.place('wall', 7, 5).ok, true);
  assert.equal(isolated.api.preview('tower', 8, 5).valid, true);
  assert.equal(isolated.api.place('tower', 8, 5).ok, true);

  const game = createGame();
  for (const x of [7, 8]) assert.equal(game.api.place('wall', x, 5).ok, true);
  assert.equal(game.api.place('tower', 9, 5).ok, true);
  const supportedBefore = structuredClone(game.state);
  assert.equal(game.api.preview('tower', 8, 5).valid, false);
  assert.match(game.api.place('tower', 8, 5).reason, /unsupported|support/i);
  assert.deepEqual(game.state, supportedBefore, 'a supported replacement cannot strand its neighbouring tower');
  assert.equal(game.api.place('wall', 10, 5).ok, true);
  assert.equal(game.api.place('tower', 8, 5).ok, true, 'another support keeps the existing tower valid');
});

test('replaced towers preserve neighbours, refresh occupancy and flow, and block enemy steps', () => {
  const game = createGame();
  for (const [type, x] of [['wall', 51], ['wall', 52], ['gate', 53]]) {
    assert.equal(game.api.place(type, x, 10).ok, true);
  }
  const neighbours = [51, 53].map(x => structuredClone(structureAt(game.state, x, 10)));
  const oldFlow = rebuildFlow(game.state);
  assert.equal(game.api.place('tower', 52, 10).ok, true);
  const tower = structureAt(game.state, 52, 10);
  assert.equal(blockingAt(game.state, 52, 10), true);
  assert.deepEqual([51, 53].map(x => structureAt(game.state, x, 10)), neighbours);
  assert.ok(game.state.flowRevision > oldFlow.revision);
  nextStep(game.state, 52.5, 9.5);
  assert.equal(game.state.flow.revision, game.state.flowRevision);
  assert.notDeepEqual(nextStep(game.state, 52.5, 9.5), { x: 52, y: 10 }, 'flow takes an open detour around the tower');
  game.state.inhabitants = [];
  const enemy = spawnEnemy(game.state, 'foot', 52.5, 9.5);
  enemy.walkTarget = { x: 52, y: 10 };
  const hp = tower.hp;
  stepEnemies(game.state, 1 / 60);
  assert.equal(enemy.attackTargetId, tower.id, 'a cached step into the tower becomes a breach attack');
  assert.ok(tower.hp < hp);
  assert.equal(enemy.x, 52.5);
  assert.equal(enemy.y, 9.5, 'enemy never walks through the occupied tile');
});

test('repeated wall-to-tower replacement and demolition conserve gold plus held value', () => {
  const game = createGame(), initial = game.state.gold;
  for (let cycle = 0; cycle < 8; cycle++) {
    assert.equal(game.api.place('wall', 52, 10).ok, true);
    assert.equal(game.state.gold, initial - 20);
    assert.equal(game.api.place('tower', 52, 10).ok, true);
    assert.equal(game.state.gold, initial - 120);
    assert.equal(game.api.demolish(52, 10).refund, 120);
    assert.equal(game.state.gold, initial);
  }
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

test('wall-family upgrades and downgrades exchange intact and half-damaged paid value atomically', () => {
  const exchanges = [
    ['wall', 'spiked', 15, 25], ['spiked', 'wall', -15, 2],
    ['wall', 'golem', 70, 80], ['golem', 'wall', -70, -25],
    ['spiked', 'gate', 25, 42], ['gate', 'spiked', -25, 5],
  ];
  for (const [from, to, intact, damaged] of exchanges) for (const fraction of [1, 0.5]) {
    const game = createGame(), cost = fraction === 1 ? intact : damaged;
    assert.equal(game.api.place(from, 52, 10).ok, true);
    const old = structureAt(game.state, 52, 10);
    old.hp *= fraction;
    game.state.gold = Math.max(0, cost);
    const preview = game.api.preview(to, 52, 10);
    assert.equal(preview.valid, true, `${from} -> ${to} at ${fraction} HP`);
    assert.equal(preview.cost, cost);
    assert.equal(preview.replacement, true);
    assert.equal(preview.replacedType, from);
    const gold = game.state.gold, revision = game.state.flowRevision;
    assert.equal(game.api.place(to, 52, 10).ok, true);
    const replacement = structureAt(game.state, 52, 10);
    assert.equal(replacement.type, to);
    assert.equal(replacement.hp, CONFIG.structures[to].hp);
    assert.equal(replacement.paidCost, CONFIG.structures[to].cost);
    assert.equal(game.state.gold, gold - cost);
    assert.equal(game.state.structures.some(s => s.id === old.id), false);
    assert.ok(game.state.flowRevision > revision);

    if (cost > 0) {
      const limited = createGame();
      assert.equal(limited.api.place(from, 52, 10).ok, true);
      structureAt(limited.state, 52, 10).hp *= fraction;
      limited.state.gold = cost - 1;
      const before = structuredClone(limited.state);
      assert.equal(limited.api.place(to, 52, 10).ok, false);
      assert.deepEqual(limited.state, before);
    }
  }
});

test('new wall-family lines total sequential exchanges, skip matching tiles, and stop before an unaffordable tile', () => {
  for (const [fraction, expected] of [[1, -5], [0.5, 40]]) {
    const game = createGame();
    assert.equal(game.api.place('wall', 53, 10).ok, true);
    assert.equal(game.api.place('spiked', 54, 10).ok, true);
    assert.equal(game.api.place('golem', 55, 10).ok, true);
    structureAt(game.state, 55, 10).hp *= fraction;
    const same = structureAt(game.state, 54, 10), gold = game.state.gold;
    const preview = game.api.previewLine('spiked', 52, 10, 55, 10);
    assert.equal(preview.totalCost, expected);
    assert.equal(preview.tiles[2].skipped, true);
    assert.equal(game.api.placeLine('spiked', 52, 10, 55, 10).placed, 3);
    assert.equal(game.state.gold, gold - expected);
    assert.equal(structureAt(game.state, 54, 10).id, same.id);
    for (let x = 52; x <= 55; x++) assert.equal(structureAt(game.state, x, 10).type, 'spiked');
  }
  const game = createGame();
  for (let x = 52; x <= 54; x++) assert.equal(game.api.place('wall', x, 10).ok, true);
  game.state.gold = 70;
  const preview = game.api.previewLine('golem', 52, 10, 54, 10);
  assert.equal(preview.totalCost, 70);
  assert.equal(preview.tiles[1].valid, false);
  const result = game.api.placeLine('golem', 52, 10, 54, 10);
  assert.equal(result.placed, 1);
  assert.equal(result.results.length, 2);
  assert.equal(game.state.gold, 0);
  assert.equal(structureAt(game.state, 52, 10).type, 'golem');
  for (const x of [53, 54]) assert.equal(structureAt(game.state, x, 10).type, 'wall');
});

test('every current wall-family member supports canyon towers throughout replacement', () => {
  const game = createGame();
  const floor = crossing(8).find(p => tileAt(p.x, p.y) === '.' && tileAt(p.x - 1, p.y) === '.');
  assert.ok(floor);
  assert.equal(game.api.place('spiked', floor.x - 1, floor.y).ok, true);
  assert.equal(game.api.place('tower', floor.x, floor.y).ok, true);
  const tower = structuredClone(structureAt(game.state, floor.x, floor.y));
  for (const type of ['golem', 'gate', 'wall', 'spiked']) {
    assert.equal(game.api.place(type, floor.x - 1, floor.y).ok, true);
    assert.deepEqual(structureAt(game.state, floor.x, floor.y), tower);
    assert.equal(game.api.demolish(floor.x - 1, floor.y).ok, false);
  }
});

test('wall-family tools never replace other player or client structures', () => {
  for (const type of ['tower', 'barricade', 'house', 'farm', 'keep']) {
    const game = createGame();
    const target = type === 'keep' ? game.state.structures[0] : structure(game.state, type, 52, 10);
    const before = structuredClone(game.state);
    for (const upgrade of ['spiked', 'golem']) assert.equal(game.api.place(upgrade, target.x, target.y).ok, false);
    assert.deepEqual(game.state, before);
  }
  const game = createGame(), site = SITES[0];
  assert.equal(game.api.place('pendulum', site.x, site.y).ok, true);
  const before = structuredClone(game.state);
  for (const upgrade of ['spiked', 'golem']) assert.equal(game.api.place(upgrade, site.x, site.y).ok, false);
  assert.deepEqual(game.state, before);
});

test('spiked and golem walls participate in blocked-road hints and intended settlement perimeters', () => {
  for (const type of ['spiked', 'golem']) {
    const game = createGame(), points = crossing(5);
    for (const { x, y } of points) assert.equal(game.api.place(type, x, y).ok, true);
    assert.equal(game.api.readiness()[0].ok, false);
    const hints = game.api.blockedRoadTiles();
    for (const point of points) assert.ok(hints.some(p => p.x === point.x && p.y === point.y));
    assert.equal(settlementOutside(game.state)[KEEP.y * MAP[0].length + KEEP.x], Infinity);
    // Growth keeps the same intended perimeter even after battle breaches it.
    const breached = structureAt(game.state, points[0].x, points[0].y);
    damageStructure(game.state, breached, breached.hp);
    assert.equal(settlementOutside(game.state)[KEEP.y * MAP[0].length + KEEP.x], Infinity);
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
      const type = ['wall', 'tower', 'barricade'][random(3)];
      if (game.api.place(type, x, y).ok) actions.place++;
    } else if (existing.type === 'wall' && random(2) === 0) {
      if (game.api.place('gate', x, y).ok) actions.replace++;
    } else if (game.api.demolish(x, y).ok) actions.demolish++;
    assert.equal(total(), initial, `recoverable value after action ${i}`);
  }
  for (const count of Object.values(actions)) assert.ok(count > 0, 'sequence exercises each action');
});

test('capacity remains informative while prep-only construction and one pendulum are enforced', () => {
  const game = createGame();
  assert.equal(capacity(game.state).housing, 6);
  assert.equal(capacity(game.state).food, 6);
  game.state.population = 7;
  assert.equal(game.api.canStart().ok, true, 'capacity shortages do not gate battle');
  game.state.population = 6;
  assert.equal(game.api.place('pendulum', SITES[0].x, SITES[0].y).ok, true);
  assert.equal(game.api.place('pendulum', SITES[1].x, SITES[1].y).ok, false);
  assert.equal(game.api.startSiege().ok, true);
  const p = tileOf('C');
  assert.equal(game.api.place('wall', p.x, p.y).ok, false);
  assert.equal(game.api.demolish(SITES[0].x, SITES[0].y).ok, false);
});
