import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { spawnEnemy, damageEnemy } from '../src/sim/enemies.js';
import { stepExplosions } from '../src/sim/explosions.js';
import { availableEmergencyGold, spendEmergencyGold } from '../src/sim/frontier/economy.js';
import { calculateContractResults, finalizeContract } from '../src/sim/frontier/contract.js';
import { advance } from './helpers.js';

function battle(clientGold) {
  const game=createGame({stage:'frontier'});
  if(clientGold!==undefined) game.state.gold=clientGold;
  assert.equal(game.api.startSiege().ok,true);
  game.state.schedule=[{t:1000,type:'boss',lane:0}];game.state.spawnIndex=0;
  return game;
}
function kill(state,type='boss') {
  const enemy=spawnEnemy(state,type,52.5,20.5);
  damageEnemy(state,enemy,enemy.hp);
  return enemy;
}

test('Frontier bounty credits live treasury once per enemy id, including duplicate death objects',()=>{
  const {state}=battle(),before=state.gold;
  for(const [type,bounty] of Object.entries(CONFIG.bounties)) {
    const enemy=spawnEnemy(state,type,52.5,20.5),duplicate=structuredClone(enemy),gold=state.gold;
    damageEnemy(state,enemy,enemy.hp-1);
    assert.equal(state.gold,gold);
    damageEnemy(state,enemy,1);damageEnemy(state,duplicate,duplicate.hp);damageEnemy(state,enemy,1);
    assert.equal(state.gold,gold+bounty);
    assert.equal(state.stats.bountyCounts[type],1);
    assert.equal(state.eventLog.filter(e=>e.type==='bounty'&&e.entityId===enemy.id).length,1);
  }
  const earned=Object.values(CONFIG.bounties).reduce((n,b)=>n+b,0);
  assert.equal(state.emergency.bountyEarned,earned);
  assert.equal(state.stats.bountyGold,earned);
  assert.equal(state.stats.enemiesDefeated,4);
  assert.equal(state.gold,before+earned);
});

test('Frontier explosion chains credit every victim once through the bounty ledger',()=>{
  const {state}=battle(),before=state.gold;
  const units=[spawnEnemy(state,'powder',20,20),spawnEnemy(state,'powder',21.8,20),
    spawnEnemy(state,'powder',23.6,20),spawnEnemy(state,'foot',21.8,20),spawnEnemy(state,'boss',23.6,20)];
  units.at(-1).hp=1;
  damageEnemy(state,units[0],10000);
  advance(state,stepExplosions,CONFIG.explosion.chainDelay*4);
  assert.ok(units.every(e=>e.hp===0));
  const earned=CONFIG.bounties.powder*3+CONFIG.bounties.foot+CONFIG.bounties.boss;
  assert.equal(state.gold,before+earned);assert.equal(state.emergency.bountyEarned,earned);
  assert.equal(state.emergency.paidEnemyIds.length,units.length);
  advance(state,stepExplosions,1);
  assert.equal(state.gold,before+earned);
});

test('emergency ledger spends client allowance first, then uncapped bounty, separating construction and repair',()=>{
  const {state}=battle(500);
  kill(state);kill(state);kill(state);
  assert.equal(availableEmergencyGold(state),CONFIG.frontier.emergencyCap+300);
  assert.equal(spendEmergencyGold(state,100,'construction'),100);
  assert.equal(spendEmergencyGold(state,80,'repair'),80);
  assert.equal(state.emergency.clientEmergencySpent,120);
  assert.equal(state.emergency.bountySpent,60);
  assert.equal(state.emergency.constructionSpending,100);
  assert.equal(state.emergency.repairSpending,80);
  assert.equal(state.emergency.constructionFunds,380);
  assert.equal(spendEmergencyGold(state,1000,'repair'),240);
  assert.equal(state.emergency.bountySpent,300,'bounty spending is not subject to the 120 G client cap');
  assert.equal(state.gold,380,'remaining council funds stay visible but cannot bypass their allowance');
  assert.equal(availableEmergencyGold(state),0);
});

test('bounty pays emergency construction when the client treasury is empty, without double-paying results',()=>{
  const game=battle(0),state=game.state;
  kill(state);
  assert.equal(game.api.placeEmergency('palisade',8,18).ok,true);
  assert.equal(state.gold,CONFIG.bounties.boss-CONFIG.structures.palisade.cost);
  assert.equal(state.emergency.clientEmergencySpent,0);
  assert.equal(state.emergency.bountySpent,CONFIG.structures.palisade.cost);
  state.phase='victory';
  const report=calculateContractResults(state);
  assert.equal(report.bountyGold,100);assert.equal(report.unspentBounty,88);
  assert.equal(report.constructionSpending,12);assert.equal(report.repairSpending,0);
  assert.equal(report.finalEarnings,report.mayorPayment+report.ownerRewardTotal+report.thankYouTotal+88);
  const gold=state.gold;
  const paid=finalizeContract(state);
  assert.equal(finalizeContract(state),paid);assert.equal(state.gold,gold);
});

test('Frontier retry restores source ledger, death ids and treasury; restart clears attempt bounties',()=>{
  const game=battle(),checkpoint=structuredClone(game.state.snapshot);
  for(let i=0;i<2;i++) {
    if(i) assert.equal(game.api.startSiege().ok,true);
    kill(game.state);
    assert.equal(game.api.placeEmergency('caltrops',8,18).ok,true);
    spendEmergencyGold(game.state,125,'repair');
    assert.ok(game.state.emergency.bountySpent>0);
    assert.equal(game.api.retrySiege(),true);
    assert.deepEqual(game.state,checkpoint);
  }
  assert.equal(game.api.startSiege().ok,true);kill(game.state);
  assert.equal(game.api.restartCampaign(),true);
  assert.equal(game.state.gold,CONFIG.frontier.budget);
  assert.equal(game.state.emergency.bountyEarned,0);
  assert.deepEqual(game.state.emergency.paidEnemyIds,[]);
});

test('living makeshift limit includes preparation works and reserved sites, and destroyed works free capacity',()=>{
  const game=createGame({stage:'frontier'});
  for(let i=0;i<CONFIG.frontier.maxMakeshiftStructures;i++) assert.equal(game.api.place('caltrops',7+i,9).ok,true);
  assert.equal(game.api.startSiege().ok,true);
  assert.match(game.api.placeEmergency('caltrops',8,18).reason,/makeshift/);
  const hazard=game.state.structures.find(s=>s.type==='caltrops');hazard.hp=0;hazard.destroyed=true;
  assert.equal(game.api.placeEmergency('caltrops',8,18).ok,true);
  assert.match(game.api.placeEmergency('caltrops',9,18).reason,/makeshift/);
});
