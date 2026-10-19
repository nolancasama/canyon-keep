import { CONFIG } from '../config.js';
import { SITES, SPAWNS, WIDTH } from '../data/map.js';
import { tileAt, structureAt, isWalkable, emit } from './grid.js';
import { homeInhabitants } from './inhabitants.js';

const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const failure = (reason, cost = 0) => ({ valid: false, ok: false, reason, cost });

function supported(state, tower, excludedId = null) {
  return ORTHOGONAL.some(([dx, dy]) => {
    const s = structureAt(state, tower.x + dx, tower.y + dy);
    return s && s.id !== excludedId && (s.type === 'wall' || s.type === 'gate');
  });
}

// Gates and the keep are traversable for merchants; all other buildings block.
function tradeRoadRegion(state, candidate = null) {
  const blocked = (x, y) => {
    if (!isWalkable(x, y)) return true;
    const s = candidate && x >= candidate.x && y >= candidate.y &&
      x < candidate.x + candidate.w && y < candidate.y + candidate.h
      ? candidate : structureAt(state, x, y);
    return s && s.type !== 'gate' && s.type !== 'keep';
  };
  const seen = new Set();
  const queue = SPAWNS.filter(s => !blocked(s.x, s.y)).map(s => ({ x: s.x, y: s.y }));
  for (const s of queue) seen.add(s.y * WIDTH + s.x);
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of ORTHOGONAL) {
      const nx = x + dx, ny = y + dy, key = ny * WIDTH + nx;
      if (seen.has(key) || blocked(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function hasTradeRoad(state, candidate = null) {
  const seen = tradeRoadRegion(state, candidate);
  return state.structures.some(s => s.type === 'keep' && !s.destroyed && s.hp > 0 && seen.has(s.y * WIDTH + s.x));
}

export function blockedRoadTiles(state) {
  if (state.phase !== 'prep') return [];
  const seen = tradeRoadRegion(state);
  if (state.structures.some(s => s.type === 'keep' && !s.destroyed && s.hp > 0 && seen.has(s.y * WIDTH + s.x))) return [];
  return state.structures.filter(s => !s.destroyed && s.hp > 0 && ['wall', 'barricade'].includes(s.type) &&
    ORTHOGONAL.some(([dx, dy]) => seen.has((s.y + dy) * WIDTH + s.x + dx)))
    .map(s => ({ x: s.x, y: s.y }));
}

export function price(state, type) {
  const def = CONFIG.structures[type];
  if (!def) return 0;
  if (type === 'house' || type === 'farm') {
    const totals = capacity(state), population = state.population ?? CONFIG.population;
    if (type === 'house' && totals.housing < population || type === 'farm' && totals.food < population) return 0;
  }
  return def.cost;
}

export function refundValue(structure) {
  if (!structure || structure.destroyed || structure.hp <= 0) return 0;
  const health = structure.type === 'pendulum' ? 1 : structure.hp / structure.maxHp;
  return Math.round((structure.paidCost ?? structure.cost) * CONFIG.refundRate * health);
}

export function placement(state, type, x, y, { line = false } = {}) {
  const def = CONFIG.structures[type];
  if (!def || type === 'keep') return failure('Select a construction tool');
  const cost = price(state, type);
  if (state.phase !== 'prep') return failure('Construction is available during preparation', cost);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return failure('Choose a map tile', cost);
  const existing = structureAt(state, x, y);
  const interchangeable = (type === 'gate' && existing?.type === 'wall') ||
    (type === 'wall' && existing?.type === 'gate');
  if (interchangeable) {
    const refund = refundValue(existing), netCost = def.cost - refund;
    return { ...(state.gold < netCost ? failure('Not enough gold', netCost) :
      { valid: true, ok: true, reason: '', cost: netCost }), replacement: true,
      replacedId: existing.id, replacedType: existing.type, refund };
  }
  if (line && existing?.type === type) return { valid: true, ok: true, reason: '', cost: 0, skipped: true };
  if (type === 'pendulum') {
    const site = SITES.find(s => s.x === x && s.y === y);
    if (!site) return failure('Choose one of the three cliff mount sites', def.cost);
    if (state.pendulum) return failure('Only one Titan\'s Pendulum may be built', def.cost);
    if (state.gold < def.cost) return failure('Not enough gold', def.cost);
    return { valid: true, ok: true, reason: '', cost: def.cost, siteId: site.id };
  }
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
    const tx = x + dx, ty = y + dy;
    if (tx < CONFIG.spawnSafeColumns) return failure('Keep the spawn approach clear', cost);
    if (!'.C'.includes(tileAt(tx, ty))) return failure('Build on canyon or castle floor', cost);
    if (structureAt(state, tx, ty)) return failure('Another structure occupies this tile', cost);
  }
  if (type === 'tower' && tileAt(x, y) !== 'C' && !supported(state, { x, y })) {
    return failure('Canyon towers must adjoin a wall or gate', def.cost);
  }
  if (state.gold < cost) return failure('Not enough gold', cost);
  return { valid: true, ok: true, reason: '', cost };
}

export function place(state, type, x, y, options) {
  const check = placement(state, type, x, y, options);
  if (!check.valid) return check;
  if (check.skipped) return check;
  const def = CONFIG.structures[type];
  const id = `${type}-${state.nextId++}`;
  let structure;
  if (type === 'pendulum') {
    const site = SITES.find(s => s.id === check.siteId);
    structure = { ...site, id, type, siteId: site.id,
      cost: def.cost, paidCost: def.cost, status: 'ready', angle: site.centerAngle-site.halfSweep,
      elapsed: 0, swingId: 0, hitIds: [] };
    state.pendulum = structure;
  } else {
    structure = { id, type, x, y, w: def.w, h: def.h, hp: def.hp,
      maxHp: def.hp, cost: def.cost, paidCost: check.replacement ? def.cost : check.cost, destroyed: false };
    if (check.replacement) state.structures.splice(state.structures.findIndex(s => s.id === check.replacedId), 1, structure);
    else state.structures.push(structure);
    state.flowRevision = (state.flowRevision ?? 0) + 1;
    state.rubble = (state.rubble ?? []).filter(r => !(r.x === x && r.y === y));
  }
  state.gold -= check.cost;
  if (type === 'house') homeInhabitants(state);
  emit(state, 'build', { structureId: id, typeOfStructure: type, x, y });
  return { ...check, structure };
}

export function lineTiles(x0, y0, x1, y1) {
  if (![x0, y0, x1, y1].every(Number.isInteger)) return [];
  const result = [{ x: x0, y: y0 }];
  let x = x0, y = y0;
  while (x !== x1) { x += Math.sign(x1 - x); result.push({ x, y }); }
  while (y !== y1) { y += Math.sign(y1 - y); result.push({ x, y }); }
  return result;
}

export function previewLine(state, type, x0, y0, x1, y1) {
  const scratch = { ...state, structures: state.structures.map(s => ({ ...s })),
    inhabitants: state.inhabitants?.map(p => ({ ...p })),
    rubble: [...(state.rubble ?? [])], events: [], eventLog: [] };
  let outOfGold = false;
  const tiles = lineTiles(x0, y0, x1, y1).map(({ x, y }) => {
    if (outOfGold) return { x, y, ...failure('Not enough gold') };
    const result = placement(scratch, type, x, y, { line: true });
    if (result.valid) place(scratch, type, x, y, { line: true });
    else if (result.reason === 'Not enough gold') outOfGold = true;
    return { x, y, ...result };
  });
  return { tiles, cost: tiles.filter(t => t.valid).reduce((n, t) => n + t.cost, 0),
    totalCost: tiles.filter(t => t.valid).reduce((n, t) => n + t.cost, 0),
    reason: tiles.find(t => !t.valid)?.reason ?? '' };
}

export function placeLine(state, type, x0, y0, x1, y1) {
  if (!['wall', 'gate', 'barricade'].includes(type)) return failure('This tool places one building at a time');
  const results = [];
  for (const { x, y } of lineTiles(x0, y0, x1, y1)) {
    const result = place(state, type, x, y, { line: true });
    results.push({ x, y, ...result });
    if (!result.ok && result.reason === 'Not enough gold') break;
  }
  return { ok: results.some(r => r.ok && !r.skipped), placed: results.filter(r => r.ok && !r.skipped).length,
    results, reason: results.find(r => !r.ok)?.reason ?? '' };
}

export function demolish(state, x, y) {
  if (state.phase !== 'prep') return failure('Demolish during preparation only');
  const pendulum = state.pendulum?.x === x && state.pendulum?.y === y ? state.pendulum : null;
  const target = pendulum ?? structureAt(state, x, y) ?? state.structures.find(s =>
    (s.destroyed || s.hp <= 0) && x >= s.x && y >= s.y && x < s.x + s.w && y < s.y + s.h);
  if (!target || target.type === 'keep') return failure('Choose a player structure');
  if (!pendulum && (target.type === 'wall' || target.type === 'gate')) {
    if (state.structures.some(s => !s.destroyed && s.type === 'tower' && tileAt(s.x, s.y) !== 'C' && supported(state, s) &&
      !supported(state, s, target.id))) return failure('Would leave a canyon tower unsupported');
  }
  const refund = refundValue(target);
  if (pendulum) state.pendulum = null;
  else state.structures.splice(state.structures.indexOf(target), 1);
  state.rubble = (state.rubble ?? []).filter(r => r.id !== target.id);
  state.gold += refund;
  if (target.type === 'house') homeInhabitants(state);
  state.flowRevision = (state.flowRevision ?? 0) + 1;
  emit(state, 'demolish', { structureId: target.id, x, y, refund });
  return { ok: true, valid: true, reason: '', refund };
}

export function repairCost(structure) {
  if (!structure || structure.destroyed || structure.hp <= 0) return 0;
  return Math.ceil(structure.cost * CONFIG.repairRate * (structure.maxHp - structure.hp) / structure.maxHp);
}

export function repair(state, x, y) {
  if (state.phase !== 'prep') return failure('Repair during preparation only');
  const target = structureAt(state, x, y);
  if (!target) return failure('Choose a damaged structure');
  const cost = repairCost(target);
  if (state.gold < cost) return failure('Not enough gold', cost);
  state.gold -= cost;
  target.hp = target.maxHp;
  return { ok: true, valid: true, reason: '', cost };
}

export function repairAll(state) {
  if (state.phase !== 'prep') return failure('Repair during preparation only');
  const cost = state.structures.reduce((n, s) => n + repairCost(s), 0);
  if (state.gold < cost) return failure('Not enough gold', cost);
  state.gold -= cost;
  for (const s of state.structures) if (!s.destroyed && s.hp > 0) s.hp = s.maxHp;
  return { ok: true, valid: true, reason: '', cost };
}

export function capacity(state) {
  return state.structures.reduce((totals, s) => {
    if (!s.destroyed && s.hp > 0) {
      totals.housing += CONFIG.structures[s.type]?.housing ?? 0;
      totals.food += CONFIG.structures[s.type]?.food ?? 0;
    }
    return totals;
  }, { housing: 0, food: 0 });
}

export function readiness(state) {
  const { housing, food } = capacity(state);
  const population = state.population ?? CONFIG.population;
  const houses = Math.max(0, Math.ceil((population - housing) / CONFIG.structures.house.housing));
  const farms = Math.max(0, Math.ceil((population - food) / CONFIG.structures.farm.food));
  const road = hasTradeRoad(state);
  return [
    { id: 'housing', ok: houses === 0, message: houses ? `Build ${houses} additional ${houses === 1 ? 'house' : 'houses'}.` : 'Housing sufficient' },
    { id: 'food', ok: farms === 0, message: farms ? `Build ${farms} additional ${farms === 1 ? 'farm' : 'farms'}.` : 'Food sufficient' },
    { id: 'tradeRoad', ok: road, message: road ? 'Castle entrance accessible' : 'Castle entrance blocked. Install a gate to create a route to the keep.' },
  ];
}

export function canStart(state) {
  if (state.phase !== 'prep') return failure('Finish the current siege first');
  const unmet = readiness(state).filter(r => !r.ok);
  if (unmet.length) return failure(unmet.map(r => r.message).join(' · '));
  return { ok: true, valid: true, reason: '' };
}
