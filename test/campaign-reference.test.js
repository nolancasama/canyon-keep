import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame } from './helpers.js';
import { expandSchedule, SIEGES } from '../src/data/sieges.js';
import { CONFIG } from '../src/config.js';
import { applyReferenceBuild } from './fixtures/reference-build.js';
import { simulateCampaign, applyMechanicalBuild, CAMPAIGN_INITIAL_BUILD } from './fixtures/campaign-reference.js';
import { growSettlement } from '../src/sim/settlement.js';

test('Sieges 2 and 3 have escalating breach packs, continuous arrivals and late bosses',()=>{
  for(const index of [2,3]) {
    const schedule=expandSchedule(index),boss=schedule.find(e=>e.type==='boss');
    assert.equal(schedule.length,index===2?75:120);
    assert.equal(SIEGES[index].bossHp,CONFIG.enemies.boss.hpBySiege[index-1]);
    assert.ok(boss.t/schedule.at(-1).t>=.7 && boss.t/schedule.at(-1).t<=.8);
    assert.ok(schedule.every((entry,i)=>i===0||entry.t-schedule[i-1].t<=12));
    assert.ok(schedule.filter(e=>e.type==='chiseler').length>expandSchedule(index-1).filter(e=>e.type==='chiseler').length);
  }
});

test('an affordable expanding campaign wins all three sieges without a pendulum and repeats exactly',()=>{
  const first=simulateCampaign(createGame);
  for(const report of first.reports) console.log(`Campaign Siege ${report.siege}: enteringPrep=${first.game.state.campaign.history[report.siege-2]?.treasuryAfter??CONFIG.startingGold}, payout=${report.payout}, structuresDestroyed=${report.structuresDestroyed}, keepDamage=${report.keepDamage}, duration=${report.time.toFixed(1)}s`);
  assert.equal(first.game.state.phase,'complete',JSON.stringify(first.reports));
  assert.equal(first.reports.length,3);
  for(const [i,baseline] of [[0,615],[1,1010]]) {
    const actual=first.game.state.campaign.history[i].treasuryAfter;
    assert.ok(actual>=baseline*.9&&actual<=baseline*1.1,`entering S${i+2}: ${actual} G vs pre-bounty ${baseline} G`);
  }
  assert.ok(first.reports.every(r=>r.phase==='victory'&&r.goldBefore>=0));
  assert.equal(first.game.state.pendulum,null);
  assert.deepEqual(first.game.state.campaign.rewardedSieges,[1,2,3]);
  const second=simulateCampaign(createGame);
  const hash=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
  assert.deepEqual(first.reports,second.reports);
  assert.equal(hash(first.game.state),hash(second.game.state));
});

test('the unchanged Siege 1 defenses lose Siege 3 even with automatic settlement growth',()=>{
  const game=createGame(123456);
  applyReferenceBuild(game);
  // Isolate layout adequacy from economy: only civilian growth is added;
  // defensive positions and HP stay unchanged.
  game.state.siegeIndex=3;
  growSettlement(game.state,'exceptional');
  growSettlement(game.state,'exceptional');
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: S3 trade road');
  game.api.stepSeconds(420);
  assert.equal(game.state.phase,'defeat',JSON.stringify({phase:game.state.phase,keep:game.state.structures[0].hp,boss:game.state.enemies.find(e=>e.type==='boss')?.hp,stats:game.state.stats}));
});

test('mechanical defenses win Siege 1 within the reference military budget',t=>{
  const reports=[];
  for(const [name,build] of [['reference',applyReferenceBuild],['mechanical',applyMechanicalBuild]]) {
    const game=createGame(123456);
    build(game);
    const cost=CONFIG.startingGold-game.state.gold,towers=game.state.structures.filter(s=>s.type==='tower').length;
    assert.equal(game.api.startSiege().ok,true,`HARNESS_PRECONDITION_FAILED: ${name} S1 road`);
    game.api.stepSeconds(420);
    const report={name,cost,towers,outcome:game.state.phase,keepDamage:game.state.results?.keepDamage,bounties:game.state.stats.bountyGold,
      spikes:game.state.eventLog.filter(e=>e.type==='spikeHit').length,golems:game.state.eventLog.filter(e=>e.type==='golemAwaken').length,
      volleys:game.state.eventLog.filter(e=>e.type==='sensorFire').length};
    reports.push(report);
    t.diagnostic(JSON.stringify(report));
  }
  assert.ok(reports[1].cost<=reports[0].cost,JSON.stringify(reports));
  assert.ok(reports[1].towers<reports[0].towers,'mechanical defenses replace some tower spending');
  assert.ok(reports.every(r=>r.outcome==='victory'),JSON.stringify(reports));
  assert.ok(reports[1].spikes>0&&reports[1].golems>0&&reports[1].volleys>0,'the purchased defenses must actually engage');
});

test('keeping the initial castle and only restoring damage leaves every grown preparation playable',t=>{
  const game=createGame(123456),layout=CAMPAIGN_INITIAL_BUILD;
  for(const {type,x,y} of layout) assert.equal(game.api.place(type,x,y).ok,true,`HARNESS_PRECONDITION_FAILED: initial ${type}@${x},${y}`);
  let transitions=0;
  for(let siege=1;siege<=3;siege++) {
    assert.equal(game.api.startSiege().ok,true,`HARNESS_PRECONDITION_FAILED: repair-only Siege ${siege}`);
    game.api.stepSeconds(420);
    assert.ok(['victory','defeat'].includes(game.state.phase),'siege must reach an outcome');
    t.diagnostic(`Repair-only Siege ${siege}: ${game.state.phase}, keepDamage=${game.state.results.keepDamage}, bounties=${game.state.stats.bountyGold}`);
    if(game.state.phase==='defeat'||siege===3) break;
    assert.equal(game.api.continueCampaign(),true,`HARNESS_PRECONDITION_FAILED: repair-only Continue ${siege}`);
    transitions++;
    const report=game.state.growthReport,plan=CONFIG.growth.tiers[report.tier];
    assert.equal(report.houses+report.shortage.houses,plan.houses);
    assert.ok(report.farms+report.shortage.farms>=plan.farms);
    assert.equal(report.rebuildShortage,0);
    const structures=game.state.structures;
    for(let i=0;i<structures.length;i++) for(let j=i+1;j<structures.length;j++) {
      const a=structures[i],b=structures[j];
      assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),`overlap after growth: ${a.id}, ${b.id}`);
    }
    // Replace breaches only at their original positions, then repair survivors.
    // No extension, new tower, injected gold or client repair is permitted.
    for(const {type,x,y} of layout) if(!structures.some(s=>!s.destroyed&&s.hp>0&&s.type===type&&s.x===x&&s.y===y)) {
      assert.equal(game.api.place(type,x,y).ok,true,`HARNESS_PRECONDITION_FAILED: restore ${type}@${x},${y}`);
    }
    assert.equal(game.api.repairAll().ok,true,'HARNESS_PRECONDITION_FAILED: repair-only military repair');
    assert.equal(game.api.readiness().every(r=>r.ok),true,'grown settlement must preserve the restored trade road');
    const actual=game.state.structures.filter(s=>!s.destroyed&&CONFIG.structures[s.type]?.military).map(s=>`${s.type}@${s.x},${s.y}`).sort();
    assert.deepEqual(actual,layout.map(s=>`${s.type}@${s.x},${s.y}`).sort());
    const capacity=game.api.capacity();
    assert.ok(capacity.housing>=game.state.population||report.shortage.houses>0);
    assert.ok(capacity.food>=game.state.population||report.shortage.farms>0);
  }
  assert.ok(transitions>0,'HARNESS_PRECONDITION_FAILED: repair-only campaign must reach growth');
});

test('scout reports can reopen only in prep and return on retry and the next assignment',()=>{
  const game=createGame(123456);
  assert.equal(game.state.scoutReport.siegeIndex,1);
  assert.ok(game.state.scoutReport.bullets.length>=3&&game.state.scoutReport.bullets.length<=4);
  assert.equal(game.api.dismissScoutReport(),true);
  assert.equal(game.state.scoutReport,null);
  assert.equal(game.api.openScoutReport(),true);
  assert.equal(game.state.scoutReport.siegeIndex,1);
  assert.equal(game.api.dismissScoutReport(),true);
  applyMechanicalBuild(game);
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: scout S1 start');
  assert.equal(game.api.openScoutReport(),false);
  assert.equal(game.state.scoutReport,null);
  game.api.stepSeconds(1);
  assert.equal(game.api.retrySiege(),true);
  assert.equal(game.state.scoutReport,null,'API retry preserves the dismissed snapshot exactly');
  assert.equal(game.api.openScoutReport(),true,'UI retry action explicitly reopens the report');
  assert.equal(game.state.scoutReport.siegeIndex,1);
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: scout retry start');
  game.api.stepSeconds(420);
  assert.equal(game.state.phase,'victory','HARNESS_PRECONDITION_FAILED: scout Continue victory');
  assert.equal(game.api.continueCampaign(),true);
  assert.ok(game.state.growthReport,'growth report accompanies next preparation');
  assert.equal(game.state.scoutReport.siegeIndex,2);
});
