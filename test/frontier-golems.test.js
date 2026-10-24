import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/campaign.js';
import { CONFIG } from '../src/config.js';
import { damageStructure, damageGolem, blocksStructure, structureAt, isWalkable, blockingAt } from '../src/sim/grid.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { stepGolems } from '../src/sim/golems.js';
import { golemReuseCooldown, golemReturnSpeed } from '../src/sim/frontier/golems.js';
import { emergencyRepairCheck } from '../src/sim/frontier/repair.js';
import { applyGeneratedTowerBuild, requireFrontierAction } from './fixtures/frontier-reference.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

function fixture({mechanical=1,mode}={}) {
  const game=createGame({stage:'frontier',skills:{communication:1,structural:1,field:1,mechanical}});
  assert.equal(game.api.place('golem',8,18).ok,true,'HARNESS_PRECONDITION_FAILED: golem wall placed');
  const wall=game.state.structures.find(s=>s.type==='golem');
  if(mode) assert.equal(game.api.setGolemMode(wall.id,mode).ok,true);
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: siege started');
  game.state.schedule=[];game.state.spawnIndex=0;
  return {game,state:game.state,wall};
}

// Golem-only stepping keeps garrison AI from moving test enemies.
function advance(state,seconds,onStep) {
  for(let i=0;i<Math.round(seconds*60);i++) {state.time+=1/60;stepGolems(state,1/60);onStep?.();}
}
function until(state,predicate,seconds=60) {
  for(let i=0;i<seconds*60&&!predicate();i++) {state.time+=1/60;stepGolems(state,1/60);}
  assert.ok(predicate(),'golem reached the expected state within the fixture limit');
}
const pin=enemy=>{enemy.speed=0;return enemy;};

test('manual release opens the breach once with a weaker full-health golem',()=>{
  const {game,state,wall}=fixture();
  assert.equal(wall.golemState,'dormant');
  assert.equal(game.api.releaseGolem(wall.id).ok,true);
  assert.equal(state.golems.length,1);
  const golem=state.golems[0];
  assert.equal(golem.maxHp,CONFIG.frontier.golem.activeHp);
  assert.ok(golem.maxHp<wall.maxHp,'active golem max HP is below the wall');
  near(golem.hp,golem.maxHp);
  assert.equal(blocksStructure(wall),false,'the wall tile is an open breach');
  assert.equal(structureAt(state,8,18),wall,'the breach still refuses construction');
  assert.equal(game.api.releaseGolem(wall.id).ok,false,'no second golem from the same wall');
  assert.equal(damageStructure(state,wall,500,'enemy'),false,'an open breach takes no structure damage');
  assert.equal(state.golems.length,1);
  assert.equal(emergencyRepairCheck(state,8,18).ok,false,'open breaches cannot be repaired');
});

test('automatic awakening at half HP carries the HP fraction and never duplicates',()=>{
  const {game,state,wall}=fixture();
  damageStructure(state,wall,130,'enemy');
  assert.equal(state.golems.length,1);
  near(state.golems[0].hp,CONFIG.frontier.golem.activeHp*110/240);
  damageStructure(state,wall,50,'enemy');
  assert.equal(game.api.releaseGolem(wall.id).ok,false);
  assert.equal(state.golems.length,1);
});

test('release is refused outside Frontier battle',()=>{
  const game=createGame({stage:'frontier'});
  game.api.place('golem',8,18);
  const wall=game.state.structures.find(s=>s.type==='golem');
  assert.equal(game.api.releaseGolem(wall.id).ok,false,'not during preparation');
});

test('guard mode holds near the breach while patrol mode ranges farther',()=>{
  const distances={};
  for(const mode of ['guard','patrol']) {
    const {game,state,wall}=fixture({mode});
    pin(spawnEnemy(state,'foot',8.5,22.5));
    game.api.releaseGolem(wall.id);
    const golem=state.golems[0];let farthest=0;
    advance(state,4,()=>{if(golem.phase==='fighting')farthest=Math.max(farthest,Math.hypot(golem.x-golem.originX,golem.y-golem.originY));});
    distances[mode]=farthest;
  }
  assert.ok(distances.guard<=CONFIG.frontier.golem.guardLeash+1e-8,`guard ${distances.guard}`);
  assert.ok(distances.patrol>CONFIG.frontier.golem.guardLeash+0.5,`patrol ${distances.patrol}`);
  assert.ok(distances.patrol<=CONFIG.frontier.golem.patrolLeash+1e-8);
});

test('modes are preparation choices that survive retry',()=>{
  const {game,wall}=fixture({mode:'patrol'});
  assert.equal(game.api.setGolemMode(wall.id,'guard').ok,false,'battle cannot change modes');
  game.api.retrySiege();
  assert.equal(game.state.structures.find(s=>s.id===wall.id).golemMode,'patrol');
});

test('an idle golem walks home, reforms at its HP fraction and runs the reuse cooldown',()=>{
  const {game,state,wall}=fixture();
  game.api.releaseGolem(wall.id);
  const golem=state.golems[0];
  golem.x+=1;golem.hp=40;
  until(state,()=>!wall.awakened,10);
  assert.equal(state.golems.length,0);
  near(wall.hp,wall.maxHp*40/160);
  assert.equal(blocksStructure(wall),true,'reformed wall blocks again');
  assert.equal(wall.golemState,'reforming');
  advance(state,CONFIG.frontier.golem.reformTime+1/60);
  assert.equal(wall.golemState,'cooldown');
  near(wall.golemTimer,CONFIG.frontier.golem.cooldown-1/60);
  assert.equal(game.api.releaseGolem(wall.id).ok,false,'cannot release during cooldown');
  advance(state,CONFIG.frontier.golem.cooldown);
  assert.equal(wall.golemState,'dormant');
  assert.equal(game.api.releaseGolem(wall.id).ok,true,'reusable after cooldown');
});

test('the active timer sends a fighting golem home',()=>{
  const {game,state,wall}=fixture();
  const boss=spawnEnemy(state,'boss',8.5,19.5);boss.hp=1e9;
  const hold=()=>{boss.x=8.5;boss.y=19.5;};
  game.api.releaseGolem(wall.id);
  const golem=state.golems[0];golem.hp=1e9;golem.maxHp=1e9;
  advance(state,CONFIG.frontier.golem.activeDuration-0.1,hold);
  assert.equal(golem.phase,'fighting');
  advance(state,0.2,hold);
  assert.notEqual(golem.phase,'fighting');
});

test('an occupied breach makes the golem wait until it is clear',()=>{
  const {game,state,wall}=fixture();
  game.api.releaseGolem(wall.id);
  const golem=state.golems[0];golem.x+=1;golem.remaining=0;
  const blocker={id:'blocker',type:'guard',x:8.5,y:18.5,hp:100,maxHp:100};
  state.guards=[blocker];
  advance(state,5);
  assert.equal(wall.awakened,true,'no reform on top of a unit');
  assert.equal(golem.phase,'waiting');
  blocker.x=12.5;
  advance(state,0.1);
  assert.equal(wall.awakened,false);
});

test('repeated release and reform cycles never heal the wall',()=>{
  const {game,state,wall}=fixture();
  wall.hp=180;let last=wall.hp;
  for(let cycle=0;cycle<3;cycle++) {
    game.api.releaseGolem(wall.id);
    until(state,()=>!wall.awakened,10);
    assert.ok(wall.hp<=last+1e-7,`cycle ${cycle}: ${wall.hp} > ${last}`);last=wall.hp;
    advance(state,CONFIG.frontier.golem.reformTime+CONFIG.frontier.golem.cooldown+0.1);
  }
  near(last,180);
});

test('a destroyed golem leaves its wall breached for the siege',()=>{
  const {game,state,wall}=fixture();
  game.api.releaseGolem(wall.id);
  damageGolem(state,state.golems[0],1e9);
  assert.equal(wall.destroyed,true);
  assert.equal(wall.golemState,'destroyed');
  assert.equal(structureAt(state,8,18),null);
  assert.ok(state.rubble.some(r=>r.id===wall.id));
  assert.equal(game.api.releaseGolem(wall.id).ok,false);
});

test('the return path follows open ground around blocking structures',()=>{
  const {game,state,wall}=fixture();
  for(let y=17;y<=19;y++) assert.equal(game.state.structures.push({id:`block-${y}`,type:'wall',x:10,y,w:1,h:1,hp:200,maxHp:200})>0,true);
  state.flowRevision++;
  game.api.releaseGolem(wall.id);
  const golem=state.golems[0];golem.x=11.5;golem.y=18.5;golem.remaining=0;
  let detour=0;
  until(state,()=>{
    if(!wall.awakened) return true;
    const tx=Math.floor(golem.x),ty=Math.floor(golem.y);
    assert.ok(isWalkable(tx,ty,state)&&!blockingAt(state,tx,ty),`golem crossed blocked tile ${tx},${ty}`);
    detour=Math.max(detour,Math.abs(golem.y-18.5));
    return false;
  },20);
  assert.ok(detour>=2-1e-7,'the golem walked around the three-tile wall');
});

test('Mechanical Engineering shortens the reuse cooldown and speeds the return',()=>{
  const expectedCooldown=[30,27.6,25.2,22.8],expectedSpeed=[1,1,1.1,1.15].map(f=>CONFIG.golem.speed*f);
  for(let level=1;level<=4;level++) {
    const {state}=fixture({mechanical:level});
    near(golemReuseCooldown(state),expectedCooldown[level-1]);
    near(golemReturnSpeed(state),expectedSpeed[level-1]);
  }
});

// Phase F balance probe: golem walls on the scout-weighted plan, released by
// hand when raiders close in, across every generated archetype.
test('manually released golems cycle through real generated sieges',()=>{
  const rows=[];
  for(const archetype of ['compact','twin','outpost']) {
    const game=createGame({stage:'frontier',generated:true,seed:1,archetype}),state=game.state;
    applyGeneratedTowerBuild(game,'weighted',archetype==='twin'?7:6);
    const keep=state.structures.find(s=>s.type==='keep'),walls=[];
    for(let r=2;r<=4&&walls.length<2;r++) for(let dx=-r;dx<=keep.w-1+r&&walls.length<2;dx++) for(const y of [keep.y-r,keep.y+keep.h-1+r]) {
      if(walls.length<2&&game.api.preview('golem',keep.x+dx,y).ok) walls.push(game.api.place('golem',keep.x+dx,y).structure.id);
    }
    assert.equal(walls.length,2,`HARNESS_PRECONDITION_FAILED: ${archetype} golem sites`);
    requireFrontierAction(game.api.setGolemMode(walls[1],'patrol'),'patrol golem');
    requireFrontierAction(game.api.startSiege(),'start golem siege');
    let releases=0,reforms=0;
    for(let t=0;t<480&&state.phase==='siege';t++) {
      for(const id of walls) {
        const wall=state.structures.find(s=>s.id===id);
        if(wall&&!wall.destroyed&&wall.golemState==='dormant'&&!wall.awakened&&
          state.enemies.some(e=>e.hp>0&&Math.hypot(e.x-wall.x-.5,e.y-wall.y-.5)<=3)&&game.api.releaseGolem(id).ok) releases++;
      }
      const before=state.eventLog.filter(e=>e.type==='golemReform').length;
      game.api.stepSeconds(1);
      reforms+=state.eventLog.filter(e=>e.type==='golemReform').length-before;
    }
    assert.notEqual(state.phase,'siege','siege resolved');
    const golemKills=state.eventLog.filter(e=>e.type==='golemSlam').length;
    rows.push({archetype,result:state.phase,releases,reforms,golemSlams:golemKills,
      wallStates:walls.map(id=>state.structures.find(s=>s.id===id)?.golemState??'destroyed')});
  }
  console.log('Frontier golem balance',JSON.stringify(rows));
  // Which walls see contact depends on each map's fronts; overall the probe
  // must exercise release, combat and reformation in real sieges.
  assert.ok(rows.reduce((n,r)=>n+r.releases,0)>0,'golems were released');
  assert.ok(rows.reduce((n,r)=>n+r.golemSlams,0)>0,'released golems fought');
  assert.ok(rows.reduce((n,r)=>n+r.reforms,0)>0,'golems reformed their walls');
});

test('Frontier golem simulation is deterministic',()=>{
  const run=()=>{
    const {game,state,wall}=fixture({mode:'patrol'});
    spawnEnemy(state,'foot',8.5,22.5);spawnEnemy(state,'chiseler',11.5,18.5);
    game.api.releaseGolem(wall.id);game.api.stepSeconds(40);
    return JSON.stringify({wall:[wall.hp,wall.golemState,wall.awakened],golems:state.golems.map(g=>[g.x,g.y,g.hp,g.phase])});
  };
  assert.equal(run(),run());
});
