import { CONFIG } from '../../config.js';
import { stageFor } from '../../data/stages.js';
import { structureAt } from '../grid.js';
import { damageEnemy } from '../enemies.js';
import { npcWalkable, route, travel, clearRoute, nearestKeep } from './npcs.js';

const directions=[[1,0],[0,1],[-1,0],[0,-1]];
const alive=unit=>unit.hp>0&&!unit.destroyed;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const center=structure=>({x:structure.x+.5,y:structure.y+.5});
const path=(state,from,to,closedGates=false)=>route(state,{x:from.x,y:from.y},to.x,to.y,true,closedGates);

// A sortie has explicit ground waypoints on both sides of an intact gate.
// They use the ordinary friendly graph; there is no wall-crossing movement.
function gateRoutes(state,unit,keep) {
  if(!keep||!alive(keep)) return [];
  const cached=unit.gateRoutesCache,revision=state.flowRevision??0;
  if(cached&&cached.x===unit.x&&cached.y===unit.y&&cached.keepId===keep.id&&cached.revision===revision) return cached.routes;
  const home=center(keep),result=[];
  for(const gate of state.structures.filter(s=>s.type==='gate'&&alive(s))) {
    const gatePoint=center(gate);
    for(const [dx,dy] of [[1,0],[0,1]]) {
      let inside={x:gatePoint.x-dx,y:gatePoint.y-dy},outside={x:gatePoint.x+dx,y:gatePoint.y+dy};
      if(!npcWalkable(state,Math.floor(inside.x),Math.floor(inside.y))||
        !npcWalkable(state,Math.floor(outside.x),Math.floor(outside.y))) continue;
      const insideHome=path(state,inside,home,true)!==null,outsideHome=path(state,outside,home,true)!==null;
      if(!insideHome&&!outsideHome) continue;
      const separated=insideHome!==outsideHome;
      if(separated?!insideHome:distance(inside,home)>distance(outside,home)) [inside,outside]=[outside,inside];
      const homePath=path(state,inside,home),approach=path(state,unit,gatePoint);
      if(homePath===null||approach===null) continue;
      result.push({gateId:gate.id,inside,outside,gate:gatePoint,length:approach.length,separated});
    }
  }
  result.sort((a,b)=>a.length-b.length||String(a.gateId).localeCompare(String(b.gateId)));
  unit.gateRoutesCache={x:unit.x,y:unit.y,keepId:keep.id,revision,routes:result};return result;
}

function groupSize(state,target) {
  return state.enemies.filter(enemy=>alive(enemy)&&distance(enemy,target)<=CONFIG.frontier.cavalry.groupRadius).length;
}

function chooseSortie(state,unit,keep) {
  const rules=CONFIG.frontier.cavalry,home=center(keep);
  const roads=stageFor(state).map.roads??[];
  const targets=state.enemies.filter(enemy=>alive(enemy)&&enemy.type!=='boss'&&distance(enemy,home)<=rules.targetRadius&&
    groupSize(state,enemy)<=rules.maxGroup);
  if(!targets.length) return false;
  const gates=gateRoutes(state,unit,keep);
  const priority=enemy=>{
    const nearbyProperty=state.structures.some(s=>alive(s)&&['farm','barn'].includes(s.type)&&distance(enemy,center(s))<=rules.priorityRadius);
    const onRoad=roads.some(p=>Math.floor(enemy.x)===p.x&&Math.floor(enemy.y)===p.y);
    const assigned=unit.priorityRoad&&distance(enemy,unit.priorityRoad)<=rules.priorityRadius;
    return (['chiseler','powder'].includes(enemy.type)?rules.specialistPriority:0)+
      (nearbyProperty||onRoad||assigned?rules.roadPriority:0)-groupSize(state,enemy);
  };
  targets.sort((a,b)=>priority(b)-priority(a)||distance(a,unit)-distance(b,unit)||String(a.id).localeCompare(String(b.id)));
  for(const target of targets) for(const gate of gates) {
    // Outside means beyond this gate in the direction away from its keep.
    const vx=gate.outside.x-gate.gate.x,vy=gate.outside.y-gate.gate.y;
    if(gate.separated?path(state,target,home,true)!==null:(target.x-gate.gate.x)*vx+(target.y-gate.gate.y)*vy<=0) continue;
    if(path(state,gate.outside,target)===null) continue;
    unit.gateId=gate.gateId;unit.waypoints=[gate.inside,gate.gate,gate.outside];
    unit.targetId=target.id;unit.sortieRemaining=rules.sortieDuration;unit.chargeReady=true;
    unit.status='sortie';clearRoute(unit);return true;
  }
  return false;
}

function terrainFactor(state,unit) {
  const rules=CONFIG.frontier.cavalry,x=Math.floor(unit.x),y=Math.floor(unit.y);
  const caltrops=structureAt(state,x,y)?.type==='caltrops';
  const blocked=directions.filter(([dx,dy])=>!npcWalkable(state,x+dx,y+dy)).length;
  return (caltrops?rules.caltropsFactor:1)*(blocked>=rules.narrowBlocked?rules.narrowFactor:1);
}

function move(state,unit,point,dt) {
  return travel(state,unit,point.x,point.y,CONFIG.frontier.cavalry.speed*terrainFactor(state,unit)*dt);
}

function followWaypoints(state,unit,dt) {
  const point=unit.waypoints?.[0];
  if(!point) return 'arrived';
  const result=move(state,unit,point,dt);
  if(result==='arrived') {unit.waypoints.shift();clearRoute(unit);}
  return result==='blocked'?'blocked':unit.waypoints.length?'moving':'arrived';
}

function attack(state,unit,target) {
  if(unit.attackCooldown>0||distance(unit,target)>CONFIG.combat.attackRange||path(state,unit,target)===null) return false;
  const rules=CONFIG.frontier.cavalry,dense=groupSize(state,target)>=rules.maxGroup;
  const damage=(rules.damage+(unit.chargeReady?rules.chargeDamage:0))*terrainFactor(state,unit)*(dense?rules.denseFactor:1);
  damageEnemy(state,target,damage);unit.attackCooldown=rules.interval;unit.chargeReady=false;
  return true;
}

function planReturn(state,unit,keep) {
  const gates=gateRoutes(state,unit,keep);
  for(const gate of gates) {
    const approach=path(state,unit,gate.outside);
    if(approach===null) continue;
    unit.gateId=gate.gateId;unit.waypoints=[gate.outside,gate.gate,gate.inside,center(keep)];
    unit.returnRevision=state.flowRevision??0;unit.returnInside=false;unit.status='return';clearRoute(unit);return true;
  }
  unit.status='stranded';unit.waypoints=[];unit.targetId=null;clearRoute(unit);return false;
}

function shelter(state,unit,keep,dt) {
  // Rubble gates still give stranded riders a recognizable shelter location.
  const home=keep?center(keep):unit;
  const gates=state.structures.filter(s=>s.type==='gate').sort((a,b)=>distance(center(a),unit)-distance(center(b),unit)||String(a.id).localeCompare(String(b.id)));
  const gate=gates.find(g=>directions.some(([dx,dy])=>{
    const p={x:g.x+.5+dx,y:g.y+.5+dy};
    return distance(p,home)>=distance(center(g),home)&&npcWalkable(state,Math.floor(p.x),Math.floor(p.y))&&path(state,unit,p)!==null;
  }));
  const target=state.enemies.filter(e=>alive(e)&&distance(e,unit)<=CONFIG.combat.attackRange)
    .sort((a,b)=>distance(a,unit)-distance(b,unit)||String(a.id).localeCompare(String(b.id)))[0];
  unit.targetId=target?.id??null;
  if(target) {attack(state,unit,target);return;}
  if(!gate) return;
  const points=directions.map(([dx,dy])=>({x:gate.x+.5+dx,y:gate.y+.5+dy}))
    .filter(p=>distance(p,home)>=distance(center(gate),home)&&npcWalkable(state,Math.floor(p.x),Math.floor(p.y))&&path(state,unit,p)!==null)
    .sort((a,b)=>distance(a,unit)-distance(b,unit));
  if(points.length) move(state,unit,points[0],dt);
}

export function stepCavalry(state,dt) {
  const rules=CONFIG.frontier.cavalry;
  for(const unit of state.cavalry??[]) {
    if(!alive(unit)) {unit.status='dead';unit.targetId=null;continue;}
    if(unit.healingJourney) continue;
    unit.sheltered=false;unit.attackCooldown=Math.max(0,(unit.attackCooldown??0)-dt);
    const keep=state.structures.find(s=>s.id===unit.keepId&&alive(s))??nearestKeep(state,unit);
    if(!keep||!alive(keep)) {unit.status='stranded';shelter(state,unit,keep,dt);continue;}
    if(!['waiting','sortie','engage','retreat','return','rest','cooldown','stranded','sheltering'].includes(unit.status)) unit.status='waiting';
    const target=state.enemies.find(e=>e.id===unit.targetId&&alive(e));
    if(['sortie','engage'].includes(unit.status)) {
      unit.sortieRemaining=(unit.sortieRemaining??rules.sortieDuration)-dt;
      const crowded=state.enemies.filter(e=>alive(e)&&distance(e,unit)<=rules.groupRadius).length>=rules.outnumbered;
      if(unit.hp<=unit.maxHp*rules.retreatFraction||crowded||unit.sortieRemaining<=0||!target) {
        unit.status='retreat';unit.targetId=null;unit.chargeReady=false;clearRoute(unit);continue;
      }
    }
    if(unit.status==='waiting') {
      unit.decisionRemaining=Math.max(0,(unit.decisionRemaining??0)-dt);
      if(unit.decisionRemaining>0||unit.hp<=unit.maxHp*rules.retreatFraction) continue;
      unit.decisionRemaining=rules.decisionInterval;chooseSortie(state,unit,keep);continue;
    }
    if(unit.status==='sortie') {
      const gate=state.structures.find(s=>s.id===unit.gateId&&alive(s)&&s.type==='gate');
      if(!gate||followWaypoints(state,unit,dt)==='blocked') {unit.status='retreat';continue;}
      if(!unit.waypoints.length) {unit.status='engage';clearRoute(unit);}continue;
    }
    if(unit.status==='engage') {
      if(distance(unit,target)<=CONFIG.combat.attackRange) attack(state,unit,target);
      else if(move(state,unit,target,dt)==='blocked') unit.status='retreat';
      continue;
    }
    if(unit.status==='retreat') {planReturn(state,unit,keep);continue;}
    if(unit.status==='return') {
      const gate=state.structures.find(s=>s.id===unit.gateId&&alive(s)&&s.type==='gate');
      if(!unit.returnInside&&(!gate||unit.returnRevision!==(state.flowRevision??0))) {planReturn(state,unit,keep);continue;}
      const result=followWaypoints(state,unit,dt);
      const inside=unit.waypoints.length===2?unit.waypoints[0]:null;
      if(unit.waypoints.length<=1||inside&&Math.floor(unit.x)===Math.floor(inside.x)&&Math.floor(unit.y)===Math.floor(inside.y)) unit.returnInside=true;
      if(result==='blocked') {
        if(unit.returnInside) {unit.status='sheltering';unit.waypoints=[];}
        else planReturn(state,unit,keep);
      }
      else if(result==='arrived') {unit.status='rest';unit.restRemaining=rules.restDuration;unit.gateId=null;}
      continue;
    }
    if(unit.status==='sheltering') {
      const result=move(state,unit,center(keep),dt);
      if(result==='arrived') {unit.status='rest';unit.restRemaining=rules.restDuration;}
      else if(result==='blocked') {
        const nearby=state.enemies.find(e=>alive(e)&&distance(e,unit)<=CONFIG.combat.attackRange);
        if(nearby) attack(state,unit,nearby);
      }
      continue;
    }
    if(unit.status==='stranded') {
      if(unit.strandRevision!==(state.flowRevision??0)) {
        unit.strandRevision=state.flowRevision??0;
        if(planReturn(state,unit,keep)) continue;
      }
      shelter(state,unit,keep,dt);continue;
    }
    if(unit.status==='rest') {
      unit.restRemaining=Math.max(0,(unit.restRemaining??rules.restDuration)-dt);
      if(unit.restRemaining<=0) {unit.status='cooldown';unit.cooldownRemaining=rules.cooldown;}
      continue;
    }
    if(unit.status==='cooldown') {
      unit.cooldownRemaining=Math.max(0,(unit.cooldownRemaining??rules.cooldown)-dt);
      if(unit.cooldownRemaining<=0) {unit.status='waiting';unit.targetId=null;unit.decisionRemaining=0;}
    }
  }
}
