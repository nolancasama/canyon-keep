import { CONFIG } from '../config.js';

// Scripted arrivals, not RNG waves. Lane is a spawn-row index.
export const SIEGES = {
  1: { name:'The First Assault', scoutReport:[
    '46 enemies spotted: 31 foot soldiers, 10 chiselers, 4 powder carriers and one giant brute.',
    'Chiselers attack your walls. Reinforce the choke.',
    'Powder carriers travel in pairs: their deaths can start explosion chains.',
    'A giant brute is expected. Leave room for a second line of defense.',
  ], bossHp:CONFIG.enemies.boss.hpBySiege[0], groups:[
    {t:0,type:'foot',count:4,spacing:2,lane:2},
    {t:10,type:'foot',count:4,spacing:2,lane:3},
    {t:20,type:'chiseler',count:3,spacing:2,lane:1},
    {t:28,type:'foot',count:5,spacing:2,lane:4},
    {t:38,type:'powder',count:2,spacing:3,lane:2},
    {t:46,type:'foot',count:5,spacing:2,lane:1},
    {t:55,type:'chiseler',count:4,spacing:2,lane:3},
    {t:64,type:'foot',count:5,spacing:2,lane:2},
    {t:74,type:'powder',count:2,spacing:3,lane:4},
    {t:83,type:'foot',count:4,spacing:2,lane:1},
    {t:92,type:'chiseler',count:3,spacing:2,lane:3},
    {t:101,type:'boss',count:1,spacing:0,lane:2},
    {t:109,type:'foot',count:4,spacing:7,lane:2},
  ] },
  2: { name:'The Growing Threat', scoutReport:[
    '75 enemies: 29 more than the first siege, including 34 foot soldiers.',
    '28 chiselers, up from 10, will put much more pressure on walls.',
    '12 powder carriers, up from 4, approach in tight clusters of three.',
    'One tougher giant brute is expected behind the breach packs.',
  ], bossHp:CONFIG.enemies.boss.hpBySiege[1], groups:[
    // 75 arrivals: chisel packs meet clustered powder at the curtain wall.
    {t:0,type:'foot',count:6,spacing:1.5,lane:1},
    {t:13,type:'chiseler',count:6,spacing:1,lane:3},
    {t:24,type:'powder',count:3,spacing:.45,lane:4},
    {t:28,type:'foot',count:6,spacing:1.5,lane:2},
    {t:42,type:'chiseler',count:6,spacing:1,lane:1},
    {t:50,type:'powder',count:3,spacing:.45,lane:3},
    {t:57,type:'foot',count:6,spacing:1.5,lane:4},
    {t:70,type:'chiseler',count:8,spacing:.9,lane:1},
    {t:77,type:'powder',count:3,spacing:.45,lane:3},
    {t:85,type:'foot',count:6,spacing:1.5,lane:2},
    {t:98,type:'chiseler',count:8,spacing:.8,lane:1},
    {t:104,type:'powder',count:3,spacing:.45,lane:4},
    {t:108,type:'boss',count:1,spacing:0,lane:2},
    {t:118,type:'foot',count:5,spacing:3,lane:4},
    {t:135,type:'foot',count:5,spacing:2.25,lane:1},
  ] },
  3: { name:'The Great Siege', scoutReport:[
    '120 enemies: 45 more than the previous siege, including 47 foot soldiers.',
    '52 chiselers, up from 28, attack walls in overlapping packs.',
    '20 powder carriers, up from 12, travel in clusters of four. Expect chains.',
    'One still stronger giant brute is expected. Prepare defense in depth.',
  ], bossHp:CONFIG.enemies.boss.hpBySiege[2], groups:[
    // 120 arrivals. Opposite spawn rows and overlapping packs create a second
    // push while the preceding pack is still breaching, rather than clean waves.
    {t:0,type:'foot',count:8,spacing:.8,lane:1},
    {t:12,type:'chiseler',count:10,spacing:.6,lane:3},
    {t:16,type:'powder',count:4,spacing:.4,lane:1},
    {t:24,type:'foot',count:8,spacing:.8,lane:4},
    {t:36,type:'chiseler',count:10,spacing:.6,lane:1},
    {t:40,type:'powder',count:4,spacing:.4,lane:4},
    {t:48,type:'foot',count:8,spacing:.8,lane:2},
    {t:60,type:'chiseler',count:12,spacing:.55,lane:4},
    {t:64,type:'powder',count:4,spacing:.4,lane:1},
    {t:72,type:'foot',count:8,spacing:.8,lane:3},
    {t:84,type:'chiseler',count:12,spacing:.55,lane:1},
    {t:88,type:'powder',count:4,spacing:.4,lane:4},
    {t:96,type:'foot',count:8,spacing:.8,lane:2},
    {t:108,type:'chiseler',count:8,spacing:.7,lane:4},
    {t:112,type:'powder',count:4,spacing:.4,lane:1},
    {t:114,type:'boss',count:1,spacing:0,lane:2},
    {t:124,type:'foot',count:3,spacing:4,lane:4},
    {t:140,type:'foot',count:4,spacing:4,lane:1},
  ] },
};
export function expandSchedule(siegeIndex=1) {
  return SIEGES[siegeIndex].groups.flatMap(group=>Array.from({length:group.count},(_,i)=>({
    t:group.t+i*group.spacing,type:group.type,lane:group.lane,
  }))).sort((a,b)=>a.t-b.t);
}
