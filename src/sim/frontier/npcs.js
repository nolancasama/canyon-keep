import { CONFIG } from '../../config.js';
import { FRONTIER_MAP } from '../../data/frontier/map.js';
import { isWalkable, structureAt, blocksStructure, emit } from '../grid.js';
import { hasTradeRoad } from '../build.js';
import { createInhabitants } from '../inhabitants.js';
import { damageEnemy } from '../enemies.js';

const directions=[[1,0],[0,1],[-1,0],[0,-1]],key=(x,y)=>`${x},${y}`;
const alive=unit=>unit.hp>0&&!unit.destroyed;
export function npcWalkable(state,x,y,friendly=true) {
  if(!isWalkable(x,y,state)) return false;
  const structure=structureAt(state,x,y);
  return !blocksStructure(structure)||(friendly&&['gate','keep'].includes(structure.type));
}
function perimeter(building) {
  const tiles=[];
  for(let x=building.x;x<building.x+building.w;x++) tiles.push({x,y:building.y-1},{x,y:building.y+building.h});
  for(let y=building.y;y<building.y+building.h;y++) tiles.push({x:building.x-1,y},{x:building.x+building.w,y});
  return tiles;
}
function safePost(state,building,slot=0) {
  const tiles=perimeter(building).filter(p=>npcWalkable(state,p.x,p.y));
  if(tiles.length) return tiles[slot%tiles.length];
  const safe=[];
  for(let y=0;y<FRONTIER_MAP.map.length;y++) for(let x=0;x<FRONTIER_MAP.map[y].length;x++) if(npcWalkable(state,x,y)) safe.push({x,y});
  safe.sort((a,b)=>Math.abs(a.x-building.x)+Math.abs(a.y-building.y)-Math.abs(b.x-building.x)-Math.abs(b.y-building.y)||a.y-b.y||a.x-b.x);
  return safe[0]??{x:building.x,y:building.y};
}
export function guardPosts(state) {
  if(state.stageId!=='frontier') return [];
  const buildings=state.structures.filter(s=>s.owner&&alive(s));
  const keep=buildings.find(s=>s.type==='keep'),posts=[{id:'keep',name:keep.label,buildingId:keep.id,district:keep.district}];
  for(const district of FRONTIER_MAP.districts) {
    const building=buildings.find(s=>s.district===district.id&&s.type!=='keep');
    if(building) posts.push({id:district.id,name:district.name,buildingId:building.id,district:district.id});
  }
  for(const building of buildings.filter(s=>s.type!=='keep')) posts.push({id:building.id,name:building.label,buildingId:building.id,district:building.district});
  return posts;
}
function postBuilding(state,postId) {
  const post=guardPosts(state).find(p=>p.id===postId);
  return state.structures.find(s=>s.id===(post?.buildingId??'keep'));
}
function positionAtPost(state,unit,slot=0) {
  const point=safePost(state,postBuilding(state,unit.postId),slot);
  unit.x=point.x+.5;unit.y=point.y+.5;unit.postX=unit.x;unit.postY=unit.y;unit.path=null;unit.status='holding';
}
function defender(state,type,id,postId,slot=0) {
  const rules=CONFIG.frontier[type==='guard'?'guards':'militia'];
  const unit={id,type,name:type==='guard'?'Professional guard':'District militia',postId,hp:rules.hp,maxHp:rules.hp,
    status:'holding',targetId:null,attackCooldown:0,sheltered:false};
  positionAtPost(state,unit,slot);return unit;
}
export function initializeFrontierNpcs(state) {
  state.guards=Array.from({length:CONFIG.frontier.guards.count},(_,i)=>defender(state,'guard',`guard-${i+1}`,'keep',i));
  state.militia=FRONTIER_MAP.districts.flatMap(d=>Array.from({length:CONFIG.frontier.militia.countPerDistrict},(_,i)=>
    defender(state,'militia',`militia-${d.id}-${i+1}`,d.id,i)));
  createInhabitants(state);
  for(const person of state.inhabitants) {
    const home=state.structures.find(s=>s.id===person.homeId),point=safePost(state,home,person.id);
    person.x=point.x+.5;person.y=point.y+.5;person.status='idle';
  }
}
export function requestGuards(state,postId,count) {
  if(state.stageId!=='frontier'||state.phase!=='prep') return {ok:false,reason:'Request guards during preparation only'};
  if(!guardPosts(state).some(post=>post.id===postId)) return {ok:false,reason:'Choose a named district post'};
  if(!Number.isInteger(count)||count<0) return {ok:false,reason:'Choose a whole number of guards'};
  const level=state.skills.communication,limits=CONFIG.frontier.guardRequestLimits;
  const limit=Object.keys(limits).filter(n=>+n<=level).reduce((n,key)=>Math.max(n,limits[key]),0);
  const guards=state.guards.filter(g=>!g.hired&&alive(g));
  if(postId==='keep') {
    if(count>guards.length) return {ok:false,reason:'Not enough professional guards'};
    const current=guards.filter(g=>g.postId==='keep').length;
    if(count<current) return {ok:false,reason:'Choose a district post to move guards from the keep'};
    let returning=count-current;
    for(const guard of guards.filter(g=>g.postId!=='keep')) if(returning-->0) {guard.postId='keep';positionAtPost(state,guard,guards.indexOf(guard));}
    return {ok:true,moved:count,limit};
  }
  const elsewhere=guards.filter(g=>g.postId!=='keep'&&g.postId!==postId).length;
  if(elsewhere+count>limit) return {ok:false,reason:`Communication ${level}: up to ${limit} reassigned guards`,limit};
  if(elsewhere+count>guards.length) return {ok:false,reason:'Not enough professional guards'};
  const current=guards.filter(g=>g.postId===postId);
  if(current.length>count) for(const guard of current.slice(count)) {guard.postId='keep';positionAtPost(state,guard,guards.indexOf(guard));}
  if(current.length<count) for(const guard of guards.filter(g=>g.postId==='keep').slice(0,count-current.length)) {
    guard.postId=postId;positionAtPost(state,guard,guards.indexOf(guard));
  }
  return {ok:true,moved:count,limit};
}

// Each route is a bounded orthogonal breadth-first search. A failed route is
// cached until its goal or the structure revision changes: shelter-in-place is
// an explicit state, rather than an endless attempt to walk through a wall.
function route(state,unit,x,y,friendly=true) {
  const sx=Math.floor(unit.x),sy=Math.floor(unit.y),gx=Math.floor(x),gy=Math.floor(y);
  const goal=key(gx,gy),revision=state.flowRevision??0;
  if(unit.pathGoal===goal&&unit.pathRevision===revision&&unit.pathFriendly===friendly&&unit.path!==undefined&&
    unit.pathX===unit.x&&unit.pathY===unit.y) return unit.path;
  const queue=[{x:sx,y:sy}],seen=new Map([[key(sx,sy),null]]);
  for(let i=0;i<queue.length&&!seen.has(goal);i++) for(const [dx,dy] of directions) {
    const nx=queue[i].x+dx,ny=queue[i].y+dy,k=key(nx,ny);
    if(seen.has(k)||!npcWalkable(state,nx,ny,friendly)) continue;
    seen.set(k,queue[i]);queue.push({x:nx,y:ny});
  }
  let path=null;
  if(seen.has(goal)) {
    path=[];let point={x:gx,y:gy};
    while(point.x!==sx||point.y!==sy) {path.push(point);point=seen.get(key(point.x,point.y));}
    path.reverse();
  }
  unit.pathGoal=goal;unit.pathRevision=revision;unit.pathFriendly=friendly;unit.pathX=unit.x;unit.pathY=unit.y;unit.path=path;return path;
}
function travel(state,unit,x,y,distance,friendly=true) {
  const path=route(state,unit,x,y,friendly);
  if(!path) return 'blocked';
  while(distance>0&&path.length) {
    const point=path[0],dx=point.x+.5-unit.x,dy=point.y+.5-unit.y,length=Math.hypot(dx,dy);
    if(!npcWalkable(state,point.x,point.y,friendly)) {unit.path=undefined;return 'blocked';}
    const step=Math.min(distance,length);
    if(length>0) {unit.x+=dx/length*step;unit.y+=dy/length*step;}
    distance-=step;
    if(step>=length-1e-8) path.shift();else break;
  }
  if(!path.length&&distance>0) {
    const dx=x-unit.x,dy=y-unit.y,length=Math.hypot(dx,dy),step=Math.min(distance,length);
    if(length>0) {unit.x+=dx/length*step;unit.y+=dy/length*step;}
  }
  unit.pathX=unit.x;unit.pathY=unit.y;
  return path.length||Math.hypot(x-unit.x,y-unit.y)>1e-8?'moving':'arrived';
}
function clearRoute(unit) {unit.path=undefined;unit.pathGoal=null;}
function accessible(state,building,candidate) {
  return perimeter(building).some(p=>!(p.x===candidate.x&&p.y===candidate.y)&&npcWalkable(state,p.x,p.y));
}
function ownerDefenses(state) {
  for(const building of state.structures.filter(s=>s.owner&&alive(s)&&s.selfDefense?.requested)) {
    const defense=building.selfDefense;if(defense.status!=='deferred') continue;
    defense.structureIds=[];defense.guardIds=[];
    if(['guard','hiredGuard'].includes(defense.rule)) {
      const guard=defender(state,'guard',`owner-guard-${building.id}`,building.id);
      guard.hired=true;state.guards.push(guard);defense.guardIds.push(guard.id);
    } else {
      const type=defense.rule==='palisades'?'palisade':'barricade',def=CONFIG.structures[type];
      for(const point of perimeter(building)) {
        if(defense.structureIds.length>=CONFIG.frontier.ownerDefense.pieces) break;
        if(!npcWalkable(state,point.x,point.y)||structureAt(state,point.x,point.y)||
          state.inhabitants.some(p=>alive(p)&&Math.floor(p.x)===point.x&&Math.floor(p.y)===point.y)||
          [...state.guards,...state.militia].some(p=>alive(p)&&Math.floor(p.x)===point.x&&Math.floor(p.y)===point.y)) continue;
        const candidate={...point,id:`owner-${building.id}-${defense.structureIds.length}`,type,w:def.w,h:def.h,hp:def.hp,maxHp:def.hp,
          cost:0,paidCost:0,destroyed:false,npcOwned:true,ownerBuildingId:building.id};
        if(!hasTradeRoad(state,candidate)||state.structures.some(s=>s.owner&&alive(s)&&!accessible(state,s,candidate))) continue;
        state.structures.push(candidate);defense.structureIds.push(candidate.id);state.flowRevision=(state.flowRevision??0)+1;
      }
    }
    defense.status=defense.structureIds.length||defense.guardIds.length?'deployed':'skipped';
    let entry=state.journal.find(e=>e.buildingId===building.id&&e.selfDefense);
    if(!entry) {entry={id:`defense-${building.id}`,buildingId:building.id,building:building.label,owner:{...building.owner},
      district:building.district,location:{x:building.x,y:building.y},status:'selfDefend',choice:'selfDefend',selfDefense:defense.rule,reward:0};state.journal.push(entry);}
    entry.selfDefenseStatus=defense.status;entry.defenseStructures=[...defense.structureIds];entry.defenseGuards=[...defense.guardIds];
    emit(state,'ownerDefense',{buildingId:building.id,status:defense.status,structures:entry.defenseStructures,guards:entry.defenseGuards});
  }
}
export function startFrontierNpcs(state) {
  ownerDefenses(state);
  for(const person of state.inhabitants) {person.sheltered=false;person.status=person.hp>0?'evacuating':'dead';clearRoute(person);}
  for(const unit of [...state.guards,...state.militia]) {unit.targetId=null;unit.attackCooldown=0;clearRoute(unit);}
}
function stepDefender(state,unit,dt) {
  if(unit.hp<=0) {unit.status='dead';unit.targetId=null;return;}
  const militia=unit.type==='militia',rules=CONFIG.frontier[militia?'militia':'guards'];
  unit.attackCooldown=Math.max(0,unit.attackCooldown-dt);
  const keep=state.structures.find(s=>s.type==='keep');
  if(militia&&(unit.retreating||unit.hp<unit.maxHp*rules.retreatFraction)) {
    unit.retreating=true;unit.targetId=null;
    const result=travel(state,unit,keep.x+.5,keep.y+.5,rules.speed*dt);
    unit.status=result==='blocked'?'sheltering':result==='arrived'?'sheltered':'retreating';unit.sheltered=result==='arrived';return;
  }
  const candidates=state.enemies.filter(e=>alive(e)&&Math.hypot(e.x-unit.postX,e.y-unit.postY)<=rules.leashRadius&&
    Math.hypot(e.x-unit.x,e.y-unit.y)<=rules.engageRadius);
  candidates.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y)||a.id-b.id);
  const target=candidates.find(e=>route(state,unit,e.x,e.y)!==null);
  if(target) {
    unit.targetId=target.id;unit.status='engaging';
    if(Math.hypot(target.x-unit.x,target.y-unit.y)<=CONFIG.combat.attackRange) {
      if(unit.attackCooldown<=0) {damageEnemy(state,target,rules.damage);unit.attackCooldown=rules.interval;}
    } else travel(state,unit,target.x,target.y,rules.speed*dt);
  } else {
    unit.targetId=null;const result=travel(state,unit,unit.postX,unit.postY,rules.speed*dt);
    unit.status=result==='moving'?'returning':result==='blocked'?'sheltering':'holding';
  }
}
export function stepFrontierNpcs(state,dt) {
  const keep=state.structures.find(s=>s.type==='keep');
  for(const person of state.inhabitants) {
    if(person.hp<=0) {person.status='dead';continue;}
    if(person.sheltered) continue;
    const result=travel(state,person,keep.x+.5,keep.y+.5,CONFIG.inhabitants.fleeSpeed*dt);
    person.status=result==='blocked'?'sheltering':result==='arrived'?'sheltered':'evacuating';person.sheltered=result==='arrived';
  }
  for(const unit of [...state.guards,...state.militia]) stepDefender(state,unit,dt);
}

// Frontier enemies use the same bounded terrain-aware movement when pursuing
// people. Canyon's original inhabitant chase remains in enemies.js unchanged.
export function engageFrontierNpc(state,enemy,speed,dt) {
  if(enemy.type==='boss') return false;
  const candidates=[...state.guards,...state.militia,...state.inhabitants].filter(unit=>alive(unit)&&!unit.sheltered&&
    Math.hypot(unit.x-enemy.x,unit.y-enemy.y)<=CONFIG.inhabitants.chaseRadius);
  candidates.sort((a,b)=>Math.hypot(a.x-enemy.x,a.y-enemy.y)-Math.hypot(b.x-enemy.x,b.y-enemy.y)||String(a.id).localeCompare(String(b.id)));
  const target=candidates.find(unit=>route(state,enemy,unit.x,unit.y,false)!==null);
  if(!target) return false;
  enemy.attackTargetId=target.id;enemy.walkTarget=null;enemy.windupRemaining=0;
  if(Math.hypot(target.x-enemy.x,target.y-enemy.y)<=CONFIG.combat.attackRange) {
    enemy.attackPhase='attacking';target.hp=Math.max(0,target.hp-CONFIG.enemies[enemy.type].unitDps*dt);
    if(!target.attacked) {
      target.attacked=true;(state.attackMarkers??=[]).push({x:target.x,y:target.y,t:state.time});
      emit(state,target.type?'defenderAttacked':'inhabitantAttacked',{id:target.id,x:target.x,y:target.y});
    }
    if(target.hp<=0) {target.status='dead';emit(state,'npcDeath',{id:target.id,npcType:target.type??'civilian',x:target.x,y:target.y});}
  } else {enemy.attackPhase='moving';travel(state,enemy,target.x,target.y,speed*dt,false);}
  return true;
}
