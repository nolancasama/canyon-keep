import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FRONTIER_MAP } from '../src/data/frontier/map.js';
import { createGame } from '../src/sim/campaign.js';
import { damageStructure } from '../src/sim/grid.js';
import { spawnEnemy, damageEnemy } from '../src/sim/enemies.js';
import { calculateContractResults, finalizeContract } from '../src/sim/frontier/contract.js';
import { choosePropertyTarget } from '../src/sim/frontier/targeting.js';
import { FRONTIER_TOWN_BUILD, FRONTIER_PRESERVATION_BUILD, applyFrontierBuild, finishFrontier, requireFrontierAction, districtCurtainEstimate } from './fixtures/frontier-reference.js';

const frontier=()=>createGame({stage:'frontier',seed:123456});
const properties=game=>game.state.structures.filter(s=>s.owner);
const round=n=>Math.round(n);
const results=game=>{game.state.phase='victory';return calculateContractResults(game.state);};

test('default stage and explicit canyon stage retain the same deterministic campaign state',()=>{
  const implicit=createGame(),explicit=createGame({stage:'canyon'});
  assert.deepEqual(implicit.state,explicit.state);
  assert.equal(implicit.api.place('unknown',10,5).reason,'Select a construction tool');
  requireFrontierAction(implicit.api.startSiege(),'start default canyon');
  requireFrontierAction(explicit.api.startSiege(),'start explicit canyon');
  implicit.api.stepSeconds(10);explicit.api.stepSeconds(10);
  assert.deepEqual(implicit.state,explicit.state);
});

test('Frontier is independently selectable and returning to canyon reconstructs its original state',()=>{
  const game=createGame();
  assert.equal(game.api.startFrontier(),true);
  assert.equal(game.state.stageId,'frontier');
  assert.equal(game.state.phase,'prep');
  assert.equal(game.state.gold,CONFIG.frontier.budget);
  assert.equal(game.api.selectStage('canyon'),true);
  assert.deepEqual(game.state,createGame().state);
});

test('handcrafted properties have stable ownership, distinct districts and pre-existing damage',()=>{
  const game=frontier(),buildings=properties(game);
  assert.ok(buildings.length>=21&&buildings.length<=27,'20–26 civilian buildings plus the keep');
  assert.equal(new Set(buildings.map(s=>s.id)).size,buildings.length);
  assert.ok(buildings.some(s=>s.hp>0&&s.hp<s.maxHp),'authored pre-existing damage');
  assert.ok(new Set(buildings.map(s=>s.district)).size>=3);
  assert.ok(buildings.some(s=>s.type==='keep'&&!s.optionalObjective));
  for(const s of buildings) {
    assert.ok(s.owner.name&&s.owner.role&&s.importance);
    assert.ok(s.value>0&&s.maxHp>=s.hp&&s.hp>0);
    assert.equal(typeof s.optionalObjective,'boolean');
    assert.equal(typeof s.ownerRewardOffer,'number');
  }
  assert.deepEqual(game.state,frontier().state,'authored stage is reproducible');
});

test('enriched Frontier settlement has varied buildings and clear non-overlapping footprints',()=>{
  const buildings=properties(frontier()),occupied=new Set();
  assert.equal(buildings.filter(s=>s.type==='warehouse').length,2);
  assert.ok(buildings.filter(s=>s.type==='shop').length>=4);
  assert.ok(buildings.some(s=>s.type==='workshop'));
  assert.ok(buildings.some(s=>s.type==='barn'&&s.value<CONFIG.frontier.property.farm.value&&s.selfDefense?.authored));
  const hamlet=buildings.filter(s=>s.district==='hamlet');
  assert.ok(hamlet.filter(s=>s.type!=='farm').length>=3&&hamlet.filter(s=>s.type!=='farm').length<=5);
  assert.ok(hamlet.some(s=>s.type==='farm'));
  const fields=buildings.filter(s=>s.type==='farm'&&s.district==='farms');
  assert.ok(fields.filter(s=>s.x<46).length>=2&&fields.filter(s=>s.x>46).length>=2,'two outlying farm groups');
  for(const s of buildings) for(let y=s.y;y<s.y+s.h;y++) for(let x=s.x;x<s.x+s.w;x++) {
    assert.notEqual(FRONTIER_MAP.map[y][x],'#',`${s.id} must stand on accessible terrain`);
    const tile=`${x},${y}`;
    assert.ok(!occupied.has(tile),`${s.id} must not overlap another property`);occupied.add(tile);
  }
  assert.ok(new Set(FRONTIER_MAP.features.filter(f=>f.kind==='river').map(f=>f.x)).size>=3,'river has bends');
});

test('all living and destroyed civilian footprints remain untouchable by player tools',()=>{
  const game=frontier();
  for(const s of properties(game)) {
    const before=structuredClone(s),gold=game.state.gold;
    assert.equal(game.api.place('wall',s.x,s.y).ok,false);
    assert.equal(game.api.demolish(s.x,s.y).ok,false);
    assert.equal(game.api.repair(s.x,s.y).ok,false);
    assert.deepEqual(s,before);assert.equal(game.state.gold,gold);
  }
  const damaged=properties(game).find(s=>s.hp<s.maxHp),hp=damaged.hp;
  requireFrontierAction(game.api.repairAll(),'repair military works');
  assert.equal(damaged.hp,hp,'repair-all cannot erase pre-existing civilian damage');
  const civilian=properties(game).find(s=>s.type!=='keep');
  damageStructure(game.state,civilian,civilian.hp);
  assert.equal(civilian.destroyed,true,'HARNESS_PRECONDITION_FAILED: civilian destroyed');
  assert.equal(game.api.place('wall',civilian.x,civilian.y).ok,false);
  assert.equal(game.api.demolish(civilian.x,civilian.y).ok,false);
  assert.equal(game.api.repair(civilian.x,civilian.y).ok,false);
});

test('Frontier optional property and civilian losses do not fail its mandatory keep objective',()=>{
  const game=frontier();
  requireFrontierAction(game.api.startSiege(),'start optional-loss fixture');
  for(const s of properties(game).filter(s=>s.type!=='keep')) damageStructure(game.state,s,s.hp);
  game.state.inhabitants.forEach(p=>p.hp=0);
  game.state.schedule=[];game.state.spawnIndex=0;game.state.enemies=[];
  game.api.tick();
  assert.equal(game.state.phase,'victory');
  assert.ok(properties(game).find(s=>s.type==='keep').hp>0);
});

test('Frontier mandatory keep destruction fails even when every civilian property survives',()=>{
  const game=frontier();
  requireFrontierAction(game.api.startSiege(),'start keep-loss fixture');
  const keep=properties(game).find(s=>s.type==='keep');
  damageStructure(game.state,keep,keep.hp);
  game.api.tick();
  assert.equal(game.state.phase,'defeat');
  assert.ok(properties(game).filter(s=>s.type!=='keep').every(s=>!s.destroyed));
});

test('Frontier result processing and bounty credit are idempotent, retry restores the exact preparation snapshot',()=>{
  const game=frontier(),before=structuredClone(game.state);
  for(let attempt=0;attempt<2;attempt++) {
    requireFrontierAction(game.api.startSiege(),'start repeatable Frontier fixture');
    const budget=game.state.gold;
    const enemy=spawnEnemy(game.state,'foot',60.5,18.5);
    damageEnemy(game.state,enemy,enemy.hp);
    damageEnemy(game.state,enemy,1000);
    assert.equal(game.state.stats.bountyGold,CONFIG.bounties.foot);
    assert.equal(game.state.gold,budget+CONFIG.bounties.foot,'bounties immediately enter the battle treasury');
    game.state.schedule=[];game.state.spawnIndex=0;game.state.enemies=[];
    game.api.tick();
    assert.equal(game.state.phase,'victory','HARNESS_PRECONDITION_FAILED: repeatable result');
    const result=structuredClone(game.state.results),contract=structuredClone(game.state.contract),gold=game.state.gold;
    game.api.tick();game.api.stepSeconds(3);
    assert.deepEqual(game.state.results,result);
    assert.deepEqual(game.state.contract,contract);
    assert.equal(game.state.gold,gold);
    assert.equal(game.api.retrySiege(),true);
    assert.deepEqual(game.state,before);
  }
});

test('equal full-perimeter protection of every district exceeds the client construction budget',()=>{
  const game=frontier();
  const estimates=districtCurtainEstimate(game.state,{wall:game.api.price('wall'),gate:game.api.price('gate')});
  assert.ok(estimates.length>=3,'HARNESS_PRECONDITION_FAILED: separately authored districts');
  assert.ok(estimates.reduce((n,d)=>n+d.cost,0)>game.state.gold);
});

test('Frontier slice one preserves prep-only Class A construction and the existing pause/speed controls',()=>{
  const game=frontier();
  requireFrontierAction(game.api.startSiege(),'start control fixture');
  assert.equal(game.api.setSpeed(0),true);assert.equal(game.state.speed,0);
  for(const speed of [1,2,4]) {assert.equal(game.api.setSpeed(speed),true);assert.equal(game.state.speed,speed);}
  assert.equal(game.api.setSpeed(3),false);
  for(const type of ['wall','gate','tower','spiked','golem','launcher','sensor','retractable']) assert.equal(game.api.place(type,30,18).ok,false);
});

test('contract acceptance assesses existing condition and charges only new property damage once',()=>{
  const game=frontier(),state=game.state;
  const damaged=properties(game).find(s=>s.hp<s.maxHp),startHp=damaged.hp;
  const assessment=state.contract.assessment.find(s=>s.id===damaged.id);
  assert.equal(assessment.assessed,damaged.value*startHp/damaged.maxHp);
  assert.equal(assessment.hpStart,startHp);
  assert.equal(results(game).liability,0,'pre-existing damage is free');
  damageStructure(state,damaged,startHp/2);
  let report=results(game),line=report.damageByBuilding.find(s=>s.id===damaged.id);
  assert.equal(line.liability,round(assessment.assessed/2));
  assert.equal(report.liability,line.liability);
  assert.equal(report.valuePreserved,round(report.totalValueBefore-line.liability));
  damageStructure(state,damaged,startHp);
  report=results(game);line=report.damageByBuilding.find(s=>s.id===damaged.id);
  assert.equal(line.liability,assessment.assessed,'destruction charges full assessed value, without adding the earlier partial charge');
  assert.equal(report.damageByBuilding.filter(s=>s.id===damaged.id).length,1);
  assert.equal(report.liability,assessment.assessed);
  assert.equal(report.propertyDeduction,round(assessment.assessed*state.contract.damageLiability));
  assert.deepEqual(calculateContractResults(state),report,'repeated calculation adds no new liability');
});

test('mayor payment itemizes damage, casualties and objective bonuses without paying unspent budget',()=>{
  const game=frontier(),state=game.state;
  const warehouse=properties(game).find(s=>s.id==='warehouse');
  damageStructure(state,warehouse,warehouse.maxHp/4);
  state.inhabitants[0].hp=0;
  const report=results(game),rules=CONFIG.frontier;
  assert.equal(report.propertyDeduction,warehouse.value/4*rules.damageLiability);
  assert.equal(report.casualtyDeduction,rules.casualtyPenalty);
  assert.equal(report.deduction,report.propertyDeduction+report.casualtyDeduction);
  assert.equal(report.bonuses.find(b=>b.key==='allCivilians').amount,0);
  assert.equal(report.bonuses.find(b=>b.key==='workshop').amount,rules.bonuses.workshop);
  assert.equal(report.mayorPayment,rules.baseFee-report.deduction+rules.bonuses.workshop);
  assert.equal(report.finalEarnings,round(report.mayorPayment+report.ownerRewardTotal+report.thankYouTotal+report.bountyGold));
  const budget=state.gold;state.gold=0;
  assert.deepEqual(calculateContractResults(state),report,'unspent budget cannot increase earnings');
  state.gold=budget;
});

test('contract gold rounds each damage and payment line before summing whole-gold totals',()=>{
  const game=frontier(),state=game.state;
  const targets=properties(game).filter(s=>s.type==='house').slice(0,3);
  assert.equal(targets.length,3,'HARNESS_PRECONDITION_FAILED: three separate house liabilities');
  for(const s of targets) damageStructure(state,s,7);
  const report=results(game);
  for(const line of report.damageByBuilding) {
    assert.ok(Number.isInteger(line.assessed));assert.ok(Number.isInteger(line.liability));assert.ok(Number.isInteger(line.preserved));
  }
  assert.equal(report.liability,report.damageByBuilding.reduce((n,s)=>n+s.liability,0));
  assert.equal(report.totalValueBefore,report.damageByBuilding.reduce((n,s)=>n+s.assessed,0));
  assert.equal(report.valuePreserved,report.damageByBuilding.reduce((n,s)=>n+s.preserved,0));
  assert.equal(report.ownerRewardTotal,report.ownerRewards.reduce((n,r)=>n+r.amount,0));
  assert.equal(report.thankYouTotal,report.thankYouPayments.reduce((n,r)=>n+r.amount,0));
  assert.equal(report.finalEarnings,report.mayorPayment+report.ownerRewardTotal+report.thankYouTotal+report.bountyGold);
  for(const value of [report.propertyDeduction,report.casualtyDeduction,report.deduction,report.mayorPayment,report.finalEarnings]) assert.ok(Number.isInteger(value));
});

test('liability deductions cap at the base fee, no payment becomes negative, and failure pays no mayor fee or bonuses',()=>{
  const game=frontier(),state=game.state;
  for(const s of properties(game).filter(s=>s.type!=='keep')) damageStructure(state,s,s.hp);
  state.inhabitants.forEach(p=>p.hp=0);
  let report=results(game);
  assert.equal(report.deduction,CONFIG.frontier.baseFee);
  assert.equal(report.deductionCapApplied,true);
  assert.equal(report.mayorPayment,0);
  assert.ok(report.finalEarnings>=0);
  damageStructure(state,properties(game).find(s=>s.type==='keep'),100000);
  report=results(game);
  assert.equal(report.result,'defeat');assert.equal(report.rating,'Contract Failed');
  assert.equal(report.baseFee,0);assert.equal(report.mayorPayment,0);
  assert.ok(report.bonuses.every(b=>b.amount===0));
  assert.ok(report.reasons.some(s=>s.includes('Mandatory objective failed')));
});

test('all four owner choices are recorded, Communication gates negotiation and repeated answers cannot pay twice',()=>{
  const game=frontier(),state=game.state,requests=state.contract.requests;
  assert.equal(state.skills.communication,2);
  assert.ok(requests.length>=4);
  const gate=requests.find(r=>r.communicationRequired>state.skills.communication);
  assert.ok(gate,'HARNESS_PRECONDITION_FAILED: a visible higher Communication gate');
  const before=structuredClone(state);
  assert.equal(game.api.respondToRequest(gate.id,'askMore').ok,false);
  assert.deepEqual(state,before,'failed negotiation is atomic');
  requireFrontierAction(game.api.respondToRequest('merchant','askMore'),'negotiate merchant');
  assert.equal(requests.find(r=>r.id==='merchant').agreedReward,CONFIG.frontier.requests.merchant.reward*1.5);
  requireFrontierAction(game.api.respondToRequest('farmer','decline'),'decline farmer');
  requireFrontierAction(game.api.respondToRequest('elder','selfDefend'),'record elder self defense');
  const gold=state.gold;
  requireFrontierAction(game.api.respondToRequest('workshop','promise'),'promise workshop');
  assert.equal(state.contract.ownerAdvances,CONFIG.frontier.requests.workshop.reward);
  assert.equal(state.contract.earnings,CONFIG.frontier.requests.workshop.reward);
  assert.equal(state.gold,gold,'immediate owner payment is separate from client budget');
  assert.equal(game.api.respondToRequest('workshop','promise').ok,false);
  assert.equal(state.contract.ownerAdvances,CONFIG.frontier.requests.workshop.reward);
  assert.equal(state.journal.length,4);
  assert.deepEqual(state.journal.map(r=>r.status),['accepted','declined','selfDefend','accepted']);
  for(const entry of state.journal) assert.ok(entry.location&&entry.owner&&entry.completionCondition);
  const elder=properties(game).find(s=>s.id==='hamlet-hall');
  assert.deepEqual(elder.selfDefense,{requested:true,rule:'barricades',status:'deferred'});
  assert.equal(state.contract.reputation,0,'declining and self defense do not penalize reputation');
});

test('surviving owners pay independently on contract failure while broken promises lose their rewards and reputation',()=>{
  const game=frontier(),state=game.state;
  requireFrontierAction(game.api.respondToRequest('merchant','promise'),'promise warehouse');
  requireFrontierAction(game.api.respondToRequest('elder','promise'),'promise meeting house');
  damageStructure(state,properties(game).find(s=>s.id==='hamlet-hall'),100000);
  damageStructure(state,properties(game).find(s=>s.type==='keep'),100000);
  const report=results(game);
  assert.equal(report.result,'defeat');assert.equal(report.mayorPayment,0);
  assert.equal(report.ownerRewards.find(r=>r.id==='merchant').amount,CONFIG.frontier.requests.merchant.reward);
  assert.equal(report.ownerRewards.find(r=>r.id==='elder').amount,0);
  assert.equal(report.promisesKept,1);assert.equal(report.promisesBroken,1);assert.equal(report.reputation,-1);
  assert.ok(report.reasons.some(s=>s.includes('reputation -1')));
  finalizeContract(state);
  assert.equal(state.journal.find(r=>r.id==='merchant').outcome,'kept');
  assert.equal(state.journal.find(r=>r.id==='elder').outcome,'broken');
});

test('thank-you payments require undamaged unpromised eligible property and obey their deterministic cap',()=>{
  const game=frontier(),state=game.state,rules=CONFIG.frontier;
  requireFrontierAction(game.api.respondToRequest('merchant','promise'),'promise warehouse');
  requireFrontierAction(game.api.respondToRequest('elder','selfDefend'),'elder self defense');
  const farm=properties(game).find(s=>s.id==='eastern-farm');
  damageStructure(state,farm,1);
  const report=results(game);
  assert.ok(report.thankYouPayments.length>0);
  assert.ok(report.thankYouTotal<=rules.thankYouCap);
  let remaining=rules.thankYouCap,expected=0;
  for(const before of state.contract.assessment) {
    const s=properties(game).find(s=>s.id===before.id);
    if(s.type==='keep'||before.assessed<rules.thankYouThreshold||s.hp<before.hpStart||['accepted','selfDefend'].includes(s.promise.status)) continue;
    const amount=round(Math.min(remaining,s.value*rules.thankYouRate));expected=round(expected+amount);remaining=round(remaining-amount);
  }
  assert.equal(report.thankYouTotal,expected);
  for(const id of ['warehouse','hamlet-hall','eastern-farm']) assert.ok(!report.thankYouPayments.some(r=>r.buildingId===id));
  assert.deepEqual(calculateContractResults(state).thankYouPayments,report.thankYouPayments);
});

test('Frontier foot raiders commit to a readable property target once; other types retain the keep breach route',()=>{
  const game=frontier(),state=game.state;
  const farmer=properties(game).find(s=>s.id==='eastern-farm');
  const foot=spawnEnemy(state,'foot',farmer.x+3,farmer.y+1);
  const target=choosePropertyTarget(state,foot);
  assert.equal(target.id,farmer.id);
  const cottage=properties(game).find(s=>s.id==='hamlet-house');
  foot.x=cottage.x+3;foot.y=cottage.y+1;
  assert.equal(choosePropertyTarget(state,foot).id,farmer.id,'moving near another property cannot switch the commitment');
  damageStructure(state,farmer,farmer.hp);
  assert.equal(choosePropertyTarget(state,foot),null);
  assert.equal(foot.propertyRaidComplete,true);
  assert.equal(choosePropertyTarget(state,foot),null,'destroyed target sends the raider back to the keep');
  for(const type of ['chiseler','powder','boss']) assert.equal(choosePropertyTarget(state,spawnEnemy(state,type,cottage.x+3,cottage.y+1)),null);
});

test('deterministic distributed defenses win with high preservation and complete the merchant promise',()=>{
  const game=frontier();
  requireFrontierAction(game.api.respondToRequest('merchant','promise'),'promise protected merchant');
  applyFrontierBuild(game,FRONTIER_PRESERVATION_BUILD);
  assert.equal(CONFIG.frontier.budget-game.state.gold,760);
  const report=finishFrontier(game);
  assert.equal(game.state.phase,'victory',`distributed defenses: ${JSON.stringify({phase:game.state.phase,preservation:report.preservation,keep:game.state.structures.find(s=>s.type==='keep').hp})}`);
  assert.ok(report.preservation>=90,`high preservation was ${report.preservation}%`);
  assert.equal(report.ownerRewards.find(r=>r.id==='merchant').kept,true);
  assert.equal(report.promisesKept,1);assert.equal(report.promisesBroken,0);
  assert.ok(report.bountyGold>0);assert.equal(report.paid,true);
});

test('deterministic town-focused defenses win while several outlying properties and their promise are lost',()=>{
  const game=frontier();
  requireFrontierAction(game.api.respondToRequest('farmer','promise'),'promise exposed eastern farm');
  applyFrontierBuild(game,FRONTIER_TOWN_BUILD);
  assert.equal(CONFIG.frontier.budget-game.state.gold,740);
  const report=finishFrontier(game);
  assert.equal(game.state.phase,'victory',`town-focused defenses: ${JSON.stringify({phase:game.state.phase,preservation:report.preservation,keep:game.state.structures.find(s=>s.type==='keep').hp})}`);
  const outlying=report.damageByBuilding.filter(s=>s.district!=='town'&&s.destroyed);
  assert.ok(outlying.length>=2,`outlying losses: ${outlying.map(s=>s.id).join(', ')}`);
  assert.equal(report.promisesBroken,1);assert.equal(report.promisesKept,0);
  assert.equal(report.ownerRewards.find(r=>r.id==='farmer').amount,0);
  assert.ok(report.damageByDistrict.find(d=>d.id==='town').liability<report.liability);
});

test('an undefended Frontier siege deterministically fails the commission without paying the mayor fee',()=>{
  const game=frontier(),report=finishFrontier(game);
  assert.equal(game.state.phase,'defeat');
  assert.equal(game.state.structures.find(s=>s.type==='keep').destroyed,true);
  assert.equal(report.rating,'Contract Failed');assert.equal(report.mayorPayment,0);assert.equal(report.baseFee,0);
});
