import { CONFIG } from '../../config.js';

// Footprint dilation follows the town's shape; distant property never stretches
// a main-town curtain across empty country. No placement search or RNG is used.
export function estimateEnclosure(map,structures,settlement,options={}) {
  const rules={...CONFIG.frontier.enclosure,...options},cells=map.map,width=cells[0].length,height=cells.length;
  const id=typeof settlement==='string'?settlement:settlement.id;
  const buildings=structures.filter(s=>s.district===id&&!s.destroyed&&!CONFIG.structures[s.type]?.military);
  const empty={wallTiles:0,gateTiles:0,naturalTiles:0,existingTiles:0,cost:0,ring:[]};
  if(!buildings.length) return empty;
  const centre=s=>({x:s.x+s.w/2,y:s.y+s.h/2}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const core=buildings.find(s=>s.type==='keep')??buildings.reduce((best,s)=>{
    const total=p=>buildings.reduce((n,b)=>n+distance(centre(p),centre(b)),0);
    return total(s)<total(best)?s:best;
  }),origin=centre(core),footprint=new Set(),key=(x,y)=>y*width+x;
  const inside=(x,y)=>x>=0&&y>=0&&x<width&&y<height;
  const included=buildings.filter(s=>distance(origin,centre(s))<=rules.coreDistance),foreign=new Set();
  // A neighboring district can lie close to the apron. Clip clearance there
  // so the advisory curtain uses free ground instead of occupied client lots.
  for(const s of structures) if(!s.destroyed&&!CONFIG.structures[s.type]?.military&&!included.includes(s)) {
    for(let y=s.y-1;y<=s.y+s.h;y++) for(let x=s.x-1;x<=s.x+s.w;x++) if(inside(x,y)) foreign.add(key(x,y));
  }
  for(const s of included) {
    for(let y=s.y-rules.clearance;y<s.y+s.h+rules.clearance;y++) for(let x=s.x-rules.clearance;x<s.x+s.w+rules.clearance;x++) {
      const distance=Math.max(s.x-x,0,x-(s.x+s.w-1))+Math.max(s.y-y,0,y-(s.y+s.h-1));
      if(inside(x,y)&&distance<=rules.clearance&&(!foreign.has(key(x,y))||distance===0)) footprint.add(key(x,y));
    }
  }
  // Only the exterior boundary needs a curtain: small enclosed gaps between
  // neighboring lots do not add internal walls. Terrain is classified later.
  const exterior=new Set(),queue=[];
  const visit=(x,y)=>{const k=key(x,y);if(inside(x,y)&&!footprint.has(k)&&!exterior.has(k)) {exterior.add(k);queue.push({x,y});}};
  for(let x=0;x<width;x++) {visit(x,0);visit(x,height-1);}
  for(let y=0;y<height;y++) {visit(0,y);visit(width-1,y);}
  for(let i=0;i<queue.length;i++) {const {x,y}=queue[i];visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);}
  const roads=new Set((map.roads??[]).map(p=>key(p.x,p.y))),existing=new Set();
  for(const s of structures) if(!s.destroyed&&s.hp>0&&CONFIG.structures[s.type]?.family==='wall'&&s.type!=='retractable') {
    for(let y=s.y;y<s.y+s.h;y++) for(let x=s.x;x<s.x+s.w;x++) existing.add(key(x,y));
  }
  const result={...empty,ring:[]};
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const k=key(x,y);if(!exterior.has(k)) continue;
    // Enemy routing uses four-connected steps, so this cardinal boundary
    // closes the footprint without charging decorative diagonal corner tiles.
    const adjacent=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>inside(x+dx,y+dy)&&footprint.has(key(x+dx,y+dy)));
    if(!adjacent) continue;
    const kind=existing.has(k)?'existing':cells[y][x]==='#'?'natural':roads.has(k)?'gate':'wall';
    result[`${kind}Tiles`]++;result.ring.push({x,y,kind});
  }
  result.cost=result.wallTiles*CONFIG.structures.wall.cost+result.gateTiles*CONFIG.structures.gate.cost;
  return result;
}

export function frontierBudgetPlan(map,structures,archetype='handcrafted',available=null) {
  const rules=CONFIG.frontier.budgets,formula=rules.archetypes[archetype]??rules.archetypes.handcrafted;
  const settlements=map.districts.filter(d=>formula.districts.includes(d.id)).map(d=>({id:d.id,name:d.name,...estimateEnclosure(map,structures,d)}));
  if(archetype==='twin') settlements.sort((a,b)=>b.cost-a.cost||a.id.localeCompare(b.id));
  const combined=settlements.reduce((n,s)=>n+s.cost,0),weighted=settlements.reduce((n,s,i)=>n+s.cost*formula.weights[i],0);
  const calculated=Math.round(weighted*(1+formula.equipmentAllowance)/rules.roundTo)*rules.roundTo;
  return {settlements,combined,weighted,equipmentAllowance:formula.equipmentAllowance,
    available:available??Math.max(rules.min,Math.min(rules.max,calculated))};
}
