import { CONFIG } from '../../config.js';
import { FRONTIER_MAP } from '../../data/frontier/map.js';
import { FRONTIER_SIEGE } from '../../data/frontier/siege.js';
import { frontierSettlement, frontierRequests } from '../../data/frontier/settlement.js';
import { initializeFrontierNpcs } from './npcs.js';
import { generateFrontierContract, frontierSeed } from './generator.js';
import { normalizeSkills } from './skills.js';
import { frontierBudgetPlan } from './budget.js';

const money=value=>Math.round(value+Number.EPSILON);
const percentage=value=>Math.round(value*10)/10;
const surviving=s=>!!s&&!s.destroyed&&s.hp>0;

export function initializeFrontier(state,options={}) {
  const rules=CONFIG.frontier;
  const generated=options.generated?generateFrontierContract(options.seed??state.rng.seed,options.archetype):null;
  const map=generated?.map??FRONTIER_MAP,siege=generated?.siege??FRONTIER_SIEGE,budget=generated?.budget??rules.budget;
  if(generated) {state.frontierMap=map;state.frontierSiege=siege;state.frontierGuardCount=generated.guardCount;}
  state.stageId='frontier';state.gold=budget;state.prepGold=budget;
  state.structures=generated?.structures??frontierSettlement();state.inhabitants=[];
  state.population=state.structures.reduce((n,s)=>n+(CONFIG.structures[s.type].housing??0),0);
  state.skills=normalizeSkills(options.skills);
  const assessment=state.structures.map(s=>({id:s.id,label:s.label,type:s.type,district:s.district,
    value:s.value,hpStart:s.hp,maxHp:s.maxHp,assessed:money(s.value*s.hp/s.maxHp),mandatory:!s.optionalObjective}));
  const requests=generated?.requests??frontierRequests(state.structures),journal=[];
  const totalValueAtRisk=money(assessment.reduce((n,s)=>n+s.assessed,0));
  const mayor={...state.structures[0].owner};
  const mandatoryObjectives=state.structures.filter(s=>s.type==='keep').map(s=>({id:s.id,label:`${s.label} must survive`,location:{x:s.x,y:s.y}}));
  const specialObjectives=generated?.specialObjectives??[];
  mandatoryObjectives.push(...specialObjectives.filter(s=>s.mandatory));
  const seed=generated?.seed??frontierSeed(options.seed??state.rng.seed);
  state.contract={id:generated?`frontier-${seed}-${generated.archetype}`:'eastbank-commission',seed,archetype:generated?.archetype??'handcrafted',
    generated:!!generated,generation:generated?.generation??{attempts:0,fallback:false},mayor,budget,baseFee:rules.baseFee,
    budgetPlan:generated?.budgetPlan??frontierBudgetPlan(map,state.structures,'handcrafted',budget),
    damageLiability:rules.damageLiability,assessment,requests,journal,briefingOpen:true,
    reputation:0,paid:false,earnings:0,ownerAdvances:0,
    mandatoryObjectives,specialObjectives,
    briefing:{title:'The Frontier Commission',mayor,
      text:'Eastbank is already built, and its people are counting on you. Spend the council’s construction budget where it will matter most. The keep must stand; the outlying farms and hamlet need difficult choices.',
      seed,archetype:generated?.archetype??'handcrafted',budget,expectedThreats:siege.scoutReport[0],
      mainObjective:mandatoryObjectives.map(s=>s.label).join('; '),totalValueAtRisk,baseFee:rules.baseFee,
      possibleBonuses:[{label:'All civilians survive',amount:rules.bonuses.allCivilians},{label:'Workshop survives',amount:rules.bonuses.workshop}],
      damageRule:`New property damage deducts ${rules.damageLiability*100}% of assessed liability; ${rules.casualtyPenalty} G per civilian lost. No charge for pre-existing damage. Deductions cannot exceed the base fee.`,
      mandatoryObjectives:mandatoryObjectives.map(s=>s.label),specialObjectives,
    },
  };
  state.journal=journal;
  state.briefing=state.contract.briefing;
  if(generated) state.contract.briefing.text=`${map.districts.map(d=>d.name).join(', ')} share the council’s construction budget. Every keep must stand. Choose which exposed properties deserve dedicated defenses.`;
  state.scoutReport={siegeIndex:1,bullets:[...siege.scoutReport]};
  initializeFrontierNpcs(state);
  return state;
}

export function objectiveMet(state,goal) {
  if(goal.kind==='districtIntact') {
    const before=state.contract.assessment.filter(s=>s.district===goal.district&&s.type!=='keep');
    const intact=before.filter(s=>surviving(state.structures.find(now=>now.id===s.id))).length;
    return before.length>0&&intact/before.length>=goal.fraction;
  }
  return surviving(state.structures.find(s=>s.id===goal.id));
}

export function respondToRequest(state,id,choice) {
  if(state.stageId!=='frontier'||state.phase!=='prep') return {ok:false,reason:'Requests are preparation only'};
  const request=state.contract.requests.find(r=>r.id===id||r.buildingId===id);
  if(!request) return {ok:false,reason:'Unknown owner request'};
  if(request.status!=='pending') return {ok:false,reason:'This request has already been answered'};
  const choices={Promise:'promise',Decline:'decline','Ask more':'askMore','Defend it yourselves':'selfDefend',
    ask_more:'askMore','ask-more':'askMore',defend:'selfDefend',self_defend:'selfDefend','self-defend':'selfDefend'};
  choice=choices[choice]??choice;
  if(!['promise','decline','askMore','selfDefend'].includes(choice)) return {ok:false,reason:'Unknown response'};
  if(choice==='askMore'&&state.skills.communication<request.communicationRequired) return {ok:false,
    reason:`Communication ${request.communicationRequired} required`,required:request.communicationRequired};
  const building=state.structures.find(s=>s.id===request.buildingId);
  const accepted=choice==='promise'||choice==='askMore';
  const reward=accepted?money(request.reward*(choice==='askMore'?CONFIG.frontier.negotiationMultiplier:1)):0;
  request.status=accepted?'accepted':choice==='decline'?'declined':'selfDefend';
  request.choice=choice;request.agreedReward=reward;
  building.promise={status:request.status,reward,negotiated:choice==='askMore',requestId:request.id};
  if(choice==='selfDefend') building.selfDefense={requested:true,rule:request.selfDefense,status:'deferred'};
  const entry={id:request.id,buildingId:building.id,building:building.label,owner:{...building.owner},
    district:building.district,location:{x:building.x,y:building.y},choice,status:request.status,reward,
    completionCondition:request.completionCondition,immediate:request.immediate&&accepted,
    selfDefense:choice==='selfDefend'?request.selfDefense:null};
  state.contract.journal.push(entry);
  if(entry.immediate) {
    request.advance=reward;state.contract.ownerAdvances+=reward;state.contract.earnings+=reward;
  }
  return {ok:true,status:request.status,reward,immediate:entry.immediate};
}

export function calculateContractResults(state) {
  if(state.contract?.paid&&state.results) return state.results;
  const rules=CONFIG.frontier,contract=state.contract;
  if(!contract) return null;
  const damageByBuilding=contract.assessment.map(before=>{
    const now=state.structures.find(s=>s.id===before.id);
    const hpEnd=surviving(now)?Math.min(before.hpStart,now.hp):0;
    const hpLost=Math.max(0,before.hpStart-hpEnd);
    const liability=before.hpStart>0?before.assessed*hpLost/before.hpStart:0;
    const roundedLiability=money(liability);
    return {...before,hpEnd,hpLost,destroyed:hpEnd===0,liability:roundedLiability,
      preserved:before.assessed-roundedLiability,damageFraction:before.hpStart>0?hpLost/before.hpStart:0};
  });
  const failedObjectives=contract.mandatoryObjectives.filter(goal=>!objectiveMet(state,goal));
  const success=failedObjectives.length===0&&state.phase!=='defeat';
  const totalValueBefore=money(contract.assessment.reduce((n,s)=>n+s.assessed,0));
  // Integer line items are summed, so property/district/contract totals agree.
  const liability=damageByBuilding.reduce((n,s)=>n+s.liability,0);
  const valuePreserved=money(totalValueBefore-liability),preservation=totalValueBefore?valuePreserved/totalValueBefore*100:100;
  const civilianLosses=state.inhabitants.filter(p=>p.hp<=0).length;
  const propertyDeduction=money(liability*contract.damageLiability),casualtyDeduction=civilianLosses*rules.casualtyPenalty;
  const deduction=money(Math.min(contract.baseFee,propertyDeduction+casualtyDeduction));
  const ownerRewards=contract.requests.filter(r=>r.status==='accepted').map(request=>{
    const kept=surviving(state.structures.find(s=>s.id===request.buildingId));
    return {id:request.id,buildingId:request.buildingId,owner:{...request.owner},
      label:state.structures.find(s=>s.id===request.buildingId)?.label??request.buildingId,
      kept,promised:request.agreedReward,amount:kept?request.agreedReward:0,advance:request.advance??0};
  });
  const promisesKept=ownerRewards.filter(r=>r.kept).length,promisesBroken=ownerRewards.length-promisesKept;
  let thankYouRemaining=rules.thankYouCap;
  const thankYouPayments=[];
  for(const property of damageByBuilding) {
    const now=state.structures.find(s=>s.id===property.id);
    if(property.type==='keep'||property.assessed<rules.thankYouThreshold||property.hpLost>0||
      now?.promise?.status==='accepted'||now?.promise?.status==='selfDefend') continue;
    const amount=money(Math.min(thankYouRemaining,property.value*rules.thankYouRate));
    if(amount>0) thankYouPayments.push({buildingId:property.id,label:property.label,owner:{...now.owner},amount});
    thankYouRemaining=money(thankYouRemaining-amount);
  }
  const workshop=surviving(state.structures.find(s=>s.id==='workshop'));
  const specialObjectives=(contract.specialObjectives??[]).map(goal=>({...goal,met:objectiveMet(state,goal)}));
  const bonuses=[{key:'allCivilians',label:'All civilians survive',amount:success&&civilianLosses===0?rules.bonuses.allCivilians:0},
    {key:'workshop',label:'Workshop survives',amount:success&&workshop?rules.bonuses.workshop:0}];
  for(const goal of specialObjectives) bonuses.push({key:goal.id,label:`${goal.mandatory?'Mandatory':'Optional'}: ${goal.label}`,amount:success&&goal.met?goal.reward:0});
  const specialPenalty=specialObjectives.filter(s=>!s.met).reduce((n,s)=>n+s.penalty,0);
  const mayorPayment=success?money(Math.max(0,contract.baseFee-deduction-specialPenalty)+bonuses.reduce((n,b)=>n+b.amount,0)):0;
  const ownerRewardTotal=money(ownerRewards.reduce((n,r)=>n+r.amount,0));
  const thankYouTotal=money(thankYouPayments.reduce((n,r)=>n+r.amount,0));
  const bountyGold=state.stats.bountyGold??0;
  const ledger=state.emergency;
  const bountyEarned=ledger?.bountyEarned??bountyGold,bountySpent=ledger?.bountySpent??0;
  const unspentBounty=Math.max(0,bountyEarned-bountySpent);
  const constructionSpending=ledger?.constructionSpending??0,repairSpending=ledger?.repairSpending??0;
  const finalEarnings=money(mayorPayment+ownerRewardTotal+thankYouTotal+unspentBounty);
  const reasons=[`${percentage(preservation)}% of assessed property value preserved`,`${civilianLosses} civilian losses`,
    `${promisesKept} promises kept; ${promisesBroken} broken`,success?'Mandatory keep protected':'Mandatory objective failed',
    workshop?'Workshop objective completed':'Workshop objective lost'];
  if(promisesBroken) reasons.push(`Contract reputation ${-promisesBroken} from broken promises`);
  for(const goal of specialObjectives) reasons.push(`${goal.mandatory?'Mandatory':'Optional'} ${goal.label}: ${goal.met?'completed':'lost'}`);
  let rating='Contract Failed';
  if(success) {
    if(preservation>=rules.rating.exceptional&&civilianLosses===0&&promisesBroken===0&&workshop&&specialObjectives.every(s=>s.met)) rating='Exceptional Engineering';
    else if(preservation>=rules.rating.strong&&civilianLosses<=rules.rating.strongCasualties&&promisesBroken===0&&workshop) rating='Strong Defense';
    else if(preservation>=rules.rating.acceptable) rating='Acceptable Defense';
    else rating='Costly Victory';
  }
  const damageByDistrict=(state.frontierMap??FRONTIER_MAP).districts.map(d=>({id:d.id,name:d.name,
    before:money(damageByBuilding.filter(b=>b.district===d.id).reduce((n,b)=>n+b.assessed,0)),
    liability:money(damageByBuilding.filter(b=>b.district===d.id).reduce((n,b)=>n+b.liability,0)),
    destroyed:damageByBuilding.filter(b=>b.district===d.id&&b.destroyed).length}));
  return {stageId:'frontier',result:success?'victory':'defeat',outcome:success?'Contract fulfilled':'Contract failed',
    totalValueBefore,valuePreserved,preservation:percentage(preservation),liability,damageByBuilding,damageByDistrict,
    civilianLosses,inhabitantsLost:civilianLosses,inhabitantsSaved:state.population-civilianLosses,
    promisesKept,promisesBroken,reputation:-promisesBroken,ownerRewards,ownerRewardTotal,thankYouPayments,thankYouTotal,
    baseFee:success?contract.baseFee:0,contractBaseFee:contract.baseFee,propertyDeduction,casualtyDeduction,
    deduction,deductionCapApplied:propertyDeduction+casualtyDeduction>contract.baseFee,bonuses,mayorPayment,
    bountyGold,bountyEarned,bountySpent,unspentBounty,constructionSpending,repairSpending,
    clientEmergencySpent:ledger?.clientEmergencySpent??0,constructionFunds:ledger?.constructionFunds??state.gold,
    bountyCounts:{...state.stats.bountyCounts},finalEarnings,rating,reasons,failedObjectives,specialObjectives,specialPenalty,
    keepStatuses:state.structures.filter(s=>s.type==='keep').map(s=>({id:s.id,label:s.label,hp:s.hp,maxHp:s.maxHp,survived:surviving(s)})),
    enemiesDefeated:state.stats.enemiesDefeated,ownerAdvances:contract.ownerAdvances,
    ownerAdvanceAdjustment:money(ownerRewardTotal-contract.ownerAdvances),paid:false};
}

export function finalizeContract(state) {
  if(!state.contract||!['victory','defeat'].includes(state.phase)) return null;
  if(state.contract.paid) return state.results;
  const result=calculateContractResults(state);
  result.paid=true;state.results=result;
  state.contract.paid=true;state.contract.earnings=result.finalEarnings;state.contract.reputation=result.reputation;
  for(const entry of state.contract.journal) if(entry.status==='accepted') {
    entry.outcome=result.ownerRewards.find(r=>r.id===entry.id)?.kept?'kept':'broken';
    const building=state.structures.find(s=>s.id===entry.buildingId);
    if(building?.promise) building.promise.outcome=entry.outcome;
  }
  return result;
}

export const processContractResults=finalizeContract;
