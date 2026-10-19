import { CONFIG, SIM_DT } from '../src/config.js';
import { WIDTH, HEIGHT, MAP } from '../src/data/map.js';
import { createGame } from '../src/sim/campaign.js';

export { createGame, SIM_DT };
export function tileOf(kind) {
  for (let y = 0; y < HEIGHT; y++) for (let x = 3; x < WIDTH; x++) if (MAP[y][x] === kind) return { x, y };
  throw Error(`No ${kind} terrain`);
}
export function structure(state, type, x, y, hp) {
  const c = CONFIG.structures[type];
  const s = { id: `test-${state.nextId++}`, type, x, y, w: c.w, h: c.h, cost: c.cost, hp: hp ?? c.hp, maxHp: c.hp, destroyed: false };
  state.structures.push(s);
  return s;
}
export function advance(state, fn, seconds) {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    state.time += SIM_DT;
    fn(state, SIM_DT);
  }
}
export function crossing(column) {
  const points = [];
  for (let y = 0; y < HEIGHT; y++) if (['.', 'C', 'S'].includes(MAP[y][column])) points.push({ x: column, y });
  return points;
}
