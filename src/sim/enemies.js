import { CONFIG } from '../config.js';
import { SPAWNS } from '../data/map.js';
import { SIEGES } from '../data/sieges.js';
import { structureAt, isWalkable, emit, damageStructure } from './grid.js';
import { nextStep } from './pathing.js';
import { queueExplosion } from './explosions.js';

export const isAlive = enemy => enemy.hp > 0;

export function spawnEnemy(state,type,x,y,lane=0) {
  const spec=CONFIG.enemies[type];
  if(!spec) throw new Error(`Unknown enemy type: ${type}`);
  const spawn=SPAWNS[((lane||0)%SPAWNS.length+SPAWNS.length)%SPAWNS.length];
  const hp=type==='boss' ? SIEGES[state.siegeIndex||1].bossHp : spec.hp;
  const enemy={id:state.nextId++,type,x:x??spawn.x+.5,y:y??spawn.y+.5,hp,maxHp:hp,
    attackPhase:'moving',attackTargetId:null,windupRemaining:0,slamCooldown:0,
    stunRemaining:0,slowRemaining:0,chipClock:0,detonated:false,dead:false};
  state.enemies.push(enemy);
  if(type==='boss') emit(state,'bossSpawn',{id:enemy.id,x:enemy.x,y:enemy.y});
  return enemy;
}

export function damageEnemy(state,enemy,amount) {
  if(enemy.hp<=0 || amount<=0) return false;
  enemy.hp=Math.max(0,enemy.hp-amount);
  if(enemy.hp===0) {
    enemy.dead=true; enemy.attackPhase='dead';
    const bounty=CONFIG.bounties[enemy.type];
    state.gold+=bounty;
    if(state.stats) {
      state.stats.enemiesDefeated++;
      state.stats.bountyGold=(state.stats.bountyGold??0)+bounty;
      const counts=state.stats.bountyCounts??={};
      counts[enemy.type]=(counts[enemy.type]??0)+1;
      if(enemy.type==='boss') state.stats.bossDefeated=true;
    }
    emit(state,'enemyDeath',{id:enemy.id,enemyType:enemy.type,x:enemy.x,y:enemy.y});
    emit(state,'bounty',{id:enemy.id,enemyType:enemy.type,x:enemy.x,y:enemy.y,amount:bounty});
    if(enemy.type==='powder') queueExplosion(state,enemy);
  }
  return true;
}

function distanceToStructure(e,s) {
  return Math.hypot(Math.max(s.x-e.x,0,e.x-(s.x+s.w)),Math.max(s.y-e.y,0,e.y-(s.y+s.h)));
}

function moveToward(state,enemy,x,y,distance) {
  const dx=x-enemy.x,dy=y-enemy.y,length=Math.hypot(dx,dy);
  if(length===0) return;
  const scale=Math.min(distance,length)/length;
  const nx=enemy.x+dx*scale,ny=enemy.y+dy*scale;
  if(isWalkable(Math.floor(nx),Math.floor(ny)) && !structureAt(state,Math.floor(nx),Math.floor(ny))) {
    enemy.x=nx; enemy.y=ny;
    if(length<=distance+1e-8) enemy.walkTarget=null;
  }
}

function markKeepReached(state,enemy,target) {
  if(target.type==='keep' && !enemy.keepReached) {
    enemy.keepReached=true;
    state.stats.keepReachedEnemies=(state.stats.keepReachedEnemies??0)+1;
  }
  if(target.type==='keep' && !state.keepReached) {
    state.keepReached=true;
    emit(state,'keepReached',{id:enemy.id,x:enemy.x,y:enemy.y});
  }
}

function slam(state,enemy,target) {
  const spec=CONFIG.enemies.boss;
  const x=Math.max(target.x,Math.min(enemy.x,target.x+target.w));
  const y=Math.max(target.y,Math.min(enemy.y,target.y+target.h));
  for(const s of state.structures) if(s.hp>0 && !s.destroyed && distanceToStructure({x,y},s)<=spec.slamRadius) damageStructure(state,s,spec.slamDamage);
  for(const other of state.enemies) if(other.id!==enemy.id && other.hp>0 && Math.hypot(other.x-x,other.y-y)<=spec.slamRadius) damageEnemy(state,other,spec.slamDamage);
  enemy.attackPhase='slamming';
  enemy.slamCooldown=CONFIG.combat.bossSlamCooldown;
  emit(state,'bossSlam',{id:enemy.id,x,y,radius:spec.slamRadius});
}

function attackStructure(state,enemy,target,dt) {
  const spec=CONFIG.enemies[enemy.type];
  enemy.attackTargetId=target.id;
  markKeepReached(state,enemy,target);
  if(enemy.type==='boss') {
    if(enemy.slamCooldown>0) return;
    if(enemy.attackPhase!=='windup') {
      enemy.attackPhase='windup'; enemy.windupRemaining=spec.windup;
      emit(state,'bossWindup',{id:enemy.id,x:enemy.x,y:enemy.y,targetId:target.id});
    }
    enemy.windupRemaining=Math.max(0,enemy.windupRemaining-dt);
    if(enemy.windupRemaining<=1e-8) slam(state,enemy,target);
    return;
  }
  enemy.attackPhase='attacking';
  damageStructure(state,target,spec.structDps*dt);
  if(enemy.type==='chiseler') {
    enemy.chipClock-=dt;
    if(enemy.chipClock<=0) {
      enemy.chipClock+=CONFIG.combat.chiselChipInterval;
      emit(state,'chisel',{id:enemy.id,x:enemy.x,y:enemy.y,targetX:target.x+.5,targetY:target.y+.5});
    }
  }
}

function attackInhabitant(state,enemy,inhabitant,dt) {
  if(Math.hypot(enemy.x-inhabitant.x,enemy.y-inhabitant.y)>CONFIG.combat.attackRange) return false;
  inhabitant.hp=Math.max(0,inhabitant.hp-CONFIG.enemies[enemy.type].unitDps*dt);
  enemy.attackPhase='attacking'; enemy.attackTargetId=inhabitant.id;
  if(!inhabitant.attacked) {
    inhabitant.attacked=true;
    state.attackMarkers.push({x:inhabitant.x,y:inhabitant.y,t:state.time});
    emit(state,'inhabitantAttacked',{id:inhabitant.id,x:inhabitant.x,y:inhabitant.y});
  }
  return true;
}

export function stepEnemies(state,dt) {
  for(const enemy of state.enemies) {
    if(enemy.hp<=0) continue;
    enemy.stunRemaining=Math.max(0,(enemy.stunRemaining||0)-dt);
    enemy.slowRemaining=Math.max(0,(enemy.slowRemaining||0)-dt);
    enemy.slamCooldown=Math.max(0,(enemy.slamCooldown||0)-dt);
    if(enemy.stunRemaining>0) {enemy.attackPhase='stunned';continue;}
    const speed=CONFIG.enemies[enemy.type].speed*(enemy.slowRemaining>0?CONFIG.pendulum.slowFactor:1);
    const inhabitant=state.inhabitants.find(person=>person.hp>0 && !person.sheltered && Math.hypot(person.x-enemy.x,person.y-enemy.y)<=CONFIG.inhabitants.chaseRadius);
    if(inhabitant) {
      if(!attackInhabitant(state,enemy,inhabitant,dt)) {
        enemy.attackPhase='moving';moveToward(state,enemy,inhabitant.x,inhabitant.y,speed*dt);
      }
      continue;
    }
    // Pillaging remains local to the chosen route, never a map-wide detour.
    const pillage=enemy.type==='foot' && (state.structures.find(s=>s.id===enemy.pillageTargetId&&s.hp>0&&!s.destroyed) || state.structures.find(s=>s.hp>0 && !s.destroyed && (s.type==='house'||s.type==='farm') && distanceToStructure(enemy,s)<=CONFIG.combat.pillageRadius));
    enemy.pillageTargetId=pillage?.id??null;
    if(enemy.walkTarget && Math.hypot(enemy.x-enemy.walkTarget.x-.5,enemy.y-enemy.walkTarget.y-.5)<1e-8) enemy.walkTarget=null;
    const step=enemy.walkTarget || nextStep(state,enemy.x,enemy.y);
    enemy.walkTarget=step;
    const target=pillage || (step && structureAt(state,step.x,step.y));
    if(target) {
      if(distanceToStructure(enemy,target)<=CONFIG.combat.attackRange) attackStructure(state,enemy,target,dt);
      else {
        enemy.attackPhase='moving';
        moveToward(state,enemy,target.x+target.w/2,target.y+target.h/2,speed*dt);
      }
      continue;
    }
    enemy.attackPhase='moving';enemy.attackTargetId=null;enemy.windupRemaining=0;
    if(step) moveToward(state,enemy,step.x+.5,step.y+.5,speed*dt);
  }
  // Small, bounded separation; do not push units into cliffs or structures.
  const live=state.enemies.filter(isAlive);
  for(let i=0;i<live.length;i++) for(let j=i+1;j<live.length;j++) {
    const a=live[i],b=live[j];
    if(a.attackPhase!=='moving' || b.attackPhase!=='moving') continue;
    let dx=a.x-b.x,dy=a.y-b.y,length=Math.hypot(dx,dy);
    if(length>=CONFIG.combat.separationRadius) continue;
    if(length<1e-8) {dx=0;dy=a.id<b.id?-1:1;length=1;}
    const push=CONFIG.combat.separationStrength*dt;
    for(const [unit,sign] of [[a,1],[b,-1]]) {
      const nx=unit.x+sign*dx/length*push,ny=unit.y+sign*dy/length*push;
      if(isWalkable(Math.floor(nx),Math.floor(ny))&&!structureAt(state,Math.floor(nx),Math.floor(ny))) {unit.x=nx;unit.y=ny;}
    }
  }
}
