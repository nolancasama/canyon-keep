import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { estimateEnclosure, frontierBudgetPlan } from '../src/sim/frontier/budget.js';
import { generateFrontierContract } from '../src/sim/frontier/generator.js';
import { createGame } from '../src/sim/campaign.js';
import { FRONTIER_MAP } from '../src/data/frontier/map.js';
import { frontierSettlement } from '../src/data/frontier/settlement.js';

const plain=()=>({map:Array(36).fill('.'.repeat(64)),roads:[],districts:[{id:'town',name:'Town'}]});
const lot=(type,x,y,id='town')=>({type,x,y,w:CONFIG.structures[type].w,h:CONFIG.structures[type].h,district:id,hp:100,destroyed:false});

test('enclosure footprint ring counts terrain, roads and built walls using configured prices',()=>{
  const map=plain(),buildings=[lot('keep',25,15)],base=estimateEnclosure(map,buildings,'town');
  const [rock,road,wall]=base.ring,cells=map.map.map(r=>r.split(''));
  cells[rock.y][rock.x]='#';map.map=cells.map(r=>r.join(''));map.roads=[road];
  buildings.push({...lot('wall',wall.x,wall.y),w:1,h:1});
  const result=estimateEnclosure(map,buildings,'town');
  assert.equal(result.naturalTiles,1);assert.equal(result.gateTiles,1);assert.equal(result.existingTiles,1);
  assert.equal(result.wallTiles,base.wallTiles-3);assert.equal(result.ring.length,base.ring.length);
  assert.equal(result.cost,result.wallTiles*CONFIG.structures.wall.cost+CONFIG.structures.gate.cost);
  assert.deepEqual(estimateEnclosure(map,buildings,'town'),result);
});

test('a connected irregular enclosure follows footprints rather than its padded bounding rectangle',()=>{
  const map=plain(),buildings=[lot('keep',20,12),lot('house',25,12),lot('house',30,12),lot('house',20,17),lot('house',20,22)];
  const estimate=estimateEnclosure(map,buildings,'town'),pad=CONFIG.frontier.enclosure.clearance+1;
  const x0=Math.min(...buildings.map(s=>s.x))-pad,y0=Math.min(...buildings.map(s=>s.y))-pad;
  const x1=Math.max(...buildings.map(s=>s.x+s.w-1))+pad,y1=Math.max(...buildings.map(s=>s.y+s.h-1))+pad;
  assert.ok(estimate.cost<(2*(x1-x0+1)+2*(y1-y0-1))*CONFIG.structures.wall.cost);
  // A flood from every map edge cannot enter any included lot: the curtain
  // closes the same four-connected movement graph used by enemy pathing.
  const blocked=new Set(estimate.ring.map(p=>`${p.x},${p.y}`)),seen=new Set(),queue=[];
  const visit=(x,y)=>{const key=`${x},${y}`;if(x>=0&&y>=0&&x<64&&y<36&&!blocked.has(key)&&!seen.has(key)) {seen.add(key);queue.push({x,y});}};
  for(let x=0;x<64;x++) {visit(x,0);visit(x,35);}
  for(let y=0;y<36;y++) {visit(0,y);visit(63,y);}
  for(let i=0;i<queue.length;i++) {const {x,y}=queue[i];visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);}
  for(const s of buildings) assert.equal(seen.has(`${s.x},${s.y}`),false,'included property is inside the curtain');
});

test('remote farms and an elongated scattered district cannot inflate the main-town estimate',()=>{
  const map=plain(),compact=[lot('keep',28,16),lot('house',24,16),lot('house',28,21)];
  const baseline=estimateEnclosure(map,compact,'town');
  const remote=[lot('farm',2,2),lot('farm',58,30),lot('house',3,29),lot('farm',60,2)];
  assert.equal(estimateEnclosure(map,[...compact,...remote],'town').cost,baseline.cost);
  const elongated=[...compact,...remote,lot('house',18,17),lot('house',39,17)];
  assert.ok(estimateEnclosure(map,elongated,'town').cost<=baseline.cost*3);
  assert.ok(estimateEnclosure(map,[...compact,lot('house',36,16)],'town').cost>baseline.cost,'nearby geometry changes enclosure costs');
});

test('generated budgets use deterministic geometry weights and leave equipment tradeoffs',()=>{
  for(const archetype of ['compact','twin','outpost']) for(let seed=0;seed<16;seed++) {
    const candidate=generateFrontierContract(seed,archetype),plan=candidate.budgetPlan,rules=CONFIG.frontier.budgets,formula=rules.archetypes[archetype];
    assert.equal(candidate.generation.fallback,false);
    assert.equal(candidate.budget,plan.available);assert.deepEqual(plan,generateFrontierContract(seed,archetype).budgetPlan);
    const weighted=plan.settlements.reduce((n,s,i)=>n+s.cost*formula.weights[i],0);
    assert.equal(plan.weighted,weighted);
    assert.equal(candidate.budget,Math.max(rules.min,Math.min(rules.max,Math.round(weighted*(1+formula.equipmentAllowance)/rules.roundTo)*rules.roundTo)));
    const [main,other]=plan.settlements;
    assert.ok(candidate.budget>=weighted,'weighted basic works are affordable');
    assert.ok(candidate.budget>=main.cost+CONFIG.structures.tower.cost,'main enclosure leaves equipment money');
    if(other) {
      assert.ok(candidate.budget<plan.combined+main.cost*formula.equipmentAllowance,'both complete enclosures plus main equipment exceed budget');
      if(archetype==='twin') assert.ok(main.cost>=other.cost,'larger twin town gets full weight');
    }
    for(const estimate of plan.settlements) {
      assert.deepEqual(estimateEnclosure(candidate.map,candidate.structures,estimate.id).ring,estimate.ring);
      for(const p of estimate.ring) assert.equal(candidate.structures.some(s=>p.x>=s.x&&p.x<s.x+s.w&&p.y>=s.y&&p.y<s.y+s.h),false,'ring tiles avoid occupied client lots');
    }
  }
});

test('contract budget plans change with geometry and survive handcrafted generator fallback',()=>{
  for(const archetype of ['compact','twin','outpost']) {
    const budgets=new Set(Array.from({length:8},(_,seed)=>generateFrontierContract(seed,archetype).budget));
    assert.ok(budgets.size>1);
  }
  const fallback=generateFrontierContract(7,'twin',{forceFailure:true});
  assert.equal(fallback.budgetPlan.available,CONFIG.frontier.budget);
  assert.deepEqual(fallback.budgetPlan,frontierBudgetPlan(FRONTIER_MAP,frontierSettlement(),'handcrafted',CONFIG.frontier.budget));
});

test('handcrafted commission affords the town and equipment while outskirts require compromise; Canyon treasury is unchanged',()=>{
  const game=createGame({stage:'frontier'}),plan=game.state.contract.budgetPlan;
  const town=plan.settlements.find(s=>s.id==='town');
  assert.equal(game.state.gold,CONFIG.frontier.budget);assert.equal(plan.available,game.state.gold);
  assert.ok(game.state.gold>=town.cost+CONFIG.structures.tower.cost*2);
  assert.ok(game.state.gold<plan.combined,'protecting farms and hamlet as well needs compromise');
  assert.equal(createGame().state.gold,1000);assert.equal(CONFIG.startingGold,1000);
});
