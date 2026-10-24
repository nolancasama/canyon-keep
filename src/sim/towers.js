import { CONFIG } from '../config.js';
import { emit } from './grid.js';
import { damageEnemy } from './enemies.js';

export function stepTowers(state,dt) {
  const config=CONFIG.tower;
  for(const tower of state.structures) {
    if(tower.type!=='tower'||tower.hp<=0||tower.destroyed) continue;
    tower.shotCooldown=Math.max(0,(tower.shotCooldown||0)-dt);
    if(tower.shotCooldown>1e-8) continue;
    let target=null,distance=Infinity;
    for(const enemy of state.enemies) if(enemy.hp>0) {
      const d=Math.hypot(enemy.x-tower.x-.5,enemy.y-tower.y-.5);
      if(d<=config.range && d<distance) {target=enemy;distance=d;}
    }
    if(target) {
      tower.shotCooldown=1/config.rate;
      state.arrows.push({id:state.nextId++,x:tower.x+.5,y:tower.y+.5,targetId:target.id,damage:config.damage});
      emit(state,'arrow',{x:tower.x+.5,y:tower.y+.5,targetId:target.id});
    }
  }
  const remaining=[];
  for(const arrow of state.arrows) {
    const target=state.enemies.find(enemy=>enemy.id===arrow.targetId);
    if(!target || target.hp<=0) continue;
    const dx=target.x-arrow.x,dy=target.y-arrow.y,distance=Math.hypot(dx,dy),travel=(arrow.projectileSpeed??config.projectileSpeed)*dt;
    if(distance<=travel) damageEnemy(state,target,arrow.damage);
    else {arrow.x+=dx/distance*travel;arrow.y+=dy/distance*travel;remaining.push(arrow);}
  }
  state.arrows=remaining;
}
