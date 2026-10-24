import { CONFIG } from '../config.js';
import { isWalkable, blockingAt, emit } from './grid.js';
import { damageEnemy } from './enemies.js';
import { rebuildFlow } from './pathing.js';

export const FACINGS = ['N', 'E', 'S', 'W'];
const DIRECTIONS = { N: [0,-1], E: [1,0], S: [0,1], W: [-1,0] };
const living = s => s && !s.destroyed && s.hp > 0;
const deviceType = s => !!CONFIG.structures[s?.type]?.device;
const find = (state,id) => state.structures.find(s=>s.id===id && living(s));

export function initializeMechanism(s, options = {}) {
  if(s.type==='sensor') {
    s.links ??= [];s.delay ??= CONFIG.sensor.delays[0];
    s.cooldown=0;s.pending=null;s.flashRemaining=0;
  }
  if(s.type==='launcher') {
    s.facing=FACINGS.includes(options.facing)?options.facing:(s.facing??'E');
    s.cooldown=0;s.volleyRemaining=0;s.volleyTimer=0;s.muzzleRemaining=0;
  }
  if(s.type==='retractable') {s.status='lowered';s.elapsed=0;s.waitElapsed=0;s.cooldown=0;}
}

export function resetMechanisms(state) {
  state.bolts=[];
  for(const s of state.structures) initializeMechanism(s);
  pruneLinks(state);
}

export function pruneLinks(state) {
  const ids=new Set(state.structures.filter(deviceType).map(s=>s.id));
  for(const s of state.structures) if(s.links) s.links=s.links.filter(id=>ids.has(id));
}

export function toggleLink(state,sensorId,deviceId) {
  const sensor=find(state,sensorId),device=find(state,deviceId);
  if(state.phase!=='prep'||sensor?.type!=='sensor'||!deviceType(device)) return {ok:false,reason:'Choose a sensor and a living device during preparation'};
  const index=sensor.links.indexOf(deviceId);
  if(index>=0) sensor.links.splice(index,1);
  else {
    if(sensor.links.length>=CONFIG.sensor.maxLinks) return {ok:false,reason:`A sensor links to at most ${CONFIG.sensor.maxLinks} devices`};
    sensor.links.push(deviceId);
  }
  return {ok:true};
}

export function cycleSensorDelay(state,id) {
  const s=find(state,id),delays=CONFIG.sensor.delays;
  if(state.phase!=='prep'||s?.type!=='sensor') return {ok:false};
  s.delay=delays[(delays.indexOf(s.delay)+1)%delays.length];
  return {ok:true,delay:s.delay};
}

export function rotateLauncher(state,id) {
  const s=find(state,id);
  if(state.phase!=='prep'||s?.type!=='launcher') return {ok:false};
  s.facing=FACINGS[(FACINGS.indexOf(s.facing)+1)%FACINGS.length];
  return {ok:true,facing:s.facing};
}

export function mechanismWarnings(state) {
  const sensors=state.structures.filter(s=>living(s)&&s.type==='sensor');
  const linked=new Set(sensors.flatMap(s=>s.links));
  const warnings=[];
  const empty=sensors.filter(s=>!s.links.some(id=>deviceType(find(state,id)))).length;
  const idle=state.structures.filter(s=>living(s)&&deviceType(s)&&!linked.has(s.id)).length;
  if(empty) warnings.push(`${empty} sensor${empty===1?' has':'s have'} no linked devices`);
  if(idle) warnings.push(`${idle} device${idle===1?' is':'s are'} unlinked`);
  return warnings;
}

// Axis-aligned lane ends at the near face of the first obstruction.
export function launcherLane(state,device,from = 0) {
  const [dx,dy]=DIRECTIONS[device.facing]??DIRECTIONS.E;
  const x=device.x+.5,y=device.y+.5;
  let range=CONFIG.launcher.range;
  for(let step=Math.max(1,Math.floor(from+.5));step<=Math.ceil(range);step++) {
    const tx=Math.floor(x+dx*step),ty=Math.floor(y+dy*step);
    if(!isWalkable(tx,ty,state)||blockingAt(state,tx,ty)) {range=Math.min(range,Math.max(from,step-.5));break;}
  }
  return {x,y,dx,dy,range,endX:x+dx*range,endY:y+dy*range};
}

function fireBolt(state,device) {
  const lane=launcherLane(state,device);
  (state.bolts??=[]).push({id:state.nextId++,sourceId:device.id,x:lane.x,y:lane.y,
    originX:lane.x,originY:lane.y,dx:lane.dx,dy:lane.dy,distance:0,hitIds:[]});
  device.muzzleRemaining=CONFIG.launcher.muzzleDuration;
  emit(state,'launcherFire',{structureId:device.id,x:lane.x,y:lane.y,facing:device.facing});
}

function occupied(state,s) {
  const units=[...state.enemies,...state.inhabitants,...(state.golems??[]).filter(g=>g.status==='active')];
  return units.some(u=>u.hp>0&&(Math.hypot(u.x-s.x-.5,u.y-s.y-.5)<=CONFIG.retractable.occupancyRadius ||
    u.x>=s.x&&u.y>=s.y&&u.x<s.x+1&&u.y<s.y+1));
}

function changeBlocking(state,s,status,event) {
  s.status=status;s.elapsed=0;
  state.flowRevision=(state.flowRevision??0)+1;
  for(const enemy of state.enemies) enemy.walkTarget=null;
  rebuildFlow(state);
  emit(state,event,{structureId:s.id,x:s.x+.5,y:s.y+.5});
}

function skipRaise(state,s) {
  s.status='cooldown';s.elapsed=0;s.cooldown=CONFIG.retractable.cooldown;
  emit(state,'wallSkip',{structureId:s.id,x:s.x+.5,y:s.y+.5});
}

// Device types register their own activation and timer behavior; triggers know
// only activate(), and the per-tick caller knows only stepMechanisms().
export const registry = {
  retractable: {
    activate(state,s) {
      if(s.status!=='lowered'||s.cooldown>1e-8) return false;
      s.status=occupied(state,s)?'waiting':'rising';s.elapsed=0;s.waitElapsed=0;
      return true;
    },
    step(state,s,dt) {
      const rules=CONFIG.retractable;
      if(s.status==='lowered') return;
      if(s.status==='cooldown') {
        s.cooldown=Math.max(0,s.cooldown-dt);
        if(s.cooldown<=1e-8) {s.cooldown=0;s.status='lowered';s.elapsed=0;}
        return;
      }
      if(s.status==='waiting'||s.status==='rising') {
        if(occupied(state,s)) {
          s.status='waiting';s.elapsed=0;s.waitElapsed+=dt;
          if(s.waitElapsed>=rules.wait-1e-8) skipRaise(state,s);
          return;
        }
        s.status='rising';s.elapsed+=dt;
        if(s.elapsed>=rules.rise-1e-8) changeBlocking(state,s,'raised','wallRaise');
        return;
      }
      s.elapsed+=dt;
      if(s.status==='raised'&&s.elapsed>=rules.hold-1e-8) changeBlocking(state,s,'lowering','wallLower');
      else if(s.status==='lowering'&&s.elapsed>=rules.lower-1e-8) {
        s.status='cooldown';s.elapsed=0;s.cooldown=rules.cooldown;
      }
    },
  },
  launcher: {
    activate(state,s) {
      if(s.cooldown>1e-8) return false;
      s.cooldown=CONFIG.launcher.cooldown;
      s.volleyRemaining=CONFIG.launcher.bolts-1;s.volleyTimer=CONFIG.launcher.interval;
      fireBolt(state,s);
      return true;
    },
    step(state,s,dt) {
      s.cooldown=Math.max(0,s.cooldown-dt);
      s.muzzleRemaining=Math.max(0,s.muzzleRemaining-dt);
      if(!s.volleyRemaining) return;
      s.volleyTimer-=dt;
      while(s.volleyRemaining>0&&s.volleyTimer<=1e-8) {
        fireBolt(state,s);s.volleyRemaining--;s.volleyTimer+=CONFIG.launcher.interval;
      }
    },
  },
};

export function activate(state,device) {
  return state.phase==='siege' && living(device) && state.structures.includes(device) &&
    (registry[device.type]?.activate(state,device)??false);
}

function fireSensor(state,s) {
  s.pending=null;s.cooldown=CONFIG.sensor.cooldown;s.flashRemaining=CONFIG.sensor.flashDuration;
  for(const id of s.links) {
    const device=find(state,id);
    if(device) activate(state,device);
  }
  emit(state,'sensorFire',{structureId:s.id,x:s.x+.5,y:s.y+.5,links:[...s.links]});
}

function stepSensor(state,s,dt) {
  s.cooldown=Math.max(0,s.cooldown-dt);
  s.flashRemaining=Math.max(0,s.flashRemaining-dt);
  if(s.pending!==null) {
    s.pending=Math.max(0,s.pending-dt);
    if(s.pending<=1e-8) fireSensor(state,s);
    return;
  }
  if(s.cooldown>1e-8 || !state.enemies.some(e=>e.hp>0&&Math.hypot(e.x-s.x-.5,e.y-s.y-.5)<=CONFIG.sensor.radius)) return;
  s.pending=s.delay;
  if(s.pending<=1e-8) fireSensor(state,s);
}

function stepBolts(state,dt) {
  state.bolts=(state.bolts??[]).filter(b=>{
    const facing=b.dx>0?'E':b.dx<0?'W':b.dy>0?'S':'N';
    const lane=launcherLane(state,{x:b.originX-.5,y:b.originY-.5,facing},b.distance);
    const previous=b.distance;
    b.distance=Math.min(lane.range,b.distance+CONFIG.launcher.projectileSpeed*dt);
    b.x=b.originX+b.dx*b.distance;b.y=b.originY+b.dy*b.distance;
    for(const enemy of state.enemies) {
      const ex=enemy.x-b.originX,ey=enemy.y-b.originY;
      const along=ex*b.dx+ey*b.dy,cross=Math.abs(ex*b.dy-ey*b.dx);
      if(enemy.hp<=0||b.hitIds.includes(enemy.id)||along<previous-1e-8||along>b.distance+1e-8||cross>CONFIG.launcher.laneRadius) continue;
      b.hitIds.push(enemy.id);damageEnemy(state,enemy,CONFIG.launcher.damage);
    }
    return b.distance<lane.range-1e-8;
  });
}

export function stepMechanisms(state,dt) {
  if(state.phase!=='siege') return;
  for(const s of state.structures) if(living(s)) registry[s.type]?.step?.(state,s,dt);
  for(const s of state.structures) if(living(s)&&s.type==='sensor') stepSensor(state,s,dt);
  stepBolts(state,dt);
}
