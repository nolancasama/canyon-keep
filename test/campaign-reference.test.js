import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame } from './helpers.js';
import { expandSchedule, SIEGES } from '../src/data/sieges.js';
import { CONFIG } from '../src/config.js';
import { applyReferenceBuild } from './fixtures/reference-build.js';
import { simulateCampaign } from './fixtures/campaign-reference.js';
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
