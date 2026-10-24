import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/campaign.js';
import { CONFIG } from '../src/config.js';
import { spawnEnemy, damageEnemy } from '../src/sim/enemies.js';
import { damageStructure, structureAt, blockingAt } from '../src/sim/grid.js';
import { hasEnemyRoute } from '../src/sim/frontier/construction.js';
import { requireFrontierAction as requireAction } from './fixtures/frontier-reference.js';

function battle() {
  const game=createGame({stage:'frontier'});
  requireAction(game.api.startSiege(),'start construction fixture');
  // Keep this unit fixture in battle while sites and occupants are observed.
  game.state.schedule=[{t:1000,type:'boss',lane:1}];game.state.spawnIndex=0;
  return game;
}
function until(game,predicate,limit=240) {
  for(let i=0;i<limit&&!predicate();i++) game.api.tick();
  assert.ok(predicate(),'HARNESS_PRECONDITION_FAILED: expected construction state not reached');
}

test('Frontier prep replaces ordinary walls with towers at net cost and preserves adjacent support',()=>{
  for(const gold of [100,99]) {
    const game=createGame({stage:'frontier'});
    requireAction(game.api.place('wall',7,18),'tower supporting wall');
    requireAction(game.api.place('wall',8,18),'wall to upgrade');
    const support=structuredClone(structureAt(game.state,7,18));
    game.state.gold=gold;
    const before=structuredClone(game.state),preview=game.api.preview('tower',8,18);
    assert.equal(preview.cost,100);
    assert.equal(preview.valid,gold===100);
    const result=game.api.place('tower',8,18);
    assert.equal(result.ok,gold===100);
    if(gold===99) assert.deepEqual(game.state,before);
    else {
      assert.equal(game.state.gold,0);
      assert.equal(structureAt(game.state,8,18).type,'tower');
      assert.equal(structureAt(game.state,8,18).paidCost,120);
      assert.equal(blockingAt(game.state,8,18),true);
      assert.equal(game.state.structures.length,before.structures.length);
      assert.deepEqual(structureAt(game.state,7,18),support);
    }
  }
});

test('Frontier active siege prohibits tower replacement of an existing ordinary wall atomically',()=>{
  const game=createGame({stage:'frontier'});
  requireAction(game.api.place('wall',7,18),'tower support');
  requireAction(game.api.place('wall',8,18),'replacement target');
  requireAction(game.api.startSiege(),'start replacement prohibition fixture');
  const before=structuredClone(game.state);
  assert.equal(game.api.preview('tower',8,18).valid,false);
  assert.equal(game.api.place('tower',8,18).ok,false);
  assert.equal(game.api.placeEmergency('tower',8,18).ok,false);
  assert.equal(game.api.placeLine('tower',8,18,9,18).ok,false);
  assert.deepEqual(game.state,before);
});

test('Frontier Class B prep works; battle sites cost budget, stay nonblocking, and complete after two seconds',()=>{
  const game=createGame({stage:'frontier'});
  for(const [i,type] of ['barricade','palisade','caltrops'].entries()) requireAction(game.api.place(type,8+i,15),'prep makeshift');
  requireAction(game.api.startSiege(),'start makeshift timing');
  game.state.schedule=[{t:1000,type:'boss',lane:1}];
  const gold=game.state.gold;
  const result=game.api.placeEmergency('palisade',8,18);requireAction(result,'emergency palisade');
  assert.equal(game.state.gold,gold-CONFIG.structures.palisade.cost);
  assert.equal(game.state.emergency.spent,CONFIG.structures.palisade.cost);
  assert.equal(result.site.duration,2);
  assert.equal(blockingAt(game.state,8,18),false);
  game.api.stepSeconds(1.9);
  assert.equal(game.state.constructionSites.length,1);
  until(game,()=>!!structureAt(game.state,8,18));
  assert.ok(game.state.time>=2);
  assert.equal(blockingAt(game.state,8,18),true);
  assert.equal(game.state.constructionSites.length,0);
});

test('battle rejects Class A, demolition, repair and refunds; canyon has no battle construction',()=>{
  const game=battle(),gold=game.state.gold;
  for(const type of ['wall','gate','tower','spiked','golem','launcher','sensor','retractable','pendulum'])
    assert.equal(game.api.place(type,8,18).ok,false,type);
  assert.equal(game.api.demolish(8,18).ok,false);
  assert.equal(game.api.repair(8,18).ok,false);
  assert.equal(game.api.repairAll().ok,false);
  assert.equal(game.state.gold,gold);
  const canyon=createGame();requireAction(canyon.api.startSiege(),'start canyon');
  for(const type of ['barricade','palisade','caltrops']) assert.equal(canyon.api.place(type,48,17).ok,false);
});

test('emergency placement rejects adjacent enemies, destroyed Class A ground and occupied or reserved tiles atomically',()=>{
  const game=createGame({stage:'frontier'});
  requireAction(game.api.place('wall',8,18),'wall to destroy');
  requireAction(game.api.startSiege(),'start rubble fixture');
  game.state.schedule=[{t:1000,type:'boss',lane:1}];
  damageStructure(game.state,structureAt(game.state,8,18),10000);
  const enemy=spawnEnemy(game.state,'foot',10.5,18.5),before=game.state.gold;
  for(const [x,y] of [[10,18],[11,18],[9,17]]) assert.equal(game.api.place('caltrops',x,y).ok,false);
  assert.equal(game.api.place('palisade',8,18).ok,false);
  assert.equal(game.state.gold,before);
  damageEnemy(game.state,enemy,1000);
  requireAction(game.api.place('caltrops',10,18),'after enemy dies');
  assert.equal(game.api.place('palisade',10,18).ok,false);
});

test('occupied emergency sites wait for enemies and NPCs, then complete without overwriting units',()=>{
  const game=createGame({stage:'frontier'});
  for(const [x,y] of [[7,18],[9,18],[8,17],[8,19]]) requireAction(game.api.place('wall',x,y),'civilian shelter enclosure');
  requireAction(game.api.startSiege(),'start occupied fixture');
  game.state.schedule=[{t:1000,type:'boss',lane:1}];
  const person=game.state.inhabitants[0];
  person.x=8.5;person.y=18.5;person.sheltered=false;person.status='holding';
  requireAction(game.api.place('palisade',8,18),'occupied civilian site');
  // The closed enclosure gives this civilian an explicit shelter-in-place state.
  until(game,()=>game.state.constructionSites[0]?.status==='waiting');
  assert.equal(structureAt(game.state,8,18),null);
  person.x=7.5;
  until(game,()=>!!structureAt(game.state,8,18));
  const site=game.api.place('barricade',8,21);requireAction(site,'enemy-occupied site');
  const enemy=spawnEnemy(game.state,'foot',8.5,21.5);
  // A stun gives the site a stable occupied footprint through its build timer.
  enemy.stunRemaining=10;
  until(game,()=>site.site.status==='waiting');
  assert.equal(structureAt(game.state,8,21),null);
  damageEnemy(game.state,enemy,1000);
  until(game,()=>!!structureAt(game.state,8,21));
});

test('three-site limit and client emergency cap are enforced; bounty can fund further makeshift construction',()=>{
  const game=battle();
  for(let i=0;i<3;i++) requireAction(game.api.place('caltrops',7+i,12),'three concurrent sites');
  assert.equal(game.api.place('caltrops',10,12).ok,false);
  until(game,()=>game.state.constructionSites.length===0);
  for(let batch=0;batch<3;batch++) {
    for(let i=0;i<3;i++) requireAction(game.api.place('caltrops',7+i,13+batch),'spend cap');
    until(game,()=>game.state.constructionSites.length===0);
  }
  assert.equal(game.state.emergency.spent,CONFIG.frontier.emergencyCap);
  const gold=game.state.gold;
  const enemy=spawnEnemy(game.state,'boss',50.5,20.5);damageEnemy(game.state,enemy,10000);
  assert.equal(game.state.gold,gold+CONFIG.bounties.boss);assert.equal(game.state.emergency.spent,CONFIG.frontier.emergencyCap);
  // Twelve living structures still cap spam even when bounty funds are ready.
  assert.equal(game.api.place('barricade',10,12).ok,false);
  const hazard=game.state.structures.find(s=>s.type==='caltrops');hazard.hp=0;hazard.destroyed=true;
  requireAction(game.api.place('barricade',10,12),'bounty-funded replacement site');
  assert.equal(game.state.emergency.clientEmergencySpent,CONFIG.frontier.emergencyCap);
  assert.equal(game.state.emergency.bountySpent,CONFIG.structures.barricade.cost);
});

test('a blocking site cannot seal the last enemy route, including all reserved footprints',()=>{
  const game=createGame({stage:'frontier'});
  // Central river has five passable rows. A curtain with two open spaces is
  // affordable; reserving its last opening must fail before either site builds.
  for(const y of [16,17,18]) requireAction(game.api.place('wall',35,y),'ford curtain');
  requireAction(game.api.startSiege(),'start ford fixture');
  assert.equal(hasEnemyRoute(game.state),true,'HARNESS_PRECONDITION_FAILED: ford has an enemy route');
  requireAction(game.api.place('palisade',35,19),'reserve first opening');
  assert.equal(game.api.place('palisade',35,20).ok,false);
  assert.equal(game.api.place('caltrops',35,20).ok,true,'walkable hazard preserves route');
});

test('caltrops slow, damage, exhaust limited uses and remain walkable',()=>{
  const game=battle();requireAction(game.api.place('caltrops',8,18),'hazard site');
  until(game,()=>!!structureAt(game.state,8,18));
  const hazard=structureAt(game.state,8,18);
  for(let i=0;i<CONFIG.frontier.caltrops.uses;i++) {
    const enemy=spawnEnemy(game.state,'foot',8.5,18.5);enemy.stunRemaining=10;
    game.api.tick();
    assert.equal(enemy.hp,CONFIG.enemies.foot.hp-CONFIG.frontier.caltrops.damage);
    assert.ok(enemy.caltropSlowRemaining>0);
    damageEnemy(game.state,enemy,1000);
  }
  assert.equal(blockingAt(game.state,8,18),false);
  assert.equal(hazard.usesRemaining,0);assert.equal(hazard.destroyed,true);
});

test('emergency caltrops reduce assessed property losses in the same deterministic farm-defense contract',()=>{
  const run=emergency=>{
    const game=createGame({stage:'frontier',seed:844});
    requireAction(game.api.respondToRequest('farmer','promise'),'farm promise');
    requireAction(game.api.place('wall',44,31),'farm tower support');
    requireAction(game.api.place('tower',44,30),'farm defense tower');
    requireAction(game.api.startSiege(),'start farm-defense contract');
    // A focused contract scenario uses the authored settlement, owner ledger,
    // actual combat/evacuation, public construction and normal result finalizer.
    game.state.schedule=[{t:3,type:'foot',x:47.5,y:25.5,lane:2}];
    if(emergency) requireAction(game.api.placeEmergency('caltrops',49,26),'emergency farm protection');
    until(game,()=>game.state.phase!=='siege',1800);
    assert.equal(game.state.phase,'victory','HARNESS_PRECONDITION_FAILED: contract completed');
    if(emergency) assert.ok(game.state.eventLog.some(e=>e.type==='caltropsHit'),'HARNESS_PRECONDITION_FAILED: raider crossed emergency caltrops');
    return game.state.results;
  };
  const baseline=run(false),protectedFarm=run(true);
  assert.ok(baseline.liability>0,'HARNESS_PRECONDITION_FAILED: unassisted raid damaged property');
  assert.ok(protectedFarm.liability<baseline.liability,`emergency ${protectedFarm.liability} G vs baseline ${baseline.liability} G`);
  assert.equal(protectedFarm.promisesKept,1);
});
