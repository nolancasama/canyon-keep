import { CONFIG } from '../config.js';
import { SITES } from '../data/map.js';
import { isWalkable, blockingAt, emit, damageStructure } from './grid.js';
import { damageEnemy } from './enemies.js';
import { deviceCooldown } from './frontier/skills.js';

function siteFor(pendulum) { return SITES.find(site=>String(site.id)===String(pendulum.siteId)); }
const ease = progress => (1-Math.cos(Math.PI*progress))/2;

// Pure renderer/debug helper. The pivot is the centre of the mount tile.
export function hammerPosition(pendulum) {
  const site=siteFor(pendulum);
  if(!site) return {x:pendulum.x+.5,y:pendulum.y+.5,angle:0};
  const angle=pendulum.angle??(site.centerAngle-site.halfSweep);
  return {x:site.pivotX+Math.cos(angle)*site.armLength,y:site.pivotY+Math.sin(angle)*site.armLength,angle};
}

export function triggerPendulum(state) {
  const pendulum=state.pendulum;
  if(state.phase!=='siege'||!pendulum||pendulum.status!=='ready') return false;
  const site=siteFor(pendulum);
  if(!site) return false;
  pendulum.status='released';pendulum.elapsed=0;pendulum.resetRemaining=0;
  pendulum.swingId=(pendulum.swingId||0)+1;pendulum.hitIds=[];
  pendulum.angle=site.centerAngle-site.halfSweep;pendulum.drumAngle=pendulum.drumAngle||0;
  emit(state,'pendulumRelease',{x:site.x+.5,y:site.y+.5,swingId:pendulum.swingId});
  return true;
}

function touchStructure(position,structure,radius) {
  return Math.hypot(Math.max(structure.x-position.x,0,position.x-structure.x-structure.w),Math.max(structure.y-position.y,0,position.y-structure.y-structure.h))<=radius;
}

function hitSweep(state,pendulum,site,previousAngle) {
  const head=hammerPosition(pendulum),config=CONFIG.pendulum;
  let hits=0;
  for(const enemy of state.enemies) {
    // Continuous head-circle collision over this tick's arc avoids gaps at the
    // edge of the strike band. The arm itself never participates in collision.
    const relative=Math.atan2(enemy.y-site.pivotY,enemy.x-site.pivotX);
    const unwrapped=relative+Math.round((head.angle-relative)/(2*Math.PI))*2*Math.PI;
    const angle=Math.max(previousAngle,Math.min(head.angle,unwrapped));
    const hx=site.pivotX+Math.cos(angle)*site.armLength,hy=site.pivotY+Math.sin(angle)*site.armLength;
    if(enemy.hp<=0||pendulum.hitIds.includes(enemy.id)||Math.hypot(enemy.x-hx,enemy.y-hy)>config.radius) continue;
    const tangent={x:-Math.sin(angle),y:Math.cos(angle)};
    pendulum.hitIds.push(enemy.id);hits++;
    damageEnemy(state,enemy,enemy.type==='boss'?config.bossDamage:config.damage);
    if(enemy.type==='boss') enemy.slowRemaining=config.slowDuration;
    else {
      enemy.stunRemaining=config.stun;
      // Subdivide the shove so it cannot teleport through cliffs or walls.
      const pieces=Math.ceil(config.knockback/config.knockbackStep);
      for(let i=0;i<pieces;i++) {
        const nx=enemy.x+tangent.x*config.knockback/pieces,ny=enemy.y+tangent.y*config.knockback/pieces;
        if(!isWalkable(Math.floor(nx),Math.floor(ny),state)||blockingAt(state,Math.floor(nx),Math.floor(ny))) break;
        enemy.x=nx;enemy.y=ny;
      }
      enemy.walkTarget=null;
    }
    emit(state,'pendulumHit',{x:enemy.x,y:enemy.y,id:enemy.id,enemyType:enemy.type,swingId:pendulum.swingId});
  }
  for(const structure of [...state.structures]) {
    if(structure.hp<=0||structure.destroyed||pendulum.hitIds.includes(structure.id)||!touchStructure(head,structure,config.radius)) continue;
    pendulum.hitIds.push(structure.id);hits++;
    damageStructure(state,structure,config.structureDamage);
    emit(state,'pendulumHit',{x:structure.x+structure.w/2,y:structure.y+structure.h/2,id:structure.id,structure:true,swingId:pendulum.swingId});
  }
  if(hits) emit(state,'pendulumImpact',{x:head.x,y:head.y,hits,swingId:pendulum.swingId});
}

export function stepPendulum(state,dt) {
  const p=state.pendulum;
  if(!p) return;
  const site=siteFor(p),config=CONFIG.pendulum;
  if(!site) return;
  const start=site.centerAngle-site.halfSweep,end=site.centerAngle+site.halfSweep;
  if(p.status==='ready') {p.angle=start;return;}
  p.elapsed=(p.elapsed||0)+dt;
  if(p.status==='released') {
    const progress=Math.min(1,p.elapsed/config.duration);
    const previousAngle=p.angle??start;
    p.angle=start+(end-start)*ease(progress);
    hitSweep(state,p,site,previousAngle);
    if(progress>=1-1e-8) {
      p.status='resetting';p.elapsed=0;p.resetRemaining=deviceCooldown(state,config.reset);
      emit(state,'pendulumReset',{x:site.x+.5,y:site.y+.5,swingId:p.swingId});
    }
  } else if(p.status==='resetting') {
    const reset=deviceCooldown(state,config.reset);
    p.resetRemaining=Math.max(0,reset-p.elapsed);
    const progress=Math.min(1,p.elapsed/reset);
    p.angle=end+(start-end)*ease(progress);
    p.drumAngle=(p.drumAngle||0)+dt*config.drumSpeed;
    if(p.resetRemaining<=1e-8) {
      p.status='ready';p.angle=start;p.elapsed=0;p.resetRemaining=0;
      emit(state,'pendulumReady',{x:site.x+.5,y:site.y+.5});
    }
  }
}
