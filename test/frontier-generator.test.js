import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { generateFrontierContract, validateFrontierContract, frontierSeed } from '../src/sim/frontier/generator.js';
import { FRONTIER_MAP } from '../src/data/frontier/map.js';
import { FRONTIER_ARCHETYPES } from '../src/data/frontier/templates.js';
import { objectiveMet, calculateContractResults } from '../src/sim/frontier/contract.js';
import { damageStructure } from '../src/sim/grid.js';
import { stageFor, scheduleFor } from '../src/data/stages.js';

test('generated Frontier contracts and initial states reproduce the same seed and archetype',()=>{
  for(const archetype of Object.keys(FRONTIER_ARCHETYPES)) {
    const options={stage:'frontier',generated:true,seed:'river-commission',archetype};
    const a=createGame(options),b=createGame(options);
    assert.deepEqual(a.state,b.state);
    assert.deepEqual(generateFrontierContract(options.seed,archetype),generateFrontierContract(options.seed,archetype));
    assert.equal(a.state.contract.generated,true);assert.equal(a.state.contract.seed,frontierSeed(options.seed));
    assert.equal(a.state.contract.archetype,archetype);assert.equal(stageFor(a.state).map,a.state.frontierMap);
    assert.notDeepEqual(generateFrontierContract(1,archetype).map,generateFrontierContract(2,archetype).map);
  }
});

test('each Frontier archetype produces usable clustered maps across thirty deterministic seeds',()=>{
  for(const archetype of Object.keys(FRONTIER_ARCHETYPES)) for(let seed=0;seed<30;seed++) {
    const contract=generateFrontierContract(seed,archetype),label=`${archetype}/${seed}`;
    assert.equal(contract.generation.fallback,false,`${label} exhausted generation: ${JSON.stringify(contract.generation.rejected)}`);
    assert.equal(validateFrontierContract(contract).ok,true,label);
    assert.equal(contract.structures.filter(s=>s.type==='keep').length,archetype==='twin'?2:1,label);
    for(const district of contract.map.districts) {
      const buildings=contract.structures.filter(s=>s.district===district.id);
      const mean=buildings.reduce((sum,s)=>sum+Math.min(...buildings.filter(other=>other!==s).map(other=>Math.hypot(other.x-s.x,other.y-s.y))),0)/buildings.length;
      assert.ok(mean<8,`${label}/${district.id} mean nearest building ${mean}`);
    }
    const occupied=new Set();
    for(const s of contract.structures) for(let y=s.y;y<s.y+s.h;y++) for(let x=s.x;x<s.x+s.w;x++) {
      const tile=`${x},${y}`;assert.ok(!occupied.has(tile),`${label} overlap`);occupied.add(tile);
      assert.notEqual(contract.map.map[y][x],'#');
    }
    for(const entry of contract.map.spawns) {
      assert.ok(entry.x===0||entry.x===63||entry.y===0||entry.y===35,label);
      assert.notEqual(contract.map.map[entry.y][entry.x],'#');
    }
  }
});

test('Frontier validation rejects overlaps, invalid entries, disconnected paths and misplaced objectives',()=>{
  const original=generateFrontierContract(8,'compact');
  assert.equal(validateFrontierContract(original).ok,true,'HARNESS_PRECONDITION_FAILED: valid baseline candidate');
  const overlap=structuredClone(original);Object.assign(overlap.structures[1],{x:overlap.structures[0].x,y:overlap.structures[0].y});
  assert.ok(validateFrontierContract(overlap).errors.includes('Overlapping structures'));
  const spawn=structuredClone(original);spawn.map.spawns[0]={x:20,y:20};assert.equal(validateFrontierContract(spawn).ok,false);
  const isolated=structuredClone(original),keep=isolated.structures[0],cells=isolated.map.map.map(row=>row.split(''));
  for(let y=keep.y-1;y<=keep.y+keep.h;y++) for(let x=keep.x-1;x<=keep.x+keep.w;x++) if(x===keep.x-1||x===keep.x+keep.w||y===keep.y-1||y===keep.y+keep.h) cells[y][x]='#';
  isolated.map.map=cells.map(row=>row.join(''));assert.ok(validateFrontierContract(isolated).errors.includes('Keep cannot be reached by enemies'));
  const goal=structuredClone(original);goal.specialObjectives=[{id:'missing',kind:'building',location:{x:3,y:3}}];
  assert.ok(validateFrontierContract(goal).errors.includes('Objective not placed'));
  const road=structuredClone(original);road.map.roads=[];assert.ok(validateFrontierContract(road).errors.includes('Disconnected district road'));
  const orphan=structuredClone(original);orphan.map.roads.push({x:2,y:2});assert.ok(validateFrontierContract(orphan).errors.includes('Disconnected road network'));
  const marker=structuredClone(original);marker.specialObjectives=[{id:marker.structures[1].id,kind:'building',location:{x:2,y:2}}];
  assert.ok(validateFrontierContract(marker).errors.includes('Objective marker does not match building'));
  const near=structuredClone(original);near.map.spawns=[{x:63,y:18}];const target=near.structures.find(s=>s.type==='warehouse');
  target.x=60;target.y=17;near.specialObjectives=[{id:target.id,kind:'building',location:{x:60,y:17}}];
  assert.ok(validateFrontierContract(near).errors.includes('Objective too close to entry'));
});

test('Frontier rejection reseeds deterministically and forced failure selects the handcrafted fallback',()=>{
  const a=generateFrontierContract(17,'twin',{rejectAttempts:2}),b=generateFrontierContract(17,'twin',{rejectAttempts:2});
  assert.deepEqual(a,b);assert.ok(a.generation.attempts>=3);assert.equal(a.generation.fallback,false);
  assert.equal(a.generation.rejected.length,a.generation.attempts-1);
  const fallback=generateFrontierContract(17,'twin',{forceFailure:true});
  assert.equal(fallback.generation.fallback,true);assert.equal(fallback.generation.attempts,CONFIG.frontier.generator.maxAttempts);
  assert.deepEqual(fallback.map,FRONTIER_MAP);assert.equal(fallback.structures[0].id,'keep');
});

test('generated Frontier contracts reuse requests, NPCs, actual scout schedule, snapshot retry and restart',()=>{
  const game=createGame({stage:'frontier',generated:true,seed:9,archetype:'twin'}),initial=structuredClone(game.state);
  assert.equal(game.state.contract.mandatoryObjectives.filter(s=>s.id.startsWith('keep')).length,2);
  assert.equal(game.state.structures.filter(s=>s.type==='keep').length,2,'HARNESS_PRECONDITION_FAILED: generated twin keeps');
  assert.ok(game.state.contract.requests.length>=4);assert.ok(game.state.guards.length>0&&game.state.militia.length>=3);
  const count=scheduleFor(game.state).filter(e=>e.type==='foot').length;
  assert.ok(game.state.scoutReport.bullets[0].startsWith(`${count} foot raiders`));
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: generated trade access');
  damageStructure(game.state,game.state.structures.find(s=>s.id==='keep-sister'),10000);game.api.tick();
  assert.equal(game.state.phase,'defeat');assert.equal(game.state.results.result,'defeat');
  assert.equal(game.api.retrySiege(),true);assert.deepEqual(game.state,initial);
  game.api.restartCampaign();assert.deepEqual(game.state,initial);
});

test('generated special objectives itemize building and eighty-percent farming outcomes',()=>{
  const game=createGame({stage:'frontier',generated:true,seed:3,archetype:'compact'}),state=game.state;
  const farms=state.structures.filter(s=>s.district==='farms'),farmGoal={id:'farms',kind:'districtIntact',district:'farms',fraction:.8,
    label:'Keep at least 80% of farming properties standing',reward:80,penalty:60,mandatory:false,location:{x:40,y:23}};
  assert.ok(farms.length>=5,'HARNESS_PRECONDITION_FAILED: five farm properties');
  state.contract.specialObjectives=[farmGoal];assert.equal(objectiveMet(state,farmGoal),true);
  state.phase='victory';let results=calculateContractResults(state);assert.equal(results.specialObjectives[0].met,true);
  assert.equal(results.bonuses.find(b=>b.key==='farms').amount,80);
  for(const s of farms.slice(0,2)) damageStructure(state,s,10000);
  assert.equal(objectiveMet(state,farmGoal),false);results=calculateContractResults(state);assert.equal(results.specialPenalty,60);
  const warehouse=state.structures.find(s=>s.type==='warehouse'),buildingGoal={id:warehouse.id,kind:'building'};
  assert.equal(objectiveMet(state,buildingGoal),true);damageStructure(state,warehouse,10000);assert.equal(objectiveMet(state,buildingGoal),false);
});
