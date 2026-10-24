import { CONFIG } from '../../config.js';
import { WIDTH, HEIGHT } from '../../data/map.js';
import { FRONTIER_MAP } from '../../data/frontier/map.js';
import { FRONTIER_SIEGE } from '../../data/frontier/siege.js';
import { frontierSettlement, frontierRequests } from '../../data/frontier/settlement.js';
import { FRONTIER_ARCHETYPES, TERRAIN_TEMPLATES, OWNER_NAMES, REQUEST_TEMPLATES, SPECIAL_BUILDING_NAMES } from '../../data/frontier/templates.js';
import { createRng, random } from '../rng.js';

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
function makeCandidate(seed,archetype,attempt) {
  const rules=CONFIG.frontier.generator,rng=createRng((seed+Math.imul(attempt+1,0x9e3779b9))>>>0);
  const integer=(min,max)=>min+Math.floor(random(rng)*(max-min+1)),pick=items=>items[integer(0,items.length-1)];
  const template=FRONTIER_ARCHETYPES[archetype],terrain=pick(TERRAIN_TEMPLATES);
  const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill('.')),features=[];
  for(let x=0;x<WIDTH;x++) {cells[0][x]='#';cells[HEIGHT-1][x]='#';}
  for(let y=0;y<HEIGHT;y++) {cells[y][0]='#';cells[y][WIDTH-1]='#';}
  function feature(kind,x,y,w,h,blocked=true) {
    features.push({kind,x,y,w,h});
    for(let py=y;py<y+h;py++) for(let px=x;px<x+w;px++) cells[py][px]=blocked?'#':'.';
  }
  if(terrain.kind==='river') {
    const count=integer(1,3),crossings=Array.from({length:count},(_,i)=>({y:Math.round((i+1)*(HEIGHT-4)/(count+1))+integer(-1,1),kind:pick(['bridge','ford'])}));
    let x=integer(34,37);
    for(let y=0;y<HEIGHT;y++) {
      // Adjacent strips always overlap: the channel stays four-connected,
      // including beneath the deliberately walkable crossing surfaces.
      const target=terrain.bend?(y<HEIGHT/2?34:37):36;
      x=Math.max(34,Math.min(37,x+(random(rng)<.55?Math.sign(target-x):integer(-1,1))));
      const w=integer(2,3);feature('river',x,y,w,1);
      const crossing=crossings.find(c=>y===c.y||y===c.y+1);
      if(crossing) feature(crossing.kind,x,y,w,1,false);
    }
  } else if(terrain.kind==='ridge') {
    const x=integer(34,37),passes=[integer(8,12),integer(23,27)];
    for(let y=0;y<HEIGHT;y++) if(!passes.some(p=>y>=p&&y<p+3)) feature('ridge',x,y,2,1);
  }
  for(let i=0;i<(terrain.kind==='plain'?7:3);i++) {
    const x=i%2?integer(60,61):integer(3,8),y=integer(3,29);
    feature('rock',x,y,integer(2,3),integer(2,4));
  }
  const districts=template.districts.map(d=>({...d,types:undefined,x:d.x+integer(-3,0),
    y:Math.max(2,Math.min(HEIGHT-d.h-2,d.y+integer(-2,2))),w:d.w+integer(-2,0),h:d.h+integer(-1,0)})),structures=[];
  function property(type,district,x,y,id,label) {
    const def=CONFIG.structures[type],value=CONFIG.frontier.property[type],name=pick(OWNER_NAMES);
    return {id,type,label,x,y,w:def.w,h:def.h,district:district.id,owner:{name,role:type==='keep'?'Town council':type==='farm'?'Farmer':'Property owner'},
      importance:type==='keep'?'This community’s keep must survive.':type==='farm'?'Outlying seed stores sustain the next harvest.':'Families and essential supplies depend on this district.',
      hp:value.initialHp??def.hp,maxHp:def.hp,value:value.value,cost:0,paidCost:0,destroyed:false,optionalObjective:type!=='keep',
      ownerRewardOffer:0,promise:{status:'none',reward:0,negotiated:false}};
  }
  for(const district of districts.filter(d=>d.keep)) {
    const x=district.x+integer(3,6),y=district.y+Math.floor(district.h/2)+integer(-2,0),id=structures.length?'keep-sister':'keep';
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
  const entryMode=integer(0,2),spawns=entryMode===0?[{x:63,y:8},{x:63,y:18},{x:63,y:28}]:
    entryMode===1?[{x:52,y:0},{x:63,y:18},{x:52,y:35}]:[{x:63,y:integer(5,11)},{x:63,y:integer(16,21)},{x:63,y:integer(26,31)}];
  for(const p of spawns) cells[p.y][p.x]='S';
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
  for(const g of groups) {g.lane=integer(0,spawns.length-1);if(g.type==='foot') g.count=integer(...rules.footCount);}
  const footCount=groups.filter(g=>g.type==='foot').reduce((n,g)=>n+g.count,0),count=type=>groups.filter(g=>g.type===type).reduce((n,g)=>n+g.count,0);
  const siege={name:`The ${template.name} Raid`,bossHp:CONFIG.frontier.siege.bossHp,groups,scoutReport:[
    `${footCount} foot raiders approach across ${spawns.length} entry points (${entryMode===1?'north, east and south':'the eastern edge'}).`,
    `${count('chiseler')} chiselers and ${count('powder')} powder carriers accompany the columns.`,
    `${count('boss')} giant brute follows the raiders toward the keeps.`,
    `The ${districts.map(d=>d.name).join(', ')} share one construction budget; exposed properties need difficult choices.`,
  ]};
  const assessed=structures.reduce((n,s)=>n+Math.round(s.value*s.hp/s.maxHp),0),budget=Math.round(Math.max(rules.budgetMin,Math.min(rules.budgetMax,rules.budgetBase+assessed*rules.budgetRate+footCount*rules.budgetPerRaider)));
  return {seed,archetype,generated:true,map:{id:`frontier-${seed}-${archetype}`,map:cells.map(row=>row.join('')),keep:{x:structures[0].x,y:structures[0].y},spawns,sites:[],roads,districts,features,terrainPattern:terrain.id},
    structures,requests,specialObjectives:[objective],siege,budget,guardCount:pick(rules.guardCounts)};
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
    requests:frontierRequests(frontierSettlement()),specialObjectives:[],budget:CONFIG.frontier.budget,guardCount:CONFIG.frontier.guards.count,
    generation:{attempts:CONFIG.frontier.generator.maxAttempts,fallback:true,rejected}};
}
