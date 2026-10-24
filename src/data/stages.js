import * as canyonMap from './map.js';
import { SIEGES, expandSchedule } from './sieges.js';
import { FRONTIER_MAP } from './frontier/map.js';
import { FRONTIER_SIEGE } from './frontier/siege.js';
import { choosePropertyTarget } from '../sim/frontier/targeting.js';

const tools=['wall','gate','barricade','tower','spiked','golem','sensor','launcher','retractable'];
export const STAGES = {
  canyon: { id:'canyon',name:'Canyon Keep Campaign',map:{map:canyonMap.MAP,keep:canyonMap.KEEP,spawns:canyonMap.SPAWNS,sites:canyonMap.SITES},
    settlement:'campaign',sieges:SIEGES,rewardModel:'campaign',allowedTools:[...tools,'pendulum'],
    flags:{battleConstruction:false,contractPayment:false,npcDefenders:false,growth:true} },
  frontier: { id:'frontier',name:'The Frontier Commission',map:FRONTIER_MAP,
    settlement:'frontier',sieges:{1:FRONTIER_SIEGE},rewardModel:'contract',allowedTools:[...tools,'palisade','caltrops'],
    targeting:choosePropertyTarget,
    flags:{battleConstruction:true,contractPayment:true,npcDefenders:true,growth:false} },
};
export const stageFor = state => state?.stageId==='frontier'&&state.frontierMap?
  {...STAGES.frontier,map:state.frontierMap,sieges:{1:state.frontierSiege??FRONTIER_SIEGE}}:STAGES[state?.stageId]??STAGES.canyon;
export const siegeFor = state => stageFor(state).sieges[state.siegeIndex??1];
export function scheduleFor(state) {
  if(stageFor(state).id==='canyon') return expandSchedule(state.siegeIndex);
  return siegeFor(state).groups.flatMap(group=>Array.from({length:group.count},(_,i)=>({
    t:group.t+i*group.spacing,type:group.type,lane:group.lane,x:group.x,y:group.y,
  }))).sort((a,b)=>a.t-b.t);
}
