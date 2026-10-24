import { CONFIG } from '../config.js';
import { structureAt, blockingAt, blocksStructure, isWalkable, emit, damageStructure, damageGolem } from './grid.js';
import { nextStep } from './pathing.js';
import { queueExplosion } from './explosions.js';
import { stageFor, siegeFor } from '../data/stages.js';
import { engageFrontierNpc } from './frontier/npcs.js';

export const isAlive = enemy => enemy.hp > 0;

export function spawnEnemy(state,type,x,y,lane=0) {
  const spec=CONFIG.enemies[type];
  if(!spec) throw new Error(`Unknown enemy type: ${type}`);
  const spawns=stageFor(state).map.spawns;
  const spawn=spawns[((lane||0)%spawns.length+spawns.length)%spawns.length];
  const hp=type==='boss' ? siegeFor(state).bossHp : spec.hp;
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
    if(!stageFor(state).flags.contractPayment) state.gold+=bounty;
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

function canReachGolem(state,enemy,golem) {
  const distance=Math.hypot(golem.x-enemy.x,golem.y-enemy.y);
  const pieces=Math.max(1,Math.ceil(distance/CONFIG.golem.knockbackStep));
  for(let i=1;i<=pieces;i++) {
    const x=Math.floor(enemy.x+(golem.x-enemy.x)*i/pieces),y=Math.floor(enemy.y+(golem.y-enemy.y)*i/pieces);
    if(!isWalkable(x,y,state)||blockingAt(state,x,y)) return false;
  }
  return true;
}

function moveToward(state,enemy,x,y,distance) {
  const dx=x-enemy.x,dy=y-enemy.y,length=Math.hypot(dx,dy);
  if(length===0) return;
  const scale=Math.min(distance,length)/length;
  const nx=enemy.x+dx*scale,ny=enemy.y+dy*scale;
  if(isWalkable(Math.floor(nx),Math.floor(ny),state) && !blockingAt(state,Math.floor(nx),Math.floor(ny))) {
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
  for(const s of [...state.structures]) if(s.hp>0 && !s.destroyed && distanceToStructure({x,y},s)<=spec.slamRadius) damageStructure(state,s,spec.slamDamage);
  for(const other of state.enemies) if(other.id!==enemy.id && other.hp>0 && Math.hypot(other.x-x,other.y-y)<=spec.slamRadius) damageEnemy(state,other,spec.slamDamage);
  if(state.stageId==='frontier') for(const unit of [...state.guards,...state.militia,...state.inhabitants]) {
    if(unit.hp<=0||unit.sheltered||Math.hypot(unit.x-x,unit.y-y)>spec.slamRadius) continue;
    unit.hp=Math.max(0,unit.hp-spec.slamDamage);
    if(unit.hp<=0) {unit.status='dead';emit(state,'npcDeath',{id:unit.id,npcType:unit.type??'civilian',x:unit.x,y:unit.y});}
  }
  enemy.attackPhase='slamming';
  enemy.slamCooldown=CONFIG.combat.bossSlamCooldown;
  emit(state,'bossSlam',{id:enemy.id,x,y,radius:spec.slamRadius});
}

function attackStructure(state,enemy,target,dt) {
  const spec=CONFIG.enemies[enemy.type];
  enemy.attackTargetId=target.id;
  markKeepReached(state,enemy,target);
  if(target.type==='spiked') {
    damageEnemy(state,enemy,CONFIG.spiked.dps*dt);
    enemy.spikeClock=(enemy.spikeClock??0)-dt;
    if(enemy.spikeClock<=0) {
      enemy.spikeClock=CONFIG.spiked.feedbackInterval;
      emit(state,'spikeHit',{id:enemy.id,x:enemy.x,y:enemy.y});
    }
    if(enemy.hp<=0) return;
  }
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
    if(state.stageId==='frontier') enemy.caltropSlowRemaining=Math.max(0,(enemy.caltropSlowRemaining||0)-dt);
    enemy.slamCooldown=Math.max(0,(enemy.slamCooldown||0)-dt);
    if(enemy.stunRemaining>0) {enemy.attackPhase='stunned';continue;}
    const speed=CONFIG.enemies[enemy.type].speed*(enemy.slowRemaining>0?CONFIG.pendulum.slowFactor:1)*
      (state.stageId==='frontier'&&enemy.caltropSlowRemaining>0?CONFIG.frontier.caltrops.slowFactor:1);
    const keepOnly=stageFor(state).flags.contractPayment&&enemy.type==='boss';
    const golem=!keepOnly&&(state.golems??[]).find(unit=>unit.status==='active' && Math.hypot(unit.x-enemy.x,unit.y-enemy.y)<=CONFIG.golem.chaseRadius && canReachGolem(state,enemy,unit));
    if(golem) {
      enemy.attackTargetId=golem.id;enemy.windupRemaining=0;enemy.walkTarget=null;
      if(Math.hypot(enemy.x-golem.x,enemy.y-golem.y)<=CONFIG.combat.attackRange) {
        enemy.attackPhase='attacking';damageGolem(state,golem,CONFIG.enemies[enemy.type].unitDps*dt);
      } else {enemy.attackPhase='moving';moveToward(state,enemy,golem.x,golem.y,speed*dt);}
      continue;
    }
    if(state.stageId==='frontier'&&engageFrontierNpc(state,enemy,speed,dt)) continue;
    const inhabitant=state.stageId!=='frontier'&&!keepOnly&&state.inhabitants.find(person=>person.hp>0 && !person.sheltered && Math.hypot(person.x-enemy.x,person.y-enemy.y)<=CONFIG.inhabitants.chaseRadius);
    if(inhabitant) {
      if(!attackInhabitant(state,enemy,inhabitant,dt)) {
        enemy.attackPhase='moving';moveToward(state,enemy,inhabitant.x,inhabitant.y,speed*dt);
      }
      continue;
    }
    // Pillaging remains local to the chosen route, never a map-wide detour.
    const stage=stageFor(state);
    const pillage=stage.targeting ? stage.targeting(state,enemy) : enemy.type==='foot' && (state.structures.find(s=>s.id===enemy.pillageTargetId&&s.hp>0&&!s.destroyed) || state.structures.find(s=>s.hp>0 && !s.destroyed && (s.type==='house'||s.type==='farm') && distanceToStructure(enemy,s)<=CONFIG.combat.pillageRadius));
    if(stage.targeting && (pillage?.id??null)!==enemy.pillageTargetId) enemy.walkTarget=null;
    enemy.pillageTargetId=pillage?.id??null;
    if(enemy.walkTarget && Math.hypot(enemy.x-enemy.walkTarget.x-.5,enemy.y-enemy.walkTarget.y-.5)<1e-8) enemy.walkTarget=null;
    const step=enemy.walkTarget || nextStep(state,enemy.x,enemy.y,stage.targeting?pillage:null);
    enemy.walkTarget=step;
    const obstacle=step && structureAt(state,step.x,step.y);
    const target=stage.targeting ? (blocksStructure(obstacle)&&obstacle)||(pillage&&distanceToStructure(enemy,pillage)<=CONFIG.combat.attackRange?pillage:null) : pillage || (blocksStructure(obstacle) && obstacle);
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
      if(isWalkable(Math.floor(nx),Math.floor(ny),state)&&!blockingAt(state,Math.floor(nx),Math.floor(ny))) {unit.x=nx;unit.y=ny;}
    }
  }
}
