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
