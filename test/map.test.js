import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP, WIDTH, HEIGHT, KEEP, SITES, SPAWNS } from '../src/data/map.js';
import { CONFIG } from '../src/config.js';
import { isWalkable, tileAt } from '../src/sim/grid.js';

const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const column = x => Array.from({ length: HEIGHT }, (_, y) => y).filter(y => isWalkable(x, y));
const center = values => values.reduce((sum, n) => sum + n, 0) / values.length;
// Cliff mask from the authored map before ledges became floor. Non-cliff tiles
// are dots so this verifies that only terrain type, not canyon geometry, moved.
const CLIFF_MASK = [
  '################################################################',
  '################################################################',
  '################################################################',
  '################################################################',
  '..............##################################################',
  '................################################################',
  '...................#############################################',
  '...................###############################......########',
  '...................#############################..........######',
  '##########..........###########################............#####',
  '############........##########################..............####',
  '##############.......########################................###',
  '###############......########################................###',
  '################......######################..................##',
  '#################.....######################..................##',
  '##################....#####################...................##',
  '###################....###################.....................#',
  '####################....#################......................#',
  '####################.....###############.......................#',
  '####################......#############.......................##',
  '#####################.......##########........................##',
  '#####################........########.........................##',
  '######################........######.........................###',
  '#######################.........##...........................###',
  '#######################.....................##..............####',
  '########################...................####............#####',
  '#########################.................######..........######',
  '##########################................########......########',
  '############################.............#######################',
  '######################.#######.........#########################',
  '###############################....#############################',
  '########################################.#######################',
  '################################################################',
  '################################################################',
  '################################################################',
  '################################################################',
];

test('map is exactly 64 by 36 and only spawn tiles open its boundary', () => {
  assert.equal(WIDTH, 64);
  assert.equal(HEIGHT, 36);
  assert.equal(MAP.length, HEIGHT);
  for (const row of MAP) {
    assert.equal(row.length, WIDTH);
    assert.match(row, /^[#.CKS123]+$/);
    assert.equal(row.includes(','), false, 'rocky ledges were converted to buildable floor');
  }
  const openings = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if ((x === 0 || x === WIDTH - 1 || y === 0 || y === HEIGHT - 1) && tileAt(x, y) !== '#') {
      assert.equal(x, 0);
      assert.equal(tileAt(x, y), 'S');
      openings.push({ x, y });
    }
  }
  assert.deepEqual(openings, SPAWNS);
  assert.equal(SPAWNS.length, 5);
  assert.deepEqual(MAP.map(row => row.replace(/[^#]/g, '.')), CLIFF_MASK,
    'converting ledges must not move any cliff');
});

test('all walkable terrain connects to the western spawn without crossing cliffs', () => {
  const queue = [SPAWNS[0]];
  const seen = new Set([`${SPAWNS[0].x},${SPAWNS[0].y}`]);
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of neighbors) {
      const next = { x: x + dx, y: y + dy };
      const key = `${next.x},${next.y}`;
      if (!isWalkable(next.x, next.y) || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if (isWalkable(x, y)) assert.ok(seen.has(`${x},${y}`), `Disconnected floor at ${x},${y}`);
  }
});

test('authored canyon bends, narrows to a three-tile choke, and opens into the basin', () => {
  assert.equal(column(5).length, 5);
  // The descending throat has only three shared crossing tiles between rows.
  const throat = Array.from({ length: WIDTH }, (_, x) => x)
    .filter(x => isWalkable(x, 15) && isWalkable(x, 16) && x < 30);
  assert.deepEqual(throat, [19, 20, 21]);
  assert.equal(tileAt(19, 15), '.');
  assert.equal(tileAt(21, 16), '.');
  // Two descending sections then a turn back toward the basin center prevent
  // this map from degenerating into a straight corridor.
  assert.ok(center(column(5)) < center(column(20)));
  assert.ok(center(column(20)) < center(column(32)));
  assert.ok(center(column(32)) > center(column(43)));
  for (let y = 13; y <= 21; y++) for (let x = 45; x <= 61; x++) {
    assert.ok('CK'.includes(tileAt(x, y)), `Basin floor at ${x},${y}`);
  }
});

test('the keep has exactly its declared three-by-three footprint', () => {
  let count = 0;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if (tileAt(x, y) !== 'K') continue;
    count++;
    assert.ok(x >= KEEP.x && x < KEEP.x + 3 && y >= KEEP.y && y < KEEP.y + 3);
  }
  assert.equal(count, 9);
});

test('three unique cliff mounts have finite sweep metadata that intersects the canyon', () => {
  assert.equal(SITES.length, 3);
  assert.equal(new Set(SITES.map(site => site.id)).size, 3);
  assert.deepEqual([...MAP.join('')].filter(c => '123'.includes(c)).sort(), ['1', '2', '3']);
  for (const site of SITES) {
    assert.equal(tileAt(site.x, site.y), site.id);
    assert.equal(isWalkable(site.x, site.y), false);
    assert.ok(Number.isFinite(site.armLength) && site.armLength > 0);
    assert.equal(site.pivotX, site.x + 0.5);
    assert.equal(site.pivotY, site.y + 0.5);
    assert.ok(Number.isFinite(site.centerAngle) && site.halfSweep > 0);
    const covered = new Set();
    for (let sample = 0; sample <= 720; sample++) {
      const angle = site.centerAngle - site.halfSweep + 2 * site.halfSweep * sample / 720;
      const hx = site.pivotX + Math.cos(angle) * site.armLength;
      const hy = site.pivotY + Math.sin(angle) * site.armLength;
      for (let y = Math.floor(hy - CONFIG.pendulum.radius); y <= Math.ceil(hy + CONFIG.pendulum.radius); y++) {
        for (let x = Math.floor(hx - CONFIG.pendulum.radius); x <= Math.ceil(hx + CONFIG.pendulum.radius); x++) {
          if (isWalkable(x, y) && Math.hypot(x + 0.5 - hx, y + 0.5 - hy) <= CONFIG.pendulum.radius) covered.add(`${x},${y}`);
        }
      }
    }
    assert.ok(covered.size >= 12, `Site ${site.id} must sweep a substantial canyon area`);
    const queue = SPAWNS.filter(({ x, y }) => !covered.has(`${x},${y}`));
    const seen = new Set(queue.map(({ x, y }) => `${x},${y}`));
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i];
      assert.notEqual(tileAt(x, y), 'C', `Site ${site.id} leaves a route around its strike band`);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (!isWalkable(nx, ny) || covered.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
});
