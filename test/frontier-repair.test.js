import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/campaign.js';
import { CONFIG } from '../src/config.js';
import { damageStructure } from '../src/sim/grid.js';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies.js';
import { initializeBattleEconomy } from '../src/sim/frontier/economy.js';
import { startEmergencyRepair, emergencyRepairCheck, cancelEmergencyRepair,
  stepFrontierRepairs, emergencyRepairDuration } from '../src/sim/frontier/repair.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

function fixture(field=1) {
  const game=createGame({stage:'frontier',skills:{communication:1,structural:1,field,mechanical:1}});
  assert.equal(game.api.place('wall',8,18).ok,true);
  assert.equal(game.api.startSiege().ok,true);
  game.state.schedule=[{t:1000,type:'boss',lane:1}];
  game.state.spawnIndex=0;
  const wall=game.state.structures.find(s=>s.type==='wall'&&s.x===8&&s.y===18);
  wall.hp=80;
  return {game,state:game.state,wall};
}

function repairFor(state,seconds,dt=1/60) {
  const count=Math.round(seconds/dt);
  for(let i=0;i<count;i++) {
    state.time+=dt;
    stepFrontierRepairs(state,dt);
  }
}

test('Frontier emergency repair waits for actual enemy damage; proximity and friendly damage do not block it',()=>{
  const {state,wall}=fixture();
  const nearby=spawnEnemy(state,'foot',8.5,17.5);
  assert.equal(emergencyRepairCheck(state,8,18).ok,true);
  damageStructure(state,wall,1,'friendly');
  assert.equal(wall.lastEnemyDamageAt,undefined);
  damageStructure(state,wall,1,'enemy');
  assert.equal(wall.lastEnemyDamageAt,state.time);
  assert.equal(emergencyRepairCheck(state,8,18).reason,'Cannot repair — Wall is under attack.');
  state.time=2.99;
  assert.equal(emergencyRepairCheck(state,8,18).reason,'Cannot repair — Wait until 3 seconds after the last hit.');
  state.time=3;
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  assert.match(emergencyRepairCheck(state,8,18).reason,/already running/);
  assert.ok(nearby.hp>0,'nearby living enemy does not replace last-hit tracking');
});

test('enemy interruption keeps restored HP and paid gold; a restarted repair spends only its remaining allowance',()=>{
  const {state,wall}=fixture(),gold=state.gold;
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  repairFor(state,2);
  near(wall.hp,100);
  near(wall.emergencyRepairUsed,20);
  near(state.emergency.repairSpending,1.5);
  near(state.gold,gold-1.5);
  const beforeHit=wall.hp,paid=state.emergency.repairSpending;
  damageStructure(state,wall,10,'enemy');
  assert.equal(wall.emergencyRepair.status,'interrupted');
  near(wall.hp,beforeHit-10);
  repairFor(state,2.9);
  near(wall.hp,beforeHit-10);
  near(state.emergency.repairSpending,paid);
  assert.equal(startEmergencyRepair(state,8,18).ok,false);
  state.time=wall.lastEnemyDamageAt+3;
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  repairFor(state,5);
  near(wall.hp,120);
  near(wall.emergencyRepairUsed,50);
  near(state.emergency.repairSpending,3.75);
  assert.match(emergencyRepairCheck(state,8,18).reason,/allowance used/);
});

test('cancel and restart retain the cumulative 25% allowance without a refund',()=>{
  const {state,wall}=fixture();
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  repairFor(state,1);
  near(wall.emergencyRepairUsed,10);
  assert.equal(cancelEmergencyRepair(state,8,18).ok,true);
  const gold=state.gold;
  repairFor(state,2);
  near(wall.hp,90);near(state.gold,gold);
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  repairFor(state,5);
  near(wall.hp,130);
  near(wall.emergencyRepairUsed,wall.maxHp*CONFIG.frontier.repair.allowanceFraction);
  assert.equal(wall.emergencyRepair.status,'completed');
  assert.equal(startEmergencyRepair(state,8,18).ok,false);
});

test('repairs reject destroyed works, Class B, civilian and client-owned military structures, keeps and Canyon battle',()=>{
  const {state,wall}=fixture();
  const before=state.gold;
  for(const changes of [{destroyed:true},{hp:0},{owner:'client'},{npcOwned:true},{enemy:true},
    {type:'barricade'},{type:'house'},{type:'keep'}]) {
    const old={...wall};Object.assign(wall,changes);
    assert.equal(startEmergencyRepair(state,8,18).ok,false,JSON.stringify(changes));
    Object.assign(wall,old);
    for(const key of Object.keys(changes)) if(!(key in old)) delete wall[key];
  }
  assert.equal(startEmergencyRepair(state,50,1).ok,false);
  assert.equal(state.gold,before);
  state.stageId='canyon';
  assert.equal(startEmergencyRepair(state,8,18).ok,false);
});

test('old rubble at a preparation-rebuilt footprint cannot hide the surviving repair target',()=>{
  const {state,wall}=fixture();
  state.structures.unshift({...wall,id:'old-destroyed-wall',destroyed:true,hp:0});
  const result=startEmergencyRepair(state,8,18);
  assert.equal(result.ok,true);
  assert.equal(result.structure.id,wall.id);
});

test('repair pays for partial HP when funds run out and can use earned bounties beyond the client allowance',()=>{
  const {state,wall}=fixture();
  state.gold=1;
  initializeBattleEconomy(state);
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  repairFor(state,5);
  near(state.gold,0);
  near(wall.hp,80+1/.075);
  near(state.emergency.repairSpending,1);
  assert.equal(wall.emergencyRepair.status,'unaffordable');
  assert.match(emergencyRepairCheck(state,8,18).reason,/Not enough gold/);
  const enemy=spawnEnemy(state,'powder',50.5,20.5);
  damageEnemy(state,enemy,1000);
  state.emergency.clientEmergencySpent=CONFIG.frontier.emergencyCap;
  assert.equal(startEmergencyRepair(state,8,18).ok,true);
  repairFor(state,5);
  near(wall.emergencyRepairUsed,50);
  assert.ok(state.emergency.bountySpent>0);
  near(state.emergency.repairSpending,3.75);
});

test('Field levels shorten repair and timestep partitions preserve restored HP and ledger',()=>{
  const durations=[5,4.25,3.5,2.75];
  for(let field=1;field<=4;field++) {
    const {state,wall}=fixture(field);
    near(emergencyRepairDuration(state),durations[field-1]);
    assert.equal(startEmergencyRepair(state,8,18).ok,true);
    repairFor(state,durations[field-1],.25);
    near(wall.hp,130);
    assert.equal(wall.emergencyRepair.status,'completed');
  }
  const outcomes=[1/60,.05,.25].map(dt=>{
    const {state,wall}=fixture();
    assert.equal(startEmergencyRepair(state,8,18).ok,true);
    repairFor(state,5,dt);
    return {hp:wall.hp,used:wall.emergencyRepairUsed,spent:state.emergency.repairSpending,
      gold:state.gold,client:state.emergency.clientEmergencySpent,status:wall.emergencyRepair.status};
  });
  for(const outcome of outcomes.slice(1)) {
    for(const key of ['hp','used','spent','gold','client']) near(outcome[key],outcomes[0][key]);
    assert.equal(outcome.status,outcomes[0].status);
  }
});

test('public repair advances with siege simulation time and retry restores its exact checkpoint',()=>{
  const game=createGame({stage:'frontier'});
  assert.equal(game.api.place('wall',8,18).ok,true);
  game.state.structures.find(s=>s.type==='wall').hp=80;
  const before=structuredClone(game.state);
  assert.equal(game.api.startSiege().ok,true);
  game.state.schedule=[{t:1000,type:'boss',lane:1}];
  assert.equal(game.api.emergencyRepair(8,18).ok,true);
  game.api.stepSeconds(1);
  const wall=game.state.structures.find(s=>s.type==='wall');
  near(wall.hp,90);
  assert.equal(game.api.retrySiege(),true);
  assert.deepEqual(game.state,before);
});
