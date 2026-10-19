import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { SITES, KEEP, MAP, WIDTH, HEIGHT } from '../src/data/map.js';
import { spawnEnemy, damageEnemy, stepEnemies } from '../src/sim/enemies.js';
import { queueExplosion, stepExplosions } from '../src/sim/explosions.js';
import { hammerPosition, stepPendulum } from '../src/sim/pendulum.js';
import { stepInhabitants } from '../src/sim/inhabitants.js';
import { createGame, advance, structure } from './helpers.js';

test('powder deaths detonate once and chains retain the 0.12s stagger', () => {
  const state = createGame().state;
  const first = spawnEnemy(state, 'powder', 50.5, 18.5);
  const second = spawnEnemy(state, 'powder', 51.5, 18.5);
  damageEnemy(state, first, 100);
  damageEnemy(state, first, 100);
  assert.equal(queueExplosion(state, first), false);
  assert.equal(state.explosions.length, 1);
  assert.equal(first.detonated, true);
  advance(state, stepExplosions, 0.1);
  assert.equal(second.hp, CONFIG.enemies.powder.hp);
  advance(state, stepExplosions, 2 / 60);
  assert.equal(second.hp, 0);
  assert.equal(second.detonated, true);
  assert.equal(state.eventLog.filter(e => e.type === 'explosion').length, 1);
  advance(state, stepExplosions, 8 / 60);
  assert.equal(state.eventLog.filter(e => e.type === 'explosion').length, 2);
  assert.equal(state.explosions.length, 0);
  const times = state.eventLog.filter(e => e.type === 'explosion').map(e => e.t);
  assert.ok(times[1] - times[0] >= CONFIG.explosion.chainDelay - 1e-8);
});

test('explosion caps nearest structure tiles at six and applies boss falloff', () => {
  const state = createGame().state;
  const walls = [];
  for (let y = 17; y <= 20; y++) for (let x = 49; x <= 52; x++) walls.push(structure(state, 'wall', x, y));
  const boss = spawnEnemy(state, 'boss', 52.5, 18.5);
  const powder = spawnEnemy(state, 'powder', 50.5, 18.5);
  damageEnemy(state, powder, 100);
  advance(state, stepExplosions, 8 / 60);
  const damaged = walls.filter(w => w.hp < w.maxHp);
  assert.equal(damaged.length, 6);
  assert.equal(boss.hp, CONFIG.enemies.boss.hp - 140 * (1 - 0.5 * 2 / 2.5));
  const blast = state.eventLog.find(e => e.type === 'explosion');
  assert.equal(blast.structureTiles.length, 6);
  const selected = new Set(blast.structureTiles.map(t => `${t.x},${t.y}`));
  const farthestSelected = Math.max(...blast.structureTiles.map(t => Math.hypot(t.x - 50, t.y - 18)));
  for (const w of walls.filter(w => !selected.has(`${w.x},${w.y}`))) {
    assert.ok(Math.hypot(w.x - 50, w.y - 18) >= farthestSelected);
  }
});

test('pendulum hits once per entity per swing, harms structures, and resets after twenty seconds', () => {
  const game = createGame();
  assert.equal(game.api.place('pendulum', SITES[0].x, SITES[0].y).ok, true);
  assert.equal(game.api.startSiege().ok, true);
  const state = game.state;
  const position = hammerPosition(state.pendulum);
  const boss = spawnEnemy(state, 'boss', position.x, position.y);
  const soldier = spawnEnemy(state, 'foot', position.x, position.y);
  soldier.hp = soldier.maxHp = 1000;
  const wall = structure(state, 'wall', Math.floor(position.x), Math.floor(position.y));
  assert.equal(game.api.triggerPendulum(), true);
  assert.equal(game.api.triggerPendulum(), false);
  advance(state, stepPendulum, CONFIG.pendulum.duration);
  assert.equal(state.pendulum.status, 'resetting');
  assert.equal(boss.hp, CONFIG.enemies.boss.hp - CONFIG.pendulum.bossDamage);
  assert.equal(boss.stunRemaining, 0);
  assert.ok(boss.slowRemaining > 0);
  assert.equal(soldier.hp, 840);
  assert.equal(wall.hp, 80);
  assert.equal(state.pendulum.hitIds.filter(id => id === boss.id).length, 1);
  assert.equal(game.api.triggerPendulum(), false);
  advance(state, stepPendulum, 19.9);
  assert.equal(state.pendulum.status, 'resetting');
  advance(state, stepPendulum, 0.1);
  assert.equal(state.pendulum.status, 'ready');
  assert.equal(game.api.triggerPendulum(), true);
  assert.equal(state.pendulum.swingId, 2);
});

test('each pendulum strikes every crowded floor centre in its head path exactly once', () => {
  for (const site of SITES) {
    const game=createGame();
    assert.equal(game.api.place('pendulum',site.x,site.y).ok,true);
    assert.equal(game.api.startSiege().ok,true);
    const state=game.state,targets=[];
    // Independent dense sampling establishes the strike-band precondition.
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++) {
      if (/[#123]/.test(MAP[y][x])) continue;
      let distance=Infinity;
      for(let i=0;i<=2000;i++) {
        const a=site.centerAngle-site.halfSweep+2*site.halfSweep*i/2000;
        distance=Math.min(distance,Math.hypot(x+.5-site.pivotX-Math.cos(a)*site.armLength,y+.5-site.pivotY-Math.sin(a)*site.armLength));
      }
      if(distance>CONFIG.pendulum.radius)continue;
      const enemy=spawnEnemy(state,'foot',x+.5,y+.5);
      enemy.hp=enemy.maxHp=1000;
      targets.push({enemy,x:enemy.x,y:enemy.y});
    }
    assert.ok(targets.length>=10,'HARNESS_PRECONDITION_FAILED: crowded strike band');
    const chainOnly=spawnEnemy(state,'foot',site.pivotX+Math.cos(site.centerAngle)*site.armLength/2,site.pivotY+Math.sin(site.centerAngle)*site.armLength/2);
    chainOnly.hp=chainOnly.maxHp=1000;
    assert.equal(game.api.triggerPendulum(),true);
    advance(state,stepPendulum,CONFIG.pendulum.duration);
    let moved=0;
    for(const {enemy,x,y} of targets) {
      assert.equal(enemy.hp,840,`site ${site.id}, target at ${x},${y}`);
      assert.equal(state.pendulum.hitIds.filter(id=>id===enemy.id).length,1);
      assert.equal(state.eventLog.filter(e=>e.type==='pendulumHit'&&e.entityId===enemy.id).length,1);
      assert.ok(enemy.stunRemaining>0);
      if(Math.hypot(enemy.x-x,enemy.y-y)>0)moved++;
    }
    assert.ok(moved>0,'crowded enemies receive cliff-safe knockback');
    assert.equal(chainOnly.hp,1000,'gantry and chain do not deal damage');
    assert.equal(state.pendulum.status,'resetting');
    assert.equal(state.pendulum.angle,site.centerAngle+site.halfSweep);
  }
});

test('boss exposes its windup before the 260-damage slam, and keepReached fires once', () => {
  const state = createGame().state;
  state.phase = 'siege';
  state.inhabitants.forEach(p => { p.sheltered = true; });
  const boss = spawnEnemy(state, 'boss', KEEP.x - 0.5, KEEP.y + 1.5);
  const keep = state.structures[0];
  advance(state, stepEnemies, 1.3);
  assert.equal(boss.attackPhase, 'windup');
  assert.ok(boss.windupRemaining > 0);
  assert.equal(keep.hp, keep.maxHp);
  advance(state, stepEnemies, 0.2);
  assert.equal(keep.hp, keep.maxHp - 260);
  assert.equal(state.eventLog.filter(e => e.type === 'keepReached').length, 1);
});

test('inhabitants flee into shelter on a basin invasion and are safe while sheltered', () => {
  const state = createGame().state;
  spawnEnemy(state, 'foot', 44.5, 18.5);
  advance(state, stepInhabitants, 2);
  assert.equal(state.inhabitants.filter(p => p.sheltered).length, 6);
  const person = state.inhabitants[0];
  const powder = spawnEnemy(state, 'powder', person.x, person.y);
  damageEnemy(state, powder, 100);
  advance(state, stepExplosions, 0.2);
  assert.equal(person.hp, CONFIG.inhabitants.hp);
});
