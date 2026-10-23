import { CONFIG } from '../config.js';
import { isWalkable, structureAt, emit, damageGolem } from './grid.js';
import { damageEnemy } from './enemies.js';

function knockback(state,enemy,golem) {
  let dx=enemy.x-golem.x,dy=enemy.y-golem.y,length=Math.hypot(dx,dy);
  if(length<1e-8) {dx=-1;dy=0;length=1;}
  const spec=CONFIG.golem,pieces=Math.ceil(spec.knockback/spec.knockbackStep);
  for(let i=0;i<pieces;i++) {
    const nx=enemy.x+dx/length*spec.knockback/pieces,ny=enemy.y+dy/length*spec.knockback/pieces;
    if(!isWalkable(Math.floor(nx),Math.floor(ny))||structureAt(state,Math.floor(nx),Math.floor(ny))) break;
    enemy.x=nx;enemy.y=ny;
  }
  enemy.walkTarget=null;
  enemy.stunRemaining=Math.max(enemy.stunRemaining,CONFIG.golem.stun);
  enemy.attackPhase='stunned';enemy.windupRemaining=0;
}

export function stepGolems(state,dt) {
  const spec=CONFIG.golem;
  for(const golem of state.golems) {
    if(golem.status!=='active') continue;
    golem.remaining=Math.max(0,golem.remaining-dt);
    if(golem.remaining<=1e-8) {golem.remaining=0;damageGolem(state,golem,golem.hp);continue;}
    golem.attackCooldown=Math.max(0,golem.attackCooldown-dt);
    let target=null,distance=Infinity;
    for(const enemy of state.enemies) if(enemy.hp>0 && Math.hypot(enemy.x-golem.originX,enemy.y-golem.originY)<=spec.leash+spec.radius) {
      const d=Math.hypot(enemy.x-golem.x,enemy.y-golem.y);
      if(d<distance) {target=enemy;distance=d;}
    }
    if(!target) continue;
    if(distance>spec.radius) {
      const step=Math.min(spec.speed*dt,distance-spec.radius);
      let nx=golem.x+(target.x-golem.x)/distance*step,ny=golem.y+(target.y-golem.y)/distance*step;
      const fromOrigin=Math.hypot(nx-golem.originX,ny-golem.originY);
      if(fromOrigin>spec.leash) {
        nx=golem.originX+(nx-golem.originX)/fromOrigin*spec.leash;
        ny=golem.originY+(ny-golem.originY)/fromOrigin*spec.leash;
      }
      if(isWalkable(Math.floor(nx),Math.floor(ny))&&!structureAt(state,Math.floor(nx),Math.floor(ny))) {golem.x=nx;golem.y=ny;}
    }
    if(golem.attackCooldown>1e-8 || !state.enemies.some(e=>e.hp>0&&Math.hypot(e.x-golem.x,e.y-golem.y)<=spec.radius+1e-8)) continue;
    golem.attackCooldown=spec.interval;
    for(const enemy of state.enemies) if(enemy.hp>0 && Math.hypot(enemy.x-golem.x,enemy.y-golem.y)<=spec.radius+1e-8) {
      damageEnemy(state,enemy,spec.damage);
      if(enemy.hp>0) knockback(state,enemy,golem);
    }
    emit(state,'golemSlam',{id:golem.id,x:golem.x,y:golem.y,radius:spec.radius});
  }
}
