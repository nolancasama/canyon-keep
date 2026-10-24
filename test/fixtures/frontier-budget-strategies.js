import { requireFrontierAction } from './frontier-reference.js';

// Scripted engineering choices, using only the same previews, purchases and
// construction actions as the player. No gold, combat or enemy-state edits.
export const BUDGET_STRATEGIES=['main enclosure','scouted fronts','reinforced main','distributed'];
const key=p=>`${p.x},${p.y}`;
const centre=(state,settlement)=>{
  const buildings=state.structures.filter(s=>s.owner&&s.district===settlement.id);
  const keep=buildings.find(s=>s.type==='keep');
  return keep?{x:keep.x+keep.w/2,y:keep.y+keep.h/2}:{
    x:buildings.reduce((n,s)=>n+s.x+s.w/2,0)/buildings.length,
    y:buildings.reduce((n,s)=>n+s.y+s.h/2,0)/buildings.length};
};

function buildRing(game,settlement,limit=Infinity,front=null) {
  const at=centre(game.state,settlement),tiles=settlement.ring.filter(p=>['wall','gate'].includes(p.kind));
  if(front) {
    const angle=Math.atan2(front.y-at.y,front.x-at.x);
    const score=p=>Math.cos(Math.atan2(p.y-at.y,p.x-at.x)-angle);
    tiles.sort((a,b)=>score(b)-score(a)||a.y-b.y||a.x-b.x);
  }
  let spent=0,placed=0;
  for(const tile of tiles) {
    const type=tile.kind,cost=game.api.price(type);
    if(spent+cost>limit||cost>game.state.gold) continue;
    if(!game.api.preview(type,tile.x,tile.y).ok) continue;
    requireFrontierAction(game.api.place(type,tile.x,tile.y),`${type} enclosure at ${key(tile)}`);
    spent+=cost;placed++;
  }
  return {spent,placed,total:tiles.length};
}

function addTowers(game,settlements,weighted) {
  const fronts=game.state.frontierSiege.plan.fronts,roads=new Set(game.state.frontierMap.roads.map(key));
  const bands={major:3,secondary:2,minor:1},given=fronts.map(()=>0),total=fronts.reduce((n,f)=>n+bands[f.band],0);
  let count=0;
  while(game.state.gold>=game.api.price('tower')) {
    const settlement=settlements[count%settlements.length],at=centre(game.state,settlement);
    let front=fronts[0];
    if(weighted) {
      const best=fronts.reduce((best,f,i)=>bands[f.band]/total*(count+1)-given[i]>bands[fronts[best].band]/total*(count+1)-given[best]?i:best,0);
      given[best]++;front=fronts[best];
    } else front=fronts[count%fronts.length];
    const angle=Math.atan2(front.anchor.y-at.y,front.anchor.x-at.x),tx=at.x+Math.cos(angle)*5,ty=at.y+Math.sin(angle)*5;
    const candidates=[];
    for(let y=Math.floor(at.y)-9;y<=Math.ceil(at.y)+9;y++) for(let x=Math.floor(at.x)-9;x<=Math.ceil(at.x)+9;x++) {
      if(roads.has(key({x,y}))||game.state.structures.some(s=>x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h)) continue;
      if(game.api.preview('tower',x,y).ok) candidates.push({x,y,score:Math.hypot(x-tx,y-ty)});
    }
    candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    const tile=candidates[0];
    if(!tile) break;
    requireFrontierAction(game.api.place('tower',tile.x,tile.y),'budget-sweep tower');
    count++;
  }
  return count;
}

export function applyBudgetStrategy(game,strategy) {
  const initial=game.state.gold,settlements=game.state.contract.budgetPlan.settlements,main=settlements[0];
  const front=game.state.frontierSiege.plan.fronts.reduce((a,b)=>b.waveShares[0]>a.waveShares[0]?b:a).anchor;
  let completeMain=false;
  if(strategy==='main enclosure'||strategy==='reinforced main') {
    const ring=buildRing(game,main);completeMain=ring.placed===ring.total;
    if(strategy==='reinforced main') addTowers(game,[main],true);
  } else if(strategy==='scouted fronts') {
    requireFrontierAction(game.api.purchaseAdvancedScouting(),'purchase sweep scouting');
    buildRing(game,main,game.state.gold*.25,front);
    addTowers(game,[main],true);
  } else if(strategy==='distributed') {
    const allowance=game.state.gold*.55/settlements.length;
    for(const settlement of settlements) buildRing(game,settlement,allowance,front);
    addTowers(game,settlements,false);
  } else throw new Error(`Unknown budget strategy: ${strategy}`);
  return {spent:initial-game.state.gold,completeMain};
}
