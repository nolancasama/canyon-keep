import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { spawnEnemy, stepEnemies } from '../src/sim/enemies.js';
import { hasTradeRoad } from '../src/sim/build.js';
import { structureAt, damageStructure } from '../src/sim/grid.js';
import { calculateContractResults } from '../src/sim/frontier/contract.js';
import { requestGuards, guardPosts, startFrontierNpcs, stepFrontierNpcs, npcWalkable, engageFrontierNpc } from '../src/sim/frontier/npcs.js';

const frontier=()=>createGame({stage:'frontier',seed:123456});
const piece=(state,type,x,y)=>{
  const def=CONFIG.structures[type],structure={id:`test-${type}-${x}-${y}`,type,x,y,w:1,h:1,hp:def.hp,maxHp:def.hp,cost:def.cost,paidCost:def.cost};
  state.structures.push(structure);state.flowRevision++;return structure;
};
const advance=(state,seconds)=>{for(let i=0;i<seconds*60;i++) stepFrontierNpcs(state,1/60);};

test('Frontier guards engage near their assigned post, pay bounties and return to holding',()=>{
  const state=frontier().state,guard=state.guards[0];
  state.guards=[guard];state.militia=[];state.inhabitants=[];
  guard.x=guard.postX=8.5;guard.y=guard.postY=18.5;
  const enemy=spawnEnemy(state,'foot',9.5,18.5),budget=state.gold;
  stepFrontierNpcs(state,1/60);
  assert.equal(guard.status,'engaging');assert.equal(guard.targetId,enemy.id);
  advance(state,10);
  assert.equal(enemy.hp,0);assert.equal(state.stats.bountyGold,CONFIG.bounties.foot);assert.equal(state.gold,budget+CONFIG.bounties.foot);
  assert.equal(guard.status,'holding');assert.equal(guard.x,guard.postX);assert.equal(guard.y,guard.postY);
  spawnEnemy(state,'foot',15.5,18.5);advance(state,1);
  assert.equal(guard.status,'holding','enemies beyond the post leash cannot pull defenders away');
});

test('Communication reassignment moves existing guards, is reversible and is preparation only',()=>{
  const game=frontier(),state=game.state,originalIds=state.guards.map(g=>g.id);
  assert.ok(guardPosts(state).some(p=>p.id==='hamlet'),'HARNESS_PRECONDITION_FAILED: named hamlet post');
  assert.equal(requestGuards(state,'hamlet',3).ok,false);
  assert.equal(game.api.requestGuards('hamlet',2).ok,true);
  assert.equal(state.guards.filter(g=>g.postId==='keep').length,CONFIG.frontier.guards.count-2);
  assert.equal(state.guards.filter(g=>g.postId==='hamlet').length,2);
  assert.deepEqual(state.guards.map(g=>g.id),originalIds);
  state.skills.communication=3;
  assert.equal(requestGuards(state,'hamlet',4).ok,true);
  assert.equal(state.guards.filter(g=>g.postId==='keep').length,0);
  assert.equal(requestGuards(state,'hamlet',0).ok,true);
  assert.equal(state.guards.filter(g=>g.postId==='keep').length,4);
  state.skills.communication=1;
  assert.equal(requestGuards(state,'farms',1).ok,false);
  state.phase='siege';assert.equal(requestGuards(state,'hamlet',1).ok,false);
});

test('civilians shelter in place when enclosed and evacuate through a gate without crossing terrain or walls',()=>{
  const state=frontier().state,person=state.inhabitants[0];
  state.inhabitants=[person];state.guards=[];state.militia=[];state.enemies=[];
  person.x=8.5;person.y=18.5;person.sheltered=false;person.path=undefined;
  const east=piece(state,'wall',9,18);
  for(const [x,y] of [[7,18],[8,17],[8,19]]) piece(state,'wall',x,y);
  advance(state,5);
  assert.equal(person.status,'sheltering');assert.equal(person.x,8.5);assert.equal(person.y,18.5);
  east.type='gate';state.flowRevision++;
  for(let i=0;i<120*60&&!person.sheltered;i++) {
    stepFrontierNpcs(state,1/60);
    assert.ok(npcWalkable(state,Math.floor(person.x),Math.floor(person.y)),'civilian always occupies friendly-walkable terrain');
  }
  assert.equal(person.status,'sheltered','bounded evacuation reaches the keep after a gate opens');
});

test('militia retreat below thirty percent HP, recover at the infirmary and enemies can kill defenders',()=>{
  const state=frontier().state,militia=state.militia[0];
  state.guards=[];state.inhabitants=[];state.militia=[militia];
  militia.x=8.5;militia.y=18.5;militia.hp=militia.maxHp*.29;
  stepFrontierNpcs(state,1/60);assert.equal(militia.status,'retreating');
  advance(state,120);assert.equal(militia.status,'holding');
  assert.ok(militia.hp>=militia.maxHp*CONFIG.frontier.infirmary.recoverFraction);
  assert.equal(militia.retreating,false);
  militia.sheltered=false;militia.x=8.5;militia.y=18.5;militia.hp=1;
  const enemy=spawnEnemy(state,'foot',8.5,18.5);
  assert.equal(engageFrontierNpc(state,enemy,CONFIG.enemies.foot.speed,1),true);
  assert.equal(militia.hp,0);assert.equal(militia.status,'dead');
});

test('Frontier brute slams harm exposed defenders while sheltered civilians remain safe',()=>{
  const state=frontier().state,keep=state.structures.find(s=>s.type==='keep'),guard=state.guards[0],person=state.inhabitants[0];
  guard.x=keep.x-.5;guard.y=keep.y+1.5;
  person.x=guard.x;person.y=guard.y;person.sheltered=true;person.status='sheltered';
  const hp=person.hp,boss=spawnEnemy(state,'boss',guard.x,guard.y);
  boss.attackPhase='windup';boss.windupRemaining=0;boss.walkTarget={x:keep.x,y:keep.y+1};
  stepEnemies(state,1/60);
  assert.ok(keep.hp<keep.maxHp,'HARNESS_PRECONDITION_FAILED: brute slam landed at keep');
  assert.equal(guard.hp,0);assert.equal(guard.status,'dead');assert.equal(person.hp,hp);
});

test('owner defenses preserve player works and the trade route, cost no budget and appear in the journal',()=>{
  const game=frontier(),state=game.state;
  assert.equal(game.api.respondToRequest('elder','selfDefend').ok,true);
  assert.equal(game.api.respondToRequest('merchant','selfDefend').ok,true);
  const home=state.structures.find(s=>s.id==='hamlet-hall');
  const tile=[{x:home.x,y:home.y-1},{x:home.x-1,y:home.y}].find(p=>npcWalkable(state,p.x,p.y)&&!structureAt(state,p.x,p.y));
  assert.ok(tile,'HARNESS_PRECONDITION_FAILED: free owner-adjacent tile');
  const player=piece(state,'wall',tile.x,tile.y),before=structuredClone(player),budget=state.gold;
  assert.equal(hasTradeRoad(state),true,'HARNESS_PRECONDITION_FAILED: trade route before defense');
  startFrontierNpcs(state);
  assert.deepEqual(player,before);assert.equal(structureAt(state,tile.x,tile.y).id,player.id);
  assert.equal(hasTradeRoad(state),true);assert.equal(state.gold,budget);
  assert.equal(home.selfDefense.status,'deployed');
  assert.ok(home.selfDefense.structureIds.length>0);
  assert.equal(state.journal.find(e=>e.buildingId===home.id).selfDefenseStatus,'deployed');
  const hired=state.guards.find(g=>g.hired&&g.postId==='warehouse');
  assert.ok(hired,'merchant owner rule hires an autonomous warehouse guard');
  assert.equal(state.journal.find(e=>e.buildingId==='warehouse').defenseGuards[0],hired.id);
  const stubborn=state.structures.find(s=>s.selfDefense?.authored);
  assert.ok(stubborn,'HARNESS_PRECONDITION_FAILED: authored stubborn owner');
  assert.ok(['deployed','skipped'].includes(stubborn.selfDefense.status));
});

test('owner defenses deterministically skip a building last access and can hire a posted guard',()=>{
  const state=frontier().state;
  state.inhabitants=[];state.guards=[];state.militia=[];
  for(const structure of state.structures) delete structure.selfDefense;
  const home={id:'last-access',type:'house',label:'Last-access home',owner:{name:'Test owner'},district:'town',
    x:8,y:18,w:2,h:2,hp:120,maxHp:120,selfDefense:{requested:true,rule:'barricades',status:'deferred'}};
  state.structures.push(home);
  for(const [x,y] of [[9,17],[8,20],[9,20],[7,18],[7,19],[10,18],[10,19]]) piece(state,'wall',x,y);
  startFrontierNpcs(state);
  assert.equal(home.selfDefense.status,'skipped');assert.equal(structureAt(state,8,17),null);
  home.selfDefense={requested:true,rule:'hiredGuard',status:'deferred'};
  startFrontierNpcs(state);
  const guard=state.guards.find(g=>g.hired);
  assert.ok(guard);assert.equal(guard.postId,home.id);assert.equal(guard.status,'holding');
});

test('Frontier accounting rounds each property line to integer gold before summing',()=>{
  const state=frontier().state,buildings=state.structures.filter(s=>s.owner&&s.type!=='keep').slice(0,3);
  for(const building of buildings) damageStructure(state,building,building.hp*.137);
  state.phase='victory';const report=calculateContractResults(state);
  for(const line of report.damageByBuilding) for(const field of ['assessed','liability','preserved']) assert.ok(Number.isInteger(line[field]));
  assert.equal(report.liability,report.damageByBuilding.reduce((n,b)=>n+b.liability,0));
  assert.equal(report.valuePreserved,report.damageByBuilding.reduce((n,b)=>n+b.preserved,0));
  assert.equal(report.liability,report.damageByDistrict.reduce((n,d)=>n+d.liability,0));
  for(const field of ['propertyDeduction','casualtyDeduction','deduction','mayorPayment','ownerRewardTotal','thankYouTotal','finalEarnings']) assert.ok(Number.isInteger(report[field]));
  assert.equal(report.finalEarnings,report.mayorPayment+report.ownerRewardTotal+report.thankYouTotal+report.bountyGold);
});
