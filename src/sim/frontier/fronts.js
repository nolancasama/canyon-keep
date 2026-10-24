import { CONFIG } from '../../config.js';
import { WIDTH, HEIGHT } from '../../data/map.js';
import { siegeFor } from '../../data/stages.js';
import { emit } from '../grid.js';

// Compass fronts in screen space (y grows south). Angles are degrees from east.
export const FRONT_DIRECTIONS=[
  {id:'E',name:'east',angle:0},{id:'SE',name:'south-east',angle:45},{id:'S',name:'south',angle:90},{id:'SW',name:'south-west',angle:135},
  {id:'W',name:'west',angle:180},{id:'NW',name:'north-west',angle:225},{id:'N',name:'north',angle:270},{id:'NE',name:'north-east',angle:315},
];
const CENTRE={x:(WIDTH-1)/2,y:(HEIGHT-1)/2};

// The ray from the map centre meets the border here; corners land on the long edge.
export function edgeAnchor(direction) {
  const a=FRONT_DIRECTIONS[direction].angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a);
  const tx=Math.abs(dx)<1e-9?Infinity:(dx>0?WIDTH-1-CENTRE.x:CENTRE.x)/Math.abs(dx);
  const ty=Math.abs(dy)<1e-9?Infinity:(dy>0?HEIGHT-1-CENTRE.y:CENTRE.y)/Math.abs(dy);
  const t=Math.min(tx,ty),x=Math.round(CENTRE.x+dx*t),y=Math.round(CENTRE.y+dy*t);
  return {x:Math.max(0,Math.min(WIDTH-1,x)),y:Math.max(0,Math.min(HEIGHT-1,y)),edge:tx<=ty?(dx>0?'east':'west'):(dy>0?'south':'north')};
}
export const bandFor=share=>share>=CONFIG.frontier.fronts.bands.major?'major':share>=CONFIG.frontier.fronts.bands.secondary?'secondary':'minor';

// Main direction first, then distinct offsets so no two fronts share a side.
export function chooseFrontPlan(integer,chance) {
  const rules=CONFIG.frontier.fronts,types=Object.keys(rules.plans),type=types[integer(0,types.length-1)];
  const main=integer(0,7),pct=range=>integer(range[0],range[1])/100,spec=rules.plans[type];
  let offsets=[],shares=[1];
  if(type==='mainSecondary') {offsets=[integer(2,6)];const m=pct(spec.main);shares=[m,1-m];}
  else if(type==='mainDiversion') {
    const m=pct(spec.main),two=chance(.5);offsets=two?[integer(2,3),integer(5,6)]:[integer(2,6)];
    shares=two?[m,(1-m)*.6,(1-m)*.4]:[m,1-m];
  } else if(type==='encirclement') {
    const m=pct(spec.main),four=chance(.5);offsets=four?[2,4,6]:[integer(2,3),integer(5,6)];
    shares=four?[m,(1-m)*.45,(1-m)*.33,(1-m)*.22]:[m,(1-m)*.6,(1-m)*.4];
  }
  const fronts=[main,...offsets.map(o=>(main+o)%8)].map((direction,i)=>({id:`front-${FRONT_DIRECTIONS[direction].id.toLowerCase()}`,direction,target:[shares[i]],wave:1}));
  // A second wave may swing the main assault onto another front, or onto a
  // fresh direction when the plan had a single front.
  if(chance(rules.waveTwoChance)) {
    let shift=fronts.length>1?fronts[integer(1,fronts.length-1)]:null;
    if(!shift) {const direction=(main+integer(2,6))%8;shift={id:`front-${FRONT_DIRECTIONS[direction].id.toLowerCase()}`,direction,target:[0],wave:2};fronts.push(shift);}
    const second=fronts.map(f=>f===shift?rules.waveTwoMain:f===fronts[0]?1-rules.waveTwoMain:0);
    for(const [i,f] of fronts.entries()) f.target[1]=second[i];
  }
  return {type,fronts};
}

// Every enemy is assigned to the front furthest below its target strength
// share for that wave (bosses join that wave's main front), so totals match the
// plan closely without dividing every group evenly.
export function assignFronts(groups,plan) {
  const rules=CONFIG.frontier.fronts,waves=plan.fronts.some(f=>f.target[1]!==undefined)?2:1;
  const enemies=groups.flatMap(g=>Array.from({length:g.count},(_,i)=>({t:g.t+i*g.spacing,type:g.type}))).sort((a,b)=>a.t-b.t);
  const assigned=Array.from({length:waves},()=>plan.fronts.map(()=>0)),totals=Array(waves).fill(0),turns=plan.fronts.map(()=>0),out=[];
  for(const enemy of enemies) {
    const wave=waves===2&&enemy.t>=rules.waveSplit?1:0,weight=rules.strength[enemy.type],shares=plan.fronts.map(f=>f.target[wave]??0);
    let best=-1;
    if(enemy.type==='boss') best=shares.indexOf(Math.max(...shares));
    else for(let i=0;i<shares.length;i++) if(shares[i]>0&&(best<0||shares[i]*(totals[wave]+weight)-assigned[wave][i]>shares[best]*(totals[wave]+weight)-assigned[wave][best]+1e-9)) best=i;
    assigned[wave][best]+=weight;totals[wave]+=weight;
    const front=plan.fronts[best],lane=front.lanes[turns[best]++%front.lanes.length];
    out.push({t:enemy.t,type:enemy.type,count:1,spacing:0,lane,front:front.id});
  }
  const total=totals.reduce((n,v)=>n+v,0);
  for(const [i,f] of plan.fronts.entries()) {
    f.share=assigned.reduce((n,w)=>n+w[i],0)/total;f.band=bandFor(f.share);
    f.waveShares=assigned.map((w,k)=>totals[k]?w[i]/totals[k]:0);
    f.firstT=Math.min(...out.filter(e=>e.front===f.id).map(e=>e.t));f.boss=out.some(e=>e.front===f.id&&e.type==='boss');
    f.wave=f.waveShares[0]>0?1:2;delete f.target;
  }
  plan.fronts=plan.fronts.filter(f=>Number.isFinite(f.firstT));plan.waves=waves;
  return out;
}

const approx=n=>n<=3?'a few':n<=6?'several':'many';
const names=list=>list.length<2?list.join(''):`${list.slice(0,-1).join(', ')} and ${list[list.length-1]}`;
// Honest but approximate: every attacking front is named, strength is banded.
export function frontScoutReport(plan,groups,districts) {
  const count=type=>groups.filter(g=>g.type===type).reduce((n,g)=>n+g.count,0),dir=f=>FRONT_DIRECTIONS[f.direction].name;
  const opening=plan.fronts.filter(f=>f.waveShares[0]>0),main=opening.reduce((a,b)=>b.waveShares[0]>a.waveShares[0]?b:a);
  const others=opening.filter(f=>f!==main),secondary=others.filter(f=>f.band!=='minor'),minor=others.filter(f=>f.band==='minor');
  const foot=Math.max(5,Math.round(count('foot')/5)*5),bullets=[
    `Main assault: the bulk of roughly ${foot} raiders will come from the ${dir(main)}${main.boss&&plan.waves===1?', with the giant brute':''}.`,
  ];
  if(secondary.length) bullets.push(`A sizeable secondary column is expected from the ${names(secondary.map(dir))}.`);
  if(minor.length) bullets.push(`Scouts glimpsed a possible raiding party to the ${names(minor.map(dir))}; its size is uncertain.`);
  if(!others.length) bullets.push('No other approach has been sighted, though the outskirts remain exposed.');
  if(plan.waves===2) {
    const shift=plan.fronts.reduce((a,b)=>b.waveShares[1]>a.waveShares[1]?b:a);
    bullets.push(`A second wave may swing toward the ${dir(shift)} later in the siege${shift.boss?', possibly led by the giant brute':''}.`);
  }
  bullets.push(`${approx(count('chiseler'))[0].toUpperCase()+approx(count('chiseler')).slice(1)} chiselers and ${approx(count('powder'))} powder carriers travel with the columns; exact timings are unknown. ${names(districts.map(d=>d.name))} share one budget.`);
  return bullets;
}

// Paid reconnaissance reads the assigned groups, never the intended shares.
// Strength uses the same weights as front assignment; rounded shares are advisory.
export function advancedScoutReport(plan,groups,districts) {
  if(!plan?.fronts?.length) return [];
  const dir=f=>FRONT_DIRECTIONS[f.direction].name,strength=g=>g.count*CONFIG.frontier.fronts.strength[g.type];
  const total=groups.reduce((n,g)=>n+strength(g),0);
  const opening=plan.fronts.filter(f=>f.waveShares[0]>0);
  const main=opening.reduce((a,b)=>b.waveShares[0]>a.waveShares[0]?b:a);
  const bullets=[`Primary attack direction: ${dir(main)}.`];
  const dangers=[['powder','powder carriers'],['chiseler','chiselers'],['boss','the giant brute']];
  for(const front of plan.fronts) {
    const assigned=groups.filter(g=>g.front===front.id&&g.count>0),share=assigned.reduce((n,g)=>n+strength(g),0);
    const dangerous=dangers.filter(([type])=>assigned.some(g=>g.type===type)).map(([,label])=>label);
    bullets.push(`${dir(front)[0].toUpperCase()+dir(front).slice(1)}: about ${total?Math.round(share/total*20)*5:0}% of enemy strength${front.band==='minor'?' (diversion)':''}${dangerous.length?`; ${names(dangerous)}`:''}.`);
  }
  if(plan.waves===2) {
    const shift=plan.fronts.reduce((a,b)=>b.waveShares[1]>a.waveShares[1]?b:a);
    bullets.push(`Second-wave main assault: ${dir(shift)}.`);
  }
  return bullets;
}

export function advancedScoutingStatus(state) {
  const cost=CONFIG.frontier.scouting.advancedCost;
  if(state.stageId!=='frontier'||state.phase!=='prep') return {ok:false,cost,reason:'Frontier preparation only'};
  if(!siegeFor(state)?.plan) return {ok:false,cost,unavailable:true,reason:'Advanced scouting is unavailable for this authored siege; use the free report'};
  if(state.contract.advancedScouting) return {ok:false,cost,reason:'Advanced scouting already purchased'};
  if(state.gold<cost) return {ok:false,cost,reason:`Need ${cost} G for advanced scouting`};
  return {ok:true,cost};
}

export function scoutingReport(state) {
  const siege=siegeFor(state),report={siegeIndex:state.siegeIndex,bullets:[...siege.scoutReport]};
  if(state.contract?.advancedScouting&&siege.plan) report.advancedBullets=advancedScoutReport(siege.plan,siege.groups,state.frontierMap?.districts??[]);
  return report;
}

export function purchaseAdvancedScouting(state) {
  const check=advancedScoutingStatus(state);
  if(!check.ok) return check;
  state.gold-=check.cost;
  state.contract.advancedScouting=true;
  state.scoutReport=scoutingReport(state);
  return check;
}

// Edge warnings precede the first entry from each front by a fixed lead.
export function stepFrontWarnings(state) {
  const plan=siegeFor(state)?.plan;
  if(!plan) return;
  state.frontWarnings??=[];
  for(const front of plan.fronts) {
    if(state.frontWarnings.some(w=>w.frontId===front.id)||state.time<front.firstT-CONFIG.frontier.fronts.warningLead) continue;
    const warning={frontId:front.id,direction:FRONT_DIRECTIONS[front.direction].name,band:front.band,t:state.time,entryT:front.firstT};
    state.frontWarnings.push(warning);emit(state,'frontWarning',warning);
  }
}
