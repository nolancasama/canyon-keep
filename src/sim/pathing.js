import { CONFIG } from '../config.js';
import { KEEP } from '../data/map.js';
import { stageFor } from '../data/stages.js';
import { isWalkable, tileAt, structureAt, blocksStructure } from './grid.js';

const directions = [[1,0],[0,1],[-1,0],[0,-1]];
const index = (x,y,width) => y * width + x;
function cost(state,x,y,enemyType) {
  const structure = structureAt(state,x,y);
  const weights=state.stageId==='frontier'?CONFIG.frontier.breachWeights[enemyType??'foot']:null;
  const breach=weights?.hp??CONFIG.breachCostPerHp;
  return CONFIG.floorMovementCost + (blocksStructure(structure) && structure.type !== 'keep' ?
    structure.hp * breach * (structure.type==='gate'?(weights?.gate??1):1) : 0);
}

// Reverse Dijkstra: a predecessor pays the cost of entering the current tile.
function buildFlow(state, target, enemyType) {
  const map=stageFor(state).map.map,width=map[0].length,height=map.length;
  const distances = Array(width * height).fill(null);
  const heap = [];
  function push(node) {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i-1)>>1;
      if (heap[parent][0] <= node[0]) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = node;
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i*2+1 < heap.length) {
        let child = i*2+1;
        if (child+1 < heap.length && heap[child+1][0] < heap[child][0]) child++;
        if (last[0] <= heap[child][0]) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  const keeps = target ? [target] : state.stageId==='frontier'
    ? state.structures.filter(s=>s.type==='keep'&&!s.destroyed&&s.hp>0)
    : [state.structures.find(s => s.type === 'keep') || { ...KEEP, w:3, h:3 }];
  for(const keep of keeps) for (let y=keep.y;y<keep.y+keep.h;y++) for (let x=keep.x;x<keep.x+keep.w;x++) {
    distances[index(x,y,width)] = 0; push([0,x,y]);
  }
  while (heap.length) {
    const [distance,x,y] = pop();
    if (distance !== distances[index(x,y,width)]) continue;
    const stepCost = cost(state,x,y,enemyType);
    for (const [dx,dy] of directions) {
      const nx=x+dx, ny=y+dy;
      if (nx<0 || ny<0 || nx>=width || ny>=height || !isWalkable(nx,ny,state)) continue;
      const candidate=distance+stepCost, id=index(nx,ny,width);
      if (distances[id] === null || candidate < distances[id]) {
        distances[id]=candidate; push([candidate,nx,ny]);
      }
    }
  }
  return { distances, revision:state.flowRevision, width, height };
}

export function rebuildFlow(state) { state.flow=buildFlow(state);return state.flow; }

export function nextStep(state,x,y,target=null,enemyType='foot') {
  if (!state.flow || state.flow.revision !== state.flowRevision) rebuildFlow(state);
  let flow=state.flow;
  if(state.stageId==='frontier'&&(target||enemyType!=='foot')) {
    const key=`${target?.id??'keep'}:${enemyType}`,cached=(state.breachFlows??={})[key];
    flow=cached?.revision===state.flowRevision?cached:(state.breachFlows[key]=buildFlow(state,target,enemyType));
  } else if(target) {
    const cached=(state.propertyFlows??={})[target.id];
    flow=cached?.revision===state.flowRevision?cached:(state.propertyFlows[target.id]=buildFlow(state,target));
  }
  const {width,height}=flow;
  x=Math.floor(x); y=Math.floor(y);
  let best=null, bestCost=Infinity;
  for (const [dx,dy] of directions) {
    const nx=x+dx,ny=y+dy;
    if (nx<0 || ny<0 || nx>=width || ny>=height || !isWalkable(nx,ny,state)) continue;
    const distance=flow.distances[index(nx,ny,width)];
    if (distance===null) continue;
    const total=distance+cost(state,nx,ny,enemyType);
    if (total<bestCost) { bestCost=total; best={x:nx,y:ny}; }
  }
  return best;
}

export const nextStepTo = (state,x,y,target,enemyType) => nextStep(state,x,y,target,enemyType);
