import { CONFIG } from '../config.js';
import { SITES } from '../data/map.js';
import { siegeName } from '../sim/siege.js';

const tools=[['wall','Wall','▥','1','Fortifications'],['gate','Gate','╫','2','Fortifications'],['barricade','Barricade','╳','3','Fortifications'],['tower','Archer tower','♜','4','Fortifications'],['spiked','Spiked Wall','✦','5','Wall Upgrades'],['golem','Golem Wall','◈','6','Wall Upgrades'],['pendulum',"Titan’s Pendulum",'⚒','7','Special Weapon'],['demolish','Demolish','×','X','Editing'],['repair','Repair','+','R','Editing']];
const lineTool=type=>!!CONFIG.structures[type]?.line;
const wallTool=type=>CONFIG.structures[type]?.family==='wall';
const names=Object.fromEntries(tools.map(t=>[t[0],t[1]]));
const descriptions={wall:'Solid stone barrier; supports canyon towers.',gate:'Keeps the trade road open; blocks enemies.',barricade:'A cheap obstacle to slow the assault.',tower:'Arrows strike enemies within range.',spiked:'Spikes damage every melee attacker.',golem:'At half HP, opens to release a temporary stone defender.',pendulum:'Cliff-mounted hammer; its sweep also damages your works.',demolish:'Remove military works for their HP-scaled refund.',repair:'Restore damaged military works for gold.'};
const escapeText=value=>String(value).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
// Compare with the last string written, not el.innerHTML: the browser re-serializes
// attributes (disabled -> disabled=""), so that comparison never matched and the
// buttons were rebuilt every refresh, dropping hover state and clicks.
const html=(el,value)=>{if(el._html!==value){el._html=value;el.innerHTML=value;}};
function findStructure(state,x,y,includeDestroyed=false){return state.structures.find(s=>(includeDestroyed||!s.destroyed&&s.hp>0)&&x>=s.x&&x<s.x+(s.w||1)&&y>=s.y&&y<s.y+(s.h||1));}

export class Interface {
  constructor(game,canvas,audio){
    this.game=game;this.canvas=canvas;this.audio=audio;this.tool='wall';this.hover=null;this.drag=null;this.previewCells=[];this.message='';this.messageUntil=0;this.inspected=false;this.lastPhase='';this.previousSpeed=1;this.refreshClock=0;
    this.el=Object.fromEntries(['resources','palette','actions','battle-stats','status','phase-label','clock','results','announcement','mute'].map(id=>[id,document.getElementById(id)]));
    this.el.palette.innerHTML='<h2>CONSTRUCTION</h2>'+tools.map(([type,name,icon,key,category],i)=>`${i===0||tools[i-1][4]!==category?'<h3 class="palette-category">'+category+'</h3>':''}<button class="tool" data-tool="${type}" title="${name}${key?' ('+key+')':''}" aria-pressed="false"><span class="tool-icon" aria-hidden="true">${icon}</span><span class="tool-name">${name}<small>${CONFIG.structures[type]?CONFIG.structures[type].cost+' GOLD':type==='demolish'?'HP-SCALED REFUND':'CLICK TO REPAIR'}</small></span>${key?'<kbd>'+key+'</kbd>':''}</button>`).join('')+'<div id="structure-info" class="structure-info" role="status"></div><p class="palette-note">Drag fortifications to draw a line.<br>Wall upgrades replace existing walls and gates.</p>';
    this.el.info=document.getElementById('structure-info');this.selectedStructureId=null;this.selectedPendulum=false;
    this.el.palette.addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b){this.unlock();this.select(b.dataset.tool);}});
    this.el.actions.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;this.unlock();this.action(b.dataset.action,b.dataset.speed);});
    this.el.results.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b){this.unlock();this.action(b.dataset.action);}});
    this.el.mute.addEventListener('click',()=>{this.unlock();this.toggleMute();});
    canvas.addEventListener('pointermove',e=>{this.hover=this.coordinates(e);this.preview();});
    canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.hover=null;this.previewCells=[];}});
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.unlock();this.canvas.focus({preventScroll:true});if(this.game.state.phase!=='prep')return;this.hover=this.coordinates(e);if(!this.tool)return;if(['demolish','repair'].includes(this.tool)){this.selectedStructureId=findStructure(this.game.state,this.hover.x,this.hover.y,true)?.id??null;this.selectedPendulum=this.game.state.pendulum?.x===this.hover.x&&this.game.state.pendulum?.y===this.hover.y;}this.drag={...this.hover};canvas.setPointerCapture(e.pointerId);this.preview();});
    canvas.addEventListener('pointerup',e=>{if(e.button!==0||!this.drag)return;this.hover=this.coordinates(e);const start=this.drag;this.drag=null;if(this.game.state.phase==='prep'){let result;if(lineTool(this.tool))result=this.game.api.placeLine(this.tool,start.x,start.y,this.hover.x,this.hover.y);else if(this.tool==='demolish')result=this.game.api.demolish(this.hover.x,this.hover.y);else if(this.tool==='repair')result=this.game.api.repair(this.hover.x,this.hover.y);else if(this.tool)result=this.game.api.place(this.tool,this.hover.x,this.hover.y);if(result){if(result.reason)this.notify(result.reason);else if(result.refund!=null)this.notify(`Demolished · ${result.refund} gold refunded`);else if(result.placed>1)this.notify(`${result.placed} tiles constructed`);}}if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);this.preview();this.refresh();});
    canvas.addEventListener('pointercancel',()=>{this.drag=null;this.preview();});
    canvas.addEventListener('contextmenu',e=>{e.preventDefault();this.select(null);});
    document.addEventListener('keydown',e=>this.keydown(e));
    document.addEventListener('pointerdown',()=>this.unlock(),{once:true});this.refresh();
  }
  unlock(){this.audio.unlock();}
  coordinates(e){const rect=this.canvas.getBoundingClientRect();let x=Math.max(0,Math.min(63,Math.floor((e.clientX-rect.left)/rect.width*64))),y=Math.max(0,Math.min(35,Math.floor((e.clientY-rect.top)/rect.height*36)));if(this.tool==='pendulum'){const site=SITES.find(s=>Math.hypot(s.x-x,s.y-y)<2);if(site){x=site.x;y=site.y;}}return{x,y};}
  select(type){if(this.game.state.growthReport||type&&!tools.some(t=>t[0]===type))return;this.tool=type;this.selectedStructureId=null;this.selectedPendulum=false;this.drag=null;this.message='';this.preview();this.refresh();}
  notify(message){this.message=message;this.messageUntil=performance.now()+3200;}
  keydown(e){if(e.altKey||e.ctrlKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(this.game.state.growthReport){if(k==='escape'||k==='enter'){e.preventDefault();this.action('dismissGrowth');}return;}const tool=tools.find(t=>t[3].toLowerCase()===k&&t[3]);if(tool&&this.game.state.phase==='prep'){e.preventDefault();this.unlock();this.select(tool[0]);return;}if(k==='escape'){e.preventDefault();this.select(null);}if(k===' '){e.preventDefault();this.unlock();this.action('pendulum');}if(k==='p'){e.preventDefault();this.action('pause');}if(k==='f'){e.preventDefault();this.action('cycle');}if(k==='m'){e.preventDefault();this.unlock();this.toggleMute();}}
  toggleMute(){const muted=this.audio.toggle();this.el.mute.innerHTML=`SOUND ${muted?'OFF':'ON'} <kbd>M</kbd>`;this.el.mute.setAttribute('aria-pressed',String(muted));}
  action(action,speed){const api=this.game.api,state=this.game.state;let result;
    if(state.growthReport&&action!=='dismissGrowth')return;
    if(action==='dismissGrowth')api.dismissGrowthReport();
    if(action==='start'){result=api.startSiege();this.drag=null;this.inspected=false;}
    if(action==='repairAll')result=api.repairAll();
    if(action==='pendulum'){result=api.triggerPendulum();}
    if(action==='speed')api.setSpeed(Number(speed));
    if(action==='pause'&&state.phase==='siege'){if(state.speed===0)api.setSpeed(this.previousSpeed||1);else{this.previousSpeed=state.speed;api.setSpeed(0);}}
    if(action==='cycle'&&state.phase==='siege'){const speeds=[1,2,4];api.setSpeed(speeds[(speeds.indexOf(state.speed)+1)%speeds.length]);}
    if(action==='retry'){api.retrySiege();this.inspected=false;this.hover=null;this.message='';this.previewCells=[];}
    if(action==='continue'){api.continueCampaign();this.inspected=false;this.hover=null;this.message='';this.previewCells=[];}
    if(action==='restart'){api.restartCampaign();this.inspected=false;this.hover=null;this.message='';this.previewCells=[];}
    if(action==='inspect')this.inspected=true;
    if(action==='results')this.inspected=false;
    if(result?.reason)this.notify(result.reason);this.preview();this.refresh();
  }
  preview(){
    this.previewCells=[];this.previewInfo=null;const state=this.game.state;
    if(!this.hover||!this.tool||state.phase!=='prep'||state.growthReport)return;const{x,y}=this.hover;
    if(lineTool(this.tool)&&this.drag){const p=this.game.api.previewLine(this.tool,this.drag.x,this.drag.y,x,y);this.previewCells=p.tiles;this.previewInfo=p;}
    else if(this.tool==='demolish'||this.tool==='repair'){const s=findStructure(state,x,y),p=state.pendulum?.x===x&&state.pendulum?.y===y?state.pendulum:null,protectedBuilding=s&&['keep','house','farm'].includes(s.type);let reason='',valid=false,cost=0;if(this.tool==='demolish'){valid=!!p||!!s&&!protectedBuilding;reason=valid?`Refund ${Math.round(((p||s).paidCost??(p||s).cost)*CONFIG.refundRate*(p?1:s.hp/s.maxHp))} gold`:protectedBuilding?'The settlement belongs to your client.':'Choose a player structure';}else{valid=!!s&&!protectedBuilding;cost=valid?Math.ceil(s.cost*CONFIG.repairRate*(s.maxHp-s.hp)/s.maxHp):0;reason=valid?`Repair cost ${cost} gold`:protectedBuilding?'The settlement belongs to your client.':'Choose a damaged military structure';}this.previewCells=[{x,y,valid,reason,cost}];this.previewInfo={cost,reason};}
    else{const p=this.game.api.preview(this.tool,x,y);this.previewCells=[{x,y,...p}];this.previewInfo={...p,totalCost:p.cost};}
  }
  meter(label,value,fraction,kind=''){return `<div class="stat-meter"><label><span>${label}</span><span>${value}</span></label><div class="meter ${kind}"><i style="width:${Math.max(0,Math.min(1,fraction))*100}%"></i></div></div>`;}
  structureInfo(){const state=this.game.state;if(state.phase!=='prep')return '';const editing=['demolish','repair'].includes(this.tool),s=editing&&((this.hover&&findStructure(state,this.hover.x,this.hover.y,true))||state.structures.find(s=>s.id===this.selectedStructureId)),p=editing&&(this.selectedPendulum||this.hover&&state.pendulum?.x===this.hover.x&&state.pendulum?.y===this.hover.y)?state.pendulum:null;
    if(s||p){const item=s||p,hp=s?(s.destroyed?0:Math.max(0,s.hp)):null,refund=Math.round((item.paidCost??item.cost)*CONFIG.refundRate*(s?hp/s.maxHp:1));return `<strong>${escapeText(names[item.type]||item.type||names.pendulum)}</strong><span>${s?Math.ceil(hp)+' / '+s.maxHp+' HP':'Cliff-mounted weapon'} · Refund ${refund} G</span>`;}
    const spec=CONFIG.structures[this.tool];return this.tool?`<strong>${escapeText(names[this.tool])}</strong>${spec?'<span>'+this.game.api.price(this.tool)+' G'+(spec.hp?' · '+spec.hp+' HP':'')+'</span>':''}<span>${escapeText(descriptions[this.tool])}</span>`:'<span>Select a construction tool.</span>';
  }
  refresh(){
    const state=this.game.state,api=this.game.api,prep=state.phase==='prep',battle=state.phase==='siege',capacity=api.capacity(),population=state.population??CONFIG.population,living=state.inhabitants.filter(i=>i.hp>0).length,keep=state.structures.find(s=>s.type==='keep'),boss=state.enemies.find(e=>e.type==='boss'&&e.hp>0),p=state.pendulum;
    html(this.el.resources,`<div class="resource gold"><span>TREASURY</span><strong>${state.gold} <small style="font-size:11px">G</small></strong></div><div class="resource"><span>INHABITANTS</span><strong>${living} <small style="font-size:11px;color:var(--muted)">/ ${population}</small></strong></div><div class="resource"><span>HOUSING</span><strong class="${capacity.housing<population?'short':''}">${capacity.housing}/${population}</strong></div><div class="resource"><span>FOOD</span><strong class="${capacity.food<population?'short':''}">${capacity.food}/${population}</strong></div>`);
    this.el.palette.classList.toggle('prep-tools',prep);this.canvas.parentElement.classList.toggle('prep-map',prep);html(this.el.info,this.structureInfo());this.el.info.hidden=!prep;
    this.blockedRoadTiles=prep?api.blockedRoadTiles():[];
    for(const b of this.el.palette.querySelectorAll('[data-tool]')){b.disabled=!prep||!!state.growthReport;b.classList.toggle('active',this.tool===b.dataset.tool);b.setAttribute('aria-pressed',String(this.tool===b.dataset.tool));if(CONFIG.structures[b.dataset.tool]){const cost=api.price(b.dataset.tool),label=cost+' GOLD';b.querySelector('small').textContent=label;b.title=`${tools.find(t=>t[0]===b.dataset.tool)[1]} · ${label}`;}}
    this.el['phase-label'].textContent=`SIEGE ${state.siegeIndex} / 3 · ${siegeName(state.siegeIndex)} · ${prep?'PREPARATION':battle?'IN PROGRESS':state.phase.toUpperCase()}`;
    this.el.clock.textContent=prep?'DESIGN · DEFEND · REBUILD':`${Math.floor(state.time/60)}:${String(Math.floor(state.time%60)).padStart(2,'0')} · ${state.speed||'PAUSED'}${state.speed?'×':''}`;
    let stats='',actions='';
    if(prep){stats=`<div><div class="prep-title">${escapeText(siegeName(state.siegeIndex))}</div><div class="prep-sub">${state.siegeIndex===1?'Build your defenses, then test them.':'Protect the growing settlement. Repair breaches and extend your defenses.'}</div></div>`;const requirements=api.readiness(),unmet=requirements.filter(r=>!r.ok),ready=unmet.length===0,repair=api.repairCost();const advisory=ready?requirements.map(r=>`<div>✓ ${escapeText(r.message)}</div>`).join('')+'<strong>Ready for battle!</strong>':'<strong>Cannot start siege:</strong>'+unmet.map(r=>`<div>${escapeText(r.message)}${r.id==='tradeRoad'?' Tip: select Gate and click a red-outlined wall.':''}</div>`).join('');actions=`<button data-action="repairAll" ${repair===0||repair>state.gold||state.growthReport?'disabled':''}>Repair all · ${repair} G</button><div class="siege-start"><button data-action="start" class="primary" ${ready&&!state.growthReport?'':'disabled'}>START SIEGE <span aria-hidden="true">→</span></button><div class="requirements ${ready?'ready':'short'}" role="status">${advisory}</div></div>`;}
    else{const end=state.schedule.length?Math.max(...state.schedule.map(s=>s.t)):1;stats=this.meter('KEEP',`${Math.ceil(Math.max(0,keep?.hp??0))} / ${keep?.maxHp??0}`,(keep?.hp??0)/(keep?.maxHp||1))+this.meter('ASSAULT',`${Math.min(state.spawnIndex??0,state.schedule.length)} / ${state.schedule.length}`,state.time/end,'progress');if(boss)stats+=this.meter('THE BRUTE',`${Math.ceil(boss.hp)} HP`,boss.hp/boss.maxHp,'boss');
      if(battle){actions=`${p?`<button data-action="pendulum" class="pendulum-button ${p.status==='ready'?'ready':''}" ${p.status!=='ready'?'disabled':''}>${p.status==='ready'?'RELEASE TITAN · READY <kbd>SPACE</kbd>':p.status==='released'?'TITAN RELEASED':`<span class="recharge-ring" style="--charge:${(1-(p.resetRemaining??0)/CONFIG.pendulum.reset)*360}deg" aria-hidden="true"></span> RESETTING · ${Math.ceil(p.resetRemaining??0)}s`}</button>`:''}<button data-action="pause" class="speed ${state.speed===0?'active':''}" aria-label="${state.speed===0?'Resume':'Pause'}">${state.speed===0?'▶':'Ⅱ'}</button>${[1,2,4].map(n=>`<button data-action="speed" data-speed="${n}" class="speed ${state.speed===n?'active':''}">${n}×</button>`).join('')}`;}
      else actions=`<button data-action="results">${this.inspected?'Show results':'Siege complete'}</button>`;
    }
    html(this.el['battle-stats'],stats);html(this.el.actions,actions);
    let status='';let invalid=false;
    if(performance.now()<this.messageUntil&&this.message){status=this.message;invalid=true;}
    else if(prep&&this.hover&&this.tool){const info=this.previewInfo,name=tools.find(t=>t[0]===this.tool)?.[1]||'',cost=info?.totalCost??info?.cost;status=`${name}${cost!=null?' · '+(cost<0?'Refund: '+-cost:'Cost: '+cost)+' G':''}${this.previewCells.length>1?' · '+this.previewCells.length+' tiles':''}${info?.reason?' — '+info.reason:''}`;invalid=this.previewCells.some(p=>!p.valid);if(this.tool==='pendulum')status+=' · Orange sweep overlaps damage your buildings.';}
    else if(prep)status='Build across the canyon. Leave a gate for the trade road.';
    else if(battle)status=p?'Space releases the Titan. Its hammer also damages friendly structures.':'Watch the breach: enemies choose the least costly route through your defenses.';
    else status='Inspect the battlefield, or retry with the exact pre-siege castle and treasury.';
    if(prep&&this.hover&&wallTool(this.tool)&&this.previewCells.length===1&&this.previewCells[0].replacement){const p=this.previewCells[0],label=p.cost<0?`Refund: ${-p.cost} G`:`Cost: ${p.cost} G`;status=`Replace ${names[p.replacedType]||p.replacedType} -> ${names[this.tool]} | ${label}`;invalid=!p.valid;}
    this.el.status.textContent=status;this.el.status.classList.toggle('invalid',invalid);this.el.status.classList.toggle('affordable',prep&&wallTool(this.tool)&&!!this.previewCells[0]?.replacement&&!invalid);
    const result=!prep&&!battle;
    this.el.results.hidden=(!result||this.inspected)&&!state.growthReport;
    if(state.growthReport){
      const report=state.growthReport,tier=String(report.tier).toUpperCase(),outside=report.outside;
      const shortage=[report.shortage.houses?`${report.shortage.houses} houses`:'',report.shortage.farms?`${report.shortage.farms} farms`:''].filter(Boolean).join(' and ');
      html(this.el.results,`<div class="result-card growth-card" role="dialog" aria-modal="true" aria-labelledby="growth-headline"><div class="eyebrow">YOUR CLIENT'S SETTLEMENT IS GROWING</div><h2 id="growth-headline">${escapeText(tier)} DEFENSE!</h2><div class="growth-summary"><strong>+${report.settlers} settlers</strong><span>+${report.houses} houses · +${report.farms} farms</span></div>${report.repaired?`<p>${report.repaired} civilian buildings rebuilt for free.</p>`:''}${outside?'<p class="notice">New buildings stand outside your walls.</p>':''}${shortage?`<p class="notice">Space is limited: ${escapeText(shortage)} could not be placed.</p>`:''}${report.rebuildShortage?`<p class="notice">${report.rebuildShortage} civilian buildings could not be rebuilt because their sites are occupied.</p>`:''}<p>Your next assignment: Protect the growing settlement.</p><button class="primary" data-action="dismissGrowth">BEGIN PREPARATION</button></div>`);
    }
    if(result&&!this.inspected){
      const victory=state.phase==='victory',complete=state.phase==='complete',r=state.results;
      const row=(label,value)=>`<div class="result-row"><span>${escapeText(label)}</span><strong>${escapeText(value)}</strong></div>`;
      const totals=state.campaign.totals;
      const ratingRows=row('Defense rating',`${r.rating} / 100`)+row('Defense tier',String(r.tier).toUpperCase());
      const breakdown=complete?
        ratingRows+row('Sieges won',state.campaign.history.length)+row('Enemies defeated',totals.enemiesDefeated)+row('Bosses defeated',state.campaign.history.filter(s=>s.bossDefeated).length)+row('Inhabitants saved (all sieges)',totals.inhabitantsSaved)+row('Inhabitants lost',totals.inhabitantsLost)+row('Buildings destroyed',totals.buildingsDestroyed)+row('Total keep HP lost',Math.ceil(totals.keepDamage))+row('Total rewards',totals.payout+' G')+row('Treasury',state.gold+' G'):
        row('Result',victory?'Victory':'Defeat')+ratingRows+row('Enemies defeated',r.enemiesDefeated)+row('Boss defeated',r.bossDefeated?'Yes':'No')+row('Inhabitants saved',r.inhabitantsSaved)+row('Inhabitants lost',r.inhabitantsLost)+row('Enemies that reached the keep',r.enemiesReachedKeep)+row('Buildings destroyed',r.buildingsDestroyed)+row('Kill bounties (earned in battle)',r.bountyGold+' G')+r.bonuses.map(l=>row(l.label,'+'+l.amount+' G')).join('')+r.penalties.map(l=>row(l.label,(l.amount<0?'−':'')+Math.abs(l.amount)+' G')).join('')+(r.floorApplied?row('Payout floor applied',CONFIG.rewards.floor+' G minimum'):'')+(!victory?row('Defeat payout','0 G'):'')+row('Net payout',r.payout+' G')+row('Treasury after',r.treasuryAfter+' G');
      html(this.el.results,`<div class="result-card"><div class="eyebrow">${complete?'THREE SIEGES ENDURED':escapeText(siegeName(state.siegeIndex))}</div><h2>${complete?'CAMPAIGN COMPLETE':victory?'VICTORY':'DEFEAT'}</h2><div class="result-breakdown">${breakdown}</div>${complete?'':victory?`<button class="primary" data-action="continue">${state.siegeIndex===3?'COMPLETE CAMPAIGN':'CONTINUE'}</button>`:'<button class="primary" data-action="retry">RETRY SIEGE</button>'}${!complete&&victory?'<button class="quiet" data-action="retry">Retry Siege</button>':''}<button class="quiet" data-action="inspect">Inspect castle</button><button class="quiet" data-action="restart">Restart Campaign</button></div>`);
    }
    if(this.lastPhase!==state.phase){this.lastPhase=state.phase;this.preview();}
  }
  update(dt,effects){this.refreshClock+=dt;if(this.refreshClock>=.1){this.refreshClock=0;this.preview();this.refresh();}this.el.announcement.textContent=effects.banner>0&&this.game.state.phase==='siege'?effects.bannerText:'';this.el.announcement.style.opacity=String(Math.min(1,effects.banner));}
}
