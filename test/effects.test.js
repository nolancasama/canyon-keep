import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Effects } from '../src/render/effects.js';

test('bounty feedback aggregates nearby chain kills within the event-time window',()=>{
  const effects=new Effects(),state={time:20,events:[
    {type:'bounty',t:1,x:10,y:10,amount:2},
    {type:'bounty',t:1.12,x:11,y:10,amount:5},
    {type:'bounty',t:1.24,x:10,y:11,amount:5},
    {type:'bounty',t:1.5,x:10,y:10,amount:3},
    {type:'bounty',t:1.5,x:14,y:10,amount:100},
  ]};
  const before=structuredClone(state);
  effects.ingest(state);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[12,3,100]);
  effects.ingest(state);
  assert.deepEqual(effects.bounties.map(b=>b.amount),[12,3,100]);
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
  const effects=new Effects(),texts=[],context={save(){},restore(){},strokeText(){},fillText(...args){texts.push(args);}};
  effects.ingest({time:1,events:[{type:'bounty',t:1,x:10,y:10,amount:7}]});
  effects.draw(context);
  assert.deepEqual(texts,[['+7 G',200,188]]);
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
