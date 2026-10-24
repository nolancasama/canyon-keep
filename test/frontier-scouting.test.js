import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { generateFrontierContract } from '../src/sim/frontier/generator.js';
import { FRONT_DIRECTIONS, frontScoutReport, advancedScoutReport, purchaseAdvancedScouting } from '../src/sim/frontier/fronts.js';

const generated=(seed=1,archetype='compact')=>createGame({stage:'frontier',generated:true,seed,archetype});

test('advanced percentages account for group counts and enemy strength rather than raw headcounts',()=>{
  const groups=[{front:'east',type:'foot',count:10},{front:'west',type:'boss',count:1}];
  const plan={waves:1,fronts:[{id:'east',direction:0,band:'major',waveShares:[10/18]},
    {id:'west',direction:4,band:'secondary',waveShares:[8/18]}]};
  assert.deepEqual(advancedScoutReport(plan,groups,[]),['Primary attack direction: east.',
    'East: about 55% of enemy strength.','West: about 45% of enemy strength; the giant brute.']);
});

test('free scouting is preserved and advanced intel matches actual assigned strength and dangers',()=>{
  const reports=new Set();
  for(const archetype of ['compact','twin','outpost']) for(let seed=0;seed<8;seed++) {
    const contract=generateFrontierContract(seed,archetype),{plan,groups}=contract.siege;
    assert.deepEqual(contract.siege.scoutReport,frontScoutReport(plan,groups,contract.map.districts));
    const before=structuredClone({plan,groups}),bullets=advancedScoutReport(plan,groups,contract.map.districts);
    assert.deepEqual({plan,groups},before,'report is pure');
    reports.add(bullets.join(' '));
    const opening=plan.fronts.filter(f=>f.waveShares[0]>0),primary=opening.reduce((a,b)=>b.waveShares[0]>a.waveShares[0]?b:a);
    assert.equal(bullets[0],`Primary attack direction: ${FRONT_DIRECTIONS[primary.direction].name}.`);
    const weight=g=>g.count*CONFIG.frontier.fronts.strength[g.type],total=groups.reduce((n,g)=>n+weight(g),0);
    for(const front of plan.fronts) {
      const direction=FRONT_DIRECTIONS[front.direction].name,label=direction[0].toUpperCase()+direction.slice(1);
      const line=bullets.find(b=>b.startsWith(`${label}:`)),assigned=groups.filter(g=>g.front===front.id&&g.count>0);
      const percent=Math.round(assigned.reduce((n,g)=>n+weight(g),0)/total*20)*5;
      assert.ok(line.includes(`about ${percent}%`),`${archetype}/${seed} actual strength for ${direction}`);
      assert.equal(line.includes('(diversion)'),front.band==='minor');
      for(const [type,text] of [['powder','powder carriers'],['chiseler','chiselers'],['boss','the giant brute']])
        assert.equal(line.includes(text),assigned.some(g=>g.type===type),`${direction}: ${text}`);
    }
    if(plan.waves===2) {
      const shift=plan.fronts.reduce((a,b)=>b.waveShares[1]>a.waveShares[1]?b:a);
      assert.ok(bullets.includes(`Second-wave main assault: ${FRONT_DIRECTIONS[shift.direction].name}.`));
    } else assert.ok(!bullets.some(b=>b.startsWith('Second-wave')));
    assert.ok(!/\d+\s*(seconds?|minutes?|s)\b/i.test(bullets.join(' ')),'no exact timings');
  }
  assert.ok(reports.size>8,'different seeds yield different appropriate intel');
});

test('advanced scouting costs configured gold once and preserves the free report and enemy plan',()=>{
  const game=generated(),before=structuredClone(game.state.frontierSiege),gold=game.state.gold;
  const basic=[...game.state.scoutReport.bullets];
  assert.equal(CONFIG.frontier.scouting.advancedCost,50);
  assert.deepEqual(game.api.advancedScoutingStatus(),{ok:true,cost:CONFIG.frontier.scouting.advancedCost});
  assert.equal(game.api.purchaseAdvancedScouting().ok,true);
  assert.equal(game.state.gold,gold-CONFIG.frontier.scouting.advancedCost);
  assert.equal(game.state.contract.advancedScouting,true);
  assert.deepEqual(game.state.scoutReport.bullets,basic);
  assert.deepEqual(game.state.frontierSiege,before,'purchase cannot alter plan, groups or free report');
  assert.ok(game.state.scoutReport.advancedBullets.length>=2);
  const bought=structuredClone(game.state);
  assert.equal(game.api.purchaseAdvancedScouting().ok,false);
  assert.deepEqual(game.state,bought,'repeat purchase does not mutate state');
  game.api.dismissScoutReport();game.api.openScoutReport();
  assert.deepEqual(game.state.scoutReport.advancedBullets,bought.scoutReport.advancedBullets);
});

test('advanced scouting refuses unaffordable, non-prep and handcrafted purchases without mutation',()=>{
  const poor=generated();poor.state.gold=CONFIG.frontier.scouting.advancedCost-1;
  const canyon=createGame(),authored=createGame({stage:'frontier'}),battle=generated();
  assert.equal(battle.api.startSiege().ok,true);
  for(const game of [poor,canyon,authored,battle]) {
    const before=structuredClone(game.state),result=purchaseAdvancedScouting(game.state);
    assert.equal(result.ok,false);assert.ok(result.reason);
    assert.deepEqual(game.state,before,'failure is mutation-free');
  }
  assert.match(authored.api.advancedScoutingStatus().reason,/authored siege/);
  const exact=generated();exact.state.gold=CONFIG.frontier.scouting.advancedCost;
  assert.equal(exact.api.purchaseAdvancedScouting().ok,true);
  assert.equal(exact.state.gold,0,'exactly the configured cost is affordable');
});

test('scouting survives retry and serialization without a refund or duplicate charge',()=>{
  const game=generated(),initial=game.state.gold,cost=CONFIG.frontier.scouting.advancedCost;
  assert.equal(game.api.purchaseAdvancedScouting().ok,true);
  let point;
  for(let y=2;y<34&&!point;y++) for(let x=3;x<61;x++) if(game.api.preview('wall',x,y).ok) {point={x,y};break;}
  assert.ok(point,'a public wall placement is available');
  assert.equal(game.api.place('wall',point.x,point.y).ok,true);
  assert.equal(game.api.demolish(point.x,point.y).ok,true);
  assert.equal(game.state.gold,initial-cost,'full construction refund excludes scouting');
  const expected=structuredClone(game.state);
  assert.equal(game.api.startSiege().ok,true);
  assert.equal(game.state.snapshot.contract.advancedScouting,true);
  assert.equal(game.api.retrySiege(),true);
  assert.deepEqual(game.state,expected,'snapshot restores purchased intel and spent gold exactly');
  game.api.openScoutReport();
  assert.deepEqual(game.state.scoutReport.advancedBullets,expected.scoutReport.advancedBullets);
  assert.equal(game.api.purchaseAdvancedScouting().ok,false);
  const saved=JSON.parse(JSON.stringify(game.state));
  assert.equal(saved.contract.advancedScouting,true);
  assert.equal(purchaseAdvancedScouting(saved).ok,false);
  assert.equal(saved.gold,initial-cost);
});
