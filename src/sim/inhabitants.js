import { CONFIG } from '../config.js';
import { tileAt, isWalkable, blockingAt } from './grid.js';

export function createInhabitants(state) {
  const keep=state.structures.find(s=>s.type==='keep');
  state.inhabitants=[];
  const count=state.population;
  for(let i=0;i<count;i++) {
    const angle=i/count*Math.PI*2;
    const x=keep.x+keep.w/2+Math.cos(angle)*(keep.w/2+.6);
    const y=keep.y+keep.h/2+Math.sin(angle)*(keep.h/2+.6);
    const safe=isWalkable(Math.floor(x),Math.floor(y),state)&&!blockingAt(state,Math.floor(x),Math.floor(y));
    state.inhabitants.push({id:state.nextId++,homeId:keep.id,x:safe?x:keep.x-.5,y:safe?y:keep.y+keep.h/2,
      hp:CONFIG.inhabitants.hp,maxHp:CONFIG.inhabitants.hp,sheltered:false,status:'idle',idleAngle:angle});
  }
  homeInhabitants(state);
  return state.inhabitants;
}

// Stable slots: the keep houses six, then each surviving house houses four.
export function homeInhabitants(state) {
  const homes=state.structures.filter(s=>s.hp>0&&!s.destroyed&&(s.type==='keep'||s.type==='house'));
  const slots=homes.flatMap(s=>Array(CONFIG.structures[s.type].housing).fill(s));
  const keep=homes.find(s=>s.type==='keep');
  state.inhabitants.forEach((person,i)=>{
    const home=slots[i]||keep;
    person.homeId=home?.id??null;
    if (!home || person.status!=='idle') return;
    const angle=person.idleAngle;
    const cx=home.x+home.w/2,cy=home.y+home.h/2;
    const candidates=Array.from({length:16},(_,j)=>({x:cx+Math.cos(angle+j*Math.PI/8)*CONFIG.inhabitants.idleRadius,y:cy+Math.sin(angle+j*Math.PI/8)*CONFIG.inhabitants.idleRadius}));
    const safe=candidates.find(p=>isWalkable(Math.floor(p.x),Math.floor(p.y),state)&&!blockingAt(state,Math.floor(p.x),Math.floor(p.y)));
    if(safe){person.x=safe.x;person.y=safe.y;}
  });
}

export function stepInhabitants(state,dt) {
  const keep=state.structures.find(s=>s.type==='keep'),config=CONFIG.inhabitants;
  if(!keep) return;
  const live=state.enemies.filter(enemy=>enemy.hp>0);
  const invaded=live.some(enemy=>tileAt(Math.floor(enemy.x),Math.floor(enemy.y),state)==='C');
  for(const person of state.inhabitants) {
    if(person.hp<=0) {person.status='dead';continue;}
    if(person.sheltered) continue;
    if(invaded||live.some(enemy=>Math.hypot(enemy.x-person.x,enemy.y-person.y)<=config.alertRadius)) person.status='fleeing';
    const cx=keep.x+keep.w/2,cy=keep.y+keep.h/2;
    if(person.status==='fleeing') {
      const dx=cx-person.x,dy=cy-person.y,length=Math.hypot(dx,dy),travel=Math.min(length,config.fleeSpeed*dt);
      if(length>0) {person.x+=dx/length*travel;person.y+=dy/length*travel;}
      if(person.x>=keep.x&&person.y>=keep.y&&person.x<keep.x+keep.w&&person.y<keep.y+keep.h) {
        person.sheltered=true;person.status='sheltered';
      }
    } else {
      const home=state.structures.find(s=>s.id===person.homeId&&!s.destroyed)||keep;
      const cx=home.x+home.w/2,cy=home.y+home.h/2;
      const angle=person.idleAngle+state.time*CONFIG.combat.inhabitantWanderSpeed;
      const x=cx+Math.cos(angle)*config.idleRadius,y=cy+Math.sin(angle)*config.idleRadius;
      if(isWalkable(Math.floor(x),Math.floor(y),state)&&!blockingAt(state,Math.floor(x),Math.floor(y))) {person.x=x;person.y=y;}
    }
  }
}
