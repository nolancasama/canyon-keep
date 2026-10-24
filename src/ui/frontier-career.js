import { CONFIG } from '../config.js';
import { SKILLS, normalizeSkills } from '../sim/frontier/skills.js';

export const CAREER_STORAGE_KEY='canyon-keep.frontier-career.v1';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;

export function normalizeCareer(record={}) {
  return {skills:normalizeSkills(record?.skills),points:count(record?.points),contractsCompleted:count(record?.contractsCompleted)};
}

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
  const awardedSessions=new Set(),sessions=new Set();
  try {record=normalizeCareer(JSON.parse(storage()?.getItem(CAREER_STORAGE_KEY)??'null'));} catch {}
  const save=()=>{try {storage()?.setItem(CAREER_STORAGE_KEY,JSON.stringify(record));} catch {}};
  const copy=()=>normalizeCareer(record);
  return {
    get record() {return copy();},
    beginContract() {const token=++sequence;sessions.add(token);return token;},
    award(result,token) {
      const points=developmentPoints(result);
      if(!points||!sessions.has(token)||awardedSessions.has(token)) return {awarded:false,points:0,record:copy()};
      awardedSessions.add(token);record.points+=points;record.contractsCompleted++;save();
      return {awarded:true,points,record:copy()};
    },
    spend(skill) {
      const result=spendDevelopmentPoint(record,skill);
      if(result.ok) {record=result.record;save();}
      return {...result,record:copy()};
    },
    reset() {record=normalizeCareer();save();return copy();},
  };
}
