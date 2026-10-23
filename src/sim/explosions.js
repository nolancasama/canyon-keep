import { CONFIG } from '../config.js';
import { emit, damageStructure, damageGolem } from './grid.js';
import { damageEnemy } from './enemies.js';

export function queueExplosion(state,carrier) {
  if (carrier.detonated) return false;
  carrier.detonated=true;
  state.explosions.push({id:state.nextId++,sourceId:carrier.id,x:carrier.x,y:carrier.y,at:state.time+CONFIG.explosion.chainDelay});
  return true;
}

function structureTiles(state,x,y,radius) {
  const tiles=[];
  for (const s of state.structures) if (s.hp>0 && !s.destroyed) {
    for(let sy=s.y;sy<s.y+s.h;sy++) for(let sx=s.x;sx<s.x+s.w;sx++) {
      const distance=Math.hypot(sx+.5-x,sy+.5-y);
      if(distance<=radius) tiles.push({structure:s,x:sx,y:sy,distance});
    }
  }
  return tiles.sort((a,b)=>a.distance-b.distance || a.structure.id-b.structure.id || a.y-b.y || a.x-b.x);
}

export function stepExplosions(state) {
  const due=state.explosions.filter(e=>e.at<=state.time+1e-8);
  state.explosions=state.explosions.filter(e=>e.at>state.time+1e-8);
  const config=CONFIG.explosion;
  for(const blast of due) {
    const falloff=distance=>1-.5*distance/config.radius;
    for(const enemy of state.enemies) if(enemy.hp>0) {
      const distance=Math.hypot(enemy.x-blast.x,enemy.y-blast.y);
      if(distance<=config.radius) damageEnemy(state,enemy,(enemy.type==='boss'?config.bossDamage:config.unitDamage)*falloff(distance));
    }
    for(const inhabitant of state.inhabitants) if(inhabitant.hp>0 && !inhabitant.sheltered) {
      const distance=Math.hypot(inhabitant.x-blast.x,inhabitant.y-blast.y);
      if(distance<=config.radius) {
        inhabitant.hp=Math.max(0,inhabitant.hp-config.unitDamage*falloff(distance));
        state.attackMarkers.push({x:inhabitant.x,y:inhabitant.y,t:state.time});
        emit(state,'inhabitantAttacked',{x:inhabitant.x,y:inhabitant.y,id:inhabitant.id});
      }
    }
    for(const golem of state.golems??[]) if(golem.status==='active') {
      const distance=Math.hypot(golem.x-blast.x,golem.y-blast.y);
      if(distance<=config.radius) damageGolem(state,golem,config.unitDamage*falloff(distance));
    }
    const tiles=structureTiles(state,blast.x,blast.y,config.radius).slice(0,config.structureTileCap);
    for(const tile of tiles) damageStructure(state,tile.structure,config.structureDamage*falloff(tile.distance));
    emit(state,'explosion',{x:blast.x,y:blast.y,radius:config.radius,structureTiles:tiles.map(t=>({x:t.x,y:t.y,id:t.structure.id})),sourceId:blast.sourceId});
  }
}
