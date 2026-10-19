import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame } from './helpers.js';
import { expandSchedule, SIEGES } from '../src/data/sieges.js';
import { CONFIG } from '../src/config.js';
import { applyReferenceBuild } from './fixtures/reference-build.js';
import { CAMPAIGN_ADDITIONS, simulateCampaign } from './fixtures/campaign-reference.js';

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
  for(const report of first.reports) console.log(`Campaign Siege ${report.siege}: payout=${report.payout}, structuresDestroyed=${report.structuresDestroyed}, keepDamage=${report.keepDamage}, duration=${report.time.toFixed(1)}s`);
  assert.equal(first.game.state.phase,'complete',JSON.stringify(first.reports));
  assert.equal(first.reports.length,3);
  assert.ok(first.reports.every(r=>r.phase==='victory'&&r.goldBefore>=0));
  assert.equal(first.game.state.pendulum,null);
  assert.deepEqual(first.game.state.campaign.rewardedSieges,[1,2,3]);
  const second=simulateCampaign(createGame);
  const hash=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
  assert.deepEqual(first.reports,second.reports);
  assert.equal(hash(first.game.state),hash(second.game.state));
});

test('the unchanged Siege 1 defenses lose Siege 3 even with mandatory civilian capacity',()=>{
  const game=createGame(123456);
  applyReferenceBuild(game);
  // Isolate layout adequacy from economy: the only added buildings are the
  // mandatory two houses and farms; defensive positions and HP stay unchanged.
  game.state.siegeIndex=3;
  game.state.population=CONFIG.populationBySiege[2];
  game.state.gold=2*(CONFIG.structures.house.cost+CONFIG.structures.farm.cost);
  for(const index of [2,3]) for(const {type,x,y} of CAMPAIGN_ADDITIONS[index].filter(s=>s.type==='house'||s.type==='farm')) {
    const placed=game.api.place(type,x,y);
    assert.equal(placed.ok,true,`HARNESS_PRECONDITION_FAILED: ${type} ${x},${y}: ${placed.reason}`);
  }
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: S3 civilian capacities');
  game.api.stepSeconds(420);
  assert.equal(game.state.phase,'defeat',JSON.stringify({phase:game.state.phase,keep:game.state.structures[0].hp,boss:game.state.enemies.find(e=>e.type==='boss')?.hp,stats:game.state.stats}));
});
