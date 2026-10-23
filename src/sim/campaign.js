import { CONFIG, SIM_DT } from '../config.js';
import { KEEP } from '../data/map.js';
import * as build from './build.js';
import { createSiegeState, stepSiege } from './siege.js';
import { triggerPendulum } from './pendulum.js';
import { createInhabitants } from './inhabitants.js';
import { rateDefense, growSettlement } from './settlement.js';

export function calculateResults(state) {
  const rules=CONFIG.rewards, before=state.snapshot;
  const keep=state.structures.find(s=>s.type==='keep');
  const keepBefore=before.structures.find(s=>s.type==='keep');
  const keepDamage=Math.max(0,keepBefore.hp-keep.hp);
  const lost=state.inhabitants.filter(p=>p.hp<=0).length;
  const destroyed=before.structures.filter(s=>!s.destroyed&&s.type!=='keep'&&state.structures.find(now=>now.id===s.id)?.destroyed);
  const totalHp=before.structures.filter(s=>!s.destroyed).reduce((n,s)=>n+s.maxHp,0);
  const damage=before.structures.filter(s=>!s.destroyed).reduce((n,s)=>n+Math.max(0,s.hp-(state.structures.find(now=>now.id===s.id)?.hp??0)),0);
  const bonuses=[
    {key:'completion',label:'Siege completion',amount:rules.completion[state.siegeIndex-1]},
    {key:'allSaved',label:'All inhabitants alive',amount:lost===0?rules.allSaved:0},
    {key:'keepUntouched',label:'No enemy reached the keep',amount:!state.keepReached?rules.keepUntouched:0},
    {key:'lowDamage',label:'Structural damage below 15%',amount:damage<totalHp*rules.damageThreshold?rules.lowDamage:0},
    {key:'economical',label:'Spent less than 70% of prep treasury',amount:before.prepGold-before.gold<before.prepGold*rules.spendingThreshold?rules.economical:0},
  ];
  if(state.phase!=='victory') for(const line of bonuses) line.amount=0;
  const penalties=[
    {key:'inhabitantsLost',label:'Inhabitants lost penalty',amount:-lost*rules.inhabitantLost},
    {key:'keepReached',label:'Keep reached penalty (once)',amount:state.keepReached?-rules.keepReached:0},
    {key:'keepDamage',label:'Keep HP lost penalty',amount:-Math.floor(keepDamage/rules.keepHpPerGold)},
    {key:'civilianBuildings',label:'Houses / farms destroyed penalty',amount:-destroyed.filter(s=>s.type==='house'||s.type==='farm').length*rules.civilianBuildingLost},
  ];
  const rawPayout=[...bonuses,...penalties].reduce((n,line)=>n+line.amount,0);
  const victory=state.phase==='victory';
  const payout=victory?Math.max(rules.floor,rawPayout):0;
  return {siegeIndex:state.siegeIndex,result:state.phase,enemiesDefeated:state.stats.enemiesDefeated,
    ...rateDefense(state),bountyGold:state.stats.bountyGold??0,
    bossDefeated:state.stats.bossDefeated,inhabitantsSaved:state.population-lost,inhabitantsLost:lost,
    enemiesReachedKeep:state.stats.keepReachedEnemies??0,buildingsDestroyed:destroyed.length,
    keepDamage,structuralDamage:damage,bonuses,penalties,rawPayout,payout,
    floorApplied:victory&&rawPayout<rules.floor,treasuryAfter:state.gold+payout};
}

export function createCampaignState(seed = CONFIG.seed) {
  const keep = CONFIG.structures.keep;
  const state = {
    phase: 'prep', siegeIndex: 1, gold: CONFIG.startingGold, prepGold: CONFIG.startingGold,
    population: CONFIG.population, rng: { seed: seed >>> 0 }, nextId: 1,
    structures: [{ id: 'keep', type: 'keep', x: KEEP.x, y: KEEP.y, w: keep.w, h: keep.h, hp: keep.hp, maxHp: keep.hp, cost: 0, destroyed: false }],
    pendulum: null, time: 0, tick: 0, speed: 1, flowRevision: 0,
    prepTime: 0, growthReport: null, growthHighlight: null,
    events: [], eventLog: [], eventSequence: 0, enemies: [], inhabitants: [],
    rubble: [], attackMarkers: [], explosions: [], arrows: [], schedule: [], spawnIndex: 0,
    keepReached: false,
    campaign: { rewardedSieges: [], history: [], complete: false,
      totals: { payout: 0, enemiesDefeated: 0, inhabitantsSaved: 0, inhabitantsLost: 0, buildingsDestroyed: 0, keepDamage: 0 } },
    stats: { enemiesDefeated: 0, inhabitantsLost: 0, buildingsDestroyed: 0, bossDefeated: false,
      bountyGold: 0, bountyCounts: { foot: 0, chiseler: 0, powder: 0, boss: 0 } },
  };
  createInhabitants(state);
  return state;
}

// The getter remains live after a retry/restart replaces the complete state.
export function createGame(seed = CONFIG.seed) {
  let state = createCampaignState(seed);
  const step = () => {
    stepSiege(state, SIM_DT);
    if ((state.phase==='victory'||state.phase==='defeat')&&!state.results) state.results=calculateResults(state);
  };
  const api = {
    place: (type, x, y) => build.place(state, type, x, y),
    placeLine: (type, x0, y0, x1, y1) => build.placeLine(state, type, x0, y0, x1, y1),
    demolish: (x, y) => build.demolish(state, x, y),
    repair: (x, y) => build.repair(state, x, y),
    repairAll: () => build.repairAll(state),
    repairCost: () => state.structures.reduce((sum, s) => sum + build.repairCost(s), 0),
    preview: (type, x, y) => build.placement(state, type, x, y),
    previewLine: (type, x0, y0, x1, y1) => build.previewLine(state, type, x0, y0, x1, y1),
    capacity: () => build.capacity(state),
    price: type => build.price(state, type),
    readiness: () => build.readiness(state),
    blockedRoadTiles: () => build.blockedRoadTiles(state),
    canStart: () => build.canStart(state),
    startSiege() {
      const check = build.canStart(state);
      if (state.phase !== 'prep' || !check.ok) return { ok: false, reason: check.reason || 'Preparation only' };
      state.snapshot = structuredClone(state);
      state.growthReport=null;state.growthHighlight=null;
      createSiegeState(state);
      return { ok: true };
    },
    triggerPendulum: () => triggerPendulum(state),
    setSpeed(n) {
      if (![0, 1, 2, 4].includes(n)) return false;
      state.speed = n;
      return true;
    },
    tick() { step(); },
    advancePrep(dt) {
      if(state.phase!=='prep'||state.growthReport||!Number.isFinite(dt)||dt<0) return false;
      state.prepTime+=dt;
      if(state.growthHighlight&&state.prepTime>=state.growthHighlight.until) state.growthHighlight=null;
      return true;
    },
    dismissGrowthReport() {
      if(!state.growthReport) return false;
      state.growthReport=null;
      return true;
    },
    stepSeconds(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return false;
      const ticks = Math.round(seconds / SIM_DT);
      for (let i = 0; i < ticks && state.phase === 'siege'; i++) step();
      return state.phase;
    },
    retrySiege() {
      if (!state.snapshot || state.campaign.rewardedSieges.includes(state.siegeIndex)) return false;
      state = structuredClone(state.snapshot);
      return true;
    },
    continueCampaign() {
      const index=state.siegeIndex;
      if(state.phase!=='victory'||state.campaign.rewardedSieges.includes(index)||!state.results) return false;
      const result=structuredClone(state.results);
      state.gold+=result.payout;
      state.campaign.rewardedSieges.push(index);
      state.campaign.history.push(result);
      for(const key of Object.keys(state.campaign.totals)) state.campaign.totals[key]+=result[key];
      delete state.snapshot;
      if(index===CONFIG.campaignSieges) {
        state.phase='complete';state.campaign.complete=true;
        return true;
      }
      state.siegeIndex++;
      state.prepGold=state.gold;
      state.phase='prep';
      state.time=0;state.tick=0;state.speed=1;
      state.prepTime=0;
      state.enemies=[];state.arrows=[];state.explosions=[];
      state.schedule=[];state.spawnIndex=0;
      delete state.results;
      // Tower attack timers are battle-local; damage, rubble, and markers persist.
      for(const s of state.structures) {delete s.shotCooldown;}
      growSettlement(state,result.tier);
      return true;
    },
    restartCampaign() { state = createCampaignState(seed); return true; },
    phase: () => state.phase,
  };
  return { get state() { return state; }, api };
}
