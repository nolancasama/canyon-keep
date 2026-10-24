import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { npcWalkable } from '../src/sim/frontier/npcs.js';
import { stepCavalry } from '../src/sim/frontier/cavalry.js';
import { initializeInfirmaries, stepInfirmaries } from '../src/sim/frontier/infirmary.js';

function fixture(secondGate=false) {
  const state=createGame({stage:'frontier',seed:77}).state;
  const map=Array.from({length:36},(_,y)=>Array.from({length:64},(_,x)=>x>=2&&x<=22&&y>=2&&y<=14?'.':'#').join(''));
  state.frontierMap={...(state.frontierMap??{}),map,roads:[{x:14,y:8}],spawns:[{x:21,y:8}]};
  const keep={id:'keep',type:'keep',x:5,y:7,w:3,h:3,hp:2000,maxHp:2000};
  state.structures=[keep];state.enemies=[];state.guards=[];state.militia=[];state.inhabitants=[];state.phase='siege';
  for(let y=2;y<=14;y++) state.structures.push({id:`curtain-${y}`,type:y===8||secondGate&&y===12?'gate':'wall',
    x:10,y,w:1,h:1,hp:130,maxHp:130});
  const rules=CONFIG.frontier.cavalry,unit={id:'rider',type:'cavalry',keepId:keep.id,x:8.5,y:8.5,
    hp:rules.hp,maxHp:rules.hp,status:'waiting',attackCooldown:0};
  state.cavalry=[unit];state.flowRevision++;
  return {state,unit,keep,gate:state.structures.find(s=>s.type==='gate')};
}

function advance(state,seconds,onStep) {
  for(let i=0;i<Math.ceil(seconds*60);i++) {stepCavalry(state,1/60);onStep?.();}
}
function until(state,predicate,seconds=30,onStep) {
  for(let i=0;i<seconds*60&&!predicate();i++) {stepCavalry(state,1/60);onStep?.();}
  assert.ok(predicate(),'autonomous cavalry reached expected state within the fixture limit');
}

test('cavalry sortie through a gate, charge, retreat through it, rest and observe cooldown',()=>{
  const {state,unit}=fixture(),enemy=spawnEnemy(state,'foot',14.5,8.5),visited=new Set();
  enemy.hp=enemy.maxHp=1000;
  const record=()=>{
    assert.ok(npcWalkable(state,Math.floor(unit.x),Math.floor(unit.y)),'rider never occupies an intact wall');
    visited.add(`${Math.floor(unit.x)},${Math.floor(unit.y)}`);
  };
  until(state,()=>unit.status==='engage',20,record);
  assert.ok(visited.has('10,8'),'outward route traverses the intact gate');
  until(state,()=>enemy.hp<1000,10,record);
  assert.equal(1000-enemy.hp,CONFIG.frontier.cavalry.damage+CONFIG.frontier.cavalry.chargeDamage,'first hit receives the charge bonus');
  unit.hp=unit.maxHp*CONFIG.frontier.cavalry.retreatFraction;
  until(state,()=>unit.status==='retreat',1,record);
  until(state,()=>unit.status==='rest',20,record);
  assert.ok(unit.x<10,'wounded rider has returned inside the curtain');
  until(state,()=>unit.status==='cooldown',5);
  const remaining=unit.cooldownRemaining;
  advance(state,remaining/2);assert.equal(unit.status,'cooldown');
  unit.hp=unit.maxHp;
  until(state,()=>unit.status==='waiting',CONFIG.frontier.cavalry.cooldown+1);
});

test('cavalry re-route to another intact gate when their original return gate is destroyed',()=>{
  const {state,unit,gate}=fixture(true),enemy=spawnEnemy(state,'chiseler',14.5,8.5);
  enemy.hp=enemy.maxHp=1000;
  until(state,()=>unit.status==='engage');
  unit.hp=unit.maxHp*.3;stepCavalry(state,1/60);stepCavalry(state,1/60);
  assert.equal(unit.status,'return');assert.equal(unit.gateId,gate.id);
  gate.hp=0;gate.destroyed=true;state.flowRevision++;
  stepCavalry(state,1/60);
  assert.equal(unit.gateId,'curtain-12');
  const crossed=new Set();
  until(state,()=>unit.status==='rest',30,()=>{
    crossed.add(`${Math.floor(unit.x)},${Math.floor(unit.y)}`);
    assert.ok(npcWalkable(state,Math.floor(unit.x),Math.floor(unit.y)));
  });
  assert.ok(crossed.has('10,12'),'return uses the surviving gate');
});

test('cavalry already through a return gate continue home when the gate or unrelated walls fall',()=>{
  const {state,unit,gate}=fixture(),enemy=spawnEnemy(state,'chiseler',14.5,8.5);enemy.hp=1000;
  until(state,()=>unit.status==='engage');unit.hp=unit.maxHp*.3;
  until(state,()=>unit.status==='return'&&unit.returnInside);
  const x=unit.x;gate.hp=0;gate.destroyed=true;state.flowRevision++;
  until(state,()=>unit.status==='rest',20,()=>{
    assert.ok(unit.x<=x+1e-8,'returned rider never heads outside again');
    assert.ok(unit.x<10);
  });
});

test('concave gate interiors are classified by connectivity rather than distance to keep',()=>{
  const {state,unit}=fixture(),cells=Array.from({length:36},()=>Array(64).fill('#'));
  for(let x=9;x<=17;x++) cells[4][x]='.';
  for(let y=4;y<=8;y++) cells[y][9]='.';
  for(let x=9;x<=20;x++) cells[8][x]='.';
  for(let y=4;y<=6;y++) for(let x=15;x<=17;x++) cells[y][x]='.';
  state.frontierMap.map=cells.map(row=>row.join(''));
  state.structures=[{id:'keep',type:'keep',x:15,y:4,w:3,h:3,hp:2000,maxHp:2000},
    {id:'concave-gate',type:'gate',x:10,y:8,w:1,h:1,hp:130,maxHp:130}];
  unit.x=9.5;unit.y=7.5;state.flowRevision++;
  const enemy=spawnEnemy(state,'chiseler',14.5,8.5);enemy.hp=1000;
  const visited=new Set();
  until(state,()=>unit.status==='engage',20,()=>{
    assert.ok(npcWalkable(state,Math.floor(unit.x),Math.floor(unit.y)));
    visited.add(`${Math.floor(unit.x)},${Math.floor(unit.y)}`);
  });
  assert.ok(visited.has('10,8'));assert.ok(unit.x>10,'sortie exits the concave courtyard');
});

test('stranded cavalry shelter outside a lost gate, defend themselves and resume when a gate returns',()=>{
  const {state,unit,gate}=fixture(),enemy=spawnEnemy(state,'chiseler',14.5,8.5);
  enemy.hp=enemy.maxHp=1000;
  until(state,()=>unit.status==='engage');
  unit.hp=unit.maxHp*.3;gate.hp=0;gate.destroyed=true;state.flowRevision++;
  until(state,()=>unit.status==='stranded');
  enemy.hp=0;advance(state,5);
  assert.ok(unit.x>10,'no intact gate means riders shelter on its outside, despite the open breach');
  const attacker=spawnEnemy(state,'foot',unit.x,unit.y),before=attacker.hp;
  advance(state,CONFIG.frontier.cavalry.interval+1);
  assert.ok(attacker.hp<before,'stranded riders can fight defensively');
  gate.destroyed=false;gate.hp=130;state.flowRevision++;
  until(state,()=>unit.status==='rest',20);
});

test('cavalry hold without gates and never use an intact wall as an exit',()=>{
  const {state,unit,gate}=fixture();gate.type='wall';state.flowRevision++;
  spawnEnemy(state,'powder',14.5,8.5);
  advance(state,8);assert.equal(unit.status,'waiting');assert.equal(unit.x,8.5);
  assert.equal(unit.y,8.5);
});

test('cavalry abandon sorties when outnumbered and infirmary journeys retain movement ownership',()=>{
  const {state,unit}=fixture();
  const target=spawnEnemy(state,'chiseler',14.5,8.5);target.hp=1000;
  until(state,()=>unit.status==='engage');
  for(let i=0;i<CONFIG.frontier.cavalry.outnumbered;i++) spawnEnemy(state,'foot',unit.x,unit.y);
  stepCavalry(state,1/60);assert.equal(unit.status,'retreat');
  unit.healingJourney={keepId:'keep'};const before=structuredClone(unit);
  advance(state,3);assert.deepEqual(unit,before,'infirmary alone moves and heals its patients');
});

test('wounded cavalry complete their gate return before healing and resume with a sortie cooldown',()=>{
  const {state,unit}=fixture(),enemy=spawnEnemy(state,'chiseler',14.5,8.5);
  enemy.hp=enemy.maxHp=1000;initializeInfirmaries(state);
  until(state,()=>unit.status==='engage');unit.hp=unit.maxHp*.4;
  stepInfirmaries(state,1/60);assert.equal(unit.healingJourney,false,'infirmary cannot bypass the gate return');
  until(state,()=>unit.status==='rest');
  stepInfirmaries(state,1/60);assert.equal(unit.healingJourney,true);
  const before=unit.hp;
  for(let i=0;i<60;i++) {stepCavalry(state,1/60);stepInfirmaries(state,1/60);}
  assert.ok(Math.abs(unit.hp-before-CONFIG.frontier.infirmary.rate)<1e-8,'rider receives the configured 3 HP per second');
  for(let i=0;i<30*60&&unit.healingJourney;i++) {stepCavalry(state,1/60);stepInfirmaries(state,1/60);}
  assert.equal(unit.healingJourney,false);assert.ok(unit.hp>=unit.maxHp*CONFIG.frontier.cavalry.recoverFraction);
  until(state,()=>unit.status==='cooldown',5);
  assert.ok(unit.cooldownRemaining>0);
});

test('caltrops and narrow corridors reduce cavalry movement and damage',()=>{
  const {state,unit}=fixture();
  const enemy=spawnEnemy(state,'foot',unit.x+.2,unit.y);enemy.hp=enemy.maxHp=1000;
  unit.status='engage';unit.targetId=enemy.id;unit.sortieRemaining=100;unit.chargeReady=false;
  state.structures.push({id:'rider-caltrops',type:'caltrops',x:8,y:8,w:1,h:1,hp:1,maxHp:1},
    ...[7,9].map(y=>({id:`narrow-${y}`,type:'wall',x:8,y,w:1,h:1,hp:200,maxHp:200})));
  state.flowRevision++;stepCavalry(state,1/60);
  const rules=CONFIG.frontier.cavalry;
  assert.ok(Math.abs(1000-enemy.hp-rules.damage*rules.caltropsFactor*rules.narrowFactor)<1e-8);
  enemy.x=9.5;unit.attackCooldown=rules.interval;
  const before=unit.x;stepCavalry(state,1/60);
  assert.ok(Math.abs(unit.x-before-rules.speed*rules.caltropsFactor*rules.narrowFactor/60)<1e-8);
});
