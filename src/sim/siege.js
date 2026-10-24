import { SIM_DT } from '../config.js';
import { SIEGES } from '../data/sieges.js';
import { emit } from './grid.js';
import { rebuildFlow } from './pathing.js';
import { spawnEnemy, stepEnemies } from './enemies.js';
import { stepTowers } from './towers.js';
import { stepExplosions } from './explosions.js';
import { stepPendulum } from './pendulum.js';
import { createInhabitants, stepInhabitants } from './inhabitants.js';
import { stepGolems } from './golems.js';
import { resetMechanisms, stepMechanisms } from './mechanisms.js';
import { stageFor, scheduleFor } from '../data/stages.js';
import { startFrontierNpcs, stepFrontierNpcs } from './frontier/npcs.js';
import { startFrontierConstruction, stepFrontierConstruction } from './frontier/construction.js';

export function createSiegeState(state) {
  state.phase = 'siege';
  state.time = 0;
  state.tick = 0;
  state.speed = 1;
  state.enemies = [];
  state.golems = [];
  state.arrows = [];
  state.explosions = [];
  resetMechanisms(state);
  state.schedule = scheduleFor(state);
  state.spawnIndex = 0;
  state.keepReached = false;
  state.stats = { enemiesDefeated: 0, inhabitantsLost: 0, buildingsDestroyed: 0, bossDefeated: false,
    bountyGold: 0, bountyCounts: { foot: 0, chiseler: 0, powder: 0, boss: 0 } };
  if(stageFor(state).flags.npcDefenders) {startFrontierConstruction(state);startFrontierNpcs(state);}
  else createInhabitants(state);
  rebuildFlow(state);
  emit(state, 'siegeStarted', { siegeIndex: state.siegeIndex });
  return state;
}

export function stepSiege(state, dt = SIM_DT) {
  if (state.phase !== 'siege') return state;
  state.tick++;
  state.time = state.tick * SIM_DT;
  while (state.spawnIndex < state.schedule.length && state.schedule[state.spawnIndex].t <= state.time) {
    const entry = state.schedule[state.spawnIndex++];
    spawnEnemy(state, entry.type, entry.x, entry.y, entry.lane);
  }
  if(stageFor(state).flags.npcDefenders) {stepFrontierConstruction(state,dt);stepFrontierNpcs(state,dt);}
  else stepInhabitants(state, dt);
  stepTowers(state, dt);
  stepPendulum(state, dt);
  stepExplosions(state, dt);
  stepEnemies(state, dt);
  stepGolems(state, dt);
  stepMechanisms(state, dt);
  state.stats.inhabitantsLost = state.inhabitants.filter(i => i.hp <= 0).length;
  // Process newly killed carriers on the following tick, preserving their delay.
  const keep = state.structures.find(s => s.type === 'keep');
  const living = state.inhabitants.filter(i => i.hp > 0);
  if (!keep || keep.hp <= 0 || (!stageFor(state).flags.contractPayment && living.length === 0)) {
    state.phase = 'defeat';
    emit(state, 'defeat');
  } else if (state.spawnIndex === state.schedule.length && !state.enemies.some(e => e.hp > 0) && state.explosions.length === 0) {
    state.phase = 'victory';
    emit(state, 'victory');
  }
  return state;
}

export function siegeName(index = 1) {
  return SIEGES[index]?.name || 'The First Assault';
}
