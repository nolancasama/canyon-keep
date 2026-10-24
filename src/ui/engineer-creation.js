import { CONFIG } from '../config.js';
import { SKILLS, skillEffects } from '../sim/frontier/skills.js';
import { ACCENTS, PORTRAITS, CREATION_PRESETS, normalizeIdentity } from './frontier-career.js';

const escape=value=>String(value).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
export const SKILL_LABELS={communication:'Communication',structural:'Structural',field:'Field',mechanical:'Mechanical'};
export function skillDescriptions(skills) {
  const effects=skillEffects(skills),rules=CONFIG.frontier,level=skills.field;
  const percent=n=>Math.round(n*100);
  return {
    communication:`Negotiation level ${effects.communication}: eligible requests pay +${percent(rules.negotiationMultiplier-1)}%. Reassign up to ${effects.guardLimit} keep guards. Request owner defenses at any level; higher-level requests offer optional rewards.`,
    structural:`+${percent(effects.structuralHpBonus)}% player Class A max HP. Levels 2–4: ${[2,3,4].map(l=>percent(skillEffects({structural:l}).structuralHpBonus)+'%').join(' / ')}. Property and makeshift works are unaffected.`,
    field:`Emergency build ${effects.emergencyBuildTime.toFixed(1)} s; repair time ×${rules.repair.fieldMultipliers[level-1]} (${(rules.repair.duration*rules.repair.fieldMultipliers[level-1]).toFixed(2)} s). Build L1–4: ${[1,2,3,4].map(field=>skillEffects({field}).emergencyBuildTime.toFixed(1)).join(' / ')} s.`,
    mechanical:`−${percent(effects.cooldownReduction)}% trap reset, launcher, retractable wall and pendulum cooldowns. Levels 2–4: ${[2,3,4].map(mechanical=>percent(skillEffects({mechanical}).cooldownReduction)+'%').join(' / ')}. Planned golem: −${percent(effects.cooldownReduction)}% cooldown, +${percent(rules.skills.plannedGolemReturnBonus[skills.mechanical-1])}% return speed (deferred).`,
  };
}

// Six cosmetic busts built entirely from CSS shapes. No external assets or sim state.
export function portraitMarkup(identity) {
  const {portrait,accent}=normalizeIdentity(identity);
  return `<span class="engineer-portrait portrait-${portrait}" style="--accent:${accent}" role="img" aria-label="${PORTRAITS[portrait]} portrait"><i class="portrait-shoulders"></i><i class="portrait-neck"></i><i class="portrait-face"></i><i class="portrait-hair"></i><i class="portrait-eyes"></i><i class="portrait-detail"></i></span>`;
}

export function newCreationDraft(record,legacy=false) {
  return {identity:normalizeIdentity(record.identity),skills:legacy?{...record.skills}:Object.fromEntries(SKILLS.map(key=>[key,1])),legacy,confirm:false,dirty:true};
}

export function creationMarkup(draft) {
  const {identity,skills,legacy,confirm}=draft,descriptions=skillDescriptions(skills);
  const remaining=CONFIG.frontier.skills.creationPoints-SKILLS.reduce((sum,key)=>sum+skills[key]-1,0);
  if(confirm)return `<section class="result-card engineer-creation creation-confirm" aria-label="Confirm engineer"><div class="eyebrow">FRONTIER COMMISSION · ENGINEER'S CHARTER</div><h2>Sign your commission</h2><div class="engineer-summary">${portraitMarkup(identity)}<div><h3>${escape(normalizeIdentity(identity).name)}</h3><p>${SKILLS.map(key=>`${SKILL_LABELS[key]} ${skills[key]}`).join(' · ')}</p></div></div><p>${legacy?'Your existing skills and development points will be preserved.':'Begin a new career with these skills and zero development points. Previous career progression will be discarded.'}</p><div class="creation-actions"><button data-action="creationBack">Back to editing</button><button class="primary" data-action="creationConfirm">Sign charter & continue</button></div></section>`;
  return `<section class="result-card engineer-creation" aria-label="Create Frontier engineer"><div class="eyebrow">FRONTIER COMMISSION · ${legacy?'WELCOME BACK':'A NEW ENGINEER'}</div><h2>${legacy?'Put a name to your work':'Your craft. Your reputation.'}</h2><p class="creation-intro">${legacy?'Your career is preserved. Choose only your name, portrait and colour.':'Choose your identity, then invest three points in your engineering craft. Level 4 is earned through contracts.'}</p><div class="creation-columns"><div class="creation-identity"><label for="engineer-name">ENGINEER NAME</label><input id="engineer-name" data-engineer-name maxlength="24" value="${escape(identity.name)}" autocomplete="off"><div class="engineer-preview">${portraitMarkup(identity)}<span>Portrait and colour are cosmetic</span></div><div class="portrait-choices" aria-label="Choose portrait">${PORTRAITS.map((name,index)=>`<button data-action="portrait:${index}" aria-label="${name}" aria-pressed="${identity.portrait===index}">${portraitMarkup({...identity,portrait:index})}<small>${name}</small></button>`).join('')}</div><div class="accent-choices" aria-label="Choose colour">${ACCENTS.map((accent,index)=>`<button style="--accent:${accent}" data-action="accent:${index}" aria-label="Colour ${index+1}" aria-pressed="${identity.accent===accent}"></button>`).join('')}</div></div><div class="creation-skills">${legacy?'<h3>Established engineering skills</h3>':`<div class="creation-presets">${CREATION_PRESETS.map((preset,index)=>`<button data-action="preset:${index}">${preset.name}</button>`).join('')}</div><div class="creation-points" role="status" aria-live="polite">${remaining} of ${CONFIG.frontier.skills.creationPoints} points remaining <small>Presets remain editable · starting maximum ${CONFIG.frontier.skills.creationMax}</small></div>`}${SKILLS.map(key=>`<article class="creation-skill"><div><strong>${SKILL_LABELS[key]}</strong><span class="skill-level">${skills[key]} / ${legacy?CONFIG.frontier.skills.max:CONFIG.frontier.skills.creationMax}</span>${legacy?'':`<button data-action="allocate:${key}:-1" aria-label="Decrease ${SKILL_LABELS[key]}" ${skills[key]<=1?'disabled':''}>−</button><button data-action="allocate:${key}:1" aria-label="Increase ${SKILL_LABELS[key]}" ${remaining<=0||skills[key]>=CONFIG.frontier.skills.creationMax?'disabled':''}>+</button>`}</div><p>${escape(descriptions[key])}</p></article>`).join('')}</div></div><div class="creation-actions"><button data-action="creationCancel">Cancel</button><button class="primary" data-action="creationReview" ${!legacy&&remaining!==0?'disabled':''}>Review engineer</button></div></section>`;
}
