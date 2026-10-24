import { CONFIG } from '../../config.js';
import { militaryUnits, nearestKeep, route, travel, clearRoute, reachableWithin } from './npcs.js';
import { dismountArcher, archerCanReachKeep } from './archers.js';

const functioning=s=>s?.type==='keep'&&s.hp>0&&!s.destroyed;
const inside=(u,s)=>u.x>=s.x&&u.x<s.x+s.w&&u.y>=s.y&&u.y<s.y+s.h;
const rulesFor=u=>CONFIG.frontier[u.type==='guard'?'guards':u.type==='archer'?'archers':u.type];
export function initializeInfirmaries(state) {
  state.infirmaries=state.structures.filter(functioning).map(s=>({keepId:s.id,pool:CONFIG.frontier.infirmary.pool,patients:[]}));
  for(const unit of militaryUnits(state)) {unit.healingJourney=false;unit.infirmaryId=null;unit.healRetry=0;}
}
function release(unit) {
  unit.healingJourney=false;unit.infirmaryId=null;unit.sheltered=false;unit.retreating=false;unit.dismount=null;
  unit.targetId=null;unit.status=unit.type==='cavalry'?'rest':'returning';clearRoute(unit);
}
// An enemy inside combatRadius only counts when open ground connects it to the
// patient. A bounded search: an unbounded route() here explored the whole map
// every tick whenever a wall separated the two.
function inCombat(state,unit) {
  const radius=CONFIG.frontier.infirmary.combatRadius;
  return state.enemies.some(e=>e.hp>0&&Math.hypot(e.x-unit.x,e.y-unit.y)<=radius&&
    reachableWithin(state,e,unit,Math.ceil(radius)+2,false));
}
export function stepInfirmaries(state,dt) {
  const config=CONFIG.frontier.infirmary,units=militaryUnits(state);
  for(const infirmary of state.infirmaries??[]) infirmary.patients=[];
  // Proportion of HP remaining gives deterministic priority across unit types.
  const wounded=[...units].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||String(a.id).localeCompare(String(b.id)));
  for(const unit of wounded) {
    if(unit.hp<=0) {unit.healingJourney=false;unit.sheltered=false;unit.status='dead';continue;}
    const rules=rulesFor(unit),recover=rules.recoverFraction??config.recoverFraction;
    unit.healRetry=Math.max(0,(unit.healRetry??0)-dt);
    if(unit.healingJourney&&unit.hp>=unit.maxHp*recover) {release(unit);continue;}
    if(!unit.healingJourney) {
      if(unit.hp>unit.maxHp*(rules.retreatFraction??config.retreatFraction)||unit.healRetry>0) continue;
      // Riders finish the gate-based return before becoming infirmary patients.
      if(unit.type==='cavalry'&&!['waiting','rest','cooldown'].includes(unit.status)) continue;
      const preferred=nearestKeep(state,unit);
      const keeps=state.structures.filter(functioning).sort((a,b)=>(a.id===preferred?.id?-1:b.id===preferred?.id?1:0));
      const keep=keeps.find(k=>(state.infirmaries??[]).some(i=>i.keepId===k.id&&i.pool>0)&&
        (unit.wallNodeId?archerCanReachKeep(state,unit,k):route(state,unit,k.x+.5,k.y+.5)!==null));
      if(!keep) {unit.healRetry=config.retryInterval;continue;}
      unit.healingJourney=true;unit.infirmaryId=keep.id;unit.sheltered=false;unit.targetId=null;clearRoute(unit);
    }
    const keep=state.structures.find(s=>s.id===unit.infirmaryId),infirmary=state.infirmaries?.find(i=>i.keepId===unit.infirmaryId);
    if(!functioning(keep)||!infirmary||infirmary.pool<=0) {release(unit);unit.healRetry=config.retryInterval;continue;}
    unit.targetId=null;
    if(unit.type==='archer'&&!dismountArcher(state,unit,dt)) {unit.status='retreating';continue;}
    if((unit.stunRemaining??0)>0) continue;
    if(!inside(unit,keep)) {
      const result=travel(state,unit,keep.x+.5,keep.y+.5,rules.speed*dt);
      unit.status=result==='blocked'?'sheltering':'retreating';
      if(result==='blocked') {release(unit);unit.healRetry=config.retryInterval;}
      continue;
    }
    // Patients inside the keep are sheltered like evacuees, so raiders outside
    // the walls stop searching for a route to them every tick.
    unit.sheltered=true;
    if(inCombat(state,unit)) {unit.status='rest';continue;}
    unit.status='waiting_infirmary';
    if(infirmary.patients.length>=config.patients) continue;
    infirmary.patients.push(unit.id);unit.status='healing';
    const amount=Math.min(config.rate*dt,infirmary.pool,unit.maxHp-unit.hp);
    unit.hp+=amount;infirmary.pool=Math.max(0,infirmary.pool-amount);
    if(unit.hp>=unit.maxHp*recover||infirmary.pool<=0) release(unit);
  }
}
