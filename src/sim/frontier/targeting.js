import { CONFIG } from '../../config.js';

const distance=(enemy,s)=>Math.hypot(Math.max(s.x-enemy.x,0,enemy.x-s.x-s.w),Math.max(s.y-enemy.y,0,enemy.y-s.y-s.h));

// A raider makes one readable property commitment. After losing that target it
// rejoins the keep assault; it never bounces between nearby valuable buildings.
export function choosePropertyTarget(state,enemy) {
  if(enemy.type!=='foot'||enemy.propertyRaidComplete) return null;
  if(enemy.propertyTargetId) {
    const target=state.structures.find(s=>s.id===enemy.propertyTargetId&&s.hp>0&&!s.destroyed);
    if(target) return target;
    enemy.propertyRaidComplete=true;enemy.propertyTargetId=null;enemy.walkTarget=null;
    return null;
  }
  const candidates=state.structures.filter(s=>s.owner&&s.type!=='keep'&&s.hp>0&&!s.destroyed&&
    s.value>0&&distance(enemy,s)<=CONFIG.frontier.propertySightRadius);
  candidates.sort((a,b)=>distance(enemy,a)-distance(enemy,b)||b.value-a.value||String(a.id).localeCompare(String(b.id)));
  if(!candidates.length) return null;
  enemy.propertyTargetId=candidates[0].id;enemy.walkTarget=null;
  return candidates[0];
}
