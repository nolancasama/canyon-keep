import { CONFIG } from '../config.js';
import { WIDTH, HEIGHT, SPAWNS, SITES } from '../data/map.js';
import { tileAt, isWalkable } from './grid.js';
import { hasTradeRoad } from './build.js';
import { createInhabitants } from './inhabitants.js';

const STEPS=[[1,0],[-1,0],[0,1],[0,-1]];
const civilian=s=>s.type==='house'||s.type==='farm';
const alive=s=>!s.destroyed&&s.hp>0;
const military=s=>CONFIG.structures[s.type]?.military;
const covers=(s,x,y)=>x>=s.x&&y>=s.y&&x<s.x+s.w&&y<s.y+s.h;
const overlaps=(a,b,clearance=0)=>a.x<b.x+b.w+clearance&&a.x+a.w>b.x-clearance&&
  a.y<b.y+b.h+clearance&&a.y+a.h>b.y-clearance;
const key=(x,y)=>y*WIDTH+x;
const tiles=s=>Array.from({length:s.w*s.h},(_,i)=>({x:s.x+i%s.w,y:s.y+Math.floor(i/s.w)}));

// The snapshot fixes which inhabitants/buildings were present for this defense.
export function rateDefense(state) {
  const rules=CONFIG.growth,keep=state.structures.find(s=>s.type==='keep');
  const population=state.snapshot?.population??state.population;
  const survivors=state.inhabitants.filter(p=>p.hp>0).length;
  const before=(state.snapshot?.structures??state.structures).filter(s=>civilian(s)&&alive(s));
  const intact=before.filter(s=>state.structures.some(now=>now.id===s.id&&alive(now))).length;
  const fraction=(value,total)=>total>0?Math.min(1,Math.max(0,value/total)):1;
  const score=rules.weights.inhabitants*fraction(survivors,population)+
    rules.weights.keep*fraction(keep?.hp??0,keep?.maxHp??CONFIG.structures.keep.hp)+
    rules.weights.civilians*fraction(intact,before.length)+
    (state.keepReached?0:rules.weights.unreached);
  const tier=score>=rules.thresholds.exceptional?'exceptional':score>=rules.thresholds.strong?'strong':'standard';
  const rating=Number(score.toFixed(2));
  return {rating,tier};
}

function distances(starts,blocked=()=>false) {
  const result=Array(WIDTH*HEIGHT).fill(Infinity),queue=[];
  for(const p of starts) if(isWalkable(p.x,p.y)&&!blocked(p.x,p.y)&&result[key(p.x,p.y)]===Infinity) {
    result[key(p.x,p.y)]=0;queue.push(p);
  }
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];
    for(const [dx,dy] of STEPS) {
      const x=p.x+dx,y=p.y+dy;
      if(!isWalkable(x,y)||blocked(x,y)||result[key(x,y)]!==Infinity) continue;
      result[key(x,y)]=result[key(p.x,p.y)]+1;queue.push({x,y});
    }
  }
  return result;
}

// Gates stop enemies in this flood even though they remain open to merchants.
// Breached (destroyed, not demolished) pieces still mark the player's intended
// perimeter, so a battle breach does not reclassify the whole keep as outside.
export function settlementOutside(state) {
  const blockers=state.structures.filter(military);
  return distances(SPAWNS,(x,y)=>blockers.some(s=>covers(s,x,y)));
}

// Minimum distance between the swept hammer-head centre and the entire 2x2
// footprint. Endpoints, rectangle corners and side extrema cover every minimum.
function inStrikeBand(site,rect) {
  const start=site.centerAngle-site.halfSweep,end=site.centerAngle+site.halfSweep;
  const angles=[start,end,0,Math.PI/2,Math.PI,Math.PI*1.5];
  for(const x of [rect.x,rect.x+rect.w]) for(const y of [rect.y,rect.y+rect.h]) {
    angles.push(Math.atan2(y-site.pivotY,x-site.pivotX));
  }
  for(const x of [rect.x,rect.x+rect.w]) {
    const ratio=(x-site.pivotX)/site.armLength;
    if(Math.abs(ratio)<=1) {const a=Math.acos(ratio);angles.push(a,-a);}
  }
  for(const y of [rect.y,rect.y+rect.h]) {
    const ratio=(y-site.pivotY)/site.armLength;
    if(Math.abs(ratio)<=1) {const a=Math.asin(ratio);angles.push(a,Math.PI-a);}
  }
  return angles.some(raw=>{
    const a=raw+Math.round((site.centerAngle-raw)/(2*Math.PI))*2*Math.PI;
    if(a<start||a>end) return false;
    const x=site.pivotX+Math.cos(a)*site.armLength,y=site.pivotY+Math.sin(a)*site.armLength;
    return Math.hypot(Math.max(rect.x-x,0,x-rect.x-rect.w),Math.max(rect.y-y,0,y-rect.y-rect.h))<=CONFIG.pendulum.radius;
  });
}

function candidateSites(state,outside,keepDistance) {
  const rules=CONFIG.growth,def=CONFIG.structures.house;
  const spawnEdge=Math.min(...SPAWNS.map(p=>p.x));
  const pendulumSite=SITES.find(s=>String(s.id)===String(state.pendulum?.siteId));
  const sites=[];
  for(let y=0;y<HEIGHT-def.h+1;y++) for(let x=spawnEdge+rules.minSpawnDistance;x<WIDTH-def.w+1;x++) {
    const site={x,y,w:def.w,h:def.h},footprint=tiles(site);
    if(footprint.some(p=>!'.C'.includes(tileAt(p.x,p.y)))) continue;
    if(state.structures.some(s=>overlaps(site,s))) continue;
    if(state.structures.some(s=>military(s)&&overlaps(site,s,rules.militaryClearance))) continue;
    if(SITES.some(s=>covers(site,s.x,s.y))||(pendulumSite&&inStrikeBand(pendulumSite,site))) continue;
    site.outside=footprint.some(p=>outside[key(p.x,p.y)]<Infinity);
    site.ring=Math.min(...footprint.map(p=>keepDistance[key(p.x,p.y)]));
    if(site.ring<Infinity) sites.push(site);
  }
  return sites;
}

function openNeighbours(state,site) {
  const neighbours=new Set();
  for(const p of tiles(site)) for(const [dx,dy] of STEPS) {
    const x=p.x+dx,y=p.y+dy;
    if(!covers(site,x,y)&&isWalkable(x,y)&&!state.structures.some(s=>covers(s,x,y))) neighbours.add(key(x,y));
  }
  return neighbours.size;
}

export function growSettlement(state,tier) {
  const rules=CONFIG.growth,plan=rules.tiers[tier],previous=state.inhabitants.filter(p=>p.hp>0).length;
  let repaired=0,rebuildShortage=0;
  for(const s of state.structures) if(civilian(s)&&!alive(s)) {
    if(state.structures.some(other=>other.id!==s.id&&overlaps(s,other))) {rebuildShortage++;continue;}
    s.destroyed=false;s.hp=s.maxHp;repaired++;
    state.rubble=(state.rubble??[]).filter(r=>r.id!==s.id);
  }
  const keep=state.structures.find(s=>s.type==='keep');
  const keepDistance=distances(tiles(keep)),outside=settlementOutside(state);
  const report={tier,houses:0,farms:0,settlers:0,outside:0,shortage:{houses:0,farms:0},repaired,rebuildShortage,buildingIds:[]};
  const place=(type,forceOutside=false)=>{
    const homes=state.structures.filter(s=>alive(s)&&(s.type==='keep'||s.type==='house'));
    const habitation=distances(homes.flatMap(tiles));
    // A farm's ring is measured from the keep beyond the nearest edge of
    // existing habitation; far corners of a house do not inflate its ring.
    const habitationRing=Math.max(...homes.map(s=>Math.min(...tiles(s).map(p=>keepDistance[key(p.x,p.y)]))));
    let candidates=candidateSites(state,outside,keepDistance).filter(s=>!forceOutside||s.outside);
    for(const site of candidates) {
      site.distance=Math.min(...tiles(site).map(p=>habitation[key(p.x,p.y)]));
      site.open=openNeighbours(state,site);
    }
    if(type==='farm') candidates=candidates.filter(s=>s.ring>=habitationRing+rules.farmRingOffset);
    candidates.sort((a,b)=>(type==='house'?a.distance-b.distance:a.ring-b.ring||b.open-a.open)||a.y-b.y||a.x-b.x);
    // Judge the road as if the player rebuilds every breached defense.
    const repaired={...state,structures:state.structures.map(s=>military(s)&&!alive(s)?{...s,destroyed:false,hp:1}:s)};
    const site=candidates.find(s=>hasTradeRoad(repaired,{...s,type}));
    if(!site) return false;
    const def=CONFIG.structures[type],id=`${type}-${state.nextId++}`;
    state.structures.push({id,type,x:site.x,y:site.y,w:def.w,h:def.h,hp:def.hp,maxHp:def.hp,
      cost:def.cost,paidCost:0,destroyed:false});
    report[type==='house'?'houses':'farms']++;report.outside+=Number(site.outside);report.buildingIds.push(id);
    return true;
  };
  // Reserve the exceptional outside promise before inside sites consume space.
  let outsideHouse=false;
  if(tier==='exceptional'&&plan.houses>0) outsideHouse=place('house',true);
  for(let i=Number(outsideHouse);i<plan.houses;i++) if(!place('house')) report.shortage.houses++;
  for(let i=0;i<plan.farms;i++) if(!place('farm')) report.shortage.farms++;
  const houses=state.structures.filter(s=>s.type==='house'&&alive(s)).length;
  state.population=CONFIG.structures.keep.housing+CONFIG.structures.house.housing*houses;
  const food=()=>state.structures.filter(alive).reduce((n,s)=>n+(CONFIG.structures[s.type]?.food??0),0);
  while(food()<state.population) {
    if(!place('farm')) {
      report.shortage.farms=Math.max(report.shortage.farms,Math.ceil((state.population-food())/CONFIG.structures.farm.food));
      break;
    }
  }
  createInhabitants(state);
  report.settlers=state.population-previous;
  state.flowRevision=(state.flowRevision??0)+1;
  state.growthReport=report;
  state.growthHighlight={ids:[...report.buildingIds],until:rules.highlightDuration};
  return report;
}
