import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, SIM_DT } from '../src/config.js';
import { createGame } from '../src/sim/campaign.js';
import { generateFrontierContract } from '../src/sim/frontier/generator.js';
import { FRONTIER_ARCHETYPES } from '../src/data/frontier/templates.js';
import { WIDTH, HEIGHT } from '../src/data/map.js';

const centre={x:(WIDTH-1)/2,y:(HEIGHT-1)/2};
const rectDistance=(p,r)=>Math.hypot(Math.max(r.x-p.x,0,p.x-(r.x+r.w-1)),Math.max(r.y-p.y,0,p.y-(r.y+r.h-1)));

test('generated sieges place central keeps and unequal fronts from every compass direction',()=>{
  for(const archetype of Object.keys(FRONTIER_ARCHETYPES)) {
    const directions=new Set(),types=new Set();
    for(let seed=0;seed<30;seed++) {
      const contract=generateFrontierContract(seed,archetype),plan=contract.siege.plan,label=`${archetype}/${seed}`;
      assert.equal(contract.generation.fallback,false,label);
      const keeps=contract.structures.filter(s=>s.type==='keep').map(k=>({x:k.x+1.5-centre.x,y:k.y+1.5-centre.y}));
      if(archetype==='twin') {
        assert.ok(Math.hypot(keeps[0].x-keeps[1].x,keeps[0].y-keeps[1].y)>=14,`${label} twin keeps are apart`);
        assert.ok(keeps[0].x*keeps[1].x+keeps[0].y*keeps[1].y<0,`${label} twin keeps flank the centre`);
      } else assert.ok(Math.hypot(keeps[0].x,keeps[0].y)<=7,`${label} keep near the centre`);
      types.add(plan.type);
      for(const front of plan.fronts) {
        directions.add(front.direction);
        assert.ok(front.lanes.length>=1,`${label} ${front.name} has entries`);
        for(const lane of front.lanes) {
          const p=contract.map.spawns[lane];
          assert.ok(p.x===0||p.y===0||p.x===WIDTH-1||p.y===HEIGHT-1,`${label} entry on the edge`);
          for(const d of contract.map.districts) assert.ok(rectDistance(p,d)>=CONFIG.frontier.generator.spawnDistrictDistance,`${label} entry clear of ${d.id}`);
        }
      }
      for(let wave=0;wave<plan.waves;wave++) assert.ok(Math.max(...plan.fronts.map(f=>f.waveShares[wave]))>=.5,`${label} wave ${wave+1} has a main front`);
      // Strength is unequal within each wave; a shifted second wave may even out the totals.
      for(let wave=0;wave<plan.waves;wave++) {
        const shares=plan.fronts.map(f=>f.waveShares[wave]).filter(s=>s>0);
        if(shares.length>1) assert.ok(Math.max(...shares)-Math.min(...shares)>.1,`${label} wave ${wave+1} fronts are unequal`);
      }
      assert.ok(Math.abs(plan.fronts.reduce((n,f)=>n+f.share,0)-1)<1e-9,`${label} shares sum to the whole force`);
      assert.ok(contract.siege.groups.every(g=>plan.fronts.some(f=>f.id===g.front&&f.lanes.includes(g.lane))),`${label} every enemy enters through its front`);
    }
    assert.equal(directions.size,8,`${archetype} uses all eight directions`);
    assert.ok(types.size>=3,`${archetype} uses ${types.size} plan types`);
  }
});

test('scout reports name every front and band strength without exact counts or times',()=>{
  for(const archetype of Object.keys(FRONTIER_ARCHETYPES)) for(let seed=0;seed<15;seed++) {
    const contract=generateFrontierContract(seed,archetype),text=contract.siege.scoutReport.join(' ');
    for(const front of contract.siege.plan.fronts) assert.ok(new RegExp(`\\b${front.name}\\b`).test(text),`${archetype}/${seed} names ${front.name}`);
    assert.ok(!/\d/.test(text.replace(/roughly \d+ raiders/,'')),`${archetype}/${seed} gives no exact figures: ${text}`);
    const roughly=+text.match(/roughly (\d+) raiders/)[1];
    assert.equal(roughly%5,0,'raider total is rounded');
  }
});

test('an edge warning precedes the first entry from each front by the configured lead',()=>{
  // Seed 1 compact has a second wave and staggered fronts (see the balance fixture).
  const game=createGame({stage:'frontier',generated:true,seed:1,archetype:'compact'}),lead=CONFIG.frontier.fronts.warningLead;
  const late=game.state.frontierSiege.plan.fronts.filter(f=>f.firstT>lead+1).sort((a,b)=>a.firstT-b.firstT)[0];
  assert.ok(late,'HARNESS_PRECONDITION_FAILED: a front that opens after the lead time');
  assert.equal(game.api.startSiege().ok,true);
  game.api.stepSeconds(late.firstT-lead-.5);
  assert.ok(!game.state.frontWarnings.some(w=>w.frontId===late.id),'no warning before the lead window');
  game.api.stepSeconds(.5+2*SIM_DT);
  const warning=game.state.frontWarnings.find(w=>w.frontId===late.id);
  assert.ok(warning,'warning fires at the lead window');
  assert.ok(warning.entryT-warning.t>=lead-2*SIM_DT,'warning arrives before the first entry');
  assert.ok(game.state.time<late.firstT,'first entry from that front has not happened yet');
  assert.ok(game.state.events.some(e=>e.type==='frontWarning'&&e.frontId===late.id),'frontWarning event emitted');
});

test('the handcrafted Frontier contract keeps its single eastern schedule without front warnings',()=>{
  const game=createGame({stage:'frontier'});
  assert.equal(game.state.frontierSiege,undefined);
  assert.equal(game.api.startSiege().ok,true);game.api.stepSeconds(5);
  assert.equal(game.state.frontWarnings,undefined);
});
