import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/campaign.js';
import { generateFrontierContract } from '../src/sim/frontier/generator.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { calculateContractResults } from '../src/sim/frontier/contract.js';
import { FRONTIER_HAMLET_BUILD, applyFrontierBuild, finishFrontier,
  frontierBalanceRow, requireFrontierAction, applyGeneratedTowerBuild, districtCurtainEstimate } from './fixtures/frontier-reference.js';
import { WIDTH, HEIGHT } from '../src/data/map.js';
import { BUDGET_STRATEGIES, applyBudgetStrategy } from './fixtures/frontier-budget-strategies.js';

// Seed 1 is a multi-front contract in every archetype (compact and outpost
// have a second wave, twin is an encirclement), chosen from a 12-seed sweep of
// weighted versus evenly spread tower plans of identical cost.
for(const archetype of ['compact','twin','outpost']) test(`Frontier ${archetype} rewards intel-weighted defense over rings and even spreads`,()=>{
  const seed=1,brief=generateFrontierContract(seed,archetype);
  assert.ok(brief.siege.plan.fronts.length>=3&&brief.specialObjectives.every(g=>!g.mandatory),'HARNESS_PRECONDITION_FAILED: optional multi-front fixture');
  const run=mode=>{
    const game=createGame({stage:'frontier',generated:true,seed,archetype});
    assert.equal(game.state.contract.generation.fallback,false,'HARNESS_PRECONDITION_FAILED: generated terrain');
    // Retain the original equal-cost tactical comparison at six/seven towers;
    // larger geometry budgets are exercised in full by the sweep below.
    const budget=game.state.gold,spent=applyGeneratedTowerBuild(game,mode,archetype==='twin'?7:6);
    finishFrontier(game);
    return {game,budget,spent,row:frontierBalanceRow(game,`${archetype}:${seed}:${mode}`,spent)};
  };
  const probe=createGame({stage:'frontier',generated:true,seed,archetype}),prices={wall:probe.api.price('wall'),gate:probe.api.price('gate')};
  const equalCost=districtCurtainEstimate(probe.state,prices).reduce((n,d)=>n+d.cost,0),edgeRing=(2*(WIDTH-2)+2*(HEIGHT-4))*prices.wall;
  assert.ok(equalCost>probe.state.gold,'closed rings around every district exceed the shared budget');
  // The former >3 budgets threshold encoded the superseded 600–950 G range.
  // The new treasury can fund a town, but still cannot wall the entire map.
  assert.ok(edgeRing>probe.state.gold,'walling the whole map edge exceeds the construction budget');
  const weighted=run('weighted'),even=run('even');
  console.log('Frontier generated balance',JSON.stringify({weighted:weighted.row,even:even.row,budget:weighted.budget,equalCost,edgeRing}));
  assert.equal(weighted.spent,even.spent,'HARNESS_PRECONDITION_FAILED: equal-cost comparison');
  assert.equal(weighted.game.state.phase,'victory');assert.equal(weighted.game.state.results.paid,true);
  assert.ok(weighted.game.state.structures.filter(s=>s.type==='keep').every(s=>s.hp>0));
  assert.ok(weighted.row.preservation>even.row.preservation,'scout-weighted towers preserve more value than an even ring');
});

test('Frontier geometry budgets support distinct public-action defenses across eight seeds per archetype',()=>{
  const table=[];
  for(const archetype of ['compact','twin','outpost']) for(const strategy of BUDGET_STRATEGIES) {
    let wins=0,preservation=0,spent=0;
    for(let seed=1;seed<=8;seed++) {
      const game=createGame({stage:'frontier',generated:true,seed,archetype});
      assert.equal(game.state.contract.generation.fallback,false,'sweep uses generated geometry');
      const built=applyBudgetStrategy(game,strategy);
      assert.ok(built.spent>0&&built.spent<=game.state.prepGold,'public actions stay within construction treasury');
      if(strategy==='main enclosure'||strategy==='reinforced main') assert.equal(built.completeMain,true,'main basic enclosure is affordable and buildable');
      assert.equal(game.api.canStart().ok,true,'scripted defenses preserve the trade route');
      const report=finishFrontier(game);
      wins+=report.result==='victory'?1:0;preservation+=report.preservation;spent+=built.spent;
    }
    table.push({archetype,strategy,wins:`${wins}/8`,preserved:Math.round(preservation/8*10)/10,meanSpend:Math.round(spent/8)});
  }
  console.log('Frontier geometry budget sweep',JSON.stringify(table));
  assert.ok(table.some(row=>row.wins!=='8/8'||row.preserved<98),'increased budgets do not make every approach a near-total-preservation victory');
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
