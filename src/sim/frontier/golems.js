import { CONFIG } from '../../config.js';
import { isWalkable, blockingAt, emit } from '../grid.js';
import { rebuildFlow } from '../pathing.js';
import { golemSlam, golemChase } from '../golems.js';
import { normalizeSkills, deviceCooldown } from './skills.js';
import { militaryUnits } from './npcs.js';

// Reusable Frontier golem walls. The wall stays in state.structures while its
// golem is out: `awakened` makes it non-blocking (an open breach), so pathing,
// repairs and archer battlements all see the gap, while the occupied tile still
// refuses new construction. HP fraction is carried across both forms.
const directions=[[1,0],[0,1],[-1,0],[0,-1]];
const key=(x,y)=>`${x},${y}`;
export const GOLEM_MODES=['guard','patrol'];

const reopenFlow=state=>{
  state.flowRevision=(state.flowRevision??0)+1;
  for(const enemy of state.enemies) enemy.walkTarget=null;
  rebuildFlow(state);
};
const wallOf=(state,golem)=>state.structures.find(s=>s.id===golem.wallId);
export const golemReturnSpeed=state=>
  CONFIG.golem.speed*(1+CONFIG.frontier.skills.golemReturnBonus[normalizeSkills(state.skills).mechanical-1]);
export const golemReuseCooldown=state=>deviceCooldown(state,CONFIG.frontier.golem.cooldown);

export function resetFrontierGolems(state) {
  if(state.stageId!=='frontier') return;
  for(const wall of state.structures) if(wall.type==='golem') {
    wall.golemMode=GOLEM_MODES.includes(wall.golemMode)?wall.golemMode:'guard';
    wall.golemState=wall.destroyed||wall.hp<=0?'destroyed':'dormant';
    wall.awakened=false;wall.golemTimer=0;
  }
}

export function setGolemMode(state,id,mode) {
  const wall=state.structures.find(s=>s.id===id&&s.type==='golem'&&!s.destroyed);
  if(state.stageId!=='frontier') return {ok:false,reason:'Golem modes are a Frontier feature'};
  if(state.phase!=='prep') return {ok:false,reason:'Choose golem modes during preparation'};
  if(!wall) return {ok:false,reason:'Select a golem wall'};
  wall.golemMode=GOLEM_MODES.includes(mode)?mode:wall.golemMode==='patrol'?'guard':'patrol';
  return {ok:true,mode:wall.golemMode};
}

export function releaseCheck(state,wall) {
  if(state.stageId!=='frontier'||state.phase!=='siege') return {ok:false,reason:'Golems are released during a Frontier battle'};
  if(!wall||wall.type!=='golem') return {ok:false,reason:'Select a golem wall'};
  if(wall.destroyed||wall.hp<=0||wall.golemState==='destroyed') return {ok:false,reason:'This golem wall is destroyed'};
  if(wall.golemState==='cooldown'||wall.golemState==='reforming') return {ok:false,reason:`Golem reforming — ready in ${Math.ceil(wall.golemTimer)} s`};
  if(wall.awakened) return {ok:false,reason:'This golem is already out'};
  return {ok:true,reason:''};
}

// Shared by manual release and automatic awakening. A wall can only hold one
// golem: every non-dormant state refuses a second release.
export function awakenFrontierGolem(state,wall,cause='manual') {
  if(!releaseCheck(state,wall).ok) return null;
  const rules=CONFIG.frontier.golem,x=wall.x+.5,y=wall.y+.5,fraction=Math.max(0,Math.min(1,wall.hp/wall.maxHp));
  wall.awakened=true;wall.golemState='active';wall.golemTimer=0;
  if(wall.emergencyRepair?.status==='repairing') wall.emergencyRepair.status='interrupted';
  const golem={id:state.nextId++,type:'golem',frontier:true,wallId:wall.id,x,y,originX:x,originY:y,
    hp:rules.activeHp*fraction,maxHp:rules.activeHp,remaining:rules.activeDuration,attackCooldown:0,
    status:'active',phase:'fighting',mode:wall.golemMode??'guard',idle:0,path:null,repath:0};
  (state.golems??=[]).push(golem);
  reopenFlow(state);
  emit(state,'golemAwaken',{id:golem.id,structureId:wall.id,x,y,cause});
  return golem;
}

export function releaseGolem(state,id) {
  const wall=state.structures.find(s=>s.id===id);
  const check=releaseCheck(state,wall);
  if(!check.ok) return check;
  const golem=awakenFrontierGolem(state,wall,'manual');
  return {ok:true,reason:'',golemId:golem.id};
}

// A dead golem leaves its wall breached for the rest of the siege.
export function frontierGolemDied(state,golem) {
  const wall=wallOf(state,golem);
  if(!wall||wall.destroyed) return;
  wall.golemState='destroyed';wall.destroyed=true;wall.hp=0;
  (state.destroyedClassATiles??=[]).push({x:wall.x,y:wall.y});
  (state.rubble??=[]).push({id:wall.id,type:wall.type,x:wall.x,y:wall.y,w:1,h:1});
  if(state.stats) state.stats.buildingsDestroyed=(state.stats.buildingsDestroyed??0)+1;
  state.flowRevision=(state.flowRevision??0)+1;
  emit(state,'structureDestroyed',{structureId:wall.id,typeOfStructure:wall.type,x:wall.x,y:wall.y});
}

function breachOccupied(state,golem) {
  const tx=Math.floor(golem.originX),ty=Math.floor(golem.originY),radius=CONFIG.frontier.golem.occupancyRadius;
  const inside=u=>Math.floor(u.x)===tx&&Math.floor(u.y)===ty;
  const near=u=>inside(u)||Math.hypot(u.x-golem.originX,u.y-golem.originY)<=radius;
  const units=[...state.enemies.filter(e=>e.hp>0&&!e.dead),
    ...militaryUnits(state).filter(u=>u.hp>0&&!u.sheltered&&!u.wallNodeId),
    ...(state.inhabitants??[]).filter(u=>u.hp>0&&!u.sheltered),
    ...(state.golems??[]).filter(g=>g.id!==golem.id&&g.status==='active')];
  return units.some(near)||(state.constructionSites??[]).some(s=>tx>=s.x&&ty>=s.y&&tx<s.x+s.w&&ty<s.y+s.h);
}

// Ordinary grid BFS over open ground; the golem's own breach is open while it
// is out. There is no direct line movement, so it never crosses walls or cliffs.
function returnPath(state,golem) {
  const sx=Math.floor(golem.x),sy=Math.floor(golem.y),gx=Math.floor(golem.originX),gy=Math.floor(golem.originY);
  const goal=key(gx,gy),seen=new Map([[key(sx,sy),null]]),queue=[[sx,sy]];
  for(let i=0;i<queue.length&&!seen.has(goal);i++) for(const [dx,dy] of directions) {
    const nx=queue[i][0]+dx,ny=queue[i][1]+dy,k=key(nx,ny);
    if(seen.has(k)||!isWalkable(nx,ny,state)||blockingAt(state,nx,ny)) continue;
    seen.set(k,key(...queue[i]));queue.push([nx,ny]);
  }
  if(!seen.has(goal)) return null;
  const path=[];
  for(let k=goal;k!==key(sx,sy);k=seen.get(k)) {const [x,y]=k.split(',').map(Number);path.push({x:x+.5,y:y+.5});}
  return path.reverse();
}

function reform(state,golem,wall) {
  wall.hp=Math.max(1,wall.maxHp*golem.hp/golem.maxHp);
  wall.awakened=false;wall.golemState='reforming';wall.golemTimer=CONFIG.frontier.golem.reformTime;
  golem.status='reformed';
  state.golems.splice(state.golems.indexOf(golem),1);
  reopenFlow(state);
  emit(state,'golemReform',{id:golem.id,structureId:wall.id,x:golem.originX,y:golem.originY});
}

function walkHome(state,golem,dt) {
  golem.repath=Math.max(0,golem.repath-dt);
  if(golem.pathRevision!==state.flowRevision||!golem.path&&golem.repath<=0) {
    golem.path=returnPath(state,golem);golem.pathRevision=state.flowRevision;golem.repath=CONFIG.frontier.golem.repathInterval;
  }
  let amount=golemReturnSpeed(state)*dt;
  while(golem.path?.length&&amount>0) {
    const next=golem.path[0],dx=next.x-golem.x,dy=next.y-golem.y,length=Math.hypot(dx,dy);
    if(length<=amount) {golem.x=next.x;golem.y=next.y;amount-=length;golem.path.shift();}
    else {golem.x+=dx/length*amount;golem.y+=dy/length*amount;amount=0;}
  }
  return Math.hypot(golem.x-golem.originX,golem.y-golem.originY)<1e-6;
}

export function stepFrontierGolemWalls(state,dt) {
  for(const wall of state.structures) {
    if(wall.type!=='golem'||!['reforming','cooldown'].includes(wall.golemState)) continue;
    wall.golemTimer=Math.max(0,wall.golemTimer-dt);
    if(wall.golemTimer>1e-8) continue;
    if(wall.golemState==='reforming') {wall.golemState='cooldown';wall.golemTimer=golemReuseCooldown(state);}
    else {wall.golemState='dormant';wall.golemTimer=0;}
  }
}

export function stepFrontierGolem(state,golem,dt) {
  const rules=CONFIG.frontier.golem,spec=CONFIG.golem,wall=wallOf(state,golem);
  golem.attackCooldown=Math.max(0,golem.attackCooldown-dt);
  if(golem.phase==='fighting') {
    golem.remaining=Math.max(0,golem.remaining-dt);
    const leash=golem.mode==='patrol'?rules.patrolLeash:rules.guardLeash;
    const target=golemChase(state,golem,leash,dt);
    golem.idle=target?0:golem.idle+dt;
    if(golem.remaining<=1e-8||golem.hp<=golem.maxHp*rules.returnHpFraction||golem.idle>=rules.idleReturn[golem.mode]) {
      golem.phase='returning';golem.path=null;
      if(wall) wall.golemState='returning';
    }
  } else if(walkHome(state,golem,dt)) {
    golem.phase='waiting';
    if(wall&&!breachOccupied(state,golem)) {reform(state,golem,wall);return;}
  } else golem.phase='returning';
  // Golems keep slamming adjacent enemies while they head home or wait.
  if(golem.attackCooldown<=1e-8&&state.enemies.some(e=>e.hp>0&&Math.hypot(e.x-golem.x,e.y-golem.y)<=spec.radius+1e-8)) golemSlam(state,golem);
}
