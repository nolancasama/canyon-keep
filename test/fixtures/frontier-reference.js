// Public preparation actions only: no treasury injections, healing, enemy
// removal or direct property edits are used by the playable siege fixtures.
export const FRONTIER_TOWN_BUILD=[
  ...[15,17,19,21,23].map(y=>({type:'tower',x:31,y})),
  ...[16,17,18,19,20].map(y=>({type:y===18?'gate':'wall',x:34,y})),
];

// Two forward towers intercept the east columns before they reach property;
// overlapping town and rear coverage keeps the brute under fire to the keep.
// Total cost: 760 G, including the two supporting walls.
export const FRONTIER_PRESERVATION_BUILD=[
  {type:'wall',x:58,y:9},{type:'tower',x:57,y:9},
  {type:'wall',x:56,y:27},{type:'tower',x:55,y:27},
  {type:'tower',x:31,y:16},{type:'tower',x:31,y:20},
  {type:'tower',x:25,y:18},{type:'tower',x:25,y:21},
];

// A dedicated outpost tower costs 140 G; Communication 3 negotiates the
// elder's 100 G survival offer to 150 G. The remaining works defend the town.
export const FRONTIER_HAMLET_BUILD=[
  {type:'wall',x:46,y:9},{type:'tower',x:47,y:9},
  {type:'tower',x:31,y:16},{type:'tower',x:31,y:20},
  {type:'tower',x:25,y:18},{type:'tower',x:25,y:21},
];

export function frontierBalanceRow(game,label,spent) {
  const result=game.state.results;
  return {label,spent,outcome:result.result,preservation:result.preservation,
    keepHp:game.state.structures.filter(s=>s.type==='keep').map(s=>s.hp),
    liability:result.liability,earnings:result.finalEarnings,
    districts:Object.fromEntries(result.damageByDistrict.map(d=>[d.id,d.liability]))};
}

// Focus all affordable archer coverage ahead of mandatory keeps. Candidate
// locations use public previews, so occupied lots and placement rules apply.
export function applyGeneratedFocusedBuild(game) {
  const keeps=game.state.structures.filter(s=>s.type==='keep');
  const towerCount=Math.floor(game.state.gold/game.api.price('tower'));
  for(let i=0;i<towerCount;i++) {
    // The twin reference has a southern brute approach: retain two northern
    // towers and put four on the southern keep instead of splitting evenly.
    const keep=keeps.length===2?keeps[i<2?0:1]:keeps[0],candidates=[];
    for(let y=keep.y-4;y<=keep.y+6;y++) for(let x=keep.x+3;x<=keep.x+10;x++) {
      if(game.api.preview('tower',x,y).ok) candidates.push({x,y,score:Math.hypot(x-(keep.x+7),y-(keep.y+1))});
    }
    candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    const tile=candidates[0];
    if(!tile) throw new Error('HARNESS_PRECONDITION_FAILED: no legal focused tower site');
    requireFrontierAction(game.api.place('tower',tile.x,tile.y),'focused keep coverage');
  }
  return game.state.prepGold-game.state.gold;
}

export function requireFrontierAction(result, description) {
  if(!result?.ok) throw new Error(`HARNESS_PRECONDITION_FAILED: ${description}: ${result?.reason}`);
}

export function finishFrontier(game, limit=480) {
  if(game.state.phase!=='prep') throw new Error('HARNESS_PRECONDITION_FAILED: Frontier must be in preparation');
  requireFrontierAction(game.api.startSiege(),'start Frontier siege');
  game.api.stepSeconds(limit);
  if(game.state.phase==='siege') throw new Error('HARNESS_PRECONDITION_FAILED: Frontier siege did not reach results');
  return game.state.results;
}

export function applyFrontierBuild(game, plan) {
  if(game.state.phase!=='prep') throw new Error('HARNESS_PRECONDITION_FAILED: Frontier must be in preparation');
  for(const {type,x,y,...options} of plan) requireFrontierAction(game.api.place(type,x,y,options),`${type} at ${x},${y}`);
}

// A free-standing rectangular wall with one gate around each authored district.
// This is a transparent comparison of equal perimeter protection, not a claim
// that rectangular curtains are the cheapest way to use the map's terrain.
export function districtCurtainEstimate(state, prices) {
  const groups={};
  for(const s of state.structures.filter(s=>s.owner)) (groups[s.district]??=[]).push(s);
  return Object.entries(groups).map(([district,buildings])=>{
    const left=Math.min(...buildings.map(s=>s.x))-1,right=Math.max(...buildings.map(s=>s.x+s.w));
    const top=Math.min(...buildings.map(s=>s.y))-1,bottom=Math.max(...buildings.map(s=>s.y+s.h));
    const tiles=2*(right-left+bottom-top);
    return {district,tiles,cost:(tiles-1)*prices.wall+prices.gate};
  });
}
