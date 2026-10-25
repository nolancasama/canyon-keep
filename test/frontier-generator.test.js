import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { generateFrontierContract, generateGarrisons, validateFrontierContract, frontierSeed } from '../src/sim/frontier/generator.js';
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
      assert.ok(entry.x===0||entry.x===contract.map.map[0].length-1||entry.y===0||entry.y===contract.map.map.length-1,label);
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
  assert.ok(game.state.contract.requests.length>=4);assert.ok(game.state.guards.length+game.state.archers.length+game.state.cavalry.length>0&&game.state.militia.length>=3);
  const fronts=scheduleFor(game.state).map(e=>e.front),report=game.state.scoutReport.bullets.join(' ');
  for(const front of game.state.frontierSiege.plan.fronts) assert.ok(fronts.includes(front.id)&&report.includes(front.name),`scout report names the ${front.name} front`);
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: generated trade access');
  damageStructure(game.state,game.state.structures.find(s=>s.id==='keep-sister'),10000);game.api.tick();
  assert.equal(game.state.phase,'defeat');assert.equal(game.state.results.result,'defeat');
  assert.equal(game.api.retrySiege(),true);assert.deepEqual(game.state,initial);
  game.api.restartCampaign();assert.deepEqual(game.state,initial);
});

test('generated garrisons are deterministic, independently budgeted and allow every single-type roster',()=>{
  const types=['footmen','archers','cavalry'],seen=new Set(),single=new Set(),missing=new Set();let independentTwins=false,poorCavalry=false;
  for(const archetype of Object.keys(FRONTIER_ARCHETYPES)) {
    const contract=generateFrontierContract(1,archetype);
    assert.deepEqual(contract.garrisons,generateGarrisons(1,archetype,contract.map,contract.structures,contract.siege));
    for(let seed=0;seed<60;seed++) {
      const rosters=generateGarrisons(seed,archetype,contract.map,contract.structures,contract.siege);
      assert.deepEqual(rosters,generateGarrisons(seed,archetype,contract.map,contract.structures,contract.siege));
      assert.equal(rosters.length,contract.structures.filter(s=>s.type==='keep').length+(archetype==='outpost'?1:0));
      if(archetype==='twin') {
        assert.notEqual(rosters[0].keepId,rosters[1].keepId);
        if(types.some(type=>rosters[0][type]!==rosters[1][type])) independentTwins=true;
      }
      for(const roster of rosters) {
        const present=types.filter(type=>roster[type]>0),strength=types.reduce((n,type)=>n+roster[type]*CONFIG.frontier.garrison.costs[type],0);
        assert.ok(present.length>0,`${archetype}/${seed} has defenders`);
        assert.ok(strength<=roster.budget+1e-9,`${archetype}/${seed} strength ${strength} exceeds ${roster.budget}`);
        assert.ok(Math.abs(strength-roster.strength)<1e-9);
        for(const type of types) (roster[type]>0?seen:missing).add(type);
        if(present.length===1) single.add(present[0]);
        if(roster.wealth<CONFIG.frontier.garrison.poorThreshold&&roster.cavalry>0) poorCavalry=true;
      }
    }
  }
  assert.deepEqual([...seen].sort(),[...types].sort());assert.deepEqual([...missing].sort(),[...types].sort());
  assert.deepEqual([...single].sort(),[...types].sort());assert.ok(independentTwins);assert.ok(poorCavalry);
  const authored=createGame({stage:'frontier'}).state;
  assert.equal(authored.guards.length,4);assert.equal(authored.archers.length,0);assert.equal(authored.cavalry.length,0);
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

function components(tiles) {
  const left=new Set(tiles),groups=[];
  for(const start of tiles) {
    if(!left.has(start)) continue;
    const queue=[start];left.delete(start);
    for(let i=0;i<queue.length;i++) {
      const [x,y]=queue[i].split(',').map(Number);
      for(const next of [`${x+1},${y}`,`${x-1},${y}`,`${x},${y+1}`,`${x},${y-1}`]) if(left.has(next)) {left.delete(next);queue.push(next);}
    }
    groups.push(queue);
  }
  return groups;
}

test('generated contracts vary terrain, towns and budgets, and rivers are continuous with one to three crossings',()=>{
  for(const archetype of Object.keys(FRONTIER_ARCHETYPES)) {
    const patterns=new Set(),keeps=new Set(),budgets=new Set(),boxes=new Set();
    for(let seed=0;seed<30;seed++) {
      const contract=generateFrontierContract(seed,archetype),map=contract.map;
      patterns.add(map.terrainPattern);keeps.add(`${map.keep.x},${map.keep.y}`);budgets.add(contract.budget);
      boxes.add(map.districts.map(d=>[d.x,d.y,d.w,d.h].join(':')).join('|'));
      const tiles=kind=>map.features.filter(f=>f.kind===kind).flatMap(f=>Array.from({length:f.w*f.h},(_,i)=>`${f.x+i%f.w},${f.y+Math.floor(i/f.w)}`));
      const river=tiles('river');
      if(!river.length) continue;
      const crossing=new Set([...tiles('ford'),...tiles('bridge')]),water=[...new Set([...river,...crossing])];
      assert.equal(components(water).length,1,`${archetype} seed ${seed} river channel is one four-connected body`);
      // Rivers run either north-south or east-west, always edge to edge.
      const rows=new Set(water.map(t=>+t.split(',')[1])),columns=new Set(water.map(t=>+t.split(',')[0]));
      assert.ok(rows.size===map.map.length||columns.size===map.map[0].length,`${archetype} seed ${seed} river spans the map`);
      for(const t of river) if(!crossing.has(t)) {const [x,y]=t.split(',').map(Number);assert.equal(map.map[y][x],'#',`${archetype} seed ${seed} river ${t} has no porous gap`);}
      const count=components([...crossing]).length;
      assert.ok(count>=1&&count<=3,`${archetype} seed ${seed} has ${count} river crossings`);
    }
    assert.ok(patterns.size>=3,`${archetype} uses ${patterns.size} terrain patterns`);
    assert.ok(keeps.size>=8,`${archetype} has ${keeps.size} keep positions`);
    assert.ok(budgets.size>=6,`${archetype} has ${budgets.size} budgets`);
    assert.ok(boxes.size>1,`${archetype} district boxes vary`);
  }
});
