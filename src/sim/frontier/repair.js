import { CONFIG } from '../../config.js';
import { emit } from '../grid.js';
import { CLASS_A, normalizeSkills } from './skills.js';
import { availableEmergencyGold, spendEmergencyGold } from './economy.js';

const EPSILON=1e-8;
const round=value=>Math.round(value*1e10)/1e10;
const failure=reason=>({ok:false,valid:false,reason:`Cannot repair — ${reason}`});
const eligible=structure=>structure&&!structure.destroyed&&structure.hp>0&&
  Number.isFinite(structure.maxHp)&&structure.maxHp>0&&CLASS_A.includes(structure.type)&&
  CONFIG.structures[structure.type]?.military&&!structure.owner&&!structure.npcOwned&&
  !structure.enemy&&!structure.emergency&&!(structure.type==='golem'&&structure.awakened);
const targetAt=(state,x,y)=>{
  const contains=s=>x>=s.x&&y>=s.y&&x<s.x+s.w&&y<s.y+s.h;
  return state.structures.find(s=>!s.destroyed&&s.hp>0&&contains(s))??state.structures.find(contains);
};

export function emergencyRepairDuration(state) {
  const rules=CONFIG.frontier.repair;
  return rules.duration*rules.fieldMultipliers[normalizeSkills(state.skills).field-1];
}

export function emergencyRepairPricePerHp(structure) {
  return structure.cost*CONFIG.repairRate*CONFIG.frontier.repair.priceMultiplier/structure.maxHp;
}

export function startFrontierRepairs(state) {
  if(state.stageId!=='frontier') return;
  for(const structure of state.structures) {
    structure.emergencyRepairUsed=0;
    delete structure.emergencyRepair;
    delete structure.lastEnemyDamageAt;
  }
}

// Called only after an enemy source has actually reduced structure HP. Enemy
// proximity and friendly fire do not restart the damage-free waiting period.
export function noteEnemyStructureDamage(state,structure) {
  if(state.stageId!=='frontier'||state.phase!=='siege') return;
  structure.lastEnemyDamageAt=state.time;
  if(structure.emergencyRepair?.status==='repairing') {
    structure.emergencyRepair.status='interrupted';
    emit(state,'repairInterrupted',{structureId:structure.id,x:structure.x,y:structure.y});
  }
}

export function emergencyRepairCheck(state,x,y) {
  if(state.stageId!=='frontier'||state.phase!=='siege') return failure('Emergency repairs are Frontier battle only.');
  const structure=targetAt(state,x,y),rules=CONFIG.frontier.repair;
  if(!eligible(structure)) return failure('Choose a surviving player-owned military Class A structure.');
  if(structure.hp>=structure.maxHp-EPSILON) return failure('Structure is already at full health.');
  if(structure.emergencyRepair?.status==='repairing') return failure('A repair is already running.');
  if(Number.isFinite(structure.lastEnemyDamageAt)) {
    const since=state.time-structure.lastEnemyDamageAt;
    if(since<EPSILON) {
      const name=structure.type==='wall'?'Wall':structure.type[0].toUpperCase()+structure.type.slice(1);
      return failure(`${name} is under attack.`);
    }
    if(since+EPSILON<rules.damageFreeSeconds) return failure(`Wait until ${rules.damageFreeSeconds} seconds after the last hit.`);
  }
  const allowance=round(structure.maxHp*rules.allowanceFraction-(structure.emergencyRepairUsed??0));
  if(allowance<=EPSILON) return failure('Per-siege repair allowance used.');
  if(availableEmergencyGold(state)<=EPSILON) return failure('Not enough gold.');
  const amount=Math.min(allowance,structure.maxHp-structure.hp),pricePerHp=emergencyRepairPricePerHp(structure);
  return {ok:true,valid:true,reason:'',structure,amount,pricePerHp,cost:amount*pricePerHp,
    duration:emergencyRepairDuration(state)};
}

export function startEmergencyRepair(state,x,y) {
  const check=emergencyRepairCheck(state,x,y);
  if(!check.ok) return check;
  const repair={status:'repairing',elapsed:0,duration:check.duration,amount:check.amount,
    restored:0,spent:0,pricePerHp:check.pricePerHp};
  check.structure.emergencyRepair=repair;
  emit(state,'repairStarted',{structureId:check.structure.id,x,y});
  return {...check,repair};
}

export function cancelEmergencyRepair(state,x,y) {
  if(state.stageId!=='frontier'||state.phase!=='siege') return failure('Emergency repairs are Frontier battle only.');
  const structure=targetAt(state,x,y);
  if(structure?.emergencyRepair?.status!=='repairing') return failure('No repair is running.');
  structure.emergencyRepair.status='cancelled';
  return {ok:true,valid:true,reason:''};
}

export function stepFrontierRepairs(state,dt) {
  if(state.stageId!=='frontier'||state.phase!=='siege'||!Number.isFinite(dt)||dt<=0) return;
  for(const structure of state.structures) {
    const repair=structure.emergencyRepair;
    if(repair?.status!=='repairing') continue;
    if(!eligible(structure)) {repair.status='interrupted';continue;}
    repair.elapsed=Math.min(repair.duration,repair.elapsed+dt);
    if(repair.duration-repair.elapsed<EPSILON) repair.elapsed=repair.duration;
    // Derive the cumulative target from elapsed time rather than charging a
    // rounded amount every tick. Speed and timestep partitioning agree.
    const target=round(repair.amount*repair.elapsed/repair.duration);
    const requested=Math.min(target-repair.restored,structure.maxHp-structure.hp);
    const paid=spendEmergencyGold(state,requested*repair.pricePerHp,'repair');
    const restored=round(Math.min(requested,paid/repair.pricePerHp));
    structure.hp=round(Math.min(structure.maxHp,structure.hp+restored));
    structure.emergencyRepairUsed=round((structure.emergencyRepairUsed??0)+restored);
    repair.restored=round(repair.restored+restored);
    repair.spent=round(repair.spent+paid);
    if(paid+EPSILON<requested*repair.pricePerHp) repair.status='unaffordable';
    else if(repair.elapsed+EPSILON>=repair.duration||structure.hp+EPSILON>=structure.maxHp) repair.status='completed';
    else if(availableEmergencyGold(state)<=EPSILON) repair.status='unaffordable';
  }
}
