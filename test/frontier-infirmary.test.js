import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { spawnEnemy, stepEnemies } from '../src/sim/enemies.js';
import { stepExplosions } from '../src/sim/explosions.js';
import { initializeInfirmaries, stepInfirmaries } from '../src/sim/frontier/infirmary.js';
import { stepFrontierNpcs, npcWalkable } from '../src/sim/frontier/npcs.js';

function fixture() {
  const state=createGame({stage:'frontier'}).state,keep=state.structures.find(s=>s.type==='keep');
  state.inhabitants=[];state.militia=[];state.archers=[];state.cavalry=[];state.enemies=[];
  for(const unit of state.guards) {unit.x=keep.x+.5;unit.y=keep.y+.5;unit.hp=unit.maxHp;}
  initializeInfirmaries(state);return {state,keep};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} ~= ${expected}`);

test('keep infirmary prioritizes two most wounded, heals 3 HP/s each and consumes exactly 120 HP',()=>{
  const {state}=fixture(),[a,b,c,dead]=state.guards;
  a.hp=10;b.hp=20;c.hp=30;dead.hp=0;
  state.golems=[{id:'excluded-golem',hp:1,maxHp:350,x:a.x,y:a.y,status:'active'}];
  stepInfirmaries(state,1);
  assert.deepEqual(state.infirmaries[0].patients,[a.id,b.id]);
  close(a.hp,13);close(b.hp,23);close(c.hp,30);close(state.infirmaries[0].pool,114);
  for(let i=0;i<60;i++) stepInfirmaries(state,1);
  close(a.hp+b.hp+c.hp,180);close(state.infirmaries[0].pool,0);
  assert.equal(dead.hp,0);assert.equal(state.golems[0].hp,1);
  assert.ok(state.infirmaries[0].patients.length<=CONFIG.frontier.infirmary.patients);
});

test('wounded footmen walk to keep and return to their post only after recovery hysteresis',()=>{
  const {state,keep}=fixture(),unit=state.guards[0];state.guards=[unit];
  unit.x=keep.x-1.5;unit.y=keep.y+.5;unit.hp=20;
  const before={x:unit.x,y:unit.y};stepFrontierNpcs(state,1/60);
  assert.equal(unit.healingJourney,true);assert.equal(unit.status,'retreating');
  assert.ok(Math.hypot(unit.x-before.x,unit.y-before.y)<=CONFIG.frontier.guards.speed/60+1e-8);
  assert.equal(unit.hp,20,'travel provides no healing');
  for(let i=0;i<45*60;i++) {
    const wasHealing=unit.healingJourney;stepFrontierNpcs(state,1/60);
    assert.ok(npcWalkable(state,Math.floor(unit.x),Math.floor(unit.y)));
    if(wasHealing&&!unit.healingJourney) assert.ok(unit.hp>=unit.maxHp*CONFIG.frontier.infirmary.recoverFraction);
  }
  assert.equal(unit.healingJourney,false);assert.equal(unit.status,'holding');
});

test('infirmary pauses during fighting and stops immediately when its keep falls',()=>{
  const {state,keep}=fixture(),unit=state.guards[0];state.guards=[unit];unit.hp=20;
  const enemy=spawnEnemy(state,'foot',unit.x,unit.y);
  stepInfirmaries(state,1);assert.equal(unit.hp,20);assert.equal(state.infirmaries[0].pool,120);
  enemy.hp=0;stepInfirmaries(state,1);assert.equal(unit.hp,23);
  keep.hp=0;keep.destroyed=true;stepInfirmaries(state,1);
  assert.equal(unit.hp,23);assert.equal(state.infirmaries[0].pool,117);
  assert.deepEqual(state.infirmaries[0].patients,[]);assert.equal(unit.healingJourney,false);
});

test('archers, cavalry and militia can receive care independently at each living keep',()=>{
  const {state,keep}=fixture(),sample=state.guards[0];state.guards=[];
  const second={...keep,id:'second-infirmary',x:8,y:18};state.structures.push(second);
  state.archers=[{...sample,id:'patient-archer',type:'archer',maxHp:60,hp:10}];
  state.cavalry=[{...sample,id:'patient-rider',type:'cavalry',maxHp:130,hp:10,status:'rest'}];
  state.militia=[{...sample,id:'patient-militia',type:'militia',maxHp:55,hp:10,x:second.x+.5,y:second.y+.5}];
  initializeInfirmaries(state);stepInfirmaries(state,1);
  for(const unit of [...state.archers,...state.cavalry,...state.militia]) assert.equal(unit.hp,13);
  assert.equal(state.infirmaries.length,2);assert.deepEqual(state.infirmaries.map(i=>i.pool),[114,117]);
});

test('new conventional defenders take ordinary enemy damage, explosions and brute slams',()=>{
  const {state,keep}=fixture(),sample=state.guards[0];state.guards=[];
  const archer={...sample,id:'blast-archer',type:'archer',hp:60,maxHp:60,wallNodeId:'wall-node'};
  const rider={...sample,id:'melee-rider',type:'cavalry',hp:130,maxHp:130};
  state.archers=[archer];state.cavalry=[rider];
  const foot=spawnEnemy(state,'foot',rider.x,rider.y);stepEnemies(state,1);
  assert.ok(rider.hp<130,'ground rider can be attacked');assert.equal(archer.hp,60,'mounted archer is not a ground target');
  state.explosions=[{x:archer.x,y:archer.y,at:0}];stepExplosions(state);
  assert.equal(archer.hp,0,'blast reaches mounted defenders');
  foot.hp=0;rider.hp=130;rider.x=keep.x-.5;rider.y=keep.y+1.5;
  const boss=spawnEnemy(state,'boss',rider.x,rider.y);boss.attackPhase='windup';boss.windupRemaining=0;boss.walkTarget={x:keep.x,y:keep.y+1};
  stepEnemies(state,1/60);assert.equal(rider.hp,0,'brute slam reaches riders');
});
