import { MAP, WIDTH, HEIGHT } from '../data/map.js';
import { CONFIG } from '../config.js';
import { rebuildFlow } from './pathing.js';
import { stageFor } from '../data/stages.js';

export function inBounds(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
}

export function tileAt(x, y, state) { return inBounds(x, y) ? (state ? stageFor(state).map.map : MAP)[y][x] : '#'; }
export function isWalkable(x, y, state) { return '.CKS'.includes(tileAt(x, y, state)); }

export function structureAt(state, x, y) {
  return state.structures.find(s => !s.destroyed && s.hp > 0 && x >= s.x && y >= s.y &&
    x < s.x + (s.w ?? 1) && y < s.y + (s.h ?? 1)) ?? null;
}

// Occupancy and blocking are distinct: tools still select walkable mechanisms.
export function blocksStructure(structure) {
  return !!structure && CONFIG.structures[structure.type]?.blocks !== false &&
    (!CONFIG.structures[structure.type]?.retracts || structure.status === 'raised');
}

export function blockingAt(state, x, y) { return blocksStructure(structureAt(state, x, y)); }

export function emit(state, type, data = {}) {
  const event = { ...data, ...(data.id !== undefined ? { entityId: data.id } : {}),
    id: state.nextEventId = (state.nextEventId ?? 0) + 1, type, t: state.time ?? 0 };
  (state.events ??= []).push(event);
  (state.eventLog ??= []).push({ ...event });
  return event;
}

export function damageStructure(state, structure, damage) {
  if (!structure || structure.destroyed || structure.hp <= 0) return false;
  if (CONFIG.structures[structure.type]?.invulnerable || !blocksStructure(structure)) return false;
  structure.hp = Math.max(0, structure.hp - damage);
  if(state.stageId==='frontier'&&state.phase==='siege'&&
    (structure.hp<=0||(structure.type==='golem'&&structure.hp<=structure.maxHp*CONFIG.golem.awakenFraction))&&
    ['wall','gate','tower','spiked','golem','launcher','sensor','retractable','pendulum'].includes(structure.type)) {
    for(let y=structure.y;y<structure.y+structure.h;y++) for(let x=structure.x;x<structure.x+structure.w;x++)
      (state.destroyedClassATiles??=[]).push({x,y});
  }
  if (state.phase === 'siege' && structure.type === 'golem' && structure.hp <= structure.maxHp * CONFIG.golem.awakenFraction) {
    const x = structure.x + .5, y = structure.y + .5;
    structure.awakened = true;
    structure.destroyed = true;
    state.structures.splice(state.structures.indexOf(structure), 1);
    const golem = { id: state.nextId++, type: 'golem', wallId: structure.id, x, y,
      originX: x, originY: y, hp: CONFIG.golem.hp, maxHp: CONFIG.golem.hp,
      remaining: CONFIG.golem.duration, attackCooldown: 0, status: 'active' };
    (state.golems ??= []).push(golem);
    state.flowRevision = (state.flowRevision ?? 0) + 1;
    for (const enemy of state.enemies) { enemy.walkTarget = null; }
    rebuildFlow(state);
    emit(state, 'golemAwaken', { id: golem.id, structureId: structure.id, x, y });
    return true;
  }
  if (structure.hp > 0) return false;
  structure.destroyed = true;
  if (state.stats && structure.type !== 'keep') {
    state.stats.buildingsDestroyed = (state.stats.buildingsDestroyed ?? 0) + 1;
  }
  state.flowRevision = (state.flowRevision ?? 0) + 1;
  (state.rubble ??= []).push({ id: structure.id, type: structure.type,
    x: structure.x, y: structure.y, w: structure.w ?? 1, h: structure.h ?? 1 });
  emit(state, 'structureDestroyed', { structureId: structure.id, typeOfStructure: structure.type,
    x: structure.x, y: structure.y });
  return true;
}

export function damageGolem(state, golem, damage) {
  if (golem.status !== 'active' || damage <= 0) return false;
  golem.hp = Math.max(0, golem.hp - damage);
  if (golem.hp > 0) return false;
  golem.status = 'crumbled';
  emit(state, 'golemCrumble', { id: golem.id, x: golem.x, y: golem.y });
  return true;
}
