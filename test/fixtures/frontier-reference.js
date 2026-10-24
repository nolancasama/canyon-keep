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
// Briefing-visible intel only: the opening main front from the scout plan.
export function mainFront(state) {
  return state.frontierSiege.plan.fronts.reduce((a,b)=>b.waveShares[0]>a.waveShares[0]?b:a);
}

// Towers ring each keep at a bearing; 'focused' biases every tower toward the
// main front, 'even' rotates the same towers through the four compass sides.
export function applyGeneratedTowerBuild(game,mode='focused') {
  const keeps=game.state.structures.filter(s=>s.type==='keep'),front=mainFront(game.state).anchor;
  const towerCount=Math.floor(game.state.gold/game.api.price('tower'));
  // Twin contracts give the keep nearer the main front the larger share.
  const ordered=[...keeps].sort((a,b)=>Math.hypot(a.x-front.x,a.y-front.y)-Math.hypot(b.x-front.x,b.y-front.y));
  // 'weighted' splits towers across every reported front by its scout band.
  const weight={major:3,secondary:2,minor:1},fronts=game.state.frontierSiege.plan.fronts,given=fronts.map(()=>0);
  for(let i=0;i<towerCount;i++) {
    const keep=ordered.length===2&&i%3===2?ordered[1]:ordered[0],cx=keep.x+1.5,cy=keep.y+1.5;
    let target=front;
    if(mode==='weighted') {
      const total=fronts.reduce((n,f)=>n+weight[f.band],0);
      const pick=fronts.reduce((best,f,k)=>weight[f.band]/total*(i+1)-given[k]>weight[fronts[best].band]/total*(i+1)-given[best]?k:best,0);
      given[pick]++;target=fronts[pick].anchor;
    }
    const toward=mode==='even'?i*Math.PI/2:Math.atan2(target.y-cy,target.x-cx);
    const tx=cx+Math.cos(toward)*6,ty=cy+Math.sin(toward)*6,candidates=[];
    for(let y=Math.floor(ty)-5;y<=Math.ceil(ty)+5;y++) for(let x=Math.floor(tx)-5;x<=Math.ceil(tx)+5;x++) {
      if(game.api.preview('tower',x,y).ok) candidates.push({x,y,score:Math.hypot(x-tx,y-ty)});
    }
    candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    const tile=candidates[0];
    if(!tile) throw new Error('HARNESS_PRECONDITION_FAILED: no legal tower site');
    requireFrontierAction(game.api.place('tower',tile.x,tile.y),`${mode} keep coverage`);
  }
  return game.state.prepGold-game.state.gold;
}
export const applyGeneratedFocusedBuild=game=>applyGeneratedTowerBuild(game,'focused');

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
