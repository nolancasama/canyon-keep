import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Effects } from '../src/render/effects.js';

test('bounty feedback aggregates nearby kills by render time even across a batched simulation step',()=>{
  const effects=new Effects(),state={time:20,events:[
    {type:'bounty',t:1,x:10,y:10,amount:2},
    {type:'bounty',t:1.12,x:11,y:10,amount:5},
    {type:'bounty',t:1.24,x:10,y:11,amount:5},
    {type:'bounty',t:1.5,x:10,y:10,amount:3},
    {type:'bounty',t:1.5,x:14,y:10,amount:100},
  ]};
  const before=structuredClone(state);
  effects.ingest(state);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[15,100]);
  effects.ingest(state);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[15,100]);
  assert.deepEqual(state,before,'presentation preserves the simulation event history');
});

test('bounty feedback expires and clears when retry replaces the state',()=>{
  const effects=new Effects(),state={time:1,events:[{type:'bounty',t:1,x:10,y:10,amount:2}]};
  effects.ingest(state);
  effects.update(CONFIG.bountyFeedback.duration);
  assert.equal(effects.bounties.length,0);
  state.events.push({type:'bounty',t:2,x:10,y:10,amount:5});
  effects.ingest(state);
  assert.equal(effects.bounties.length,1);
  effects.ingest({time:0,events:[]});
  assert.equal(effects.bounties.length,0);
});

test('bounty feedback draws the aggregated gold total near the kill',()=>{
  const effects=new Effects(),texts=[],context={save(){},restore(){},measureText(text){return {width:text.length*8};},strokeText(){},fillText(...args){texts.push(args);}};
  effects.ingest({time:1,events:[{type:'bounty',t:1,x:10,y:10,amount:7}]});
  effects.draw(context);
  assert.deepEqual(texts,[['+7 G',200,188]]);
});

test('bounty feedback merges across render frames only within the presentation window',()=>{
  const effects=new Effects(),state={phase:'siege',events:[{type:'bounty',t:1,x:10,y:10,amount:2}]};
  effects.ingest(state);effects.update(CONFIG.bountyFeedback.mergeSeconds*.5);
  state.events.push({type:'bounty',t:9,x:10,y:10,amount:5});effects.ingest(state);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[7]);
  effects.update(CONFIG.bountyFeedback.mergeSeconds+.01);
  state.events.push({type:'bounty',t:9.01,x:10,y:10,amount:3});effects.ingest(state);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[7,3]);
});

test('bounty labels use measured non-overlapping boxes and grow with larger sums',()=>{
  const effects=new Effects(),state={phase:'siege',events:[]},context={measureText(text){return {width:text.length*10};}};
  for(let i=0;i<20;i++)state.events.push({type:'bounty',t:i*3,x:10+(i%4)*2.1,y:2+Math.floor(i/4)*.1,amount:i===0?100:3});
  effects.ingest(state);
  const labels=effects.bountyLayout(context);
  assert.ok(labels.length>1);
  assert.ok(labels[0].size>labels.at(-1).size);
  for(let i=0;i<labels.length;i++)for(let j=0;j<i;j++){const a=labels[i],b=labels[j],collides=Math.abs(a.x-b.x)<(a.width+b.width)/2&&a.y-a.size-3<b.y+4&&a.y+4>b.y-b.size-3;assert.equal(collides,false,`${a.text} and ${b.text} overlap`);}
  assert.ok(labels.every(b=>b.y-b.size>=2),'top-edge labels stay on canvas');
});

test('pendulum impacts scale one capped shake and keep particles bounded',()=>{
  const impact=hits=>{const effects=new Effects();effects.ingest({events:[{type:'pendulumImpact',x:10,y:10,hits}]});return effects;};
  const single=impact(1),crowd=impact(20);
  assert.ok(crowd.shake>single.shake);assert.ok(crowd.shake<=7);
  assert.ok(single.particles.some(p=>p.life>0&&p.kind==='cloud'));
  crowd.ingest({events:Array.from({length:100},()=>({type:'pendulumImpact',x:10,y:10,hits:20}))});
  assert.ok(crowd.shake<=7);assert.equal(crowd.particles.length,280);assert.ok(crowd.rings.length<=20);
  crowd.update(.4);assert.equal(crowd.shake,0);
});

test('powder chains struck by the pendulum receive a stronger flash using entity IDs',()=>{
  const effects=new Effects(),state={events:[
    {type:'enemyDeath',id:1,entityId:50,enemyType:'powder',x:10,y:10,t:1},
    {type:'pendulumHit',id:2,entityId:50,enemyType:'powder',x:10,y:10,t:1},
    {type:'enemyDeath',id:3,entityId:60,enemyType:'powder',x:11,y:10,t:1.12},
    {type:'explosion',id:4,sourceId:50,x:10,y:10,t:1.12},
    {type:'explosion',id:5,sourceId:60,x:11,y:10,t:1.24},
    {type:'explosion',id:6,sourceId:70,x:20,y:10,t:2},
  ]};
  const before=structuredClone(state);effects.ingest(state);
  assert.deepEqual(effects.rings.filter(r=>r.kind==='blast').map(r=>r.titan),[true,true,false]);
  assert.deepEqual(state,before);
});

test('returning to prep and retrying a later siege never replays historical bounty labels',()=>{
  const effects=new Effects(),state={phase:'siege',time:1,events:[{type:'bounty',t:1,x:10,y:10,amount:2}]};
  effects.ingest(state);
  assert.equal(effects.bounties.length,1);
  state.phase='prep';
  effects.ingest(state);
  assert.equal(effects.bounties.length,0);
  const retry=structuredClone(state);
  effects.ingest(retry);
  assert.equal(effects.bounties.length,0);
  retry.phase='siege';
  retry.events.push({type:'bounty',t:1,x:10,y:10,amount:5});
  effects.ingest(retry);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[5]);
});
