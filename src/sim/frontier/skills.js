import { CONFIG } from '../../config.js';

export const SKILLS=['communication','structural','field','mechanical'];
export const CLASS_A=['wall','gate','tower','spiked','golem','launcher','sensor','retractable','pendulum'];

export function normalizeSkills(skills={}) {
  const rules=CONFIG.frontier.skills;
  return Object.fromEntries(SKILLS.map(key=>[key,Number.isFinite(skills?.[key])?
    Math.max(1,Math.min(rules.max,Math.floor(skills[key]))):rules.starter[key]]));
}

export function skillEffects(skills) {
  const levels=normalizeSkills(skills),rules=CONFIG.frontier;
  const communication=levels.communication;
  return {communication,structuralHpBonus:(levels.structural-1)*rules.skills.structuralHpPerLevel,
    emergencyBuildTime:Math.max(rules.skills.minBuildTime,rules.buildTime-(levels.field-1)*rules.fieldBuildReduction),
    cooldownReduction:(levels.mechanical-1)*rules.skills.mechanicalCooldownPerLevel,
    guardLimit:communication>=3?rules.guardRequestLimits[3]:communication>=2?rules.guardRequestLimits[2]:0};
}

export function classAMaxHp(state,type,hp) {
  if(state.stageId==='frontier'&&type==='gate') hp=CONFIG.frontier.gateHp;
  return state.stageId==='frontier'&&CLASS_A.includes(type)&&Number.isFinite(hp)?
    hp+hp*skillEffects(state.skills).structuralHpBonus:hp;
}

export function deviceCooldown(state,base) {
  return state.stageId==='frontier'?base*(1-skillEffects(state.skills).cooldownReduction):base;
}

export function emergencyBuildTime(state) {
  return state.stageId==='frontier'?skillEffects(state.skills).emergencyBuildTime:CONFIG.frontier.buildTime;
}
