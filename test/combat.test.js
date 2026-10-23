import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { SITES, KEEP, MAP, WIDTH, HEIGHT } from '../src/data/map.js';
import { spawnEnemy, damageEnemy, stepEnemies } from '../src/sim/enemies.js';
import { queueExplosion, stepExplosions } from '../src/sim/explosions.js';
import { hammerPosition, stepPendulum } from '../src/sim/pendulum.js';
import { stepInhabitants } from '../src/sim/inhabitants.js';
import { damageStructure, damageGolem, structureAt, isWalkable } from '../src/sim/grid.js';
import { nextStep } from '../src/sim/pathing.js';
import { stepGolems } from '../src/sim/golems.js';
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

test('spikes damage every melee attacker, throttle feedback and pay kill bounties; ordinary walls do not',()=>{
  for(const type of ['wall','spiked']) {
    const state=createGame().state;
    state.phase='siege';state.inhabitants.forEach(p=>p.sheltered=true);
    const wall=structure(state,type,50,18),gold=state.gold;
    const attackers=[18.2,18.8].map(y=>spawnEnemy(state,'chiseler',49.5,y));
    for(const enemy of attackers) {enemy.walkTarget={x:50,y:18};enemy.hp=20;}
    advance(state,stepEnemies,2);
    if(type==='wall') {
      assert.ok(attackers.every(e=>e.hp===20));
      assert.equal(state.gold,gold);
    } else {
      assert.ok(attackers.every(e=>e.hp===0));
      assert.equal(state.gold,gold+2*CONFIG.bounties.chiseler);
      assert.ok(wall.hp>0);
      const feedback=state.eventLog.filter(e=>e.type==='spikeHit');
      assert.ok(feedback.length>0&&feedback.length<50);
      assert.equal(state.stats.bountyCounts.chiseler,2);
    }
  }
});

function awakenedGolem() {
  const game=createGame(),state=game.state;
  assert.equal(game.api.place('golem',50,18).ok,true,'HARNESS_PRECONDITION_FAILED: golem wall placed');
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: siege started');
  state.inhabitants.forEach(p=>p.sheltered=true);
  const wall=structureAt(state,50,18);
  damageStructure(state,wall,wall.hp*CONFIG.golem.awakenFraction);
  assert.equal(state.golems.length,1,'HARNESS_PRECONDITION_FAILED: golem emerged');
  return {game,state,wall,golem:state.golems[0]};
}

test('golem wall awakens once at half HP, removes occupancy without rubble and rebuilds flow immediately',()=>{
  const game=createGame(),state=game.state;
  assert.equal(game.api.place('golem',50,18).ok,true);
  assert.equal(game.api.startSiege().ok,true);
  state.inhabitants.forEach(p=>p.sheltered=true);
  const wall=structureAt(state,50,18),revision=state.flowRevision;
  const adjacent=spawnEnemy(state,'chiseler',49.5,18.5),inside=spawnEnemy(state,'foot',50.5,18.5);
  adjacent.walkTarget=inside.walkTarget={x:49,y:17};
  damageStructure(state,wall,119);
  assert.equal(state.golems.length,0);
  damageStructure(state,wall,1);
  assert.equal(state.golems.length,1);
  assert.equal(state.structures.includes(wall),false);
  assert.equal(structureAt(state,50,18),null);
  assert.equal(state.rubble.some(r=>r.id===wall.id),false);
  assert.equal(state.flowRevision,revision+1);
  assert.equal(state.flow.revision,state.flowRevision);
  assert.equal(adjacent.walkTarget,null);assert.equal(inside.walkTarget,null);
  assert.deepEqual(nextStep(state,49.5,18.5),{x:50,y:18});
  damageStructure(state,wall,999);
  assert.equal(state.golems.length,1);
  assert.equal(state.eventLog.filter(e=>e.type==='golemAwaken').length,1);
  damageGolem(state,state.golems[0],999);
  const before=[adjacent,inside].map(e=>e.x);
  advance(state,stepEnemies,.5);
  assert.ok(adjacent.x>before[0]);assert.ok(inside.x>before[1]);
  assert.ok([adjacent,inside].every(e=>isWalkable(Math.floor(e.x),Math.floor(e.y))));
});

test('melee and lethal structure damage both awaken golem walls during battle; preparation damage persists',()=>{
  const game=createGame(),state=game.state;
  const wall=structure(state,'golem',50,18);
  damageStructure(state,wall,100);
  assert.equal(state.golems.length,0);
  assert.equal(wall.hp,140);
  state.phase='siege';state.inhabitants.forEach(p=>p.sheltered=true);
  const enemy=spawnEnemy(state,'chiseler',49.5,18.5);
  enemy.walkTarget={x:50,y:18};
  advance(state,stepEnemies,1);
  assert.equal(state.golems.length,1);
  const other=structure(state,'golem',52,18);
  damageStructure(state,other,999);
  assert.equal(state.golems.length,2);
  assert.equal(state.rubble.length,0);
});

test('area damage awakens neighboring golem walls without skipping a removed structure',()=>{
  for(const source of ['explosion','boss']) {
    const state=createGame().state;state.phase='siege';
    state.inhabitants.forEach(p=>p.sheltered=true);
    const walls=[structure(state,'golem',50,18),structure(state,'golem',50,19)];
    if(source==='explosion') {
      walls.forEach(w=>w.hp=140);
      damageEnemy(state,spawnEnemy(state,'powder',50.5,19),999);
      advance(state,stepExplosions,.2);
    } else {
      const boss=spawnEnemy(state,'boss',49.5,18.5);boss.walkTarget={x:50,y:18};
      advance(state,stepEnemies,CONFIG.enemies.boss.windup);
    }
    assert.equal(state.golems.length,2,source);
    assert.ok(walls.every(w=>!state.structures.includes(w)),source);
    assert.equal(state.flow.revision,state.flowRevision);
    assert.equal(state.rubble.length,0);
  }
});

test('golem slam damages all nearby enemies, gives bounded knockback and stun, observes cooldown and pays bounties',()=>{
  const {state,golem}=awakenedGolem(),gold=state.gold;
  const targets=['foot','chiseler','boss'].map((type,i)=>spawnEnemy(state,type,golem.x+.4,golem.y+(i-1)*.2));
  const far=spawnEnemy(state,'foot',golem.x+2,golem.y);
  const before=targets.map(e=>({hp:e.hp,x:e.x,y:e.y}));
  stepGolems(state,1/60);
  for(let i=0;i<targets.length;i++) {
    const e=targets[i],b=before[i];
    assert.equal(e.hp,b.hp-CONFIG.golem.damage);
    assert.ok(Math.abs(Math.hypot(e.x-b.x,e.y-b.y)-CONFIG.golem.knockback)<1e-8);
    assert.equal(e.stunRemaining,CONFIG.golem.stun);
  }
  assert.equal(far.hp,far.maxHp);
  assert.equal(state.eventLog.filter(e=>e.type==='golemSlam').length,1);
  targets.forEach(e=>{e.x=golem.x+.4;e.y=golem.y;});
  stepGolems(state,.5);
  assert.equal(state.eventLog.filter(e=>e.type==='golemSlam').length,1);
  stepGolems(state,.7);
  assert.equal(state.eventLog.filter(e=>e.type==='golemSlam').length,2);
  assert.equal(state.gold,gold+CONFIG.bounties.foot+CONFIG.bounties.chiseler);
  assert.equal(state.stats.bountyGold,CONFIG.bounties.foot+CONFIG.bounties.chiseler);
});

test('golem knockback stops at blocking structures and never harms them',()=>{
  const {state,golem}=awakenedGolem();
  const wall=structure(state,'wall',52,18),enemy=spawnEnemy(state,'boss',51.4,18.5);
  stepGolems(state,1/60);
  assert.ok(enemy.x<52);
  assert.equal(wall.hp,wall.maxHp);
  assert.equal(golem.x,50.5);
});

test('golem movement remains leashed and stops at obstacles without attacking structures',()=>{
  const {state,golem}=awakenedGolem();
  const enemy=spawnEnemy(state,'boss',55.1,18.5);
  enemy.hp=enemy.maxHp=100000;
  for(let i=0;i<1200;i++) {
    stepGolems(state,1/60);
    assert.ok(Math.hypot(golem.x-golem.originX,golem.y-golem.originY)<=CONFIG.golem.leash+1e-8);
  }
  assert.ok(golem.x>golem.originX+3,'golem pursues reachable enemies');
  const other=awakenedGolem(),wall=structure(other.state,'wall',51,18);
  spawnEnemy(other.state,'boss',52.5,18.5);
  advance(other.state,stepGolems,5);
  assert.ok(other.golem.x<51);
  assert.equal(wall.hp,wall.maxHp);
});

test('enemies target and damage golems, which crumble once at zero HP or thirty seconds',()=>{
  const {state,golem}=awakenedGolem();
  const enemy=spawnEnemy(state,'foot',golem.x+.4,golem.y),hp=golem.hp;
  stepEnemies(state,1/60);
  assert.equal(enemy.attackTargetId,golem.id);
  assert.ok(Math.abs(golem.hp-(hp-CONFIG.enemies.foot.unitDps/60))<1e-8);
  damageGolem(state,golem,999);damageGolem(state,golem,999);
  assert.equal(golem.status,'crumbled');assert.equal(golem.hp,0);
  assert.equal(state.eventLog.filter(e=>e.type==='golemCrumble').length,1);
  const timed=awakenedGolem();
  advance(timed.state,stepGolems,CONFIG.golem.duration-1/60);
  assert.equal(timed.golem.status,'active');
  stepGolems(timed.state,1/60);
  assert.equal(timed.golem.status,'crumbled');assert.equal(timed.golem.remaining,0);
  stepGolems(timed.state,1/60);
  assert.equal(timed.state.eventLog.filter(e=>e.type==='golemCrumble').length,1);
});

test('a nearby golem across a surviving wall does not strand an enemy against that wall',()=>{
  const {state,golem}=awakenedGolem();
  const wall=structure(state,'wall',49,18),enemy=spawnEnemy(state,'chiseler',48.5,18.5);
  enemy.walkTarget={x:49,y:18};
  assert.ok(Math.hypot(enemy.x-golem.x,enemy.y-golem.y)<CONFIG.golem.chaseRadius);
  advance(state,stepEnemies,.5);
  assert.equal(enemy.attackTargetId,wall.id);
  assert.ok(wall.hp<wall.maxHp);
});

test('enemies resume the current flow route after their golem target crumbles',()=>{
  const {state,golem}=awakenedGolem();
  const enemy=spawnEnemy(state,'chiseler',49.5,18.5);
  enemy.walkTarget={x:48,y:18};
  stepEnemies(state,1/60);
  assert.equal(enemy.attackTargetId,golem.id,'HARNESS_PRECONDITION_FAILED: enemy pursues golem');
  damageGolem(state,golem,999);
  const x=enemy.x;
  advance(state,stepEnemies,.5);
  assert.ok(enemy.x>x,'enemy follows the opened route instead of an obsolete step');
});

test('retry restores damaged dormant golem walls and treasury; Continue clears battle golems',()=>{
  const game=createGame();
  assert.equal(game.api.place('golem',50,18).ok,true);
  assert.equal(game.api.place('golem',52,18).ok,true);
  const wall=structureAt(game.state,50,18);wall.hp=180;
  structureAt(game.state,52,18).hp=200;
  const before=structuredClone(game.state);
  assert.equal(game.api.startSiege().ok,true);
  damageStructure(game.state,wall,60);
  assert.equal(game.state.golems.length,1);
  assert.equal(game.api.retrySiege(),true);
  assert.deepEqual(game.state,before);
  assert.equal(game.api.startSiege().ok,true);
  damageStructure(game.state,structureAt(game.state,50,18),60);
  game.state.schedule=[];game.api.tick();
  assert.equal(game.state.phase,'victory');
  assert.equal(game.api.continueCampaign(),true);
  assert.equal(game.state.golems.length,0);
  assert.equal(structureAt(game.state,50,18),null,'awakened wall is gone');
  assert.equal(structureAt(game.state,52,18)?.type,'golem','dormant wall persists');
  assert.equal(structureAt(game.state,52,18).hp,200,'dormant wall damage persists');
});
