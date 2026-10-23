import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { SITES } from '../src/data/map.js';
import { spawnEnemy, damageEnemy } from '../src/sim/enemies.js';
import { stepExplosions } from '../src/sim/explosions.js';
import { hammerPosition, stepPendulum } from '../src/sim/pendulum.js';
import { createGame, advance } from './helpers.js';

test('each enemy type pays its bounty immediately exactly once at death',()=>{
  assert.deepEqual(CONFIG.bounties,{foot:2,chiseler:3,powder:5,boss:100});
  const game=createGame();
  assert.equal(game.api.startSiege().ok,true);
  let expectedGold=game.state.gold;
  for(const [type,bounty] of Object.entries(CONFIG.bounties)) {
    const enemy=spawnEnemy(game.state,type,20,20);
    const prior=enemy.hp;
    assert.equal(damageEnemy(game.state,enemy,0),false);
    assert.equal(enemy.hp,prior);
    assert.equal(damageEnemy(game.state,enemy,prior-1),true);
    assert.equal(game.state.gold,expectedGold,'damage alone earns no bounty');
    assert.equal(damageEnemy(game.state,enemy,1),true);
    expectedGold+=bounty;
    assert.equal(game.state.gold,expectedGold);
    assert.equal(game.state.stats.bountyCounts[type],1);
    const events=game.state.eventLog.filter(e=>e.type==='bounty'&&e.entityId===enemy.id);
    assert.equal(events.length,1);
    assert.equal(events[0].amount,bounty);
    assert.equal(events[0].enemyType,type);
    assert.equal(events[0].x,20);
    assert.equal(events[0].y,20);
    assert.equal(damageEnemy(game.state,enemy,10000),false);
    assert.equal(game.state.gold,expectedGold,'repeat damage cannot pay again');
  }
  assert.equal(game.state.stats.enemiesDefeated,4);
  assert.equal(game.state.stats.bountyGold,expectedGold-CONFIG.startingGold);
});

test('staggered powder chains pay each carrier and victim once including a boss killed by a blast',()=>{
  const game=createGame();
  assert.equal(game.api.startSiege().ok,true);
  const state=game.state,before=state.gold;
  const first=spawnEnemy(state,'powder',20,20);
  const second=spawnEnemy(state,'powder',21.8,20);
  const third=spawnEnemy(state,'powder',23.6,20);
  const foot=spawnEnemy(state,'foot',21.8,20);
  const boss=spawnEnemy(state,'boss',23.6,20);
  boss.hp=1;
  damageEnemy(state,first,999);
  assert.equal(state.gold,before+CONFIG.bounties.powder);
  advance(state,stepExplosions,CONFIG.explosion.chainDelay*4);
  assert.ok([first,second,third,foot,boss].every(e=>e.hp===0),'HARNESS_PRECONDITION_FAILED: chain reaches all victims');
  const earned=3*CONFIG.bounties.powder+CONFIG.bounties.foot+CONFIG.bounties.boss;
  assert.equal(state.gold,before+earned);
  assert.equal(state.stats.bountyGold,earned);
  assert.equal(state.stats.bountyCounts.powder,3);
  assert.equal(state.stats.bountyCounts.foot,1);
  assert.equal(state.stats.bountyCounts.boss,1);
  assert.equal(state.eventLog.filter(e=>e.type==='bounty').length,5);
  advance(state,stepExplosions,1);
  for(const enemy of state.enemies) damageEnemy(state,enemy,999);
  assert.equal(state.gold,before+earned);
});

test('pendulum kills pay gold through the same death point and never pay again on later sweep ticks',()=>{
  const game=createGame();
  assert.equal(game.api.place('pendulum',SITES[0].x,SITES[0].y).ok,true);
  assert.equal(game.api.startSiege().ok,true);
  const head=hammerPosition(game.state.pendulum);
  const enemy=spawnEnemy(game.state,'foot',head.x,head.y);
  const before=game.state.gold;
  assert.equal(game.api.triggerPendulum(),true);
  advance(game.state,stepPendulum,CONFIG.pendulum.duration+.1);
  assert.equal(enemy.hp,0,'HARNESS_PRECONDITION_FAILED: pendulum kills the target');
  assert.equal(game.state.gold,before+CONFIG.bounties.foot);
  assert.equal(game.state.stats.bountyGold,CONFIG.bounties.foot);
  assert.equal(game.state.eventLog.filter(e=>e.type==='bounty'&&e.entityId===enemy.id).length,1);
});
