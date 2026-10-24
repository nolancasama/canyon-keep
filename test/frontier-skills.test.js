import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { SITES } from '../src/data/map.js';
import { createGame } from '../src/sim/campaign.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { damageStructure } from '../src/sim/grid.js';
import { activate, registry, stepMechanisms } from '../src/sim/mechanisms.js';
import { stepPendulum } from '../src/sim/pendulum.js';
import { normalizeSkills, skillEffects, classAMaxHp, emergencyBuildTime } from '../src/sim/frontier/skills.js';
import { CAREER_STORAGE_KEY, normalizeCareer, createCareerController } from '../src/ui/frontier-career.js';

const levels={communication:4,structural:4,field:4,mechanical:4};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
function placed(game,type,x,y) {
  const result=game.api.place(type,x,y);
  assert.equal(result.ok,true,`HARNESS_PRECONDITION_FAILED: ${type} ${x},${y}: ${result.reason}`);
  return result.structure;
}
function start(game) {
  assert.equal(game.api.startSiege().ok,true,'HARNESS_PRECONDITION_FAILED: siege started');
  game.state.schedule=[{t:1000,type:'boss',lane:1}];game.state.spawnIndex=0;
}
function finish(game) {
  game.state.schedule=[];game.state.spawnIndex=0;game.state.enemies=[];game.api.tick();
  assert.ok(game.state.results,'HARNESS_PRECONDITION_FAILED: contract finalized');
  return game.state.results;
}

test('Frontier skills default to 2/1/1/1, clamp plain inputs, and expose each current effect',()=>{
  assert.deepEqual(normalizeSkills(),{communication:2,structural:1,field:1,mechanical:1});
  assert.deepEqual(normalizeSkills({communication:99,structural:-4,field:2.9,mechanical:NaN}),
    {communication:4,structural:1,field:2,mechanical:1});
  const input={...levels},game=createGame({stage:'frontier',skills:input});input.field=1;
  assert.deepEqual(game.state.skills,levels,'contract copies plain career skills');
  const effects=skillEffects(levels);
  close(effects.structuralHpBonus,.15);close(effects.emergencyBuildTime,1.1);
  close(effects.cooldownReduction,.24);assert.equal(effects.guardLimit,4);
  assert.equal(skillEffects({communication:1}).guardLimit,0);
  assert.equal(skillEffects({communication:2}).guardLimit,2);
});

test('Structural raises every finite Class A max HP by exactly 5% per level, excluding property and Class B',()=>{
  for(let level=1;level<=4;level++) {
    const game=createGame({stage:'frontier',skills:{structural:level}}),state=game.state;
    for(const type of ['wall','gate','tower','spiked','golem','launcher','sensor','retractable']) {
      const hp=type==='gate'?CONFIG.frontier.gateHp:CONFIG.structures[type].hp;
      close(classAMaxHp(state,type,hp),hp+hp*.05*(level-1));
    }
    for(const type of ['keep','house','farm','palisade','barricade','caltrops'])
      assert.equal(classAMaxHp(state,type,CONFIG.structures[type].hp),CONFIG.structures[type].hp);
    const wall=placed(game,'wall',8,18),tower=placed(game,'tower',9,18),palisade=placed(game,'palisade',10,18);
    close(wall.hp,200+10*(level-1));assert.equal(wall.hp,wall.maxHp);
    close(tower.maxHp,250+12.5*(level-1));assert.equal(palisade.maxHp,100);
    const gate=placed(game,'gate',8,18);close(gate.maxHp,CONFIG.frontier.gateHp*(1+CONFIG.frontier.skills.structuralHpPerLevel*(level-1)));
    assert.equal(state.structures.find(s=>s.type==='keep').maxHp,CONFIG.structures.keep.hp);
  }
});

test('Field emergency site duration decreases by exactly 0.3 seconds per level and respects the configured floor',()=>{
  for(let level=1;level<=4;level++) {
    const game=createGame({stage:'frontier',skills:{field:level}});start(game);
    const result=game.api.placeEmergency('palisade',8,18);
    assert.equal(result.ok,true,'HARNESS_PRECONDITION_FAILED: emergency site placed');
    close(result.site.duration,2-.3*(level-1));
  }
  const before=CONFIG.frontier.buildTime;
  try {
    CONFIG.frontier.buildTime=1;
    assert.equal(emergencyBuildTime({stageId:'frontier',skills:{field:4}}),CONFIG.frontier.skills.minBuildTime);
  } finally {CONFIG.frontier.buildTime=before;}
});

test('Mechanical reduces sensor, launcher, retractable normal/occupied cooldowns and pendulum reset by 8% per level',()=>{
  for(let level=1;level<=4;level++) {
    const game=createGame({stage:'frontier',skills:{mechanical:level}}),state=game.state,factor=1-.08*(level-1);
    const sensor=placed(game,'sensor',8,18),launcher=placed(game,'launcher',9,18),wall=placed(game,'retractable',10,18);
    start(game);assert.equal(activate(state,launcher),true);close(launcher.cooldown,5*factor);
    assert.equal(activate(state,wall),true);
    registry.retractable.step(state,wall,.4);registry.retractable.step(state,wall,8);registry.retractable.step(state,wall,.4);
    close(wall.cooldown,6*factor);
    wall.status='lowered';wall.cooldown=0;const enemy=spawnEnemy(state,'foot',10.5,18.5);
    assert.equal(activate(state,wall),true);registry.retractable.step(state,wall,1.5);close(wall.cooldown,6*factor);
    enemy.x=8.5;enemy.y=18.5;stepMechanisms(state,0);close(sensor.cooldown,6*factor);
    state.pendulum={...SITES[0],siteId:SITES[0].id,status:'ready',hitIds:[],elapsed:0};
    assert.equal(game.api.triggerPendulum(),true);stepPendulum(state,CONFIG.pendulum.duration);
    close(state.pendulum.resetRemaining,20*factor);
    stepPendulum(state,20*factor);assert.equal(state.pendulum.status,'ready');
  }
});

test('Communication career skills gate existing negotiation and reassignment options',()=>{
  const low=createGame({stage:'frontier',skills:{communication:1}}),high=createGame({stage:'frontier',skills:{communication:3}});
  const request=high.state.contract.requests.find(r=>r.communicationRequired===3);
  assert.ok(request,'HARNESS_PRECONDITION_FAILED: Communication 3 request');
  assert.equal(low.api.respondToRequest(request.id,'askMore').ok,false);
  assert.equal(high.api.respondToRequest(request.id,'askMore').ok,true);
  const post=high.api.guardPosts().find(p=>p.id!=='keep');
  assert.ok(post,'HARNESS_PRECONDITION_FAILED: guard post');
  assert.equal(low.api.requestGuards(post.id,1).ok,false);
  assert.equal(high.api.requestGuards(post.id,4).ok,true);
});

test('Canyon ignores Frontier skills in HP, device cooldowns and emergency permission',()=>{
  const game=createGame({skills:levels}),state=game.state;
  state.skills={...levels};
  const wall=placed(game,'wall',50,18),launcher=placed(game,'launcher',52,18),sensor=placed(game,'sensor',54,18);
  assert.equal(wall.maxHp,200);assert.equal(launcher.maxHp,200);assert.equal(sensor.maxHp,1);
  start(game);assert.equal(activate(state,launcher),true);assert.equal(launcher.cooldown,5);
  spawnEnemy(state,'foot',54.5,18.5);stepMechanisms(state,0);assert.equal(sensor.cooldown,6);
  assert.equal(game.api.placeEmergency('palisade',48,18).ok,false);
  state.pendulum={...SITES[0],siteId:SITES[0].id,status:'ready',hitIds:[],elapsed:0};
  assert.equal(game.api.triggerPendulum(),true);stepPendulum(state,CONFIG.pendulum.duration);
  assert.equal(state.pendulum.resetRemaining,20);
});

test('career grants two points for Exceptional and one for other victories, once per session through retry',()=>{
  const career=createCareerController({storage:()=>null}),game=createGame({stage:'frontier'}),token=career.beginContract();
  start(game);const report=finish(game);
  assert.equal(report.rating,'Exceptional Engineering','HARNESS_PRECONDITION_FAILED: exceptional contract');
  assert.equal(career.award(report,token).points,2);assert.equal(career.award(report,token).awarded,false);
  assert.equal(game.api.retrySiege(),true);start(game);career.award(finish(game),token);
  assert.deepEqual(career.record.skills,normalizeSkills());
  assert.equal(career.record.points,2);assert.equal(career.record.contractsCompleted,1);
  const next=career.beginContract();assert.equal(game.api.restartCampaign(),true);start(game);
  game.state.inhabitants[0].hp=0;const standard=finish(game);
  assert.notEqual(standard.rating,'Exceptional Engineering','HARNESS_PRECONDITION_FAILED: standard completion');
  assert.equal(career.award(standard,next).points,1);
  assert.equal(career.record.points,3);assert.equal(career.record.contractsCompleted,2);
});

test('career never grants for failed/unpaid/canyon results and permits a successful retry after failure',()=>{
  const career=createCareerController({storage:()=>null}),game=createGame({stage:'frontier'}),token=career.beginContract();
  start(game);const keep=game.state.structures.find(s=>s.type==='keep');damageStructure(game.state,keep,keep.hp);
  const failure=finish(game);assert.equal(failure.result,'defeat','HARNESS_PRECONDITION_FAILED: failed contract');
  assert.equal(career.award(failure,token).awarded,false);
  assert.equal(career.award({stageId:'canyon',result:'victory',paid:true},token).awarded,false);
  assert.equal(career.award({stageId:'frontier',result:'victory',paid:false},token).awarded,false);
  assert.equal(career.record.points,0);assert.equal(career.record.contractsCompleted,0);
  assert.equal(game.api.retrySiege(),true);start(game);assert.equal(career.award(finish(game),token).points,2);
});

test('career persistence is optional and guarded, spending raises one skill to max four, reset restores starter career',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const career=createCareerController({storage:()=>storage});
  assert.equal(career.spend('structural').ok,false);
  const result={stageId:'frontier',result:'victory',paid:true,rating:'Exceptional Engineering'};
  for(let i=0;i<2;i++) career.award(result,career.beginContract());
  for(let i=0;i<3;i++) assert.equal(career.spend('structural').ok,true);
  assert.equal(career.record.skills.structural,4);assert.equal(career.record.points,1);
  assert.equal(career.spend('structural').ok,false);assert.equal(career.spend('unknown').ok,false);
  assert.deepEqual(createCareerController({storage:()=>storage}).record,career.record);
  assert.deepEqual(JSON.parse(values.get(CAREER_STORAGE_KEY)),career.record);
  const snapshot=career.record;snapshot.skills.field=4;assert.equal(career.record.skills.field,1);
  assert.deepEqual(career.reset(),normalizeCareer());
  for(const unavailable of [()=>{throw Error('blocked');},()=>({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}),
    ()=>({getItem:()=>'{bad json',setItem(){throw Error('quota');}})]) {
    const optional=createCareerController({storage:unavailable});
    assert.equal(optional.award(result,optional.beginContract()).points,2);
    assert.equal(optional.spend('field').ok,true);assert.deepEqual(optional.reset(),normalizeCareer());
  }
});

test('Frontier session observation changes on a fresh contract but stays outside reproducible state and retry snapshots',()=>{
  const game=createGame({stage:'frontier',skills:levels}),before=structuredClone(game.state),session=game.api.frontierSession();
  start(game);finish(game);assert.equal(game.api.retrySiege(),true);
  assert.equal(game.api.frontierSession(),session);assert.deepEqual(game.state,before);
  assert.equal(game.api.restartCampaign(),true);assert.ok(game.api.frontierSession()>session);assert.deepEqual(game.state,before);
});

test('a displayed normalized Frontier seed replays the identical initial RNG and generated state',()=>{
  const stringSeed=createGame({stage:'frontier',generated:true,seed:'river-commission',archetype:'twin',skills:levels});
  const replay=createGame({stage:'frontier',generated:true,seed:stringSeed.state.contract.seed,archetype:'twin',skills:levels});
  assert.deepEqual(replay.state,stringSeed.state);
});
