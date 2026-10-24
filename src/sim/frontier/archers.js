import { CONFIG, SIM_DT } from '../../config.js';
import { structureAt, blocksStructure, isWalkable, emit } from '../grid.js';
import { npcWalkable, route, travel, clearRoute, nearestKeep } from './npcs.js';

const directions=[[1,0],[0,1],[-1,0],[0,-1]];
const key=(x,y)=>`${x},${y}`;
const alive=s=>s.hp>0&&!s.destroyed;
const wallTypes=['wall','gate','spiked','golem'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// A separate, read-only topology: ground collision and enemy flows never use it.
export function wallNetwork(state) {
  const structures=state.structures.filter(alive),walls=structures.filter(s=>wallTypes.includes(s.type)&&!s.awakened);
  const towers=structures.filter(s=>s.type==='tower'&&walls.some(w=>Math.abs(w.x-s.x)+Math.abs(w.y-s.y)===1));
  const nodes=[...walls,...towers].map(s=>({id:key(s.x,s.y),x:s.x,y:s.y,structureId:s.id,type:s.type,
    neighbors:[],component:null,access:false,groundAccess:[]}));
  const byId=new Map(nodes.map(n=>[n.id,n])),keeps=structures.filter(s=>s.type==='keep');
  for(const node of nodes) {
    node.neighbors=directions.map(([dx,dy])=>key(node.x+dx,node.y+dy)).filter(id=>byId.has(id));
    const byGate=node.type!=='gate'&&node.neighbors.some(id=>byId.get(id).type==='gate');
    const byKeep=keeps.some(k=>directions.some(([dx,dy])=>node.x+dx>=k.x&&node.x+dx<k.x+k.w&&
      node.y+dy>=k.y&&node.y+dy<k.y+k.h));
    node.access=node.type==='tower'||byGate||byKeep;
    if(node.access) node.groundAccess=directions.map(([dx,dy])=>({x:node.x+dx,y:node.y+dy}))
      .filter(p=>npcWalkable(state,p.x,p.y));
  }
  let component=0;
  for(const node of nodes) if(node.component===null) {
    const queue=[node];node.component=component++;
    for(let i=0;i<queue.length;i++) for(const id of queue[i].neighbors) {
      const next=byId.get(id);if(next.component===null) {next.component=node.component;queue.push(next);}
    }
  }
  return nodes;
}

function wallRoute(nodes,from,to) {
  const byId=new Map(nodes.map(n=>[n.id,n])),queue=[from],seen=new Map([[from,null]]);
  for(let i=0;i<queue.length&&!seen.has(to);i++) for(const id of byId.get(queue[i])?.neighbors??[]) {
    if(!seen.has(id)) {seen.set(id,queue[i]);queue.push(id);}
  }
  if(!seen.has(to)) return null;
  const path=[];for(let id=to;id!==from;id=seen.get(id)) path.push(byId.get(id));
  return path.reverse();
}

function moveToward(unit,x,y,amount) {
  const dx=x-unit.x,dy=y-unit.y,length=Math.hypot(dx,dy),step=Math.min(amount,length);
  if(length>0) {unit.x+=dx/length*step;unit.y+=dy/length*step;}
  return {remaining:amount-step,arrived:length<=amount+1e-8};
}

function walkWall(unit,nodes,destination,amount) {
  const current=nodes.find(n=>n.id===unit.wallNodeId);
  if(!current) return false;
  // Finish the adjacent climb/current edge before choosing another edge.
  const centered=moveToward(unit,current.x+.5,current.y+.5,amount);
  if(!centered.arrived) return false;
  amount=centered.remaining;
  const path=wallRoute(nodes,current.id,destination);
  if(!path) return false;
  for(const next of path) {
    if(amount<=0) return false;
    // The node ID changes at the start of an edge, so a destroyed destination
    // also drops an archer who was crossing onto it.
    unit.wallNodeId=next.id;
    const moved=moveToward(unit,next.x+.5,next.y+.5,amount);
    if(!moved.arrived) return false;
    amount=moved.remaining;
  }
  return true;
}

function dropArcher(state,unit) {
  const [x,y]=unit.wallNodeId.split(',').map(Number);
  const candidates=directions.map(([dx,dy])=>({x:x+dx,y:y+dy})).filter(p=>npcWalkable(state,p.x,p.y));
  // With every adjacent tile blocked, the now-destroyed tile itself is the
  // only safe landing. Never put a falling archer in a cliff or intact wall.
  if(!candidates.length&&npcWalkable(state,x,y)) candidates.push({x,y});
  if(!candidates.length) {unit.status='stranded_wall';return false;}
  candidates.sort((a,b)=>distance({x:a.x+.5,y:a.y+.5},unit)-distance({x:b.x+.5,y:b.y+.5},unit));
  unit.x=candidates[0].x+.5;unit.y=candidates[0].y+.5;unit.wallNodeId=null;unit.dismount=null;
  unit.hp=Math.max(0,unit.hp-CONFIG.frontier.archers.fallDamage);
  unit.stunRemaining=CONFIG.frontier.archers.fallStun;unit.status=unit.hp>0?'stunned':'dead';
  unit.targetId=null;clearRoute(unit);emit(state,'archerFall',{id:unit.id,x:unit.x,y:unit.y});return true;
}

// Used by the infirmary before ground travel. Descent always follows the
// current connected wall line to real stairs, then crosses one adjacent edge.
export function archerCanReachKeep(state,unit,keep) {
  const nodes=wallNetwork(state),current=nodes.find(n=>n.id===unit.wallNodeId);
  if(!current) return route(state,{x:unit.x,y:unit.y},keep.x+.5,keep.y+.5)!==null;
  return nodes.some(n=>n.component===current.component&&n.access&&n.groundAccess.some(p=>
    route(state,{x:p.x+.5,y:p.y+.5},keep.x+.5,keep.y+.5)!==null));
}
export function dismountArcher(state,unit,dt=SIM_DT) {
  if(!unit.wallNodeId) return true;
  const nodes=wallNetwork(state),current=nodes.find(n=>n.id===unit.wallNodeId);
  if(!current) return dropArcher(state,unit);
  const keep=state.structures.find(s=>s.id===unit.infirmaryId&&s.type==='keep'&&alive(s))??nearestKeep(state,unit),options=[];
  for(const node of nodes.filter(n=>n.component===current.component&&n.access)) for(const point of node.groundAccess) {
    const probe={x:point.x+.5,y:point.y+.5};
    if(keep&&route(state,probe,keep.x+.5,keep.y+.5)===null) continue;
    const path=wallRoute(nodes,current.id,node.id);
    options.push({node,point,cost:path.length+distance(unit,{x:node.x+.5,y:node.y+.5})});
  }
  const planned=unit.dismount&&options.find(o=>o.node.id===unit.dismount.nodeId&&o.point.x===unit.dismount.x&&o.point.y===unit.dismount.y);
  options.sort((a,b)=>a.cost-b.cost||a.node.y-b.node.y||a.node.x-b.node.x);
  const option=planned??options[0];
  if(!option) {unit.status='stranded_wall';return false;}
  unit.dismount={nodeId:option.node.id,x:option.point.x,y:option.point.y,descending:planned&&unit.dismount.descending};unit.status='descending';
  if(!unit.dismount.descending) {
    if(walkWall(unit,nodes,option.node.id,CONFIG.frontier.archers.speed*dt)) unit.dismount.descending=true;
    return false;
  }
  const moved=moveToward(unit,option.point.x+.5,option.point.y+.5,CONFIG.frontier.archers.speed*dt);
  if(!moved.arrived) return false;
  unit.wallNodeId=null;unit.dismount=null;clearRoute(unit);return false;
}

// Grid traversal checks every crossed cell, including both sides of a corner.
// The shooter's own battlement is the only solid tile exempted.
export function archerLineOfSight(state,unit,target) {
  let x=Math.floor(unit.x),y=Math.floor(unit.y);
  const endX=Math.floor(target.x),endY=Math.floor(target.y),start=key(x,y);
  const dx=target.x-unit.x,dy=target.y-unit.y,sx=Math.sign(dx),sy=Math.sign(dy);
  const deltaX=dx?Math.abs(1/dx):Infinity,deltaY=dy?Math.abs(1/dy):Infinity;
  let nextX=dx?((sx>0?x+1-unit.x:unit.x-x)/Math.abs(dx)):Infinity;
  let nextY=dy?((sy>0?y+1-unit.y:unit.y-y)/Math.abs(dy)):Infinity;
  const blocked=(tx,ty)=>key(tx,ty)!==start&&!(tx===endX&&ty===endY)&&
    (!isWalkable(tx,ty,state)||blocksStructure(structureAt(state,tx,ty)));
  while(x!==endX||y!==endY) {
    if(Math.abs(nextX-nextY)<1e-10) {
      if(blocked(x+sx,y)||blocked(x,y+sy)) return false;
      x+=sx;y+=sy;nextX+=deltaX;nextY+=deltaY;
    } else if(nextX<nextY) {x+=sx;nextX+=deltaX;}
    else {y+=sy;nextY+=deltaY;}
    if(blocked(x,y)) return false;
  }
  return true;
}

function mount(state,unit,nodes,dt) {
  let option=unit.mountPlan&&nodes.some(n=>n.id===unit.mountPlan.node.id&&n.access&&n.groundAccess.some(p=>
    p.x===unit.mountPlan.point.x&&p.y===unit.mountPlan.point.y))?unit.mountPlan:null;
  unit.mountScanRemaining=Math.max(0,(unit.mountScanRemaining??0)-dt);
  if(!option&&(unit.mountScanRemaining<=0||unit.mountRevision!==state.flowRevision)) {
    const options=[];
    for(const node of nodes.filter(n=>n.access)) for(const point of node.groundAccess) {
      const path=route(state,unit,point.x+.5,point.y+.5);
      if(path!==null) options.push({node,point,cost:path.length});
    }
    options.sort((a,b)=>a.cost-b.cost||a.node.y-b.node.y||a.node.x-b.node.x);
    option=options[0]??null;unit.mountPlan=option;unit.mountRevision=state.flowRevision;unit.mountScanRemaining=CONFIG.frontier.archers.scanInterval;
  }
  if(!option) return false;
  unit.status='ascending';
  const result=travel(state,unit,option.point.x+.5,option.point.y+.5,CONFIG.frontier.archers.speed*dt);
  if(result==='arrived') {
    unit.wallNodeId=option.node.id;unit.wallDestinationId=option.node.id;unit.mountPlan=null;clearRoute(unit);
  } else if(result==='blocked') {
    unit.mountPlan=null;unit.mountScanRemaining=CONFIG.frontier.archers.scanInterval;
  }
  return true;
}

export function stepArchers(state,dt) {
  const rules=CONFIG.frontier.archers,units=state.archers??[];
  if(!units.length) return;
  const nodes=wallNetwork(state),enemies=state.enemies.filter(alive);
  for(const unit of units) {
    if(unit.hp<=0) {unit.status='dead';unit.targetId=null;continue;}
    if(unit.wallNodeId&&!nodes.some(n=>n.id===unit.wallNodeId)&&!dropArcher(state,unit)) continue;
    if(unit.hp<=0) continue;
    unit.stunRemaining=Math.max(0,(unit.stunRemaining??0)-dt);
    unit.attackCooldown=Math.max(0,(unit.attackCooldown??0)-dt);
    if(unit.stunRemaining>0) {unit.status='stunned';continue;}
    if(unit.healingJourney) continue;
    const node=nodes.find(n=>n.id===unit.wallNodeId);
    if(node) {
      unit.scanRemaining=Math.max(0,(unit.scanRemaining??0)-dt);
      if(unit.scanRemaining<=0) {
        unit.scanRemaining=rules.scanInterval;
        const line=nodes.filter(n=>n.component===node.component);
        const scored=line.map(n=>({node:n,nearest:Math.min(...enemies.map(e=>distance({x:n.x+.5,y:n.y+.5},e))),score:enemies.reduce((sum,e)=>{
          const from={x:n.x+.5,y:n.y+.5};return sum+(distance(from,e)<=rules.range&&archerLineOfSight(state,from,e)?1:0);
        },0)}));
        scored.sort((a,b)=>b.score-a.score||a.nearest-b.nearest||distance({x:a.node.x+.5,y:a.node.y+.5},unit)-distance({x:b.node.x+.5,y:b.node.y+.5},unit)||a.node.y-b.node.y||a.node.x-b.node.x);
        unit.wallDestinationId=scored[0]?.node.id??node.id;
      }
      walkWall(unit,nodes,unit.wallDestinationId??node.id,rules.speed*dt);unit.status='battlement';
    } else if(!mount(state,unit,nodes,dt)) {
      const keep=nearestKeep(state,unit);
      if(keep&&distance(unit,{x:keep.x+.5,y:keep.y+.5})>rules.range) {
        travel(state,unit,keep.x+.5,keep.y+.5,rules.speed*dt);unit.status='returning';
      } else unit.status='ground_guard';
    }
    const targets=enemies.filter(e=>alive(e)&&distance(unit,e)<=rules.range&&archerLineOfSight(state,unit,e));
    targets.sort((a,b)=>distance(unit,a)-distance(unit,b)||a.id-b.id);
    const target=targets[0];unit.targetId=target?.id??null;
    if(target&&unit.attackCooldown<=0) {
      unit.attackCooldown=rules.interval;
      (state.arrows??=[]).push({id:state.nextId++,sourceId:unit.id,x:unit.x,y:unit.y,targetId:target.id,
        damage:rules.damage,projectileSpeed:rules.projectileSpeed});
      emit(state,'arrow',{x:unit.x,y:unit.y,targetId:target.id,sourceId:unit.id});
    }
  }
}
