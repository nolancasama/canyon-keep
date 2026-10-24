import { CONFIG } from '../../config.js';
import { WIDTH } from '../../data/map.js';
import { stageFor } from '../../data/stages.js';
import { isWalkable, tileAt, structureAt, blocksStructure, emit } from '../grid.js';
import { damageEnemy } from '../enemies.js';
import { emergencyBuildTime } from './skills.js';

export const CLASS_B=['barricade','palisade','caltrops'];
const fail=(reason,cost=0)=>({ok:false,valid:false,reason,cost});
const contains=(s,x,y)=>x>=s.x&&y>=s.y&&x<s.x+s.w&&y<s.y+s.h;
const directions=[[1,0],[0,1],[-1,0],[0,-1]];

// Include every reserved footprint so simultaneous completions cannot jointly
// close the last route. Gates block enemies; the keep itself is the goal.
export function hasEnemyRoute(state,candidate=null,excludeId=null) {
  const reserved=(state.constructionSites??[]).filter(s=>s.id!==excludeId&&CONFIG.structures[s.type].blocks!==false);
  if(candidate&&CONFIG.structures[candidate.type].blocks!==false) reserved.push(candidate);
  const blocked=(x,y)=>!isWalkable(x,y,state)||reserved.some(s=>contains(s,x,y))||
    (blocksStructure(structureAt(state,x,y))&&structureAt(state,x,y).type!=='keep');
  const queue=stageFor(state).map.spawns.filter(p=>!blocked(p.x,p.y)),seen=new Set(queue.map(p=>p.y*WIDTH+p.x));
  const reached=new Set();
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];
    const building=structureAt(state,p.x,p.y);
    if(building?.type==='keep') reached.add(building.id);
    for(const [dx,dy] of directions) {
      const x=p.x+dx,y=p.y+dy,key=y*WIDTH+x;
      if(seen.has(key)||blocked(x,y)) continue;
      seen.add(key);queue.push({x,y});
    }
  }
  return state.structures.filter(s=>s.type==='keep'&&!s.destroyed&&s.hp>0).every(s=>reached.has(s.id));
}

export function emergencyPlacement(state,type,x,y) {
  const def=CONFIG.structures[type],rules=CONFIG.frontier,cost=def?.cost??0;
  if(state.stageId!=='frontier'||state.phase!=='siege') return fail('Emergency construction is Frontier battle only',cost);
  if(!CLASS_B.includes(type)) return fail('Class A construction is preparation only',cost);
  if(!Number.isInteger(x)||!Number.isInteger(y)) return fail('Choose a map tile',cost);
  if((state.constructionSites??[]).length>=rules.maxConstructionSites) return fail('Only 3 construction sites at once',cost);
  if((state.emergency?.spent??0)+cost>rules.emergencyCap) return fail('Emergency supplies cap reached',cost);
  if(state.gold<cost) return fail('Not enough gold',cost);
  for(let dy=0;dy<def.h;dy++) for(let dx=0;dx<def.w;dx++) {
    const tx=x+dx,ty=y+dy;
    if(!'.C'.includes(tileAt(tx,ty,state))) return fail('Build on open ground',cost);
    if(stageFor(state).map.spawns.some(p=>(state.frontierMap?Math.max(Math.abs(p.x-tx),Math.abs(p.y-ty)):Math.abs(p.x-tx))<CONFIG.spawnSafeColumns)) return fail('Keep the spawn approach clear',cost);
    if(structureAt(state,tx,ty)||state.structures.some(s=>s.owner&&contains(s,tx,ty))||
      (state.constructionSites??[]).some(s=>contains(s,tx,ty))) return fail('Another structure or site occupies this tile',cost);
    if((state.destroyedClassATiles??[]).some(p=>p.x===tx&&p.y===ty)) return fail('Destroyed Class A ground cannot be rebuilt this siege',cost);
    if(state.enemies.some(e=>e.hp>0&&Math.max(Math.abs(Math.floor(e.x)-tx),Math.abs(Math.floor(e.y)-ty))<=rules.enemyBuildClearance)) return fail('Too close to a living enemy (1 tile clearance)',cost);
  }
  if(def.blocks!==false&&!hasEnemyRoute(state,{type,x,y,w:def.w,h:def.h})) return fail('Would seal every enemy route to the keep',cost);
  return {ok:true,valid:true,reason:'',cost};
}

export function placeEmergency(state,type,x,y) {
  const check=emergencyPlacement(state,type,x,y);
  if(!check.ok) return check;
  const def=CONFIG.structures[type],rules=CONFIG.frontier;
  const site={id:`site-${state.nextId++}`,type,x,y,w:def.w,h:def.h,elapsed:0,
    duration:emergencyBuildTime(state),status:'building'};
  state.constructionSites.push(site);state.gold-=check.cost;state.emergency.spent+=check.cost;
  emit(state,'constructionStarted',{structureId:site.id,typeOfStructure:type,x,y});
  return {...check,site};
}

export function startFrontierConstruction(state) {
  state.constructionSites=[];state.emergency={spent:0,cap:CONFIG.frontier.emergencyCap};state.destroyedClassATiles=[];
}

export function stepFrontierConstruction(state,dt) {
  for(const site of [...state.constructionSites]) {
    site.elapsed=Math.min(site.duration,site.elapsed+dt);
    if(site.elapsed+1e-8<site.duration) continue;
    const occupants=[...state.enemies,...state.inhabitants,...state.guards,...state.militia,...state.golems];
    if(occupants.some(p=>p.hp>0&&!p.sheltered&&p.status!=='crumbled'&&contains(site,p.x,p.y))) {site.status='waiting';continue;}
    if(CONFIG.structures[site.type].blocks!==false&&!hasEnemyRoute(state,site,site.id)) {site.status='waiting_route';continue;}
    const def=CONFIG.structures[site.type];
    const structure={id:site.id,type:site.type,x:site.x,y:site.y,w:def.w,h:def.h,hp:def.hp,maxHp:def.hp,
      cost:def.cost,paidCost:def.cost,destroyed:false,emergency:true};
    state.structures.push(structure);state.constructionSites.splice(state.constructionSites.indexOf(site),1);
    state.rubble=state.rubble.filter(r=>!contains(site,r.x,r.y));
    state.flowRevision++;
    for(const enemy of state.enemies) enemy.walkTarget=null;
    emit(state,'build',{structureId:structure.id,typeOfStructure:site.type,x:site.x,y:site.y});
  }
  for(const hazard of state.structures.filter(s=>s.type==='caltrops'&&!s.destroyed)) {
    hazard.usesRemaining??=CONFIG.frontier.caltrops.uses;hazard.hitIds??=[];
    for(const enemy of state.enemies) {
      if(enemy.hp<=0||!contains(hazard,enemy.x,enemy.y)||hazard.hitIds.includes(enemy.id)) continue;
      hazard.hitIds.push(enemy.id);hazard.usesRemaining--;
      enemy.caltropSlowRemaining=CONFIG.frontier.caltrops.slowDuration;
      damageEnemy(state,enemy,CONFIG.frontier.caltrops.damage);
      emit(state,'caltropsHit',{structureId:hazard.id,id:enemy.id,x:enemy.x,y:enemy.y});
      if(hazard.usesRemaining<=0) {hazard.destroyed=true;hazard.hp=0;break;}
    }
  }
}
