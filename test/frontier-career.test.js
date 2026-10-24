import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Interface } from '../src/ui/interface.js';
import { creationMarkup, newCreationDraft, skillDescriptions } from '../src/ui/engineer-creation.js';
import {
  CAREER_STORAGE_KEY, CREATION_PRESETS, normalizeCareer, normalizeIdentity,
  validateCreationSkills, reputation, createCareerController,
} from '../src/ui/frontier-career.js';

const identity={name:'Ada Stone',portrait:2,accent:'#88a9cd'};
const starter={communication:3,structural:1,field:2,mechanical:1};
const oldStarter={communication:2,structural:1,field:1,mechanical:1};
const victory={stageId:'frontier',result:'victory',paid:true,rating:'Strong Defense',finalEarnings:287};
const total=skills=>Object.values(skills).reduce((sum,value)=>sum+value,0);
function memory(initial) {
  const values=new Map(initial===undefined?[]:[[CAREER_STORAGE_KEY,JSON.stringify(initial)]]);
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}
function fresh(storage=memory()) {
  const career=createCareerController({storage:()=>storage});
  assert.equal(career.create({identity,skills:starter}).ok,true);
  return career;
}

test('creation requires exactly three allocated points, integer skills at least one, and a maximum of three',()=>{
  assert.equal(validateCreationSkills(starter).ok,true);
  for(const skills of [
    {...starter,communication:2}, {...starter,structural:2},
    {communication:4,structural:1,field:1,mechanical:1},
    {communication:3,structural:0,field:2,mechanical:2},
    {...starter,field:1.5}, {...starter,field:NaN},
    {communication:3,structural:1,field:2},
  ]) assert.equal(validateCreationSkills(skills).ok,false,JSON.stringify(skills));
  const career=createCareerController({storage:()=>memory()});
  assert.equal(career.needsCreation,true);
  assert.equal(career.create({identity,skills:{...starter,communication:4}}).ok,false);
  assert.equal(career.needsCreation,true);
  assert.equal(career.create({identity,skills:starter}).ok,true);
  assert.equal(total(career.record.skills),7);
  assert.equal(career.record.points,0);
  assert.equal(career.needsCreation,false);
});

test('all four specialization presets satisfy the frozen allocation and remain independent of career edits',()=>{
  const expected={
    Diplomat:{communication:3,structural:1,field:2,mechanical:1},
    'Fortress Expert':{communication:1,structural:3,field:2,mechanical:1},
    'Field Engineer':{communication:2,structural:1,field:3,mechanical:1},
    Mechanist:{communication:1,structural:2,field:1,mechanical:3},
  };
  assert.equal(CREATION_PRESETS.length,4);
  for(const preset of CREATION_PRESETS) {
    assert.deepEqual(preset.skills,expected[preset.name]);
    assert.equal(total(preset.skills),7);
    assert.equal(validateCreationSkills(preset.skills).ok,true);
  }
  const edited={...CREATION_PRESETS[0].skills,communication:2,structural:2};
  const career=createCareerController({storage:()=>memory()});
  assert.equal(career.create({identity,skills:edited}).ok,true);
  edited.field=3;
  assert.equal(career.record.skills.field,2);
  assert.deepEqual(CREATION_PRESETS[0].skills,expected.Diplomat);
});

test('engineer identity trims names, supplies a default, and limits names to 24 characters',()=>{
  assert.equal(normalizeIdentity({...identity,name:'  Ada Stone  '}).name,'Ada Stone');
  assert.ok(normalizeIdentity({...identity,name:'   '}).name.length>0);
  assert.equal(normalizeIdentity({...identity,name:'a'.repeat(30)}).name.length,24);
  assert.equal(normalizeIdentity({...identity,name:'a'.repeat(23)+' word'}).name,'a'.repeat(23));
});

test('level four requires earned development points after creation',()=>{
  const career=fresh();
  assert.equal(career.spend('communication').ok,false);
  assert.equal(career.record.skills.communication,3);
  assert.equal(career.award(victory,career.beginContract()).points,1);
  assert.equal(career.spend('communication').ok,true);
  assert.equal(career.record.skills.communication,4);
  assert.equal(career.record.points,0);
  assert.equal(career.spend('communication').ok,false);
  assert.equal(validateCreationSkills(career.record.skills).ok,false);
});

test('saved engineers round-trip identity, skills, points and contract history under the existing key',()=>{
  const storage=memory(),career=fresh(storage);
  const token=career.beginContract();
  assert.equal(career.award(victory,token,{seed:93,archetype:'twin'}).awarded,true);
  assert.equal(career.award(victory,token,{seed:93,archetype:'twin'}).awarded,false);
  assert.deepEqual(career.record.history,[{seed:93,archetype:'twin',rating: victory.rating,finalEarnings:287}]);
  assert.deepEqual(career.record.identity,identity);
  assert.deepEqual(career.record.skills,starter);
  assert.equal(career.record.contractsCompleted,1);
  const restored=createCareerController({storage:()=>storage});
  assert.equal(restored.needsCreation,false);
  assert.equal(restored.needsIdentity,false);
  assert.deepEqual(restored.record,career.record);
  assert.deepEqual(JSON.parse(storage.getItem(CAREER_STORAGE_KEY)),career.record);
  const copy=restored.record;
  copy.identity.name='Changed';copy.skills.field=4;copy.history[0].finalEarnings=999;
  assert.deepEqual(restored.record,career.record,'record copies cannot mutate stored career');
});

test('each form of legacy progression keeps skills and points and requests identity only',()=>{
  for(const old of [
    {skills:oldStarter,points:2,contractsCompleted:0},
    {skills:oldStarter,points:0,contractsCompleted:1},
    {skills:{...oldStarter,mechanical:4},points:0,contractsCompleted:0},
  ]) {
    const normalized=normalizeCareer(old);
    assert.deepEqual(normalized.skills,old.skills);
    assert.equal(normalized.points,old.points);
    assert.equal(normalized.contractsCompleted,old.contractsCompleted);
    const career=createCareerController({storage:()=>memory(old)});
    assert.equal(career.needsCreation,false);
    assert.equal(career.needsIdentity,true);
    assert.equal(career.identify(identity).ok,true);
    assert.equal(career.needsIdentity,false);
    assert.deepEqual(career.record.skills,old.skills);
    assert.equal(career.record.points,old.points);
    assert.equal(career.record.contractsCompleted,old.contractsCompleted);
  }
});

test('an untouched old default record requires full creation',()=>{
  const career=createCareerController({storage:()=>memory({skills:oldStarter,points:0,contractsCompleted:0})});
  assert.equal(career.needsCreation,true);
  assert.equal(career.needsIdentity,false);
  assert.equal(career.create({identity,skills:starter}).ok,true);
  assert.equal(total(career.record.skills),7);
  assert.equal(career.record.points,0);
});

test('explicit new careers discard progression and invalidate old contract sessions, preventing free points',()=>{
  const career=fresh();
  career.award(victory,career.beginContract(),{seed:1,archetype:'compact'});
  career.spend('communication');
  const oldToken=career.beginContract();
  const reset=career.reset();
  assert.equal(career.needsCreation,true);
  assert.equal(reset.points,0);
  assert.equal(reset.contractsCompleted,0);
  assert.deepEqual(reset.history,[]);
  assert.equal(career.create({identity,skills:starter}).ok,true);
  assert.equal(career.award(victory,oldToken).awarded,false);
  for(let i=0;i<3;i++) {
    assert.equal(career.create({identity,skills:starter}).ok,true);
    assert.equal(total(career.record.skills)+career.record.points,7);
    assert.equal(career.record.contractsCompleted,0);
    assert.deepEqual(career.record.history,[]);
  }
});

test('history retains twenty contracts while reputation averages only the latest ten rating scores',()=>{
  const career=fresh(),scores=CONFIG.frontier.skills.reputationScores;
  assert.equal(reputation([]),0);
  assert.equal(reputation([{rating:'Exceptional Engineering'},{rating:'Contract Failed'}]),
    (scores['Exceptional Engineering']+scores['Contract Failed'])/2);
  for(let i=0;i<25;i++) {
    const rating=i<15?'Exceptional Engineering':i<20?'Strong Defense':'Costly Victory';
    career.award({...victory,rating,finalEarnings:i},career.beginContract(),{seed:i,archetype:'compact'});
  }
  assert.equal(career.record.contractsCompleted,25);
  assert.equal(career.record.history.length,20);
  assert.equal(career.record.history[0].seed,5);
  assert.equal(career.record.history.at(-1).seed,24);
  const expected=(scores['Strong Defense']+scores['Costly Victory'])/2;
  assert.equal(career.record.reputation,expected);
  assert.equal(reputation(career.record.history),expected);
});

test('failed contracts affect history and reputation once, and a successful retry replaces that contract entry',()=>{
  const career=fresh(),token=career.beginContract();
  const failure={...victory,result:'defeat',rating:'Contract Failed',finalEarnings:0};
  assert.equal(career.award(failure,token,{seed:8,archetype:'outpost'}).awarded,false);
  assert.equal(career.record.points,0);
  assert.equal(career.record.contractsCompleted,0);
  assert.equal(career.record.history.length,1);
  assert.equal(career.record.reputation,0);
  career.award(failure,token,{seed:8,archetype:'outpost'});
  assert.equal(career.record.history.length,1);
  assert.equal(career.award(victory,token,{seed:8,archetype:'outpost'}).awarded,true);
  assert.equal(career.record.history.length,1);
  assert.equal(career.record.history[0].rating,victory.rating);
  assert.equal(career.record.reputation,CONFIG.frontier.skills.reputationScores[victory.rating]);
  career.award(failure,token,{seed:8,archetype:'outpost'});
  assert.equal(career.record.history[0].rating,victory.rating);
});

function titleInterface(career) {
  const ui=Object.create(Interface.prototype),accepted=[];
  ui.career=career;ui.seedText='42';ui.archetypeChoice='compact';
  ui.observeCareer=()=>{};ui.refresh=()=>{};
  ui.el={results:{querySelector:()=>null}};
  ui.game={state:{phase:'title'},api:{selectStage(stage,options){
    accepted.push({stage,options});ui.game.state={phase:'prep',stageId:stage,contract:{seed:42,archetype:'compact',generated:true}};
  }}};
  return {ui,accepted};
}

test('Frontier entry creates once, preserves the selected contract, and requires review before confirmation',()=>{
  const {ui,accepted}=titleInterface(createCareerController({storage:()=>memory()}));
  ui.action('playSeed');
  assert.equal(accepted.length,0);assert.ok(ui.creation);assert.equal(ui.creation.legacy,false);
  ui.action('creationConfirm');assert.equal(accepted.length,0);
  ui.action('preset:3');ui.action('allocate:mechanical:-1');ui.action('allocate:field:1');
  assert.deepEqual(ui.creation.skills,{communication:1,structural:2,field:2,mechanical:2});
  ui.creation.identity.name='  New Engineer  ';
  ui.action('creationReview');assert.equal(ui.creation.confirm,true);
  ui.action('creationConfirm');assert.equal(accepted.length,1);
  assert.equal(accepted[0].options.seed,42);
  assert.equal(ui.career.record.identity.name,'New Engineer');
  ui.game.state={phase:'title'};ui.action('playSeed');
  assert.equal(accepted.length,2);assert.equal(ui.creation,null);
});

test('legacy identity setup cannot change allocations, and cancelling a new career retains progression',()=>{
  const old={skills:{...oldStarter,mechanical:4},points:2,contractsCompleted:5};
  const {ui}=titleInterface(createCareerController({storage:()=>memory(old)}));
  ui.action('stageFrontier');assert.equal(ui.creation.legacy,true);
  ui.action('preset:0');ui.action('allocate:communication:1');
  assert.deepEqual(ui.creation.skills,old.skills);
  ui.action('creationReview');ui.action('creationConfirm');
  assert.deepEqual(ui.career.record.skills,old.skills);assert.equal(ui.career.record.points,2);
  ui.game.state={phase:'title'};const saved=ui.career.record;
  ui.action('resetCareer');ui.action('preset:0');ui.action('creationCancel');
  assert.deepEqual(ui.career.record,saved);
});

test('creation renders six local portraits, editable allocation and numeric effects from configuration',()=>{
  const draft=newCreationDraft(normalizeCareer());
  const markup=creationMarkup(draft);
  assert.equal((markup.match(/data-action="portrait:/g)||[]).length,6);
  assert.equal((markup.match(/data-action="accent:/g)||[]).length,6);
  assert.ok(markup.includes('3 of 3 points remaining'));
  draft.skills={...starter};
  const text=skillDescriptions(draft.skills);
  assert.ok(text.field.includes('1.7 s'));
  assert.ok(text.field.includes(`×${CONFIG.frontier.repair.fieldMultipliers[1]}`));
  assert.ok(text.structural.includes('+0%'));
  draft.identity.name='<script>alert(1)</script>';
  assert.ok(creationMarkup(draft).includes('&lt;script&gt;'));
});

test('spending points keeps a failed session linked to its existing history entry for a later retry',()=>{
  const career=fresh(),failedToken=career.beginContract();
  career.award({...victory,result:'defeat',rating:'Contract Failed'},failedToken,{seed:1});
  career.award(victory,career.beginContract(),{seed:2});
  assert.equal(career.spend('field').ok,true);
  career.award(victory,failedToken,{seed:1});
  assert.equal(career.record.history.length,2);
  assert.deepEqual(career.record.history.map(item=>item.seed),[1,2]);
  assert.equal(career.record.history[0].rating,victory.rating);
});
