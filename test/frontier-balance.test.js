import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/campaign.js';
import { generateFrontierContract } from '../src/sim/frontier/generator.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { calculateContractResults } from '../src/sim/frontier/contract.js';
import { FRONTIER_HAMLET_BUILD, applyFrontierBuild, finishFrontier,
  frontierBalanceRow, requireFrontierAction, applyGeneratedFocusedBuild, districtCurtainEstimate } from './fixtures/frontier-reference.js';

for(const archetype of ['compact','twin','outpost']) test(`Frontier ${archetype} has a winning keep-focused plan and unaffordable equal curtains`,()=>{
  // A keep-focused strategy deliberately accepts optional outlying losses.
  // Select this scenario by briefing data before any battle outcome is known.
  const seed=Array.from({length:8},(_,i)=>i+1).find(seed=>generateFrontierContract(seed,archetype).specialObjectives.every(g=>!g.mandatory));
  assert.ok(seed,'HARNESS_PRECONDITION_FAILED: optional outlying objective fixture');
  const game=createGame({stage:'frontier',generated:true,seed,archetype});
  assert.equal(game.state.contract.generation.fallback,false,'HARNESS_PRECONDITION_FAILED: generated terrain');
  const equalCost=districtCurtainEstimate(game.state,{wall:game.api.price('wall'),gate:game.api.price('gate')}).reduce((n,d)=>n+d.cost,0);
  assert.ok(equalCost>game.state.gold,'equal district protection exceeds the shared budget');
  const budget=game.state.gold,spent=applyGeneratedFocusedBuild(game);
  finishFrontier(game);
  console.log('Frontier generated balance',JSON.stringify({...frontierBalanceRow(game,`${archetype}:${seed}`,spent),budget,equalCost}));
  assert.equal(game.state.phase,'victory');
  assert.equal(game.state.results.paid,true);
  assert.ok(game.state.structures.filter(s=>s.type==='keep').every(s=>s.hp>0));
});

test('Frontier guard reassignment trades keep protection for exposed farming property in a controlled raid',()=>{
  const run=reassign=>{
    const game=createGame({stage:'frontier',seed:123456,skills:{communication:3}});
    if(reassign) requireFrontierAction(game.api.requestGuards('hill-farm',4),'reassign farm guards');
    const posts=game.state.guards.filter(g=>g.postId==='keep').length;
    assert.equal(posts,reassign?0:4,'HARNESS_PRECONDITION_FAILED: professional guards moved');
    requireFrontierAction(game.api.startSiege(),'start controlled guard fixture');
    // Isolate two simultaneous contacts using real units and combat on the
    // authored map. The full schedule otherwise overwhelms isolated farm
    // guards before later raids, masking their defense/keep tradeoff.
    game.state.schedule=[];game.state.spawnIndex=0;
    for(let i=0;i<2;i++) spawnEnemy(game.state,'foot',55.5,27.5);
    for(let i=0;i<4;i++) spawnEnemy(game.state,'chiseler',21.5,20.5);
    assert.equal(game.state.enemies.length,6,'HARNESS_PRECONDITION_FAILED: simultaneous controlled contacts');
    game.api.stepSeconds(12);
    const report=calculateContractResults(game.state);
    return {keepHp:game.state.structures.find(s=>s.type==='keep').hp,
      farmLoss:report.damageByDistrict.find(d=>d.id==='farms').liability,
      keepPressure:game.state.stats.keepReachedEnemies??0};
  };
  const keep=run(false),farm=run(true);
  console.log('Frontier guard balance',JSON.stringify({keep,farm}));
  assert.ok(farm.farmLoss<keep.farmLoss,'farm guards reduce exposed-district loss');
  assert.ok(farm.keepHp<keep.keepHp,'the keep takes more damage with fewer guards');
});

test('Frontier negotiated outlying promise exceeds its dedicated defense cost',()=>{
  const game=createGame({stage:'frontier',seed:123456,skills:{communication:3}});
  requireFrontierAction(game.api.respondToRequest('elder','askMore'),'negotiate the hamlet promise');
  applyFrontierBuild(game,FRONTIER_HAMLET_BUILD);
  const spent=game.state.prepGold-game.state.gold;
  const report=finishFrontier(game),reward=report.ownerRewards.find(r=>r.id==='elder');
  console.log('Frontier promise balance',JSON.stringify({...frontierBalanceRow(game,'Hamlet promise',spent),reward}));
  assert.equal(report.result,'victory');assert.equal(reward.kept,true);
  const cost=game.api.price('wall')+game.api.price('tower');
  assert.ok(cost>0,'HARNESS_PRECONDITION_FAILED: paid dedicated defense');
  assert.ok(reward.amount>cost,`${reward.amount} G reward exceeds ${cost} G hamlet works`);
});
