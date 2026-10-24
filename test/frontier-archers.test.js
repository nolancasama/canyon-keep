import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, SIM_DT } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { stepTowers } from '../src/sim/towers.js';
import { npcWalkable } from '../src/sim/frontier/npcs.js';
import { initializeInfirmaries, stepInfirmaries } from '../src/sim/frontier/infirmary.js';
import { wallNetwork, stepArchers, dismountArcher, archerLineOfSight } from '../src/sim/frontier/archers.js';

function fixture() {
  const state=createGame({stage:'frontier',seed:123456}).state;
  state.frontierMap={map:Array.from({length:36},()=>Array(64).fill('.')),districts:[],keep:{x:12,y:12,w:3,h:3}};
  state.structures=[{id:'keep',type:'keep',x:12,y:12,w:3,h:3,hp:2000,maxHp:2000}];
  state.guards=[];state.militia=[];state.inhabitants=[];state.archers=[];state.cavalry=[];state.enemies=[];state.arrows=[];
  state.phase='siege';return state;
}
function piece(state,type,x,y) {
  const rules=CONFIG.structures[type],s={id:`${type}-${x}-${y}`,type,x,y,w:1,h:1,hp:rules.hp,maxHp:rules.hp};
  state.structures.push(s);state.flowRevision++;return s;
}
function archer(state,x,y) {
  const unit={id:`archer-${state.archers.length}`,type:'archer',x,y,postX:x,postY:y,
    hp:CONFIG.frontier.archers.hp,maxHp:CONFIG.frontier.archers.hp,attackCooldown:0};
  state.archers.push(unit);return unit;
}
function enemy(state,x,y) {
  const unit={id:state.nextId++,type:'foot',x,y,hp:40,maxHp:40};state.enemies.push(unit);return unit;
}
function advance(state,seconds,arrows=false) {
  for(let i=0;i<Math.ceil(seconds/SIM_DT);i++) {stepArchers(state,SIM_DT);if(arrows) stepTowers(state,SIM_DT);}
}

test('archer battlements are four-connected intact wall types and integrated towers with real access points',()=>{
  const state=fixture();
  for(const [type,x,y] of [['wall',8,12],['gate',9,12],['spiked',10,12],['golem',11,12],['tower',8,11],
    ['tower',22,12],['launcher',7,12],['retractable',6,12],['wall',4,4]]) piece(state,type,x,y);
  const nodes=wallNetwork(state),at=(x,y)=>nodes.find(n=>n.x===x&&n.y===y);
  assert.equal(nodes.length,6);
  assert.ok(at(8,11).access,'integrated tower stairs');
  assert.ok(at(8,12).access&&at(10,12).access,'gate-flanking stairs');
  assert.ok(at(11,12).access,'wall touching keep');
  assert.equal(at(4,4).access,false);
  assert.equal(at(8,11).component,at(11,12).component);
  assert.notEqual(at(4,4).component,at(8,12).component);
  assert.ok(nodes.every(n=>n.neighbors.every(id=>{
    const next=nodes.find(p=>p.id===id);return Math.abs(next.x-n.x)+Math.abs(next.y-n.y)===1;
  })));
  assert.ok(at(8,11).groundAccess.every(p=>npcWalkable(state,p.x,p.y)));
  assert.deepEqual(JSON.parse(JSON.stringify(nodes)),nodes,'topology is snapshot-safe data');
});

test('archers walk to access, traverse only their connected line and never teleport to a separate wall',()=>{
  const state=fixture();
  for(let x=8;x<=11;x++) piece(state,x===9?'gate':'wall',x,12);
  piece(state,'tower',8,11);piece(state,'wall',18,8);piece(state,'tower',18,7);
  const unit=archer(state,8.5,9.5);enemy(state,15.5,10.5);
  let mounted=false,previous=null;
  for(let i=0;i<12/SIM_DT;i++) {
    const before={x:unit.x,y:unit.y};stepArchers(state,SIM_DT);
    assert.ok(Math.hypot(unit.x-before.x,unit.y-before.y)<=CONFIG.frontier.archers.speed*SIM_DT+1e-7,'walking is speed limited');
    if(unit.wallNodeId) {
      mounted=true;assert.ok(['8,11','8,12','9,12','10,12','11,12'].includes(unit.wallNodeId));
      if(previous&&previous!==unit.wallNodeId) {
        const a=previous.split(',').map(Number),b=unit.wallNodeId.split(',').map(Number);
        assert.equal(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),1);
      }
      previous=unit.wallNodeId;
    }
  }
  assert.ok(mounted);assert.equal(unit.wallNodeId,'11,12','threat draws archer toward the reachable end');
});

test('archer sight excludes its own wall but cliffs and intervening solid structures block shots',()=>{
  const state=fixture(),unit=archer(state,8.5,8.5),target=enemy(state,12.5,8.5);
  piece(state,'wall',8,8);unit.wallNodeId='8,8';
  assert.equal(archerLineOfSight(state,unit,target),true);
  state.frontierMap.map[8][10]='#';assert.equal(archerLineOfSight(state,unit,target),false);
  advance(state,2);assert.equal(state.arrows.length,0);
  state.frontierMap.map[8][10]='.';const blocker=piece(state,'wall',10,8);
  assert.equal(archerLineOfSight(state,unit,target),false);
  blocker.destroyed=true;assert.equal(archerLineOfSight(state,unit,target),true);
  // A diagonal sightline cannot squeeze through two touching cliff corners.
  state.frontierMap.map[8][9]='#';
  assert.equal(archerLineOfSight(state,unit,{x:10.5,y:10.5}),false);
});

test('ground fallback fires visible arrows at the configured interval and applies ranged damage',()=>{
  const state=fixture(),unit=archer(state,10.5,10.5),target=enemy(state,7.5,10.5);
  stepArchers(state,SIM_DT);
  assert.equal(unit.status,'ground_guard');assert.equal(state.arrows.length,1);
  assert.equal(state.arrows[0].damage,CONFIG.frontier.archers.damage);
  assert.equal(state.arrows[0].sourceId,unit.id);
  assert.equal(unit.attackCooldown,CONFIG.frontier.archers.interval);
  stepTowers(state,1);assert.equal(target.hp,40-CONFIG.frontier.archers.damage);
  advance(state,CONFIG.frontier.archers.interval/2);assert.equal(state.arrows.length,0);
  advance(state,CONFIG.frontier.archers.interval);assert.ok(state.arrows.length>=1);
});

test('destroying an occupied battlement drops its archer safely with damage and a stun',()=>{
  const state=fixture(),wall=piece(state,'wall',8,8),unit=archer(state,8.5,8.5);
  unit.wallNodeId='8,8';wall.hp=0;wall.destroyed=true;state.flowRevision++;
  stepArchers(state,SIM_DT);
  assert.equal(unit.wallNodeId,null);assert.equal(unit.hp,unit.maxHp-CONFIG.frontier.archers.fallDamage);
  assert.equal(unit.status,'stunned');assert.ok(unit.stunRemaining>0);
  assert.ok(npcWalkable(state,Math.floor(unit.x),Math.floor(unit.y)));
  assert.equal(Math.abs(Math.floor(unit.x)-8)+Math.abs(Math.floor(unit.y)-8),1);
  const position={x:unit.x,y:unit.y};stepArchers(state,SIM_DT);
  assert.deepEqual({x:unit.x,y:unit.y},position,'stunned archer cannot move or shoot');
  assert.equal(state.arrows.length,0);
});

test('an infirmary journey descends through reachable stairs without jumping between wall components',()=>{
  const state=fixture();
  for(let x=6;x<=10;x++) piece(state,x===7?'gate':'wall',x,8);
  const unit=archer(state,10.5,8.5);unit.wallNodeId='10,8';unit.healingJourney=true;unit.hp=10;
  let grounded=false,walked=false;
  for(let i=0;i<10/SIM_DT&&!grounded;i++) {
    const before={x:unit.x,y:unit.y};grounded=dismountArcher(state,unit,SIM_DT);
    assert.ok(Math.hypot(unit.x-before.x,unit.y-before.y)<=CONFIG.frontier.archers.speed*SIM_DT+1e-7);
    if(unit.wallNodeId==='9,8') walked=true;
    const position={x:unit.x,y:unit.y};stepArchers(state,SIM_DT);
    assert.deepEqual({x:unit.x,y:unit.y},position,'infirmary owns movement during a healing journey');
  }
  assert.ok(walked);assert.ok(grounded);assert.equal(unit.wallNodeId,null);assert.equal(unit.hp,10);
  assert.ok(npcWalkable(state,Math.floor(unit.x),Math.floor(unit.y)));
  unit.healingJourney=false;advance(state,5);assert.ok(unit.wallNodeId,'recovered archer returns to battlements');
});

test('wounded battlement archers descend at walking speed, receive real care and resume their role',()=>{
  const state=fixture();
  for(let x=6;x<=10;x++) piece(state,x===7?'gate':'wall',x,8);
  const unit=archer(state,10.5,8.5);unit.wallNodeId='10,8';unit.hp=10;
  initializeInfirmaries(state);
  let treated=false;
  for(let i=0;i<35/SIM_DT;i++) {
    const before={x:unit.x,y:unit.y};stepInfirmaries(state,SIM_DT);stepArchers(state,SIM_DT);
    assert.ok(Math.hypot(unit.x-before.x,unit.y-before.y)<=CONFIG.frontier.archers.speed*SIM_DT+1e-7);
    if(unit.hp>10) {treated=true;assert.equal(unit.wallNodeId,null,'treatment only on the ground at keep');}
    if(treated&&!unit.healingJourney) break;
  }
  assert.ok(treated);assert.ok(unit.hp>=unit.maxHp*CONFIG.frontier.archers.recoverFraction);
  assert.equal(unit.healingJourney,false);advance(state,15);assert.ok(unit.wallNodeId);
});

test('mounted patients choose stairs leading to a reachable infirmary rather than an isolated nearer keep',()=>{
  const state=fixture();
  for(let y=0;y<36;y++) state.frontierMap.map[y][11]='#';
  state.structures.push({id:'reachable-keep',type:'keep',x:2,y:8,w:3,h:3,hp:2000,maxHp:2000});
  for(let x=6;x<=10;x++) piece(state,x===7?'gate':'wall',x,8);
  const unit=archer(state,10.5,8.5);unit.wallNodeId='10,8';unit.hp=10;
  initializeInfirmaries(state);stepInfirmaries(state,SIM_DT);
  assert.equal(unit.infirmaryId,'reachable-keep');
  for(let i=0;i<20/SIM_DT&&unit.hp===10;i++) {stepInfirmaries(state,SIM_DT);stepArchers(state,SIM_DT);}
  assert.ok(unit.hp>10,'patient physically descends toward its assigned accessible keep');
  assert.equal(state.infirmaries.find(i=>i.keepId==='keep').pool,120);
});
