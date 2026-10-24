import { CONFIG } from '../config.js';
import { SKILLS, normalizeSkills } from '../sim/frontier/skills.js';

export const CAREER_STORAGE_KEY='canyon-keep.frontier-career.v1';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
export const CREATION_PRESETS=[
  {name:'Diplomat',skills:{communication:3,structural:1,field:2,mechanical:1}},
  {name:'Fortress Expert',skills:{communication:1,structural:3,field:2,mechanical:1}},
  {name:'Field Engineer',skills:{communication:2,structural:1,field:3,mechanical:1}},
  {name:'Mechanist',skills:{communication:1,structural:2,field:1,mechanical:3}},
];
export const PORTRAITS=['Surveyor','Mason','Artificer','Architect','Pathfinder','Warden'];
export const ACCENTS=['#e1b968','#8dbba5','#88a9cd','#c88c78','#b39acb','#c1c887'];
export function normalizeIdentity(identity={}) {
  return {name:(typeof identity?.name==='string'?identity.name.trim().slice(0,24).trim():'')||'Rowan Stone',
    portrait:Number.isInteger(identity?.portrait)&&identity.portrait>=0&&identity.portrait<PORTRAITS.length?identity.portrait:0,
    accent:ACCENTS.includes(identity?.accent)?identity.accent:ACCENTS[0]};
}
export function validateCreationSkills(skills) {
  if(!SKILLS.every(key=>Number.isInteger(skills?.[key])&&skills[key]>=1&&skills[key]<=CONFIG.frontier.skills.creationMax))
    return {ok:false,reason:'Each starting skill must be between 1 and 3.'};
  return SKILLS.reduce((sum,key)=>sum+skills[key]-1,0)===CONFIG.frontier.skills.creationPoints?
    {ok:true}:{ok:false,reason:'Allocate exactly 3 starting points.'};
}
export function reputation(history=[]) {
  const recent=history.slice(-10);
  return recent.length?recent.reduce((sum,item)=>sum+(CONFIG.frontier.skills.reputationScores[item.rating]??0),0)/recent.length:0;
}

export function normalizeCareer(record={}) {
  const history=Array.isArray(record?.history)?record.history.slice(-20).filter(item=>item&&typeof item==='object').map(item=>({
    seed:item.seed??null,archetype:typeof item.archetype==='string'?item.archetype:'handcrafted',
    rating:typeof item.rating==='string'?item.rating:'Contract Failed',finalEarnings:Number.isFinite(item.finalEarnings)?item.finalEarnings:0})):[];
  return {identity:record?.identity?normalizeIdentity(record.identity):null,skills:normalizeSkills(record?.skills),
    points:count(record?.points),contractsCompleted:count(record?.contractsCompleted),history,reputation:reputation(history)};
}
const progressed=record=>record.points>0||record.contractsCompleted>0||SKILLS.some(key=>record.skills[key]!==CONFIG.frontier.skills.starter[key]);

export function developmentPoints(result) {
  if(result?.stageId!=='frontier'||result.result!=='victory'||!result.paid) return 0;
  const rules=CONFIG.frontier.skills;
  return result.rating==='Exceptional Engineering'?rules.exceptionalPoints:rules.completionPoints;
}

export function spendDevelopmentPoint(record,skill) {
  const next=normalizeCareer(record);
  if(!SKILLS.includes(skill)) return {ok:false,reason:'Unknown skill',record:next};
  if(next.skills[skill]>=CONFIG.frontier.skills.max) return {ok:false,reason:'Maximum level reached',record:next};
  if(next.points<1) return {ok:false,reason:'Complete a contract to earn development points',record:next};
  next.skills[skill]++;next.points--;
  return {ok:true,record:next};
}

// UI-owned optional persistence. Contract sessions live outside the retry snapshot:
// replaying a finished siege cannot grant development points a second time.
export function createCareerController({storage=()=>globalThis.localStorage}={}) {
  let record=normalizeCareer(),sequence=0;
  const awardedSessions=new Set(),sessions=new Set(),historySessions=new Map();
  try {record=normalizeCareer(JSON.parse(storage()?.getItem(CAREER_STORAGE_KEY)??'null'));} catch {}
  const save=()=>{try {storage()?.setItem(CAREER_STORAGE_KEY,JSON.stringify(record));} catch {}};
  const copy=()=>normalizeCareer(record);
  return {
    get record() {return copy();},
    get needsCreation() {return !record.identity&&!progressed(record);},
    get needsIdentity() {return !record.identity&&progressed(record);},
    create({identity,skills}={}) {
      const valid=validateCreationSkills(skills);if(!valid.ok)return {...valid,record:copy()};
      record=normalizeCareer({identity:normalizeIdentity(identity),skills});
      sessions.clear();awardedSessions.clear();historySessions.clear();save();return {ok:true,record:copy()};
    },
    identify(identity) {
      if(record.identity||!progressed(record))return {ok:false,reason:'No legacy identity to complete',record:copy()};
      record.identity=normalizeIdentity(identity);save();return {ok:true,record:copy()};
    },
    beginContract() {const token=++sequence;sessions.add(token);return token;},
    award(result,token,metadata={}) {
      const points=developmentPoints(result);
      if(!sessions.has(token)||awardedSessions.has(token)) return {awarded:false,points:0,record:copy()};
      if(result?.stageId==='frontier'&&result.paid&&['victory','defeat'].includes(result.result)&&(!historySessions.has(token)||points)) {
        const entry={seed:metadata.seed??result.seed??null,archetype:metadata.archetype??result.archetype??'handcrafted',
          rating:result.rating,finalEarnings:result.finalEarnings??0};
        const previous=historySessions.get(token),index=record.history.indexOf(previous);
        if(index>=0)record.history[index]=entry;else record.history.push(entry);
        record.history=record.history.slice(-20);historySessions.set(token,entry);record.reputation=reputation(record.history);save();
      }
      if(!points)return {awarded:false,points:0,record:copy()};
      awardedSessions.add(token);record.points+=points;record.contractsCompleted++;save();
      return {awarded:true,points,record:copy()};
    },
    spend(skill) {
      const result=spendDevelopmentPoint(record,skill);
      if(result.ok) {result.record.history=record.history;record=result.record;save();}
      return {...result,record:copy()};
    },
    reset() {record=normalizeCareer();sessions.clear();awardedSessions.clear();historySessions.clear();save();return copy();},
  };
}
