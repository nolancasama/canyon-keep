import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { WIDTH, HEIGHT } from '../src/data/map.js';
import { createGame } from '../src/sim/campaign.js';
import { structureAt, blocksStructure, damageStructure } from '../src/sim/grid.js';
import { nextStep } from '../src/sim/pathing.js';
import { npcWalkable } from '../src/sim/frontier/npcs.js';
import { majorRoadExits } from '../src/sim/build.js';

function corridor({wide=false}={}) {
  const game=createGame({stage:'frontier'}),state=game.state;
  const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill('#'));
  for(let y=1;y<=7;y++) for(let x=wide?0:1;x<=(wide?WIDTH-1:11);x++) cells[y][x]='.';
  cells[4][9]='K';
  state.frontierMap={map:cells.map(row=>row.join('')),spawns:[{x:0,y:4},{x:WIDTH-1,y:4}],
    roads:wide?Array.from({length:WIDTH},(_,x)=>({x,y:4})):[],sites:[],districts:[]};
  state.structures=[{id:'keep',label:'Test keep',type:'keep',x:9,y:4,w:1,h:1,hp:2000,maxHp:2000}];
  state.gold=2000;
  return game;
}

test('Frontier gate base HP is 130 with Structural bonus; canyon gate and wall retain their base HP',()=>{
  const frontier=createGame({stage:'frontier',skills:{structural:1}});
  assert.equal(frontier.api.place('gate',8,18).structure.maxHp,130);
  assert.equal(frontier.api.place('wall',9,18).structure.maxHp,200);
  const trained=createGame({stage:'frontier',skills:{structural:3}});
  assert.equal(trained.api.place('gate',8,18).structure.maxHp,130*(1+2*CONFIG.frontier.skills.structuralHpPerLevel));
  const canyon=createGame();
  assert.equal(canyon.api.place('gate',52,10).structure.maxHp,180);
  assert.equal(canyon.api.place('wall',53,10).structure.maxHp,200);
});

test('intact gates block enemy movement, pass friendlies and become open after destruction',()=>{
  const game=corridor(),state=game.state;
  for(let y=1;y<=7;y++) assert.equal(game.api.place(y===4?'gate':'wall',5,y).ok,true);
  const gate=structureAt(state,5,4);
  assert.equal(blocksStructure(gate),true);
  assert.equal(npcWalkable(state,5,4),true);
  assert.equal(npcWalkable(state,5,4,false),false);
  assert.deepEqual(nextStep(state,4.5,4.5,null,'chiseler'),{x:5,y:4});
  assert.equal(damageStructure(state,gate,gate.hp),true);
  assert.equal(structureAt(state,5,4),null);
  assert.equal(npcWalkable(state,5,4,false),true);
  assert.deepEqual(nextStep(state,4.5,4.5,null,'foot'),{x:5,y:4});
});

test('wall drag inserts road gates, previews gross and net costs, and single placement deliberately replaces a gate',()=>{
  const game=corridor({wide:true});
  assert.equal(game.api.place('wall',5,4).ok,true);
  const before=structuredClone(game.state),preview=game.api.previewLine('wall',5,2,5,6);
  assert.deepEqual(game.state,before,'preview has no side effects');
  assert.equal(preview.tiles.filter(t=>t.autoGate).length,1);
  assert.equal(preview.autoGates,1);
  assert.equal(preview.tiles.find(t=>t.autoGate).type,'gate');
  assert.equal(preview.totalCost,4*CONFIG.structures.wall.cost+CONFIG.structures.gate.cost);
  assert.equal(preview.netCost,preview.totalCost-CONFIG.structures.wall.cost);
  assert.equal(preview.cost,preview.netCost);
  const gold=game.state.gold;
  assert.equal(game.api.placeLine('wall',5,2,5,6).placed,5);
  assert.equal(game.state.gold,gold-preview.netCost);
  assert.equal(structureAt(game.state,5,4).type,'gate');
  assert.equal(game.api.place('wall',5,4).ok,true,'other rows retain an access route');
  assert.equal(structureAt(game.state,5,4).type,'wall');
  game.state.frontierMap.features=[{kind:'footpath',x:6,y:3,w:1,h:1}];
  assert.equal(game.api.previewLine('wall',6,2,6,3).tiles.some(t=>t.autoGate),false);
});

test('handcrafted and generated major roads insert gates and mandatory blocked friendly routes name the exit',()=>{
  for(const options of [{stage:'frontier'},{stage:'frontier',generated:true,seed:2,archetype:'compact'}]) {
    const game=createGame(options),roads=game.state.frontierMap?.roads;
    const map=roads?game.state.frontierMap:null;
    const candidates=map?.roads??[{x:35,y:19}];
    const crossing=candidates.find(p=>game.api.preview('gate',p.x,p.y).valid);
    assert.ok(crossing);
    assert.equal(game.api.previewLine('wall',crossing.x,crossing.y,crossing.x,crossing.y).tiles[0].autoGate,true);
    assert.ok(majorRoadExits(game.state).length>0);
  }
  const game=corridor({wide:true});
  for(let y=1;y<=7;y++) assert.equal(game.api.place('wall',5,y).ok,true);
  const blocked=game.api.readiness().filter(route=>!route.ok);
  assert.equal(blocked.length,1);
  assert.match(blocked[0].message,/Mandatory route: Test keep to road exit \(0, 4\).*inaccessible to friendly/);
  assert.equal(game.api.canStart().ok,false);
  assert.equal(game.api.place('gate',5,4).ok,true);
  assert.equal(game.api.canStart().ok,true);
  assert.equal(game.api.placeLine('wall',5,4,5,4).ok,false,'matching gate is a free skip');
  structureAt(game.state,5,4).autoGate=true;
  const before=structuredClone(game.state);
  assert.equal(game.api.place('wall',5,4).ok,false,'last friendly road route is protected for an auto-gate');
  assert.deepEqual(game.state,before);
});

test('Frontier foot prefers an affordable open gap while chiselers choose the weak gate deterministically',()=>{
  const game=corridor(),state=game.state;
  for(let y=2;y<=7;y++) assert.equal(game.api.place(y===4?'gate':'wall',5,y).ok,true);
  structureAt(state,5,4).hp=80;
  const firstCrossing=type=>{
    let point={x:4,y:4};
    for(let step=0;step<40&&point.x<5;step++) point=nextStep(state,point.x,point.y,null,type);
    return point;
  };
  assert.deepEqual(firstCrossing('foot'),{x:5,y:1});
  assert.deepEqual(firstCrossing('chiseler'),{x:5,y:4});
  const copy=structuredClone(state);
  assert.deepEqual(nextStep(copy,4,4,null,'foot'),nextStep(state,4,4,null,'foot'));
  assert.deepEqual(nextStep(copy,4,4,null,'chiseler'),nextStep(state,4,4,null,'chiseler'));
});
