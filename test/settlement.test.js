import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { growSettlement, rateDefense, settlementOutside } from '../src/sim/settlement.js';
import { hasTradeRoad } from '../src/sim/build.js';
import { tileAt, damageStructure } from '../src/sim/grid.js';
import { WIDTH, SITES } from '../src/data/map.js';
import { structure } from './helpers.js';

test('performance is pure and weighs surviving inhabitants, keep HP, civilians and invasion',()=>{
  const state=createGame().state;
  const house=structure(state,'house',51,10);
  state.snapshot=structuredClone(state);
  const before=structuredClone(state);
  assert.deepEqual(rateDefense(state),{rating:100,tier:'exceptional'});
  assert.deepEqual(state,before);
  state.inhabitants[0].hp=0;state.structures[0].hp/=2;state.keepReached=true;
  damageStructure(state,house,999);
  assert.deepEqual(rateDefense(state),{rating:48.33,tier:'standard'});
  const empty=createGame().state;
  empty.structures[0].hp=empty.structures[0].maxHp/2;
  assert.deepEqual(rateDefense(empty),{rating:85,tier:'strong'},'no civilians receives the full civilian score');
});

test('growth is free, deterministic, supplies homes and food, and scales with defense tier',()=>{
  const counts=[];
  for(const tier of ['standard','strong','exceptional']) {
    const state=createGame(12).state,twin=structuredClone(state),gold=state.gold;
    const report=growSettlement(state,tier);
    growSettlement(twin,tier);
    assert.deepEqual(state,twin);
    assert.equal(state.gold,gold);
    assert.equal(report.houses,CONFIG.growth.tiers[tier].houses);
    assert.equal(report.farms,CONFIG.growth.tiers[tier].farms);
    assert.deepEqual(report.shortage,{houses:0,farms:0});
    assert.equal(state.population,6+4*report.houses);
    assert.equal(state.inhabitants.length,state.population);
    assert.ok(state.inhabitants.every(p=>state.structures.some(s=>s.id===p.homeId)));
    const food=state.structures.reduce((n,s)=>n+(CONFIG.structures[s.type].food??0),0);
    assert.ok(food>=state.population);
    assert.ok(hasTradeRoad(state));
    counts.push(report.houses+report.farms);
  }
  assert.ok(counts[0]<counts[1]&&counts[1]<counts[2]);
});

test('exceptional growth reserves an outside building beyond a player wall ring',()=>{
  const state=createGame().state;
  for(let x=53;x<=61;x++) for(const y of [13,21]) structure(state,'wall',x,y);
  for(let y=14;y<=20;y++) for(const x of [53,61]) structure(state,x===53&&y===17?'gate':'wall',x,y);
  assert.ok(hasTradeRoad(state),'HARNESS_PRECONDITION_FAILED: wall ring has a merchant gate');
  const outside=settlementOutside(state);
  assert.equal(outside[17*WIDTH+56],Infinity,'HARNESS_PRECONDITION_FAILED: ring encloses the keep');
  const military=structuredClone(state.structures.filter(s=>s.type!=='keep'));
  const report=growSettlement(state,'exceptional');
  assert.ok(report.outside>=1);
  assert.equal(report.houses,3);
  assert.equal(report.farms,2);
  assert.deepEqual(state.structures.filter(s=>military.some(old=>old.id===s.id)),military);
  assert.ok(hasTradeRoad(state));
  const fresh=state.structures.filter(s=>report.buildingIds.includes(s.id));
  assert.ok(fresh.some(s=>outside[s.y*WIDTH+s.x]<Infinity));
  for(const s of fresh) {
    assert.ok(s.x>=CONFIG.growth.minSpawnDistance);
    for(let y=s.y;y<s.y+s.h;y++) for(let x=s.x;x<s.x+s.w;x++) assert.ok('.C'.includes(tileAt(x,y)));
    for(const other of state.structures) if(s.id!==other.id) {
      const clearance=military.some(m=>m.id===other.id)?CONFIG.growth.militaryClearance:0;
      assert.ok(s.x+s.w<=other.x-clearance||s.x>=other.x+other.w+clearance||
        s.y+s.h<=other.y-clearance||s.y>=other.y+other.h+clearance,'buildings neither overlap nor crowd military structures');
    }
  }
});

test('destroyed civilian buildings rebuild at their positions without charging gold',()=>{
  const state=createGame().state;
  const house=structure(state,'house',51,10),farm=structure(state,'farm',54,10);
  damageStructure(state,house,999);damageStructure(state,farm,999);
  const original=[house,farm].map(s=>({id:s.id,x:s.x,y:s.y})),gold=state.gold;
  const report=growSettlement(state,'standard');
  assert.equal(report.repaired,2);assert.equal(state.gold,gold);
  for(const old of original) {
    const s=state.structures.find(s=>s.id===old.id);
    assert.equal(s.x,old.x);assert.equal(s.y,old.y);assert.equal(s.hp,s.maxHp);assert.equal(s.destroyed,false);
    assert.ok(!state.rubble.some(r=>r.id===s.id));
  }
});

test('growth reports a shortage gracefully when no sites remain',()=>{
  const state=createGame().state;
  // Restrict every buildable tile while leaving the existing road traversable.
  // Destroyed military footprints remain owned and cannot be overwritten.
  for(let y=0;y<36;y++) for(let x=7;x<64;x++) if('.C'.includes(tileAt(x,y))) {
    const blocker=structure(state,'wall',x,y);blocker.destroyed=true;blocker.hp=0;
  }
  assert.ok(hasTradeRoad(state),'HARNESS_PRECONDITION_FAILED: reserved rubble does not block merchants');
  const report=growSettlement(state,'exceptional');
  assert.equal(report.houses,0);assert.equal(report.farms,0);
  assert.deepEqual(report.shortage,{houses:3,farms:2});
  assert.equal(state.population,6);assert.ok(hasTradeRoad(state));
});

test('built pendulum strike bands remain clear of new settlement buildings',()=>{
  const state=createGame().state,site=SITES[2];
  state.pendulum={siteId:site.id};
  const report=growSettlement(state,'exceptional');
  for(const s of state.structures.filter(s=>report.buildingIds.includes(s.id))) {
    for(let i=0;i<=100;i++) {
      const angle=site.centerAngle-site.halfSweep+2*site.halfSweep*i/100;
      const x=site.pivotX+Math.cos(angle)*site.armLength,y=site.pivotY+Math.sin(angle)*site.armLength;
      assert.ok(Math.hypot(Math.max(s.x-x,0,x-s.x-s.w),Math.max(s.y-y,0,y-s.y-s.h))>CONFIG.pendulum.radius);
    }
  }
});

test('food shortage adds extra farms beyond the tier allocation without spending gold',()=>{
  const state=createGame().state;
  structure(state,'house',51,10);
  structure(state,'house',54,10);
  structure(state,'house',59,10);
  state.population=CONFIG.structures.keep.housing+3*CONFIG.structures.house.housing;
  const gold=state.gold,report=growSettlement(state,'standard');
  assert.ok(report.farms>CONFIG.growth.tiers.standard.farms);
  assert.equal(state.gold,gold);
  assert.equal(report.shortage.farms,0);
  const food=state.structures.reduce((n,s)=>n+(CONFIG.structures[s.type].food??0),0);
  assert.ok(food>=state.population);
  assert.ok(hasTradeRoad(state));
});
