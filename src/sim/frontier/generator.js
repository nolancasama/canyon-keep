import { CONFIG } from '../../config.js';
import { WIDTH, HEIGHT } from '../../data/map.js';
import { FRONTIER_MAP } from '../../data/frontier/map.js';
import { FRONTIER_SIEGE } from '../../data/frontier/siege.js';
import { frontierSettlement, frontierRequests } from '../../data/frontier/settlement.js';
import { FRONTIER_ARCHETYPES, TERRAIN_TEMPLATES, TWIN_AXES, OWNER_NAMES, REQUEST_TEMPLATES, SPECIAL_BUILDING_NAMES } from '../../data/frontier/templates.js';
import { createRng, random } from '../rng.js';
import { FRONT_DIRECTIONS, edgeAnchor, chooseFrontPlan, assignFronts, frontScoutReport } from './fronts.js';
import { frontierBudgetPlan } from './budget.js';

const directions=[[1,0],[0,1],[-1,0],[0,-1]],key=(x,y)=>y*WIDTH+x;
const copy=value=>structuredClone(value);
const inside=(x,y)=>x>=0&&y>=0&&x<WIDTH&&y<HEIGHT;
const distanceToLot=(point,s)=>Math.hypot(Math.max(s.x-point.x,0,point.x-(s.x+s.w-1)),Math.max(s.y-point.y,0,point.y-(s.y+s.h-1)));
const perimeter=s=>{
  const points=[];
  for(let x=s.x;x<s.x+s.w;x++) points.push({x,y:s.y-1},{x,y:s.y+s.h});
  for(let y=s.y;y<s.y+s.h;y++) points.push({x:s.x-1,y},{x:s.x+s.w,y});
  return points.filter(p=>inside(p.x,p.y));
};
export function frontierSeed(value=CONFIG.seed) {
  if(typeof value==='number'&&Number.isFinite(value)) return value>>>0;
  const text=String(value);let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return hash>>>0;
}
function occupied(structures) {
  const cells=new Map();
  for(const s of structures) for(let y=s.y;y<s.y+s.h;y++) for(let x=s.x;x<s.x+s.w;x++) cells.set(key(x,y),s);
  return cells;
}
function search(map,starts,pass,goal=null,order=directions) {
  const queue=[],previous=new Map();
  for(const p of starts) if(inside(p.x,p.y)&&map[p.y][p.x]!=='#'&&pass(p.x,p.y)) {previous.set(key(p.x,p.y),null);queue.push(p);}
  let found=null;
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];if(goal?.(p.x,p.y)) {found=p;break;}
    for(const [dx,dy] of order) {
      const x=p.x+dx,y=p.y+dy,k=key(x,y);
      if(!inside(x,y)||map[y][x]==='#'||previous.has(k)||!pass(x,y)) continue;
      previous.set(k,p);queue.push({x,y});
    }
  }
  if(!goal) return previous;
  if(!found) return null;
  const path=[];
  for(let p=found;p;p=previous.get(key(p.x,p.y))) path.push(p);
  return path.reverse();
}
// A separate seed stream deliberately leaves terrain, owner requests and the
// raid schedule unchanged when garrison composition changes.
export function generateGarrisons(seed,archetype,map,structures,siege) {
  const rules=CONFIG.frontier.garrison,types=Object.keys(rules.costs);
  const difficulty=siege.groups.reduce((sum,g)=>sum+g.count*(CONFIG.frontier.fronts.strength[g.type]??1),0);
  const keeps=structures.filter(s=>s.type==='keep'),posts=keeps.map(keep=>({keep,district:keep.district}));
  for(const district of map.districts.filter(d=>d.id==='outpost')) posts.push({keep:keeps[0],district:district.id,postId:district.id});
  return posts.map(post=>{
    const {keep,postId}=post,rng=createRng(frontierSeed(`${seed}:garrison:${archetype}:${postId??keep.id}`)),roll=()=>random(rng);
    const district=map.districts.find(d=>d.id===post.district),properties=structures.filter(s=>s.district===post.district&&s.type!=='keep');
    const size=properties.length,wealth=rules.wealthRange[0]+roll()*(rules.wealthRange[1]-rules.wealthRange[0]);
    const value=properties.reduce((sum,s)=>sum+s.value,0),fortifications=structures.filter(s=>!s.destroyed&&CONFIG.structures[s.type]?.military&&s.district===post.district).length;
    const budget=Math.floor(Math.max(rules.minBudget,Math.min(rules.maxBudget,
      (rules.baseBudget+size*rules.sizeBudget+value*wealth*rules.wealthBudget+fortifications*rules.fortificationBudget+difficulty*rules.difficultyBudget)*(rules.archetypeBudget[archetype]??1))));
    const weights={...rules.typeWeights,cavalry:rules.typeWeights.cavalry*(wealth<rules.poorThreshold?rules.poorCavalryWeight:1)};
    let available=types.filter(type=>roll()<rules.subsetChance*(type==='cavalry'&&wealth<rules.poorThreshold?rules.poorCavalryWeight:1));
    const pick=items=>{
      let remaining=roll()*items.reduce((sum,type)=>sum+weights[type],0);
      return items.find(type=>(remaining-=weights[type])<0)??items.at(-1);
    };
    if(!available.length) available=[pick(types)];
    const roster={keepId:keep.id,...(postId?{postId}:{}),name:district?.name??keep.label,footmen:0,archers:0,cavalry:0,budget,strength:0,size,wealth,difficulty,fortifications};
    for(;;) {
      const affordable=available.filter(type=>roster.strength+rules.costs[type]<=budget+Number.EPSILON*budget);
      if(!affordable.length) break;
      const type=pick(affordable);roster[type]++;roster.strength=Math.round((roster.strength+rules.costs[type])*10)/10;
    }
    return roster;
  });
}
function makeCandidate(seed,archetype,attempt) {
  const rules=CONFIG.frontier.generator,rng=createRng((seed+Math.imul(attempt+1,0x9e3779b9))>>>0);
  const integer=(min,max)=>min+Math.floor(random(rng)*(max-min+1)),pick=items=>items[integer(0,items.length-1)];
  const chance=p=>random(rng)<p,template=FRONTIER_ARCHETYPES[archetype];
  const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill('.')),features=[];
  for(let x=0;x<WIDTH;x++) {cells[0][x]='#';cells[HEIGHT-1][x]='#';}
  for(let y=0;y<HEIGHT;y++) {cells[y][0]='#';cells[y][WIDTH-1]='#';}
  function feature(kind,x,y,w,h,blocked=true) {
    features.push({kind,x,y,w,h});
    for(let py=y;py<y+h;py++) for(let px=x;px<x+w;px++) cells[py][px]=blocked?'#':'.';
  }
  // The siege plan comes first: settlements are then laid out around the map
  // centre with some outskirts deliberately facing the main assault.
  const plan=chooseFrontPlan(integer,chance),mainAngle=FRONT_DIRECTIONS[plan.fronts[0].direction].angle;
  const cx=(WIDTH-1)/2,cy=(HEIGHT-1)/2,m=rules.edgeMargin,rects=[];
  const clear=(x,y,w,h,gap)=>!rects.some(r=>x<r.x+r.w+gap&&x+w+gap>r.x&&y<r.y+r.h+gap&&y+h+gap>r.y);
  const fits=(x,y,w,h)=>x>=m&&y>=m&&x+w<=WIDTH-m&&y+h<=HEIGHT-m;
  function outward(d,angle,radius) {
    for(let turn=0;turn<12;turn++) {
      const a=(angle+(turn%2?1:-1)*Math.ceil(turn/2)*30)*Math.PI/180;
      for(let s=.8;s<=1.6;s+=.05) {
        const x=Math.round(cx+Math.cos(a)*radius.x*s-d.w/2),y=Math.round(cy+Math.sin(a)*radius.y*s-d.h/2);
        if(fits(x,y,d.w,d.h)&&clear(x,y,d.w,d.h,2)) return {x,y};
      }
    }
    return null;
  }
  const axis=pick(TWIN_AXES),side=chance(.5)?1:-1,districts=[],structures=[];let ringCount=0;
  for(const d of template.districts) {
    const w=d.w+integer(-2,0),h=d.h+integer(-1,0),spec={...d,types:undefined,w,h};let at=null;
    if(d.place==='centre') at={x:Math.round(cx+integer(-rules.centreJitter.x,rules.centreJitter.x)-w/2),y:Math.round(cy+integer(-rules.centreJitter.y,rules.centreJitter.y)-h/2)};
    else if(d.place==='twinA'||d.place==='twinB') {
      const sign=(d.place==='twinA'?1:-1)*side;
      at={x:Math.round(cx+axis.x*sign+integer(-2,2)-w/2),y:Math.round(cy+axis.y*sign+integer(-1,1)-h/2)};
    } else {
      const angle=ringCount++===0&&chance(.6)?mainAngle+integer(-30,30):integer(0,359);
      at=outward(spec,angle,d.place==='far'?rules.farRadius:rules.ringRadius);
    }
    if(!at) return null;
    at.x=Math.max(m,Math.min(WIDTH-m-w,at.x));at.y=Math.max(m,Math.min(HEIGHT-m-h,at.y));
    if(!clear(at.x,at.y,w,h,1)) return null;
    districts.push({...spec,...at});rects.push({x:at.x,y:at.y,w,h});
  }
  // Rivers and ridges run edge to edge through open ground beside the
  // settlements; a pattern that cannot fit the layout becomes open outcrops.
  let terrain=pick(TERRAIN_TEMPLATES);
  function channel(vertical,width,bend,wander) {
    const length=vertical?HEIGHT:WIDTH,span=vertical?WIDTH:HEIGHT,bases=[];
    for(let b=4;b<span-6;b++) bases.splice(integer(0,bases.length),0,b);
    for(const base of bases) {
      const strips=[];let l=base;
      for(let a=0;a<length;a++) {
        const target=bend?(a<length/2?base-2:base+2):base;
        if(wander) l=Math.max(base-2,Math.min(base+2,l+(chance(.55)?Math.sign(target-l):integer(-1,1))));
        const w=width===2?2:integer(2,3);strips.push({a,l,w});
      }
      const tiles=strips.flatMap(s=>Array.from({length:s.w},(_,i)=>vertical?{x:s.l+i,y:s.a}:{x:s.a,y:s.l+i}));
      if(tiles.every(t=>clear(t.x,t.y,1,1,1))) return strips;
    }
    return null;
  }
  if(terrain.kind!=='plain') {
    const vertical=chance(.5),river=terrain.kind==='river';
    const strips=channel(vertical,river?3:2,terrain.bend,river)??channel(!vertical,river?3:2,terrain.bend,river);
    if(!strips) terrain=TERRAIN_TEMPLATES.find(t=>t.kind==='plain');
    else {
      const length=strips.length,isVertical=length===HEIGHT;
      const place=(kind,s,blocked=true)=>isVertical?feature(kind,s.l,s.a,s.w,1,blocked):feature(kind,s.a,s.l,1,s.w,blocked);
      if(river) {
        const count=integer(1,3),crossings=Array.from({length:count},(_,i)=>({a:Math.round((i+1)*(length-4)/(count+1))+integer(-1,1),kind:pick(['bridge','ford'])}));
        for(const s of strips) {
          // Adjacent strips always overlap: the channel stays four-connected,
          // including beneath the deliberately walkable crossing surfaces.
          place('river',s);
          const crossing=crossings.find(c=>s.a===c.a||s.a===c.a+1);
          if(crossing) place(crossing.kind,s,false);
        }
      } else {
        const passes=[integer(Math.round(length*.2),Math.round(length*.35)),integer(Math.round(length*.6),Math.round(length*.75))];
        for(const s of strips) if(!passes.some(p=>s.a>=p&&s.a<p+3)) place('ridge',s);
      }
    }
  }
  for(let i=0,placed=0;i<60&&placed<(terrain.kind==='plain'?7:3);i++) {
    const w=integer(2,3),h=integer(2,4),x=integer(3,WIDTH-4-w),y=integer(3,HEIGHT-4-h);
    if(!clear(x,y,w,h,2)) continue;
    if(Array.from({length:h},(_,dy)=>cells[y+dy].slice(x,x+w)).flat().some(c=>c!=='.')) continue;
    feature('rock',x,y,w,h);placed++;
  }
  function property(type,district,x,y,id,label) {
    const def=CONFIG.structures[type],value=CONFIG.frontier.property[type],name=pick(OWNER_NAMES);
    return {id,type,label,x,y,w:def.w,h:def.h,district:district.id,owner:{name,role:type==='keep'?'Town council':type==='farm'?'Farmer':'Property owner'},
      importance:type==='keep'?'This community’s keep must survive.':type==='farm'?'Outlying seed stores sustain the next harvest.':'Families and essential supplies depend on this district.',
      hp:value.initialHp??def.hp,maxHp:def.hp,value:value.value,cost:0,paidCost:0,destroyed:false,optionalObjective:type!=='keep',
      ownerRewardOffer:0,promise:{status:'none',reward:0,negotiated:false}};
  }
  for(const district of districts.filter(d=>d.keep)) {
    const x=district.x+Math.floor(district.w/2)-1+integer(-2,2),y=district.y+Math.floor(district.h/2)-1+integer(-1,1),id=structures.length?'keep-sister':'keep';
    const s=property('keep',district,x,y,id,`${district.name} Keep`);structures.push(s);
    for(let py=y;py<y+s.h;py++) for(let px=x;px<x+s.w;px++) cells[py][px]='K';
  }
  for(let di=0;di<districts.length;di++) {
    const district=districts[di],types=[...template.districts[di].types];
    if(random(rng)<.5) types.push(district.id==='farms'?'farm':'house');
    for(let i=0;i<types.length;i++) {
      const type=types[i],def=CONFIG.structures[type];let point=null;
      for(let tries=0;tries<rules.placementAttempts;tries++) {
        const x=integer(district.x,district.x+district.w-def.w),y=integer(district.y,district.y+district.h-def.h);
        if(structures.some(s=>x<s.x+s.w+1&&x+def.w>s.x-1&&y<s.y+s.h+1&&y+def.h>s.y-1)) continue;
        if(Array.from({length:def.h},(_,dy)=>Array.from({length:def.w},(_,dx)=>cells[y+dy][x+dx])).flat().some(c=>c==='#')) continue;
        point={x,y};break;
      }
      if(!point) return null;
      const id=type==='workshop'?'workshop':`${district.id}-${type}-${i}`;
      structures.push(property(type,district,point.x,point.y,id,`${district.name} ${type==='farm'?'fields':type} ${i+1}`));
    }
  }
  // Region artwork and castle-zone floor follow padded building clusters.
  // Preserve a usable apron for towers around each keep without tinting an
  // identical rectangular town envelope on every commission.
  for(const d of districts) {
    d.regions=structures.filter(s=>s.district===d.id).map(s=>{
      const pad=s.type==='keep'?4:2,x=Math.max(1,s.x-pad),y=Math.max(1,s.y-pad);
      return {x,y,w:Math.min(WIDTH-1,s.x+s.w+pad)-x,h:Math.min(HEIGHT-1,s.y+s.h+pad)-y};
    });
    d.x=Math.min(...d.regions.map(r=>r.x));d.y=Math.min(...d.regions.map(r=>r.y));
    d.w=Math.max(...d.regions.map(r=>r.x+r.w))-d.x;d.h=Math.max(...d.regions.map(r=>r.y+r.h))-d.y;
    if(d.keep) for(const r of d.regions) for(let y=r.y;y<r.y+r.h;y++) for(let x=r.x;x<r.x+r.w;x++) if(cells[y][x]==='.') cells[y][x]='C';
  }
  // Entry points slide along each front's edge until they open onto walkable
  // ground well clear of every settlement.
  const spawns=[];
  for(const [i,front] of plan.fronts.entries()) {
    const anchor=edgeAnchor(front.direction),vertical=anchor.edge==='east'||anchor.edge==='west',length=vertical?HEIGHT:WIDTH;
    const at=a=>anchor.edge==='north'?{x:a,y:0,ix:a,iy:1}:anchor.edge==='south'?{x:a,y:HEIGHT-1,ix:a,iy:HEIGHT-2}:anchor.edge==='west'?{x:0,y:a,ix:1,iy:a}:{x:WIDTH-1,y:a,ix:WIDTH-2,iy:a};
    const start=vertical?anchor.y:anchor.x,want=i===0?CONFIG.frontier.fronts.mainSpawns:1;front.lanes=[];
    for(let step=0;step<=rules.spawnSlide*2&&front.lanes.length<want;step++) {
      const a=start+(step%2?1:-1)*Math.ceil(step/2);
      if(a<2||a>length-3) continue;
      const p=at(a);
      if(cells[p.iy][p.ix]!=='.'||spawns.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<4)) continue;
      if(districts.some(d=>distanceToLot(p,d)<rules.spawnDistrictDistance)) continue;
      front.lanes.push(spawns.length);spawns.push({x:p.x,y:p.y});cells[p.y][p.x]='S';
    }
    if(!front.lanes.length) return null;
    Object.assign(front,{name:FRONT_DIRECTIONS[front.direction].name,edge:anchor.edge,anchor:{x:anchor.x,y:anchor.y}});
  }
  const lots=occupied(structures),roadSet=new Set(),roads=[],order=random(rng)<.5?directions:[directions[1],directions[0],directions[3],directions[2]];
  const pass=(x,y)=>!lots.has(key(x,y))||lots.get(key(x,y)).type==='keep';
  const anchor=perimeter(structures[0]).find(p=>cells[p.y][p.x]!=='#'&&pass(p.x,p.y));
  if(!anchor) return null;
  roadSet.add(key(anchor.x,anchor.y));roads.push(anchor);
  // Each irregular cluster joins the same road tree, taking walkable detours
  // around lots and authored terrain rather than laying down a regular grid.
  for(const target of [...structures,...spawns.map(p=>({...p,w:1,h:1,entry:true}))]) {
    const starts=target.entry?[{x:target.x,y:target.y}]:perimeter(target);
    const path=search(cells,starts,pass,(x,y)=>roadSet.has(key(x,y)),order);
    if(!path) return null;
    for(const p of path) if(!roadSet.has(key(p.x,p.y))) {roadSet.add(key(p.x,p.y));roads.push(p);}
  }
  const requests=[];
  for(const request of REQUEST_TEMPLATES) {
    const eligible=structures.filter(s=>request.types.includes(s.type)&&!s.request),s=pick(eligible);
    if(!s) continue;
    const terms=CONFIG.frontier.requests[request.key];s.request=request.key;s.owner.role=request.role;s.ownerRewardOffer=terms.reward;
    requests.push({id:`${request.key}-${s.id}`,buildingId:s.id,owner:{...s.owner},dialogue:request.dialogue,communicationRequired:terms.communication,
      reward:terms.reward,immediate:request.key==='workshop',status:'pending',selfDefense:request.selfDefense,completionCondition:'Building still standing when the siege ends'});
  }
  let objective;
  if(random(rng)<.5) {
    const s=pick(structures.filter(s=>s.type==='warehouse'));
    s.label=pick(SPECIAL_BUILDING_NAMES);s.specialObjective=true;
    objective={id:s.id,kind:'building',label:`Protect ${s.label}`,location:{x:s.x,y:s.y},district:s.district};
  } else {
    const d=districts.find(d=>d.id==='farms');
    objective={id:'farming-district',kind:'districtIntact',district:'farms',fraction:rules.farmIntactFraction,
      label:`Keep at least ${rules.farmIntactFraction*100}% of farming properties standing`,location:{x:structures.find(s=>s.district===d.id).x,y:structures.find(s=>s.district===d.id).y}};
  }
  objective.mandatory=random(rng)<.25;objective.reward=rules.specialReward;objective.penalty=rules.specialPenalty;
  const groups=copy(CONFIG.frontier.siege.groups);
  for(const g of groups) if(g.type==='foot') g.count=integer(...rules.footCount);
  const schedule=assignFronts(groups,plan);
  const siege={name:`The ${template.name} Raid`,bossHp:CONFIG.frontier.siege.bossHp,groups:schedule,plan,
    scoutReport:frontScoutReport(plan,groups,districts)};
  const map={id:`frontier-${seed}-${archetype}`,map:cells.map(row=>row.join('')),keep:{x:structures[0].x,y:structures[0].y},spawns,sites:[],roads,districts,features,terrainPattern:terrain.id};
  const budgetPlan=frontierBudgetPlan(map,structures,archetype),budget=budgetPlan.available;
  const guardCount=pick(rules.guardCounts),garrisons=generateGarrisons(seed,archetype,map,structures,siege);
  return {seed,archetype,generated:true,map,
    structures,requests,specialObjectives:[objective],siege,budget,budgetPlan,guardCount,garrisons};
}

export function validateFrontierContract(candidate) {
  const errors=[],rules=CONFIG.frontier.generator;
  if(!candidate) return {ok:false,errors:['Could not place the authored district clusters']};
  const {map,structures,specialObjectives=[]}=candidate,cells=map.map,lots=new Map(),keeps=structures.filter(s=>s.type==='keep');
  const walk=(x,y)=>inside(x,y)&&cells[y]?.[x]!==undefined&&cells[y][x]!=='#';
  for(const s of structures) for(let y=s.y;y<s.y+s.h;y++) for(let x=s.x;x<s.x+s.w;x++) {
    const k=key(x,y);if(lots.has(k)) errors.push('Overlapping structures');if(!walk(x,y)) errors.push('Structure on impassable terrain');lots.set(k,s);
  }
  if(!keeps.length) errors.push('No mandatory keep');
  if(!map.spawns.length||map.spawns.some(p=>!walk(p.x,p.y)||!(p.x===0||p.y===0||p.x===WIDTH-1||p.y===HEIGHT-1))) errors.push('Invalid enemy entry');
  for(const keep of keeps) {
    const reached=search(cells,map.spawns,()=>true);
    if(!reached.has(key(keep.x,keep.y))) errors.push('Keep cannot be reached by enemies');
  }
  const friendly=(x,y)=>!lots.has(key(x,y))||lots.get(key(x,y)).type==='keep';
  const evacuation=search(cells,keeps.map(s=>({x:s.x,y:s.y})),friendly);
  for(const s of structures) if(!perimeter(s).some(p=>evacuation.has(key(p.x,p.y)))) errors.push('No civilian or NPC evacuation path');
  const roadSet=new Set(map.roads.map(p=>key(p.x,p.y))),roadStart=map.roads[0];
  const roadReach=roadStart?search(cells,[roadStart],(x,y)=>roadSet.has(key(x,y))):new Map();
  if(map.roads.some(p=>!walk(p.x,p.y)||!friendly(p.x,p.y))) errors.push('Road obstructed');
  if(map.roads.some(p=>!roadReach.has(key(p.x,p.y)))) errors.push('Disconnected road network');
  for(const d of map.districts) {
    const buildings=structures.filter(s=>s.district===d.id);
    if(!buildings.some(s=>perimeter(s).some(p=>roadReach.has(key(p.x,p.y))))) errors.push('Disconnected district road');
    let defensive=0;
    for(let y=d.y-1;y<=d.y+d.h;y++) for(let x=d.x-1;x<=d.x+d.w;x++) if(walk(x,y)&&!lots.has(key(x,y))) defensive++;
    if(defensive<rules.minDefensiveTiles) errors.push('No defensive building space');
  }
  const meaningful=map.districts.filter(d=>structures.filter(s=>s.district===d.id).reduce((n,s)=>n+s.value,0)>=rules.minDistrictValue);
  if(meaningful.length<2) errors.push('No meaningful district choice');
  for(const goal of specialObjectives) {
    const targets=goal.kind==='districtIntact'?structures.filter(s=>s.district===goal.district):structures.filter(s=>s.id===goal.id);
    if(!targets.length||!goal.location||!walk(goal.location.x,goal.location.y)) errors.push('Objective not placed');
    if(goal.kind!=='districtIntact'&&targets.length&&goal.location&&(goal.location.x!==targets[0].x||goal.location.y!==targets[0].y)) errors.push('Objective marker does not match building');
    if(targets.some(s=>map.spawns.some(p=>distanceToLot(p,s)<rules.objectiveSpawnDistance))) errors.push('Objective too close to entry');
  }
  for(const keep of keeps) if(map.spawns.some(p=>distanceToLot(p,keep)<rules.objectiveSpawnDistance)) errors.push('Keep too close to entry');
  if(map.spawns.some(p=>map.districts.some(d=>distanceToLot(p,d)<rules.spawnDistrictDistance))) errors.push('Entry inside or beside a settlement');
  const plan=candidate.siege?.plan;
  if(plan) {
    for(const front of plan.fronts) {
      const entries=front.lanes.map(i=>map.spawns[i]).filter(Boolean),reached=entries.length?search(cells,entries,()=>true):new Map();
      if(!keeps.some(k=>reached.has(key(k.x,k.y)))) errors.push('Front cannot reach a keep');
    }
    for(let wave=0;wave<plan.waves;wave++) if(Math.max(...plan.fronts.map(f=>f.waveShares[wave]))<.5) errors.push('No main front carries half the strength');
  }
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}

// Test hooks are data-only and affect rejection, never bypass validation.
export function generateFrontierContract(inputSeed=CONFIG.seed,inputArchetype='random',testHooks={}) {
  const seed=frontierSeed(inputSeed),ids=Object.keys(FRONTIER_ARCHETYPES);
  const archetype=FRONTIER_ARCHETYPES[inputArchetype]?inputArchetype:ids[Math.floor(random(createRng(seed))*ids.length)];
  const rejected=[];
  for(let attempt=0;attempt<CONFIG.frontier.generator.maxAttempts;attempt++) {
    const candidate=makeCandidate(seed,archetype,attempt),validation=validateFrontierContract(candidate);
    if(testHooks.forceFailure||attempt<(testHooks.rejectAttempts??0)) validation.errors.push('Forced validation rejection');
    if(validation.errors.length===0) return {...candidate,generation:{attempts:attempt+1,fallback:false,rejected}};
    rejected.push(validation.errors);
  }
  return {seed,archetype,generated:true,map:copy(FRONTIER_MAP),siege:copy(FRONTIER_SIEGE),structures:frontierSettlement(),
    garrisons:[{keepId:'keep',name:'Vale Keep',footmen:CONFIG.frontier.guards.count,archers:0,cavalry:0,budget:CONFIG.frontier.guards.count,strength:CONFIG.frontier.guards.count}],
    budgetPlan:frontierBudgetPlan(FRONTIER_MAP,frontierSettlement(),'handcrafted',CONFIG.frontier.budget),
    requests:frontierRequests(frontierSettlement()),specialObjectives:[],budget:CONFIG.frontier.budget,guardCount:CONFIG.frontier.guards.count,
    generation:{attempts:CONFIG.frontier.generator.maxAttempts,fallback:true,rejected}};
}
