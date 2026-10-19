import { MAP, WIDTH, HEIGHT } from '../data/map.js';

export function inBounds(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
}

export function tileAt(x, y) { return inBounds(x, y) ? MAP[y][x] : '#'; }
export function isWalkable(x, y) { return '.CKS'.includes(tileAt(x, y)); }

export function structureAt(state, x, y) {
  return state.structures.find(s => !s.destroyed && s.hp > 0 && x >= s.x && y >= s.y &&
    x < s.x + (s.w ?? 1) && y < s.y + (s.h ?? 1)) ?? null;
}

export function emit(state, type, data = {}) {
  const event = { ...data, ...(data.id !== undefined ? { entityId: data.id } : {}),
    id: state.nextEventId = (state.nextEventId ?? 0) + 1, type, t: state.time ?? 0 };
  (state.events ??= []).push(event);
  (state.eventLog ??= []).push({ ...event });
  return event;
}

export function damageStructure(state, structure, damage) {
  if (!structure || structure.destroyed || structure.hp <= 0) return false;
  structure.hp = Math.max(0, structure.hp - damage);
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
