import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { SITES } from '../src/data/map.js';
import { createGame, calculateResults } from '../src/sim/campaign.js';
import { damageStructure } from '../src/sim/grid.js';
import { createInhabitants, stepInhabitants } from '../src/sim/inhabitants.js';
import { spawnEnemy, stepEnemies } from '../src/sim/enemies.js';
import { structure, advance, crossing } from './helpers.js';

function finish(game, defeat=false) {
  game.state.schedule=[];game.state.spawnIndex=0;game.state.enemies=[];
  if(defeat) damageStructure(game.state,game.state.structures[0],100000);
  game.api.tick();
  assert.equal(game.state.phase,defeat?'defeat':'victory','HARNESS_PRECONDITION_FAILED: synthetic result');
}

test('exact capacity shortages gate starting; homes track four inhabitants per house on any floor',()=>{
  const game=createGame();
  game.state.population=14;createInhabitants(game.state);
  assert.equal(game.api.canStart().reason,'Build 2 additional houses. · Build 2 additional farms.');
  assert.equal(game.api.startSiege().ok,false);
  assert.equal(game.api.place('house',52,10).ok,true);
  assert.equal(game.api.canStart().reason,'Build 1 additional house. · Build 2 additional farms.');
  assert.equal(game.api.place('house',55,10).ok,true);
  assert.equal(game.api.canStart().reason,'Build 2 additional farms.');
  assert.equal(game.api.place('farm',58,10).ok,true);
  assert.equal(game.api.canStart().reason,'Build 1 additional farm.');
  assert.equal(game.api.place('farm',58,13).ok,true);
  assert.equal(game.api.canStart().ok,true);
  const homes=game.state.structures.filter(s=>s.type==='house');
  for(const house of homes) {
    const people=game.state.inhabitants.filter(p=>p.homeId===house.id);
    assert.equal(people.length,4);
    for(const p of people) assert.ok(Math.hypot(p.x-house.x-house.w/2,p.y-house.y-house.h/2)<=CONFIG.inhabitants.idleRadius+1e-8);
  }
  advance(game.state,stepInhabitants,1);
  damageStructure(game.state,homes[0],999);
  assert.equal(game.api.capacity().housing,10);
  assert.equal(game.api.canStart().reason,'Build 1 additional house.');
  assert.equal(game.api.place('house',homes[0].x,homes[0].y).ok,true);
  assert.equal(game.api.canStart().ok,true);
  const canyon=createGame();
  assert.equal(canyon.api.place('house',6,7).ok,true);
  assert.equal(canyon.api.place('farm',11,6).ok,true);
});

test('readiness lists every requirement, all shortages together, and updates after each preparation action',()=>{
  const game=createGame();
  const read=()=>Object.fromEntries(game.api.readiness().map(r=>[r.id,r]));
  const initial=game.api.readiness();
  assert.equal(initial.length,3);
  assert.deepEqual(initial.map(r=>r.id),['housing','food','tradeRoad']);
  assert.ok(initial.every(r=>r.ok&&typeof r.message==='string'));
  const before=JSON.stringify(game.state);
  initial[0].ok=false;
  assert.equal(game.api.readiness()[0].ok,true,'returned observations do not mutate readiness');
  assert.equal(JSON.stringify(game.state),before,'readiness observation is pure');
  game.state.population=14;
  const line=crossing(5);
  for(const {x,y} of line) assert.equal(game.api.place('wall',x,y).ok,true);
  let requirements=read();
  assert.equal(requirements.housing.message,'Build 2 additional houses.');
  assert.equal(requirements.food.message,'Build 2 additional farms.');
  assert.equal(requirements.tradeRoad.message,'Castle entrance blocked. Install a gate to create a route to the keep.');
  assert.equal(game.api.readiness().filter(r=>!r.ok).length,3);
  assert.equal(game.api.canStart().ok,false);
  assert.equal(game.api.startSiege().ok,false);
  assert.equal(game.api.place('house',52,10).ok,true);
  assert.equal(read().housing.message,'Build 1 additional house.');
  assert.equal(game.api.place('house',55,10).ok,true);
  assert.equal(read().housing.ok,true);
  assert.equal(game.api.place('farm',58,10).ok,true);
  assert.equal(read().food.message,'Build 1 additional farm.');
  assert.equal(game.api.place('farm',58,13).ok,true);
  assert.equal(read().food.ok,true);
  assert.equal(game.api.canStart().ok,false,'road alone still prevents starting');
  const p=line[2];
  assert.equal(game.api.place('gate',p.x,p.y).ok,true);
  assert.equal(game.api.readiness().every(r=>r.ok),true);
  assert.equal(game.api.canStart().ok,true);
  assert.equal(game.api.demolish(52,10).ok,true);
  assert.equal(read().housing.ok,false);
  assert.equal(game.api.canStart().ok,false);
  assert.equal(game.api.place('house',52,10).ok,true);
  assert.equal(game.api.startSiege().ok,true);
});

test('foot soldiers stop to pillage local houses and farms, then continue their route',()=>{
  for(const type of ['house','farm']) {
    const game=createGame(),state=game.state;
    state.inhabitants.forEach(p=>p.sheltered=true);
    const target=structure(state,type,51,18,8);
    const foot=spawnEnemy(state,'foot',50.5,18.5);
    advance(state,stepEnemies,1.1);
    assert.equal(target.destroyed,true);
    const at={x:foot.x,y:foot.y};
    advance(state,stepEnemies,1);
    assert.ok(Math.hypot(foot.x-at.x,foot.y-at.y)>.1);
    assert.equal(game.api.capacity()[type==='house'?'housing':'food'],6);
  }
});

test('each enemy reaching the keep is counted while the keepReached event fires once',()=>{
  const state=createGame().state,keep=state.structures[0];
  state.inhabitants.forEach(p=>p.sheltered=true);
  spawnEnemy(state,'foot',keep.x-.5,keep.y+.5);
  spawnEnemy(state,'foot',keep.x-.5,keep.y+1.5);
  advance(state,stepEnemies,.5);
  assert.equal(state.stats.keepReachedEnemies,2);
  assert.equal(state.eventLog.filter(e=>e.type==='keepReached').length,1);
  advance(state,stepEnemies,.5);
  assert.equal(state.stats.keepReachedEnemies,2);
});

test('reward breakdown includes every bonus and penalty, one keep penalty, and the payout floor',()=>{
  const game=createGame();
  game.api.startSiege();
  let s=game.state;s.phase='victory';s.stats.bossDefeated=true;
  const perfect=calculateResults(s);
  assert.deepEqual(perfect.bonuses.map(l=>l.amount),[300,100,75,100,50,50]);
  assert.deepEqual(perfect.penalties.map(l=>l.amount),[-0,0,-0,-0]);
  assert.equal(perfect.payout,675);
  s.snapshot.gold=300; // Exactly 70% spent does not earn the economical bonus.
  s.structures[0].hp-=100;
  s.keepReached=true;s.stats.keepReachedEnemies=9;s.inhabitants[0].hp=0;
  let r=calculateResults(s);
  assert.deepEqual(r.bonuses.map(l=>l.amount),[300,0,0,100,50,0]);
  assert.deepEqual(r.penalties.map(l=>l.amount),[-40,-50,-10,-0]);
  assert.equal(r.payout,350);
  assert.equal(r.enemiesReachedKeep,9);
  const threshold=structuredClone(s);
  threshold.structures[0].hp=threshold.snapshot.structures[0].hp*(1-CONFIG.rewards.damageThreshold);
  assert.equal(calculateResults(threshold).bonuses.find(l=>l.key==='lowDamage').amount,0,'exactly 15% damage is excluded');
  const house=structure(s,'house',51,10),farm=structure(s,'farm',54,10);
  s.snapshot.structures.push(structuredClone(house),structuredClone(farm));
  damageStructure(s,house,999);damageStructure(s,farm,999);
  s.inhabitants.forEach(p=>p.hp=0);s.structures[0].hp=1;
  r=calculateResults(s);
  assert.deepEqual(r.penalties.map(l=>l.amount),[-240,-50,-199,-30]);
  assert.equal(r.buildingsDestroyed,2);
  assert.equal(r.bonuses.find(l=>l.key==='lowDamage').amount,0);
  assert.equal(r.floorApplied,true);assert.equal(r.payout,250);
  s.phase='defeat';r=calculateResults(s);
  assert.equal(r.payout,0);assert.equal(r.floorApplied,false);
});

test('Continue pays each siege once, grows population, preserves damage/rubble/markers, and completes',()=>{
  const game=createGame(42);
  assert.equal(game.api.continueCampaign(),false);
  for(let index=1;index<=3;index++) {
    if(index>1) {
      assert.equal(game.api.place('house',index===2?51:54,10).ok,true);
      assert.equal(game.api.place('farm',57,index===2?10:13).ok,true);
    }
    assert.equal(game.api.startSiege().ok,true);
    const state=game.state,wall=structure(state,'wall',50,17);
    damageStructure(state,wall,999);
    state.structures[0].hp-=10;
    const keepHp=state.structures[0].hp;
    state.attackMarkers.push({x:52,y:15,t:0});
    finish(game);
    const payout=state.results.payout,gold=state.gold;
    assert.equal(game.api.continueCampaign(),true);
    assert.equal(game.state.gold,gold+payout);
    assert.equal(game.api.continueCampaign(),false);
    assert.equal(game.state.gold,gold+payout);
    assert.equal(game.api.retrySiege(),false);
    assert.equal(game.state.structures[0].hp,keepHp);
    assert.ok(game.state.rubble.length>=index);
    assert.equal(game.state.attackMarkers.length,index);
    if(index<3) {
      assert.equal(game.state.phase,'prep');
      assert.equal(game.state.population,CONFIG.populationBySiege[index]);
    }
  }
  assert.equal(game.state.phase,'complete');
  assert.equal(game.state.campaign.complete,true);
  assert.deepEqual(game.state.campaign.rewardedSieges,[1,2,3]);
  assert.equal(game.state.campaign.totals.payout,game.state.campaign.history.reduce((n,r)=>n+r.payout,0));
  game.api.restartCampaign();assert.deepEqual(game.state,createGame(42).state);
});

test('retry after victory results and defeat restores exact pre-siege state for every siege',()=>{
  for(const defeat of [false,true]) for(let index=1;index<=3;index++) {
    const game=createGame(92);
    game.state.siegeIndex=index;
    game.state.population=CONFIG.populationBySiege[index-1];
    if(index>1) {
      game.api.place('house',51,10);game.api.place('farm',57,10);
      if(index===3){game.api.place('house',54,10);game.api.place('farm',57,13);}
    }
    game.api.place('pendulum',SITES[1].x,SITES[1].y);
    game.state.rng.seed=8712;
    const before=structuredClone(game.state);
    assert.equal(game.api.startSiege().ok,true);
    game.api.stepSeconds(1);
    finish(game,defeat);
    assert.equal(game.api.retrySiege(),true);
    assert.deepEqual(game.state,before);
    assert.equal(game.api.continueCampaign(),false);
    assert.deepEqual(game.state,before);
    assert.equal(game.api.startSiege().ok,true);
    finish(game,defeat);
    assert.equal(game.api.retrySiege(),true);
    assert.deepEqual(game.state,before);
  }
});
