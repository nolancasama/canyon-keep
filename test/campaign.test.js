import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { SITES } from '../src/data/map.js';
import { createGame, calculateResults } from '../src/sim/campaign.js';
import { damageStructure } from '../src/sim/grid.js';
import { createInhabitants, stepInhabitants } from '../src/sim/inhabitants.js';
import { spawnEnemy, damageEnemy, stepEnemies } from '../src/sim/enemies.js';
import { structure, advance, crossing } from './helpers.js';

function finish(game, defeat=false) {
  game.state.schedule=[];game.state.spawnIndex=0;game.state.enemies=[];
  if(defeat) damageStructure(game.state,game.state.structures[0],100000);
  game.api.tick();
  assert.equal(game.state.phase,defeat?'defeat':'victory','HARNESS_PRECONDITION_FAILED: synthetic result');
}

test('capacity is informative and homes track four inhabitants per authority-owned house',()=>{
  const game=createGame();
  game.state.population=14;createInhabitants(game.state);
  assert.equal(game.api.canStart().ok,true);
  structure(game.state,'house',52,10);
  structure(game.state,'house',55,10);
  createInhabitants(game.state);
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
  assert.equal(game.api.canStart().ok,true);
});

test('readiness reports only the trade road and updates after preparation actions',()=>{
  const game=createGame();
  const read=()=>Object.fromEntries(game.api.readiness().map(r=>[r.id,r]));
  const initial=game.api.readiness();
  assert.equal(initial.length,1);
  assert.deepEqual(initial.map(r=>r.id),['tradeRoad']);
  assert.ok(initial.every(r=>r.ok&&typeof r.message==='string'));
  const before=JSON.stringify(game.state);
  initial[0].ok=false;
  assert.equal(game.api.readiness()[0].ok,true,'returned observations do not mutate readiness');
  assert.equal(JSON.stringify(game.state),before,'readiness observation is pure');
  game.state.population=14;
  const line=crossing(5);
  for(const {x,y} of line) assert.equal(game.api.place('wall',x,y).ok,true);
  let requirements=read();
  assert.equal(requirements.tradeRoad.message,'Castle entrance blocked. Install a gate to create a route to the keep.');
  assert.equal(game.api.readiness().filter(r=>!r.ok).length,1);
  assert.equal(game.api.canStart().ok,false);
  assert.equal(game.api.startSiege().ok,false);
  assert.equal(game.api.canStart().ok,false,'road alone still prevents starting');
  const p=line[2];
  assert.equal(game.api.place('gate',p.x,p.y).ok,true);
  assert.equal(game.api.readiness().every(r=>r.ok),true);
  assert.equal(game.api.canStart().ok,true);
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

test('reward breakdown excludes prepaid bounties and retains bonuses, penalties and payout floor',()=>{
  const game=createGame();
  game.api.startSiege();
  let s=game.state;s.phase='victory';s.stats.bossDefeated=true;
  const perfect=calculateResults(s);
  const rules=CONFIG.rewards,completion=rules.completion[0];
  assert.deepEqual(perfect.bonuses.map(l=>l.amount),[completion,100,75,50,50]);
  assert.deepEqual(perfect.penalties.map(l=>l.amount),[-0,0,-0,-0]);
  assert.equal(perfect.payout,Math.max(rules.floor,completion+275));
  assert.equal(perfect.bonuses.some(l=>l.key==='boss'),false);
  s.snapshot.gold=300; // Exactly 70% spent does not earn the economical bonus.
  s.structures[0].hp-=100;
  s.keepReached=true;s.stats.keepReachedEnemies=9;s.inhabitants[0].hp=0;
  let r=calculateResults(s);
  assert.deepEqual(r.bonuses.map(l=>l.amount),[completion,0,0,50,0]);
  assert.deepEqual(r.penalties.map(l=>l.amount),[-40,-50,-10,-0]);
  assert.equal(r.payout,Math.max(rules.floor,completion-50));
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
  assert.equal(r.floorApplied,true);assert.equal(r.payout,rules.floor);
  s.phase='defeat';r=calculateResults(s);
  assert.equal(r.payout,0);assert.equal(r.floorApplied,false);
});

test('Continue pays once, grows and rehomes the settlement, preserves military damage and completes',()=>{
  const game=createGame(42);
  assert.equal(game.api.continueCampaign(),false);
  for(let index=1;index<=3;index++) {
    if(game.state.growthReport) game.api.dismissGrowthReport();
    const housesBefore=game.state.structures.filter(s=>s.type==='house').length;
    const farmsBefore=game.state.structures.filter(s=>s.type==='farm').length;
    assert.equal(game.api.startSiege().ok,true);
    const state=game.state,wall=structure(state,'wall',50,17);
    damageStructure(state,wall,999);
    state.structures[0].hp-=10;
    const keepHp=state.structures[0].hp;
    state.attackMarkers.push({x:52,y:15,t:0});
    finish(game);
    assert.equal(state.results.tier,'exceptional');
    assert.ok(state.results.rating>=95&&state.results.rating<=100);
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
      assert.equal(state.results,undefined);
      assert.ok(game.state.growthReport);
      assert.equal(game.state.growthReport.tier,'exceptional');
      const houses=game.state.structures.filter(s=>s.type==='house'&&!s.destroyed);
      const farms=game.state.structures.filter(s=>s.type==='farm'&&!s.destroyed);
      assert.equal(houses.length-housesBefore,3,'near-perfect defense earns exceptional house growth');
      assert.equal(farms.length-farmsBefore,2);
      assert.equal(game.state.population,6+4*houses.length);
      assert.equal(game.state.inhabitants.length,game.state.population);
      assert.ok(game.api.capacity().food>=game.state.population);
      for(const house of houses) assert.equal(game.state.inhabitants.filter(p=>p.homeId===house.id).length,4);
      assert.equal(game.api.readiness().every(r=>r.ok),true);
    } else {
      assert.equal(game.state.growthReport,null,'final siege does not grow the settlement');
      assert.equal(game.state.structures.filter(s=>s.type==='house').length,housesBefore);
      assert.equal(game.state.structures.filter(s=>s.type==='farm').length,farmsBefore);
      assert.equal(game.state.results.tier,'exceptional','campaign completion retains final defense rating');
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
    game.state.population=6+4*(index-1);
    if(index>1) {
      structure(game.state,'house',51,10);structure(game.state,'farm',57,10);
      if(index===3){structure(game.state,'house',54,10);structure(game.state,'farm',57,13);}
    }
    game.api.place('pendulum',SITES[1].x,SITES[1].y);
    game.state.rng.seed=8712;
    const before=structuredClone(game.state);
    assert.equal(game.api.startSiege().ok,true);
    game.api.stepSeconds(1);
    damageEnemy(game.state,spawnEnemy(game.state,'boss',20,20),99999);
    damageEnemy(game.state,spawnEnemy(game.state,'foot',20,20),99999);
    assert.equal(game.state.gold,before.gold+CONFIG.bounties.boss+CONFIG.bounties.foot);
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

test('bounty result total is informational and Continue never pays it twice',()=>{
  const game=createGame();
  assert.equal(game.api.startSiege().ok,true);
  const before=game.state.gold;
  for(const type of ['foot','chiseler','powder','boss']) damageEnemy(game.state,spawnEnemy(game.state,type,20,20),99999);
  game.state.explosions=[];
  finish(game);
  const expected=Object.values(CONFIG.bounties).reduce((sum,n)=>sum+n,0);
  assert.equal(game.state.results.bountyGold,expected);
  assert.equal(game.state.results.bountyGold,game.state.stats.bountyGold);
  assert.equal(game.state.gold,before+expected);
  const payout=game.state.results.payout;
  assert.equal(game.api.continueCampaign(),true);
  assert.equal(game.state.gold,before+expected+payout);
});

test('Continue rebuilds destroyed civilian buildings for free before growth and retry does not duplicate growth',()=>{
  const game=createGame();
  const house=structure(game.state,'house',52,10),farm=structure(game.state,'farm',55,10);
  game.state.population=10;
  createInhabitants(game.state);
  assert.equal(game.api.startSiege().ok,true);
  damageStructure(game.state,house,999);
  damageStructure(game.state,farm,999);
  finish(game);
  const treasury=game.state.gold,payout=game.state.results.payout;
  assert.equal(game.api.continueCampaign(),true);
  assert.equal(game.state.gold,treasury+payout,'rebuild and growth consume no gold');
  for(const old of [house,farm]) {
    const restored=game.state.structures.find(s=>s.type===old.type&&s.x===old.x&&s.y===old.y&&!s.destroyed);
    assert.ok(restored,'civilian footprint is restored');
    assert.equal(restored.hp,restored.maxHp);
  }
  game.api.dismissGrowthReport();
  const afterGrowth=structuredClone(game.state);
  for(let i=0;i<2;i++) {
    assert.equal(game.api.startSiege().ok,true);
    damageEnemy(game.state,spawnEnemy(game.state,'boss',20,20),99999);
    finish(game);
    assert.equal(game.api.retrySiege(),true);
    assert.deepEqual(game.state,afterGrowth);
  }
});

test('growth highlights last through the report and previews, then stop on construction or eight prep seconds',()=>{
  const game=createGame();
  assert.equal(game.api.startSiege().ok,true);
  finish(game);
  assert.equal(game.api.continueCampaign(),true);
  const highlight=structuredClone(game.state.growthHighlight);
  assert.ok(highlight.ids.length>0,'HARNESS_PRECONDITION_FAILED: Continue added buildings');
  game.api.advancePrep(CONFIG.growth.highlightDuration);
  assert.deepEqual(game.state.growthHighlight,highlight,'reading the report does not consume highlight time');
  game.api.dismissGrowthReport();
  const point=crossing(5)[0];
  game.api.previewLine('wall',point.x,point.y,point.x,point.y);
  assert.deepEqual(game.state.growthHighlight,highlight,'previews do not mutate highlights');
  assert.equal(game.api.place('wall',0,0).ok,false);
  assert.deepEqual(game.state.growthHighlight,highlight);
  assert.equal(game.api.place('wall',point.x,point.y).ok,true);
  assert.equal(game.state.growthHighlight,null);
  assert.equal(game.api.startSiege().ok,true);
  finish(game);
  assert.equal(game.api.continueCampaign(),true);
  game.api.dismissGrowthReport();
  game.api.advancePrep(CONFIG.growth.highlightDuration/2);
  assert.ok(game.state.growthHighlight);
  game.api.advancePrep(CONFIG.growth.highlightDuration/2);
  assert.equal(game.state.growthHighlight,null);
});
