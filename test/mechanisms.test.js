import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, SIM_DT } from '../src/config.js';
import { KEEP, WIDTH } from '../src/data/map.js';
import { blocksStructure, damageStructure, isWalkable, structureAt, tileAt } from '../src/sim/grid.js';
import { damageEnemy, spawnEnemy, stepEnemies } from '../src/sim/enemies.js';
import { stepExplosions } from '../src/sim/explosions.js';
import { rebuildFlow } from '../src/sim/pathing.js';
import { settlementOutside } from '../src/sim/settlement.js';
import { activate, registry, stepMechanisms } from '../src/sim/mechanisms.js';
import { createGame, advance, crossing } from './helpers.js';

function placed(game,type,x,y,options) {
  const result=game.api.place(type,x,y,options);
  assert.equal(result.ok,true,`HARNESS_PRECONDITION_FAILED: ${type} at ${x},${y}: ${result.reason}`);
  return structureAt(game.state,x,y);
}
function rig(delay=0) {
  const game=createGame(),sensor=placed(game,'sensor',50,18),launcher=placed(game,'launcher',52,18,{facing:'N'});
  assert.equal(game.api.toggleLink(sensor.id,launcher.id).ok,true,'HARNESS_PRECONDITION_FAILED: sensor linked');
  for(let i=0;sensor.delay!==delay&&i<4;i++) game.api.cycleSensorDelay(sensor.id);
  assert.equal(sensor.delay,delay,'HARNESS_PRECONDITION_FAILED: configured delay');
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: siege started');
  return {game,state:game.state,sensor,launcher};
}
function durableEnemy(state,type,x,y) {
  const enemy=spawnEnemy(state,type,x,y);
  enemy.hp=enemy.maxHp=1000;
  return enemy;
}

test('mechanism dispatcher and timer loop use registered device handlers',()=>{
  const game=createGame(),device=placed(game,'launcher',50,18);
  assert.equal(game.api.startSiege().ok,true);
  const type='test-mechanism';
  registry[type]={activate(state,s){s.activations=(s.activations??0)+1;return true;},step(state,s,dt){s.elapsed=(s.elapsed??0)+dt;}};
  try {
    device.type=type;
    assert.equal(activate(game.state,device),true);assert.equal(device.activations,1);
    advance(game.state,stepMechanisms,.5);
    assert.ok(Math.abs(device.elapsed-.5)<1e-8);
    device.destroyed=true;
    assert.equal(activate(game.state,device),false);
    advance(game.state,stepMechanisms,.5);
    assert.ok(Math.abs(device.elapsed-.5)<1e-8,'destroyed devices never tick');
  } finally {delete registry[type];}
});

test('sensor requires a living enemy within tile-centred radius, detects bosses, and ignores inhabitants',()=>{
  for(const type of ['foot','boss']) {
    const {state,sensor,launcher}=rig();
    state.inhabitants[0].x=sensor.x+.5;state.inhabitants[0].y=sensor.y+.5;
    advance(state,stepMechanisms,.25);
    assert.equal(sensor.cooldown,0);assert.equal(launcher.cooldown,0);
    const enemy=spawnEnemy(state,type,sensor.x+2.01,sensor.y+.5);
    advance(state,stepMechanisms,.25);
    assert.equal(sensor.cooldown,0);assert.equal(launcher.cooldown,0);
    enemy.x=sensor.x+2;
    stepMechanisms(state,SIM_DT);
    assert.ok(sensor.cooldown>0);assert.ok(launcher.cooldown>0);
    const dead=rig();
    spawnEnemy(dead.state,type,dead.sensor.x+.5,dead.sensor.y+.5).hp=0;
    advance(dead.state,stepMechanisms,.25);
    assert.equal(dead.sensor.cooldown,0);assert.equal(dead.launcher.cooldown,0);
  }
});

test('sensor delay cycles through frozen choices and delays activation by the configured duration',()=>{
  const game=createGame(),sensor=placed(game,'sensor',50,18);
  assert.equal(sensor.delay,0);
  for(const delay of [.5,1,2,0]) assert.equal(game.api.cycleSensorDelay(sensor.id).delay,delay);
  for(const delay of [.5,1,2]) {
    const {state,sensor,launcher}=rig(delay);
    spawnEnemy(state,'boss',sensor.x+.5,sensor.y+.5);
    stepMechanisms(state,SIM_DT);
    advance(state,stepMechanisms,delay-2*SIM_DT);
    assert.equal(launcher.cooldown,0,`${delay}s delay does not activate early`);
    advance(state,stepMechanisms,3*SIM_DT);
    assert.ok(launcher.cooldown>0,`${delay}s delay activates after expiry`);
    assert.ok(sensor.cooldown>0);
  }
});

test('one standing enemy produces only one sensor activation in each six-second cooldown window',()=>{
  const {state,sensor,launcher}=rig();
  spawnEnemy(state,'boss',sensor.x+.5,sensor.y+.5);
  stepMechanisms(state,SIM_DT);
  assert.ok(launcher.cooldown>0,'HARNESS_PRECONDITION_FAILED: first activation');
  advance(state,stepMechanisms,5.8);
  assert.equal(launcher.cooldown,0,'sensor has not re-fired after launcher cooldown ends');
  assert.ok(sensor.cooldown>0);
  advance(state,stepMechanisms,.25);
  assert.ok(launcher.cooldown>4.8,'standing enemy activates again after sensor cooldown');
});

test('linked launcher fires three piercing bolts in every configured facing and ignores enemies outside the lane',()=>{
  for(const [facing,dx,dy] of [['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]]) {
    const game=createGame(),launcher=placed(game,'launcher',50,18,{facing}),state=game.state;
    const sensor=placed(game,'sensor',49,19);
    assert.equal(game.api.toggleLink(sensor.id,launcher.id).ok,true);
    assert.equal(game.api.startSiege().ok,true);
    assert.equal(launcher.facing,facing);
    const x=50.5,y=18.5;
    const near=durableEnemy(state,'boss',x+dx*2,y+dy*2);
    const far=durableEnemy(state,'boss',x+dx*4,y+dy*4);
    const edge=durableEnemy(state,'boss',x+dx*3-dy*.44,y+dy*3+dx*.44);
    const outside=durableEnemy(state,'boss',x+dx*3-dy*.46,y+dy*3+dx*.46);
    const behind=durableEnemy(state,'boss',x-dx,y-dy);
    for(const enemy of [near,far,edge,outside,behind]) assert.equal(isWalkable(Math.floor(enemy.x),Math.floor(enemy.y)),true,'HARNESS_PRECONDITION_FAILED: lane targets on floor');
    assert.equal(activate(state,launcher),true);
    assert.equal(activate(state,launcher),false,'cooldown ignores repeated activation');
    advance(state,stepMechanisms,2);
    for(const enemy of [near,far,edge]) assert.equal(enemy.hp,910,`${facing}: three once-per-enemy hits`);
    assert.equal(outside.hp,1000);assert.equal(behind.hp,1000);
    const shots=state.eventLog.filter(e=>e.type==='launcherFire'&&e.structureId===launcher.id);
    assert.equal(shots.length,3);assert.ok(shots.every(e=>e.facing===facing));
    for(let i=1;i<shots.length;i++) assert.ok(Math.abs(shots[i].t-shots[i-1].t-.25)<=SIM_DT+1e-8);
    assert.equal(launcher.volleyRemaining,0);
    assert.equal(activate(state,launcher),false);
    advance(state,stepMechanisms,3.1);
    assert.equal(activate(state,launcher),true,'launcher accepts activation after five seconds');
  }
});

test('launcher volley cadence is 0.25 seconds and kills pay bounties once through the shared damage path',()=>{
  const game=createGame(),launcher=placed(game,'launcher',50,18,{facing:'E'}),state=game.state;
  assert.equal(game.api.startSiege().ok,true);
  const target=durableEnemy(state,'boss',51.5,18.5);
  assert.equal(activate(state,launcher),true);
  advance(state,stepMechanisms,.2);
  assert.equal(target.hp,970);
  advance(state,stepMechanisms,.25);
  assert.equal(target.hp,940);
  advance(state,stepMechanisms,.25);
  assert.equal(target.hp,910);
  const other=createGame(),gun=placed(other,'launcher',50,18,{facing:'E'});
  assert.equal(other.api.startSiege().ok,true);
  const gold=other.state.gold,enemy=spawnEnemy(other.state,'foot',51.5,18.5);
  assert.equal(activate(other.state,gun),true);
  advance(other.state,stepMechanisms,1);
  assert.equal(enemy.hp,0);
  assert.equal(other.state.gold,gold+CONFIG.bounties.foot);
  assert.equal(other.state.stats.bountyCounts.foot,1);
  assert.equal(other.state.stats.enemiesDefeated,1);
});

test('launcher bolts stop at blocking walls and cliffs and never exceed twelve tiles',()=>{
  for(const obstacle of ['wall','cliff']) {
    const game=createGame(),state=game.state;
    const launcher=placed(game,'launcher',obstacle==='wall'?50:27,obstacle==='wall'?18:22,{facing:'E'});
    if(obstacle==='wall') placed(game,'wall',53,18);
    else assert.equal(tileAt(31,22),'#','HARNESS_PRECONDITION_FAILED: cliff crosses lane');
    assert.equal(game.api.startSiege().ok,true);
    const before=durableEnemy(state,'boss',obstacle==='wall'?52.5:29.5,launcher.y+.5);
    const after=durableEnemy(state,'boss',obstacle==='wall'?54.5:36.5,launcher.y+.5);
    assert.equal(isWalkable(Math.floor(after.x),Math.floor(after.y)),true,'HARNESS_PRECONDITION_FAILED: target beyond obstacle is on floor');
    assert.equal(activate(state,launcher),true);
    advance(state,stepMechanisms,2);
    assert.equal(before.hp,910);assert.equal(after.hp,1000,obstacle);
  }
  const game=createGame(),state=game.state,launcher=placed(game,'launcher',46,22,{facing:'E'});
  assert.equal(game.api.startSiege().ok,true);
  const inside=durableEnemy(state,'boss',58,22.5),outside=durableEnemy(state,'boss',59.1,22.5);
  assert.equal(isWalkable(59,22),true,'HARNESS_PRECONDITION_FAILED: range target on floor');
  assert.equal(activate(state,launcher),true);
  advance(state,stepMechanisms,2);
  assert.equal(inside.hp,910);assert.equal(outside.hp,1000);
});

test('unlinked launchers remain idle with enemies in their firing lane',()=>{
  const game=createGame(),launcher=placed(game,'launcher',50,18,{facing:'E'}),state=game.state;
  assert.equal(game.api.canStart().ok,true,'unlinked mechanisms are advisory only');
  assert.equal(game.api.startSiege().ok,true);
  const enemy=durableEnemy(state,'boss',51.5,18.5);
  advance(state,stepMechanisms,12);
  assert.equal(enemy.hp,1000);assert.equal(launcher.cooldown,0);assert.equal(launcher.volleyRemaining,0);
});

test('sensor skips a linked device destroyed before activation',()=>{
  const {state,sensor,launcher}=rig(.5);
  spawnEnemy(state,'boss',sensor.x+.5,sensor.y+.5);
  stepMechanisms(state,SIM_DT);
  damageStructure(state,launcher,launcher.hp);
  assert.equal(launcher.destroyed,true,'HARNESS_PRECONDITION_FAILED: device destroyed before delay expires');
  advance(state,stepMechanisms,1);
  assert.ok(sensor.cooldown>0);assert.equal(launcher.cooldown,0);
  assert.equal(state.eventLog.filter(e=>e.type==='launcherFire').length,0);
});

test('link tool enforces valid targets, three links, toggling, and cleanup on demolition or replacement',()=>{
  const game=createGame(),sensor=placed(game,'sensor',50,18);
  const devices=[51,52,53,54].map(x=>placed(game,'launcher',x,18));
  const wall=placed(game,'wall',50,19),otherSensor=placed(game,'sensor',51,19);
  assert.equal(game.api.toggleLink(sensor.id,wall.id).ok,false);
  assert.equal(game.api.toggleLink(sensor.id,otherSensor.id).ok,false);
  assert.equal(game.api.toggleLink(sensor.id,sensor.id).ok,false);
  for(const device of devices.slice(0,3)) assert.equal(game.api.toggleLink(sensor.id,device.id).ok,true);
  assert.deepEqual(sensor.links,devices.slice(0,3).map(d=>d.id));
  assert.equal(game.api.toggleLink(sensor.id,devices[3].id).ok,false);assert.equal(sensor.links.length,3);
  assert.equal(game.api.toggleLink(sensor.id,devices[1].id).ok,true);
  assert.equal(sensor.links.includes(devices[1].id),false);
  assert.equal(game.api.toggleLink(sensor.id,devices[3].id).ok,true);
  assert.equal(game.api.demolish(devices[0].x,devices[0].y).ok,true);
  assert.equal(sensor.links.includes(devices[0].id),false);
  placed(game,'gate',devices[2].x,devices[2].y);
  assert.deepEqual(sensor.links,[devices[3].id]);
  placed(game,'launcher',devices[2].x,devices[2].y);
  assert.deepEqual(sensor.links,[devices[3].id],'replacement does not inherit old device wiring');
});

test('links, delay, and facing survive exact retry and persist across consecutive sieges',()=>{
  const {game,state,sensor,launcher}=rig(1);
  const snapshot=structuredClone(state.snapshot),ids=[sensor.id,launcher.id];
  spawnEnemy(state,'boss',50.5,18.5);
  advance(state,stepMechanisms,2);
  assert.equal(game.api.retrySiege(),true);
  assert.deepEqual(game.state,snapshot);
  assert.equal(game.api.startSiege().ok,true);
  game.state.schedule=[];game.api.tick();
  assert.equal(game.state.phase,'victory','HARNESS_PRECONDITION_FAILED: empty schedule ends siege');
  assert.equal(game.api.continueCampaign(),true);
  const restoredSensor=game.state.structures.find(s=>s.id===ids[0]),restoredLauncher=game.state.structures.find(s=>s.id===ids[1]);
  assert.deepEqual(restoredSensor.links,[ids[1]]);assert.equal(restoredSensor.delay,1);assert.equal(restoredLauncher.facing,'N');
  assert.equal(game.api.startSiege().ok,true);
  assert.equal(restoredSensor.cooldown,0);assert.equal(restoredLauncher.cooldown,0);
  assert.equal(game.api.toggleLink(ids[0],ids[1]).ok,false,'wiring is prep-only');
  assert.equal(game.api.cycleSensorDelay(ids[0]).ok,false);
  assert.equal(game.api.rotateLauncher(ids[1]).ok,false);
});

test('sensors never block pathing, enclosure, trade road, movement, or take damage',()=>{
  const game=createGame(),state=game.state;
  rebuildFlow(state);
  const distances=[...state.flow.distances],outside=settlementOutside(state);
  const sensor=placed(game,'sensor',50,18);
  assert.equal(CONFIG.structures.sensor.blocks,false);assert.equal(blocksStructure(sensor),false);
  rebuildFlow(state);assert.deepEqual(state.flow.distances,distances);assert.deepEqual(settlementOutside(state),outside);
  assert.equal(game.api.readiness().find(r=>r.id==='tradeRoad').ok,true);
  const hp=sensor.hp;damageStructure(state,sensor,9999);assert.equal(sensor.hp,hp);assert.equal(sensor.destroyed,false);
  assert.equal(game.api.startSiege().ok,true);
  state.inhabitants.forEach(p=>p.sheltered=true);
  const enemy=spawnEnemy(state,'foot',49.5,18.5);enemy.walkTarget={x:50,y:18};
  advance(state,stepEnemies,1.1);
  assert.ok(enemy.x>51,'enemy walks across sensor tile');assert.equal(sensor.hp,hp);
  assert.notEqual(enemy.attackTargetId,sensor.id);
  const road=createGame(),points=crossing(8),gap=points.at(-1);
  for(const p of points.slice(0,-1)) placed(road,'wall',p.x,p.y);
  placed(road,'sensor',gap.x,gap.y);
  assert.equal(road.api.canStart().ok,true,'sensor is an open tile in an otherwise sealed curtain');
  assert.notEqual(settlementOutside(road.state)[KEEP.y*WIDTH+KEEP.x],Infinity);
});

test('launcher replacement charges net HP-scaled value atomically and preserves canyon tower support',()=>{
  for(const [from,to,fraction,cost] of [['wall','launcher',1,50],['wall','launcher',.5,60],['launcher','wall',1,-50],['launcher','gate',.5,25]]) {
    const game=createGame(),old=placed(game,from,52,10);old.hp*=fraction;
    game.state.gold=Math.max(0,cost);
    assert.equal(game.api.preview(to,52,10).cost,cost);
    const before=game.state.gold,replacement=placed(game,to,52,10);
    assert.equal(game.state.gold,before-cost);assert.equal(replacement.paidCost,CONFIG.structures[to].cost);
    if(cost>0) {
      const limited=createGame(),piece=placed(limited,from,52,10);piece.hp*=fraction;limited.state.gold=cost-1;
      const snapshot=structuredClone(limited.state);
      assert.equal(limited.api.place(to,52,10).ok,false);assert.deepEqual(limited.state,snapshot);
    }
  }
  const game=createGame(),floor=crossing(8).find(p=>tileAt(p.x-1,p.y)==='.');
  assert.ok(floor,'HARNESS_PRECONDITION_FAILED: canyon tower support site');
  placed(game,'wall',floor.x-1,floor.y);const tower=placed(game,'tower',floor.x,floor.y);
  placed(game,'launcher',floor.x-1,floor.y);
  assert.equal(structureAt(game.state,tower.x,tower.y).id,tower.id);
  assert.equal(game.api.demolish(floor.x-1,floor.y).ok,false);
  const launcher=structureAt(game.state,floor.x-1,floor.y);
  const facings=new Set([launcher.facing]);
  for(let i=0;i<3;i++) facings.add(game.api.rotateLauncher(launcher.id).facing);
  assert.deepEqual([...facings].sort(),['E','N','S','W']);
});

function retractableRig() {
  const game=createGame(),wall=placed(game,'retractable',50,18);
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: retractable siege started');
  game.state.inhabitants.forEach(p=>p.sheltered=true);
  return {game,state:game.state,wall};
}

test('one sensor dispatches to three mixed devices and wiring advisories clear when all are connected',()=>{
  const game=createGame(),sensor=placed(game,'sensor',48,18);
  const devices=[placed(game,'launcher',50,18),placed(game,'launcher',50,19),placed(game,'retractable',52,19)];
  assert.equal(game.api.mechanismWarnings().length,2);
  assert.equal(game.api.canStart().ok,true);
  for(const device of devices) assert.equal(game.api.toggleLink(sensor.id,device.id).ok,true);
  assert.deepEqual(game.api.mechanismWarnings(),[]);
  assert.equal(game.api.startSiege().ok,true);
  spawnEnemy(game.state,'boss',48.5,18.5);
  stepMechanisms(game.state,SIM_DT);
  assert.ok(devices.slice(0,2).every(d=>d.cooldown>0));
  assert.equal(devices[2].status,'rising');
  assert.equal(game.api.retrySiege(),true);
  const restoredSensor=game.state.structures.find(s=>s.id===sensor.id);
  placed(game,'wall',devices[2].x,devices[2].y);
  assert.equal(restoredSensor.links.includes(devices[2].id),false,'replacing a retractable drops its link');
});

test('retractables begin lowered and are ignored by pathing, trade road, and enclosure until raised',()=>{
  const game=createGame(),state=game.state;
  rebuildFlow(state);
  const distances=[...state.flow.distances],outside=settlementOutside(state);
  const wall=placed(game,'retractable',50,18);
  assert.equal(wall.status,'lowered');assert.equal(wall.hp,200);assert.equal(blocksStructure(wall),false);
  assert.equal(CONFIG.structures.retractable.supportsTower,false);
  rebuildFlow(state);assert.deepEqual(state.flow.distances,distances);assert.deepEqual(settlementOutside(state),outside);
  assert.equal(game.api.canStart().ok,true,'unlinked retractable warning never gates Start Siege');
  damageStructure(state,wall,100);assert.equal(wall.hp,200,'lowered wall is not exposed to damage');
  const road=createGame(),points=crossing(8),gap=points.at(-1);
  for(const p of points.slice(0,-1)) placed(road,'wall',p.x,p.y);
  placed(road,'retractable',gap.x,gap.y);
  assert.equal(road.api.canStart().ok,true);
  assert.notEqual(settlementOutside(road.state)[KEEP.y*WIDTH+KEEP.x],Infinity);
});

test('linked sensor raises retractable after its animation, changes flow cost, holds, lowers, and cools down',()=>{
  const game=createGame(),sensor=placed(game,'sensor',48,18),wall=placed(game,'retractable',50,18);
  assert.equal(game.api.toggleLink(sensor.id,wall.id).ok,true);
  assert.equal(game.api.startSiege().ok,true);
  const state=game.state,enemy=spawnEnemy(state,'boss',48.5,18.5);
  state.inhabitants.forEach(p=>p.sheltered=true);
  enemy.walkTarget={x:49,y:18};
  const revision=state.flowRevision,before=state.flow.distances[18*WIDTH+49];
  stepMechanisms(state,SIM_DT);
  assert.equal(wall.status,'rising','HARNESS_PRECONDITION_FAILED: linked trigger begins rise');
  advance(state,stepMechanisms,CONFIG.retractable.rise-SIM_DT);
  assert.equal(blocksStructure(wall),false,'animation remains walkable before full rise');
  advance(state,stepMechanisms,SIM_DT);
  assert.equal(wall.status,'raised');assert.equal(blocksStructure(wall),true);
  assert.ok(state.flowRevision>revision);assert.equal(state.flow.revision,state.flowRevision);
  assert.ok(state.flow.distances[18*WIDTH+49]>before,'raised wall adds breach cost to formerly open route');
  assert.equal(enemy.walkTarget,null);
  assert.equal(activate(state,wall),false,'raised devices ignore another activation');
  damageStructure(state,wall,40);assert.equal(wall.hp,160);
  const raisedRevision=state.flowRevision;
  enemy.walkTarget={x:49,y:18};
  advance(state,stepMechanisms,CONFIG.retractable.hold);
  assert.equal(wall.status,'lowering');assert.equal(blocksStructure(wall),false);
  assert.ok(state.flowRevision>raisedRevision);assert.equal(state.flow.revision,state.flowRevision);
  assert.equal(enemy.walkTarget,null);
  assert.equal(state.flow.distances[18*WIDTH+49],before);
  advance(state,stepMechanisms,CONFIG.retractable.lower);
  assert.equal(wall.status,'cooldown');assert.equal(wall.hp,160,'lowering preserves battle damage');
  assert.equal(activate(state,wall),false);
  // Remove the trigger's presence before its next detection window.
  enemy.x=45.5;enemy.y=18.5;
  advance(state,stepMechanisms,CONFIG.retractable.cooldown-SIM_DT);
  assert.equal(activate(state,wall),false);
  advance(state,stepMechanisms,2*SIM_DT);
  assert.equal(wall.status,'lowered');assert.equal(activate(state,wall),true);
});

test('retractable rise waits for enemies, inhabitants, and golems and skips after 1.5 occupied seconds',()=>{
  for(const kind of ['enemy','inhabitant','golem']) {
    const {state,wall}=retractableRig();
    let unit;
    if(kind==='enemy') unit=spawnEnemy(state,'foot',50.5,18.5);
    else if(kind==='inhabitant') {unit=state.inhabitants[0];unit.sheltered=false;unit.x=50.5;unit.y=18.5;}
    else {unit={id:'occupying-golem',x:50.5,y:18.5,hp:350,status:'active'};state.golems.push(unit);}
    const x=unit.x,y=unit.y,hp=unit.hp;
    assert.equal(activate(state,wall),true);
    assert.equal(wall.status,'waiting');
    advance(state,stepMechanisms,CONFIG.retractable.wait-.1);
    assert.equal(wall.status,'waiting');assert.equal(blocksStructure(wall),false);
    advance(state,stepMechanisms,.2);
    assert.equal(wall.status,'cooldown',`${kind} occupancy skips activation`);
    assert.equal(blocksStructure(wall),false);assert.equal(wall.hp,200);
    assert.equal(unit.x,x);assert.equal(unit.y,y);assert.equal(unit.hp,hp,'no teleporting or crushing');
    assert.equal(activate(state,wall),false);
  }
});

test('retractables recheck occupancy throughout rising, then resume safely when the tile clears',()=>{
  const {state,wall}=retractableRig();
  assert.equal(activate(state,wall),true);
  advance(state,stepMechanisms,.2);
  assert.equal(wall.status,'rising','HARNESS_PRECONDITION_FAILED: rise in progress');
  const enemy=spawnEnemy(state,'foot',50.5,18.5);
  stepMechanisms(state,SIM_DT);
  assert.equal(wall.status,'waiting');assert.equal(blocksStructure(wall),false);
  advance(state,stepMechanisms,.2);
  assert.equal(wall.status,'waiting');assert.equal(enemy.x,50.5);assert.equal(enemy.hp,enemy.maxHp);
  enemy.x=49.5;
  advance(state,stepMechanisms,CONFIG.retractable.rise+SIM_DT);
  assert.equal(wall.status,'raised');assert.equal(blocksStructure(wall),true);
  assert.ok(state.enemies.every(e=>Math.floor(e.x)!==wall.x||Math.floor(e.y)!==wall.y));
  const corner=retractableRig();
  spawnEnemy(corner.state,'foot',50.02,18.02);
  assert.equal(activate(corner.state,corner.wall),true);
  advance(corner.state,stepMechanisms,CONFIG.retractable.rise+.1);
  assert.equal(blocksStructure(corner.wall),false,'an occupant near the tile corner is not trapped by a raised tile');
});

test('the integrated siege tick never closes a raised tile around a moving enemy',()=>{
  const {game,state,wall}=retractableRig();
  state.schedule=[];
  const enemy=spawnEnemy(state,'foot',49.85,18.5);enemy.walkTarget={x:50,y:18};
  assert.equal(activate(state,wall),true);
  let raised=false;
  for(let i=0;i<180&&state.phase==='siege';i++) {
    game.api.tick();
    if(!blocksStructure(wall)) continue;
    raised=true;
    assert.ok(state.enemies.filter(e=>e.hp>0).every(e=>Math.floor(e.x)!==wall.x||Math.floor(e.y)!==wall.y),'raised geometry contains no enemy');
  }
  assert.equal(raised,true,'HARNESS_PRECONDITION_FAILED: moving enemy clears and wall finishes raising');
  assert.ok(enemy.x>51,'enemy crossed before wall fully closed');
});

test('raised retractables are enemy targets and destroy to rubble while surviving damage persists across reset',()=>{
  const {state,wall}=retractableRig();
  assert.equal(activate(state,wall),true);
  advance(state,stepMechanisms,CONFIG.retractable.rise);
  assert.equal(wall.status,'raised','HARNESS_PRECONDITION_FAILED: wall fully raised');
  const enemy=spawnEnemy(state,'chiseler',49.5,18.5);enemy.walkTarget={x:50,y:18};
  advance(state,stepEnemies,.25);
  assert.equal(enemy.attackTargetId,wall.id);assert.ok(wall.hp<200);
  damageStructure(state,wall,999);
  assert.equal(wall.destroyed,true);assert.equal(structureAt(state,50,18),null);
  assert.ok(state.rubble.some(r=>r.id===wall.id&&r.type==='retractable'));
  assert.equal(activate(state,wall),false);
  const other=retractableRig(),snapshot=structuredClone(other.state.snapshot),id=other.wall.id;
  assert.equal(activate(other.state,other.wall),true);
  advance(other.state,stepMechanisms,CONFIG.retractable.rise);
  damageStructure(other.state,other.wall,30);
  assert.equal(other.game.api.retrySiege(),true);assert.deepEqual(other.game.state,snapshot);
  assert.equal(other.game.state.structures.find(s=>s.id===id).status,'lowered');
  assert.equal(other.game.api.startSiege().ok,true);
  const restored=other.game.state.structures.find(s=>s.id===id);
  assert.equal(activate(other.game.state,restored),true);
  advance(other.game.state,stepMechanisms,CONFIG.retractable.rise);
  damageStructure(other.game.state,restored,30);
  other.game.state.schedule=[];other.game.api.tick();
  assert.equal(other.game.state.phase,'victory','HARNESS_PRECONDITION_FAILED: raised wall survives to victory');
  assert.equal(other.game.api.continueCampaign(),true);
  assert.equal(restored.status,'lowered');assert.equal(restored.hp,170);
  assert.equal(other.game.api.startSiege().ok,true);assert.equal(restored.status,'lowered');
});

test('retractable wall-family exchanges use HP-scaled net cost and cannot strand canyon towers',()=>{
  for(const [from,to,fraction,cost] of [['wall','retractable',1,25],['launcher','retractable',1,-25],['launcher','retractable',.5,10],['retractable','launcher',1,25],['retractable','launcher',.5,47]]) {
    const game=createGame(),old=placed(game,from,52,10);old.hp*=fraction;game.state.gold=Math.max(0,cost);
    assert.equal(game.api.preview(to,52,10).cost,cost);
    const gold=game.state.gold,replacement=placed(game,to,52,10);
    assert.equal(game.state.gold,gold-cost);assert.equal(replacement.hp,CONFIG.structures[to].hp);
    assert.equal(replacement.paidCost,CONFIG.structures[to].cost);
    if(cost>0) {
      const limited=createGame(),piece=placed(limited,from,52,10);piece.hp*=fraction;limited.state.gold=cost-1;
      const snapshot=structuredClone(limited.state);
      assert.equal(limited.api.place(to,52,10).ok,false);assert.deepEqual(limited.state,snapshot);
    }
  }
  const game=createGame(),floor=crossing(8).find(p=>tileAt(p.x-1,p.y)==='.');
  assert.ok(floor,'HARNESS_PRECONDITION_FAILED: canyon tower site');
  placed(game,'launcher',floor.x-1,floor.y);placed(game,'tower',floor.x,floor.y);
  const snapshot=structuredClone(game.state);
  assert.equal(game.api.place('retractable',floor.x-1,floor.y).ok,false);assert.deepEqual(game.state,snapshot);
  const unsupported=createGame();placed(unsupported,'retractable',floor.x-1,floor.y);
  assert.equal(unsupported.api.place('tower',floor.x,floor.y).ok,false);
});

test('an in-flight launcher bolt stops at a newly raised wall ahead but ignores a wall raised behind it',()=>{
  for(const ahead of [true,false]) {
    const game=createGame(),launcher=placed(game,'launcher',46,22,{facing:'E'});
    const wall=placed(game,'retractable',ahead?50:48,22);
    assert.equal(game.api.startSiege().ok,true);
    const state=game.state,target=durableEnemy(state,'boss',52.5,22.5);
    assert.equal(blocksStructure(wall),false,'HARNESS_PRECONDITION_FAILED: wall initially lowered');
    assert.equal(activate(state,launcher),true);
    const bolt=state.bolts[0];
    const firstBoltOnly=(s,dt)=>{
      stepMechanisms(s,dt);
      s.bolts=s.bolts.filter(b=>b.id===bolt.id);
    };
    advance(state,firstBoltOnly,ahead?.1:.15);
    assert.ok(state.bolts.includes(bolt),'HARNESS_PRECONDITION_FAILED: first bolt still in flight');
    const previous=bolt.distance,nearFace=wall.x-bolt.originX;
    assert.equal(previous<nearFace,ahead,'HARNESS_PRECONDITION_FAILED: wall is on intended side of moving bolt');
    // Isolate collision with a dynamic blocker from the separately tested rise animation.
    wall.status='raised';wall.elapsed=0;
    assert.equal(blocksStructure(wall),true,'HARNESS_PRECONDITION_FAILED: wall becomes blocking');
    if(!ahead) {
      stepMechanisms(state,SIM_DT);
      assert.ok(state.bolts.includes(bolt),'raising a wall behind the bolt does not despawn it');
      assert.ok(bolt.distance>previous,'raising a wall behind the bolt never rewinds its travel');
    }
    advance(state,firstBoltOnly,.5);
    assert.equal(target.hp,ahead?1000:970,ahead?'new obstruction stops the fired bolt':'first bolt reaches target beyond a wall raised behind it');
  }
});

test('sensors and lowered retractables neither take explosion damage nor consume its six-structure cap',()=>{
  const game=createGame(),sensor=placed(game,'sensor',50,18),lowered=placed(game,'retractable',49,19);
  const walls=[[49,17],[50,17],[51,17],[49,18],[51,18],[50,19]].map(([x,y])=>placed(game,'wall',x,y));
  assert.equal(game.api.startSiege().ok,true);
  const state=game.state,hp=sensor.hp;
  assert.equal(blocksStructure(sensor),false);assert.equal(blocksStructure(lowered),false);
  for(const wall of walls) assert.ok(Math.hypot(wall.x-50,wall.y-18)<=CONFIG.explosion.radius,'HARNESS_PRECONDITION_FAILED: six exposed wall centres in blast radius');
  damageEnemy(state,spawnEnemy(state,'powder',50.5,18.5),999);
  advance(state,stepExplosions,.2);
  assert.equal(sensor.hp,hp);assert.equal(lowered.hp,200);
  assert.ok(walls.every(w=>w.hp<w.maxHp),'all six damage slots reach exposed walls');
  const blast=state.eventLog.find(e=>e.type==='explosion');
  assert.equal(blast.structureTiles.length,CONFIG.explosion.structureTileCap);
  assert.ok(blast.structureTiles.every(t=>t.id!==sensor.id&&t.id!==lowered.id));
});
