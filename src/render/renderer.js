import { SITES } from '../data/map.js';
import { CONFIG } from '../config.js';
import { stageFor } from '../data/stages.js';
import { launcherLane } from '../sim/mechanisms.js';
import { createTerrain, createFrontierTerrain, createFloorClip, TILE } from './terrain.js';
import { Effects } from './effects.js';

const TAU=Math.PI*2;
function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
function line(c,x1,y1,x2,y2,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function bar(c,x,y,w,hp,max){c.fillStyle='#192021';c.fillRect(x-w/2,y,w,3);c.fillStyle=hp/max>.45?'#a4bc84':'#d88a65';c.fillRect(x-w/2,y,w*Math.max(0,hp/max),3);}
const sites=state=>state?.stageId==='frontier'?stageFor(state).map.sites:Array.isArray(SITES)?SITES:Object.values(SITES);
const siteFor=p=>sites().find(s=>s.id===p.siteId)||p;
const center=s=>({x:s.pivotX*TILE,y:s.pivotY*TILE});
const floorClip=createFloorClip();
function strikeBand(s){
  const p=center(s),r=s.armLength*TILE,h=CONFIG.pendulum.radius*TILE,a=s.centerAngle-s.halfSweep,b=s.centerAngle+s.halfSweep;
  const band=new Path2D();band.arc(p.x,p.y,r+h,a,b);band.arc(p.x+Math.cos(b)*r,p.y+Math.sin(b)*r,h,b,b+Math.PI);band.arc(p.x,p.y,r-h,b,a,true);band.arc(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,h,a+Math.PI,a+TAU);band.closePath();return band;
}
function hoveredMount(ui,state){
  return ui.hover&&sites(state).find(s=>{const dx=ui.hover.x+.5-s.pivotX,dy=ui.hover.y+.5-s.pivotY,forward=dx*Math.cos(s.centerAngle)+dy*Math.sin(s.centerAngle),side=-dx*Math.sin(s.centerAngle)+dy*Math.cos(s.centerAngle);return forward>=-3.5&&forward<=.7&&Math.abs(side)<1.9;});
}
function shownSweeps(state,ui){return state.phase==='prep'&&ui.tool==='pendulum'?sites(state):state.phase==='prep'&&hoveredMount(ui,state)?[hoveredMount(ui,state)]:state.pendulum?[siteFor(state.pendulum)]:[];}

export class Renderer {
  constructor(canvas,audio){this.canvas=canvas;this.c=canvas.getContext('2d');this.terrain=createTerrain();this.effects=new Effects(audio);this.frame=document.createElement('canvas');this.frame.width=1280;this.frame.height=720;this.visualTime=0;this.audio=audio;}
  draw(state,ui,dt){
    this.effects.update(dt);this.effects.ingest(state);this.visualTime+=dt;const c=this.c;
    if(this.effects.stop>0){c.drawImage(this.frame,0,0);return;}
    c.save();if(this.effects.shake>0){c.translate(Math.sin(this.visualTime*145)*this.effects.shake,Math.cos(this.visualTime*123)*this.effects.shake*.6);}
    if(state.stageId==='frontier'&&this.frontierMap!==stageFor(state).map){this.frontierMap=stageFor(state).map;this.frontierTerrain=createFrontierTerrain(this.frontierMap);}
    c.drawImage(state.stageId==='frontier'?this.frontierTerrain:this.terrain,0,0);this.effects.ground(c);
    this.mapLabels(c,state);
    for(const r of state.rubble||[]){c.fillStyle='#55574b';for(let i=0;i<6;i++)c.fillRect((r.x+.15+(i%3)*.24)*TILE,(r.y+.2+Math.floor(i/3)*.32)*TILE,5,4);}
    for(const m of state.attackMarkers||[]){line(c,m.x*TILE-5,m.y*TILE-5,m.x*TILE+5,m.y*TILE+5,'#b7624e99',2);line(c,m.x*TILE+5,m.y*TILE-5,m.x*TILE-5,m.y*TILE+5,'#b7624e99',2);}
    this.overlays(c,state,ui);
    for(const s of state.structures||[])if(!s.destroyed&&s.hp>0)this.structure(c,s,state);
    if(state.stageId==='frontier')for(const site of state.constructionSites||[])this.constructionSite(c,site);
    if(state.stageId==='frontier')this.frontierProperties(c,state,ui);
    this.mechanismLinks(c,state,ui);
    this.sweepWarnings(c,state,ui);
    if(state.phase==='prep'){
      c.save();c.strokeStyle=`rgba(240,96,78,${.7+Math.sin(this.visualTime*4)*.3})`;c.fillStyle=`rgba(240,96,78,${.18+Math.sin(this.visualTime*4)*.1})`;c.lineWidth=3;for(const tile of ui.blockedRoadTiles||[])c.fillRect(tile.x*TILE,tile.y*TILE,TILE,TILE);
      for(const tile of ui.blockedRoadTiles||[])c.strokeRect(tile.x*TILE+1,tile.y*TILE+1,TILE-2,TILE-2);
      c.restore();
      const highlight=state.growthHighlight;
      if(highlight&&(state.prepTime??0)<highlight.until){c.save();c.strokeStyle=`rgba(242,218,143,${.6+Math.sin(this.visualTime*4)*.3})`;c.fillStyle=`rgba(242,218,143,${.08+Math.sin(this.visualTime*4)*.04})`;c.lineWidth=3;for(const s of state.structures)if(!s.destroyed&&s.hp>0&&highlight.ids.includes(s.id)){c.fillRect(s.x*TILE-2,s.y*TILE-2,s.w*TILE+4,s.h*TILE+4);c.strokeRect(s.x*TILE-2,s.y*TILE-2,s.w*TILE+4,s.h*TILE+4);}c.restore();}
    }
    for(const h of state.inhabitants||[])if(h.hp>0&&!h.sheltered)this.inhabitant(c,h,state);
    for(const g of state.guards||[])if(g.hp>0)this.guard(c,g);
    for(const g of state.militia||[])if(g.hp>0&&!g.sheltered)this.guard(c,g);
    for(const g of state.golems||[])if(g.hp>0&&g.status!=='crumbled')this.golem(c,g,state);
    for(const e of [...(state.enemies||[])].filter(e=>e.hp>0&&!e.dead).sort((a,b)=>a.y-b.y))this.enemy(c,e,state);
    for(const a of state.arrows||[]){const target=state.enemies.find(e=>e.id===a.targetId);const angle=target?Math.atan2(target.y-a.y,target.x-a.x):0;c.save();c.translate(a.x*TILE,a.y*TILE);c.rotate(angle);line(c,-7,0,4,0,'#f1dfa5',1.5);line(c,4,0,1,-2,'#f1dfa5');c.restore();}
    for(const b of state.bolts||[]){c.save();c.translate(b.x*TILE,b.y*TILE);c.rotate(Math.atan2(b.dy,b.dx));line(c,-13,0,5,0,'#34403d',4);line(c,-12,0,5,0,'#ffe5a1',2);line(c,5,0,1,-3,'#fff5ce',1.7);line(c,5,0,1,3,'#fff5ce',1.7);line(c,-10,-3,-7,0,'#b1d6c0',1);line(c,-10,3,-7,0,'#b1d6c0',1);c.restore();}
    for(const s of sites(state))this.mount(c,s,state.pendulum?.siteId===s.id?state.pendulum:null,state.phase==='prep'&&ui.tool==='pendulum');
    if(state.pendulum)this.pendulum(c,state.pendulum,state);
    this.preview(c,state,ui);this.effects.draw(c);c.restore();
    if(state.phase==='siege'&&state.speed===0){c.fillStyle='#11202475';c.fillRect(0,0,1280,720);c.fillStyle='#f0dfac';c.font='24px Georgia';c.textAlign='center';c.fillText('PAUSED',640,70);c.font='12px system-ui';c.fillText('P TO RESUME',640,93);c.textAlign='left';}
    this.frame.getContext('2d').drawImage(this.canvas,0,0);
  }
  // Approximate intel: one inward arrow per front sized by band, entry tiles
  // tinted. Battle dims them until a front's lead warning fires.
  fronts(c,state,plan){
    const size={major:36,secondary:27,minor:19},label={major:'MAJOR',secondary:'SECONDARY',minor:'POSSIBLE RAID'},spawns=stageFor(state).map.spawns,lead=CONFIG.frontier.fronts.warningLead;
    c.save();c.font='bold 16px system-ui';c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
    for(const f of plan.fronts){
      const warning=(state.frontWarnings||[]).find(w=>w.frontId===f.id),alert=state.phase==='siege'&&warning&&state.time-warning.t<lead+1.5;
      const alpha=state.phase==='prep'?.95:alert?.75+Math.sin(this.visualTime*9)*.25:.3,color=alert?'#ff7a5c':'#f3c38e';
      c.globalAlpha=alpha*.35;c.fillStyle=color;for(const lane of f.lanes){const p=spawns[lane];if(p)c.fillRect((p.x-(p.y===0||p.y===35?2:0))*TILE,(p.y-(p.x===0||p.x===63?2:0))*TILE,(p.y===0||p.y===35?5:1)*TILE,(p.x===0||p.x===63?5:1)*TILE);}
      const ax=(f.anchor.x+.5)*TILE,ay=(f.anchor.y+.5)*TILE,dx=640-ax,dy=360-ay,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,s=size[f.band];
      const bx=ax+ux*28,by=ay+uy*28,tipX=bx+ux*s,tipY=by+uy*s;
      c.globalAlpha=alpha;c.setLineDash(f.wave===2&&state.phase==='prep'?[4,3]:[]);c.strokeStyle='#1b1d16';c.lineWidth=4;c.fillStyle=color;
      c.beginPath();c.moveTo(tipX,tipY);c.lineTo(bx-uy*s*.55,by+ux*s*.55);c.lineTo(bx+ux*s*.25,by+uy*s*.25);c.lineTo(bx+uy*s*.55,by-ux*s*.55);c.closePath();c.stroke();c.fill();c.setLineDash([]);
      if(state.phase==='prep'||alert){const text=alert?`INCOMING · ${f.name.toUpperCase()}`:f.wave===2?'2ND WAVE?':label[f.band],tx=tipX+ux*26-uy*0,ty=tipY+uy*20;c.strokeStyle='#1b1d16';c.lineWidth=4;c.strokeText(text,tx,ty);c.fillText(text,tx,ty);}
    }
    c.restore();
  }
  mapLabels(c,state){c.save();if(state.stageId==='frontier'){const map=stageFor(state).map;c.font='italic 13px Georgia';c.fillStyle='#e7e2bca0';for(const d of map.districts||[])c.fillText(d.name,d.x*TILE+4,d.y*TILE-9);const plan=stageFor(state).sieges[1]?.plan;c.fillStyle='#f3c38e';c.textAlign='right';
    if(plan){const main=plan.fronts.reduce((a,b)=>b.waveShares[0]>a.waveShares[0]?b:a);c.fillText(`Main assault expected: ${main.name}`,1250,35);c.restore();this.fronts(c,state,plan);return;}
    const edges=[...new Set(map.spawns.map(p=>p.x===0?'west':p.x===63?'east':p.y===0?'north':'south'))];c.fillText(`Raiders approach: ${edges.join(' / ')}`,1250,35);c.restore();return;}c.fillStyle='#c3c7ae77';c.font='10px system-ui';c.letterSpacing='2px';c.fillText('THE CANYON KEEP',1000,130);c.fillStyle='#c9ba9290';c.font='italic 13px Georgia';c.fillText('The western approach',85,100);c.restore();}
  frontierProperties(c,state,ui){
    const hovered=ui.hover&&state.structures.find(s=>s.owner&&ui.hover.x>=s.x&&ui.hover.x<s.x+s.w&&ui.hover.y>=s.y&&ui.hover.y<s.y+s.h);
    c.save();for(const s of state.structures)if(s.owner){const x=s.x*TILE,y=s.y*TILE,w=s.w*TILE,h=s.h*TILE,selected=s.id===ui.requestBuildingId||s.id===(hovered?.id??ui.selectedStructureId),request=state.contract.requests.find(r=>r.buildingId===s.id),accepted=s.promise?.status==='accepted';
      if(s.hp<s.maxHp){c.fillStyle=s.destroyed?'#8e3f3670':`rgba(193,102,66,${(1-s.hp/s.maxHp)*.5})`;c.fillRect(x,y,w,h);if(s.destroyed){c.strokeStyle='#e99573';c.setLineDash([4,3]);c.strokeRect(x,y,w,h);c.setLineDash([]);line(c,x+5,y+5,x+w-5,y+h-5,'#d7917180',2);line(c,x+w-5,y+5,x+5,y+h-5,'#d7917180',2);}}
      if(accepted||selected){c.lineWidth=selected?3:1.5;c.strokeStyle=selected?'#ffe3a3':'#a5d3b0';c.strokeRect(x-3,y-3,w+6,h+6);}
      if(state.phase==='prep'&&request){const pending=['none','pending','open',undefined].includes(request.status),mx=x+w/2,my=y-10;circle(c,mx,my,7,pending?'#e5bd6c':accepted?'#8fb597':'#6d7c72');c.fillStyle='#202c28';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(pending?'!':accepted?'✓':'·',mx,my+3);}
      if(selected||s.destroyed){c.fillStyle='#ecdfbb';c.font='9px system-ui';c.textAlign='center';c.fillText(`${s.label||s.type}${s.destroyed?' · LOST':''}`,x+w/2,y+h+12);}
    }c.restore();
  }
  guard(c,g){const x=g.x*TILE,y=g.y*TILE,militia=g.type==='militia',attacking=g.status==='engaging'||g.status==='attacking',swing=attacking?Math.sin(this.visualTime*10)*3:0;c.save();circle(c,x,y+2,7,'#263630');c.fillStyle=militia?'#b79a66':g.hired?'#b18c85':'#7da3ad';c.fillRect(x-4,y-3,8,10);circle(c,x,y-6,4,'#d8bc97');if(!militia)line(c,x-4,y-9,x+4,y-9,'#d2d8c0',3);line(c,x+7,y+5,x+7+swing,y-13,'#d2ceae',1.5);if(militia){line(c,x+4,y-10,x+10,y-10,'#dfcf96',1.5);line(c,x+4,y-10,x+4,y-14,'#dfcf96');line(c,x+10,y-10,x+10,y-14,'#dfcf96');}else{c.fillStyle=g.hired?'#935f55':'#5d7f8c';c.fillRect(x-8,y-1,5,8);}if(g.status==='retreating'){line(c,x-5,y+12,x,y+15,'#efc67c',1.5);line(c,x,y+15,x+5,y+12,'#efc67c',1.5);}if(g.hp<g.maxHp)bar(c,x,y-16,18,g.hp,g.maxHp);c.restore();}
  constructionSite(c,site){const x=(site.x+.5)*TILE,y=(site.y+.5)*TILE,q=Math.min(1,(site.elapsed||0)/(site.duration||CONFIG.frontier.buildTime)),waiting=site.status!=='building';c.save();c.fillStyle='#d9bf6630';c.fillRect(site.x*TILE+1,site.y*TILE+1,(site.w||1)*TILE-2,(site.h||1)*TILE-2);c.strokeStyle=waiting?'#ef9d6f':'#e6d18f';c.setLineDash([3,3]);c.strokeRect(site.x*TILE+1,site.y*TILE+1,(site.w||1)*TILE-2,(site.h||1)*TILE-2);c.setLineDash([]);line(c,x-5,y+4,x+5,y-4,'#b99a6a',3);c.strokeStyle='#283a35';c.lineWidth=3;c.beginPath();c.arc(x,y,8,0,TAU);c.stroke();c.strokeStyle=waiting?'#f4a478':'#f4d98e';c.beginPath();c.arc(x,y,8,-Math.PI/2,-Math.PI/2+q*TAU);c.stroke();if(waiting){c.fillStyle='#f4d98e';c.font='bold 10px system-ui';c.textAlign='center';c.fillText('Ⅱ',x,y+4);}c.restore();}
  structure(c,s,state){
    const x=s.x*TILE,y=s.y*TILE,w=(s.w||1)*TILE,h=(s.h||1)*TILE,health=s.hp/s.maxHp;
    if(s.type==='caltrops'){c.fillStyle='#35463355';c.fillRect(x+1,y+1,w-2,h-2);for(const [dx,dy]of [[5,5],[14,6],[9,13],[16,16]]){line(c,x+dx-3,y+dy+2,x+dx+3,y+dy-2,'#28342e',2.5);line(c,x+dx-2,y+dy-2,x+dx+2,y+dy+2,'#d2d1b1',1.5);line(c,x+dx,y+dy,x+dx,y+dy-4,'#e5dcb7',1);}return;}
    if(s.type==='sensor'){c.save();circle(c,x+10,y+10,7,'#2c403d');c.strokeStyle='#9eab8a';c.lineWidth=1.5;c.beginPath();c.arc(x+10,y+10,5.5,0,TAU);c.stroke();for(let i=0;i<4;i++){const a=i*TAU/4;line(c,x+10+Math.cos(a)*4,y+10+Math.sin(a)*4,x+10+Math.cos(a)*8,y+10+Math.sin(a)*8,'#c3ac70',2);}circle(c,x+10,y+10,2.4,s.flashRemaining>0?'#fff4b6':s.pending!=null?'#e9c06b':s.cooldown>0?'#747f71':'#abd9ba');c.restore();return;}
    if(s.type==='retractable'){const status=s.status||'lowered',q=status==='raised'?1:status==='rising'?Math.min(1,(s.elapsed||0)/CONFIG.retractable.rise):status==='lowering'?Math.max(0,1-(s.elapsed||0)/CONFIG.retractable.lower):0;c.fillStyle='#37423b';c.fillRect(x+1,y+2,18,16);c.strokeStyle=status==='waiting'?'#f0c274':'#919b7d';c.lineWidth=1;c.strokeRect(x+1,y+2,18,16);for(const dy of [5,10,15])line(c,x+3,y+dy,x+17,y+dy,'#171f1c',2);if(q>0){c.fillStyle='#141f1d66';c.fillRect(x+4,y+5,16,14);c.fillStyle=health>.3?'#a6afa0':'#857f69';c.fillRect(x+3,y+16-q*16,14,q*16);c.fillStyle='#d9d4b4';c.fillRect(x+3,y+16-q*16,14,3);for(const dx of [5,14])line(c,x+dx,y+17-q*16,x+dx,y+17,'#596d61',2);}else{line(c,x+3,y+3,x+17,y+3,'#b3b99c',2);for(const dx of [3,17])circle(c,x+dx,y+10,1.7,'#d3b875');}if(health<.95)bar(c,x+10,y-7,20,s.hp,s.maxHp);return;}
    c.fillStyle='#17201f66';c.fillRect(x+4,y+5,w,h);
    if(CONFIG.structures[s.type]?.family==='wall'){
      c.fillStyle=health>.65?'#bbb7a0':health>.3?'#a39d86':'#8b816b';c.fillRect(x+1,y+1,18,18);c.fillStyle='#e0d6b6';c.fillRect(x+1,y+1,18,3);c.fillStyle='#656c60';c.fillRect(x+1,y+16,18,3);
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]])if(state.structures.some(a=>!a.destroyed&&a.hp>0&&CONFIG.structures[a.type]?.family==='wall'&&a.x===s.x+dx&&a.y===s.y+dy)){c.fillStyle='#bbb59b';c.fillRect(x+(dx===-1?-2:dx===1?17:4),y+(dy===-1?-2:dy===1?17:4),dx?5:12,dy?5:12);}
      line(c,x+1,y+10,x+19,y+10,'#656c5c',1);line(c,x+9,y+4,x+9,y+10,'#6d7260',1);line(c,x+14,y+10,x+14,y+16,'#6d7260',1);
      if(s.type==='gate'){c.fillStyle='#4d4736';c.fillRect(x+5,y+2,10,16);for(let i=0;i<3;i++)line(c,x+7+i*3,y+3,x+7+i*3,y+17,'#b99356',1.3);line(c,x+5,y+7,x+15,y+7,'#dfbb72',2);}
      if(s.type==='spiked'){for(const [dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]])for(const offset of [-4,4]){const px=x+10+dx*7-dy*offset,py=y+10+dy*7+dx*offset;c.fillStyle='#374341';c.beginPath();c.moveTo(px-dy*3,py+dx*3);c.lineTo(px+dx*7,py+dy*7);c.lineTo(px+dy*3,py-dx*3);c.closePath();c.fill();line(c,px,py,px+dx*6,py+dy*6,'#e4dfc9',1.2);}c.fillStyle='#555e56';c.fillRect(x+5,y+5,10,10);line(c,x+7,y+6,x+7,y+14,'#c2c8b0',2);line(c,x+13,y+6,x+13,y+14,'#c2c8b0',2);}
      if(s.type==='golem'){c.fillStyle='#73847b';c.fillRect(x+3,y+3,14,14);line(c,x+3,y+5,x+7,y+8,'#d6d4b7',2);line(c,x+17,y+5,x+13,y+8,'#d6d4b7',2);line(c,x+7,y+13,x+13,y+13,'#3d514d',2);line(c,x+10,y+7,x+9,y+11,'#c4c7ad',2);line(c,x+4,y+16,x+6,y+18,'#374b48',1);line(c,x+16,y+15,x+14,y+18,'#374b48',1);c.save();c.shadowColor='#a9efd3';c.shadowBlur=5;c.globalAlpha=.55+Math.sin(this.visualTime*2+s.x)*.12;line(c,x+5,y+8,x+8,y+8,'#b5f4d5',2);line(c,x+12,y+8,x+15,y+8,'#b5f4d5',2);c.restore();}
      if(s.type==='launcher'){c.save();c.translate(x+10,y+10);c.rotate(({N:-Math.PI/2,E:0,S:Math.PI/2,W:Math.PI})[s.facing||'E']);c.fillStyle='#344a46';c.fillRect(-7,-6,14,12);line(c,-6,-6,-6,6,'#d2b473',2);line(c,-3,-5,7,-5,'#c1b68d',2);line(c,-3,5,7,5,'#c1b68d',2);line(c,-6,0,11,0,'#252c27',6);line(c,-5,-1,10,-1,'#b7c3a6',2);line(c,0,-8,0,8,'#e0c17c',2);if(s.muzzleRemaining>0){c.globalAlpha=Math.min(1,s.muzzleRemaining*10);c.fillStyle='#fff0ac';c.beginPath();c.moveTo(10,-5);c.lineTo(24,0);c.lineTo(10,5);c.closePath();c.fill();circle(c,11,0,4,'#fff8d5');}c.restore();}
    } else if(s.type==='barricade'){
      line(c,x+3,y+4,x+17,y+17,'#55442f',5);line(c,x+17,y+4,x+3,y+17,'#55442f',5);line(c,x+3,y+3,x+17,y+16,'#c2a377',2);line(c,x+17,y+3,x+3,y+16,'#c2a377',2);line(c,x+1,y+10,x+19,y+10,'#71613f',3);
      if(s.npcOwned){line(c,x+2,y+8,x+18,y+13,'#f1d9a2',1.5);line(c,x+3,y+13,x+17,y+8,'#f1d9a2',1.5);circle(c,x+10,y+10,2,'#d7bb7d');}
    } else if(s.type==='palisade'){
      for(const dx of [4,10,16]){c.fillStyle=s.npcOwned?'#a78d58':'#9b7850';c.beginPath();c.moveTo(x+dx-3,y+18);c.lineTo(x+dx-3,y+5);c.lineTo(x+dx,y);c.lineTo(x+dx+3,y+5);c.lineTo(x+dx+3,y+18);c.closePath();c.fill();line(c,x+dx-1,y+5,x+dx-1,y+17,'#dfbf89',1);}line(c,x+1,y+12,x+19,y+12,s.npcOwned?'#f1d9a2':'#584832',2);if(s.npcOwned)line(c,x+2,y+9,x+18,y+15,'#efd69e',1);
    } else if(s.type==='tower'){
      c.fillStyle='#6d776b';c.fillRect(x,y,20,20);c.fillStyle='#c5c1a7';c.fillRect(x+1,y-3,18,19);c.fillStyle='#59665f';c.fillRect(x+5,y+1,10,10);c.fillStyle='#e6ddbb';for(let i=0;i<3;i++){c.fillRect(x+i*7,y-5,5,5);c.fillRect(x+i*7,y+12,5,5);}circle(c,x+10,y+5,3,'#dec09a');c.fillStyle='#527e7b';c.fillRect(x+7,y+7,6,5);line(c,x+13,y+3,x+16,y+8,'#d4b96f',1.5);
      line(c,x+4,y-3,x+4,y-12,'#4f5143',1);c.fillStyle='#5a9690';c.beginPath();c.moveTo(x+4,y-12);c.lineTo(x+14,y-9);c.lineTo(x+4,y-6);c.fill();
    } else if(s.type==='keep'){
      c.fillStyle='#909784';c.fillRect(x,y,w,h);c.fillStyle='#bfc3a5';c.fillRect(x+2,y+2,w-4,h-4);c.fillStyle='#6c7e6e';c.fillRect(x+12,y+10,w-24,h-20);c.fillStyle='#4d5144';c.fillRect(x+w/2-6,y+h-14,12,14);
      for(const dx of [0,w-17])for(const dy of [0,h-17]){c.fillStyle='#d4cfaf';c.fillRect(x+dx,y+dy-4,17,18);c.fillStyle='#7b8976';c.fillRect(x+dx+4,y+dy,9,8);for(let i=0;i<3;i++){c.fillStyle='#e6dcbb';c.fillRect(x+dx+i*6,y+dy-6,4,5);}}
      c.fillStyle='#435f5e';c.beginPath();c.moveTo(x+18,y+16);c.lineTo(x+w/2,y+5);c.lineTo(x+w-18,y+16);c.closePath();c.fill();c.fillStyle='#617f71';c.fillRect(x+18,y+16,w-36,21);line(c,x+w/2,y+7,x+w/2,y-16,'#c7bd94',2);c.fillStyle='#deb65f';c.beginPath();c.moveTo(x+w/2,y-16);c.lineTo(x+w/2+17,y-12);c.lineTo(x+w/2,y-7);c.fill();
      if(state.phase==='prep'){c.fillStyle='#e8dfb8';c.font='9px system-ui';c.textAlign='center';c.fillText('KEEP',x+w/2,y+h+12);c.textAlign='left';}
    } else if(s.type==='shop'){
      const awning=s.district==='hamlet'?'#789274':s.x%2?'#a75343':'#5d8390';c.fillStyle='#d4bc8c';c.fillRect(x+3,y+5,w-6,h-8);c.fillStyle='#766143';c.fillRect(x+1,y+3,w-2,10);line(c,x+2,y+4,x+w-2,y+4,'#c3aa77',2);c.fillStyle='#3c4b40';c.fillRect(x+8,y+18,w-16,h-22);for(let dx=0;dx<w;dx+=6){c.fillStyle=dx%12?awning:'#dfcc98';c.fillRect(x+dx,y+13,Math.min(6,w-dx),12);c.beginPath();c.arc(x+dx+3,y+25,3,0,Math.PI);c.fill();}line(c,x+3,y+22,x+3,y+h,'#65513a',2);line(c,x+w-3,y+22,x+w-3,y+h,'#65513a',2);c.fillStyle='#b7975e';c.fillRect(x+4,y+h-8,w-8,6);for(const [dx,color]of [[8,'#bb6845'],[16,'#91a16b'],[25,'#d9bd75']])circle(c,x+dx,y+h-9,3,color);
    } else if(s.type==='warehouse'){
      c.fillStyle='#b2a885';c.fillRect(x+2,y+11,w-4,h-12);c.fillStyle='#586b65';c.beginPath();c.moveTo(x-3,y+17);c.lineTo(x+3,y+1);c.lineTo(x+w-3,y+1);c.lineTo(x+w+3,y+17);c.closePath();c.fill();line(c,x+4,y+3,x+w-4,y+3,'#c6c4a0',2);for(let dx=5;dx<w;dx+=8)line(c,x+dx,y+5,x+dx-3,y+15,'#7d9181',1);c.fillStyle='#554f39';c.fillRect(x+w/2-8,y+h-19,16,18);line(c,x+w/2,y+h-18,x+w/2,y+h-2,'#bbaa78',1.5);for(const dx of [3,w-11]){c.fillStyle='#a17d4e';c.fillRect(x+dx,y+h-11,8,9);line(c,x+dx,y+h-10,x+dx+8,y+h-3,'#d4bc82',1.5);}
    } else if(s.type==='workshop'){
      c.fillStyle='#c0a37d';c.fillRect(x+3,y+10,w-6,h-11);c.fillStyle='#895548';c.beginPath();c.moveTo(x,y+16);c.lineTo(x+w/2,y);c.lineTo(x+w,y+16);c.closePath();c.fill();line(c,x+3,y+14,x+w/2,y+2,'#d7a071',2);c.fillStyle='#4c5b51';c.fillRect(x+w-13,y-7,8,23);c.fillStyle='#a1a18a';c.fillRect(x+w-15,y-8,12,4);c.fillStyle='#696f61';c.fillRect(x+6,y+h-16,12,14);circle(c,x+w-11,y+h-12,7,'#4b5146');circle(c,x+w-11,y+h-12,4,'#d2be87');circle(c,x+w-11,y+h-12,2,'#4b5146');for(let i=0;i<8;i++){const a=i*TAU/8;line(c,x+w-11+Math.cos(a)*5,y+h-12+Math.sin(a)*5,x+w-11+Math.cos(a)*9,y+h-12+Math.sin(a)*9,'#c8b480',2);}
    } else if(s.type==='barn'){
      c.fillStyle='#8d5e42';c.fillRect(x+3,y+11,w-6,h-12);for(let dx=6;dx<w-3;dx+=6)line(c,x+dx,y+14,x+dx,y+h-2,'#be9260',1);c.fillStyle='#5a5544';c.beginPath();c.moveTo(x,y+16);c.lineTo(x+7,y+4);c.lineTo(x+w/2,y-1);c.lineTo(x+w-7,y+4);c.lineTo(x+w,y+16);c.closePath();c.fill();c.fillStyle='#423f30';c.fillRect(x+w/2-8,y+h-17,16,16);line(c,x+w/2-7,y+h-16,x+w/2+7,y+h-2,'#e4c78d',1.5);line(c,x+w/2+7,y+h-16,x+w/2-7,y+h-2,'#e4c78d',1.5);
    } else if(s.type==='house'){
      c.fillStyle='#d0c099';c.fillRect(x+3,y+10,w-6,h-12);c.fillStyle='#6e5c48';c.beginPath();c.moveTo(x,y+15);c.lineTo(x+w/2,y-1);c.lineTo(x+w,y+15);c.closePath();c.fill();line(c,x+3,y+13,x+w/2,y+2,'#ae9163',2);c.fillStyle='#4f5d51';c.fillRect(x+w/2-4,y+h-15,8,13);
    } else if(s.type==='farm'){
      c.fillStyle='#665f3f';c.fillRect(x+1,y+1,w-2,h-2);for(let i=0;i<5;i++){line(c,x+4+i*7,y+3,x+4+i*7,y+h-3,'#c8b671',3);line(c,x+5+i*7,y+5,x+5+i*7,y+h-5,'#849257',1);}
    }
    if(health<.95){c.strokeStyle=health<.3?'#453b31':'#62624f';c.lineWidth=health<.3?2:1.3;c.beginPath();c.moveTo(x+w*.35,y+2);c.lineTo(x+w*.5,y+h*.4);c.lineTo(x+w*.33,y+h*.6);c.lineTo(x+w*.55,y+h-2);c.stroke();if(health<.3){line(c,x+w*.1,y+h*.6,x+w*.8,y+h*.2,'#50483a',2);c.fillStyle='#68614a';c.fillRect(x+w-7,y+h-6,7,6);}bar(c,x+w/2,y-10,Math.max(20,w),s.hp,s.maxHp);}
  }
  inhabitant(c,h,state){const x=h.x*TILE,y=h.y*TILE,bob=Math.sin(this.visualTime*3+Number(h.id||0))*.6;c.fillStyle='#24332b55';c.beginPath();c.ellipse(x+1,y+7,7,3,0,0,TAU);c.fill();circle(c,x,y+1+bob,7,'#202a29');circle(c,x,y+1+bob,5.5,['#698e99','#c2a16d','#7b9876'][Math.abs(Number(h.id)||0)%3]);circle(c,x,y-5+bob,4.7,'#202a29');circle(c,x,y-5+bob,3.2,'#e3c3a0');}
  golem(c,g,state){const x=g.x*TILE,y=g.y*TILE,bob=g.status==='moving'?Math.sin((state.time??0)*7)*1.2:0;c.save();c.translate(x,y+bob);c.globalAlpha=Math.min(1,(g.remaining??1)*2);c.fillStyle='#17292477';c.beginPath();c.ellipse(2,10,15,7,0,0,TAU);c.fill();for(const [px,py,w,h]of [[-10,3,8,10],[3,3,8,10],[-11,-12,22,20],[-18,-9,8,17],[11,-9,8,17],[-8,-20,16,13]]){c.fillStyle='#253d38';c.fillRect(px-1,py-1,w+2,h+2);c.fillStyle='#8d9c86';c.fillRect(px,py,w,h);c.fillStyle='#bdc4a5';c.fillRect(px,py,w,3);}line(c,-7,-7,0,-3,'#4b6356',2);line(c,0,-3,-3,5,'#4b6356',2);line(c,0,-3,7,-6,'#4b6356',2);c.shadowBlur=6;c.shadowColor='#8bf1cc';line(c,-5,-15,-2,-15,'#b9ffde',2);line(c,2,-15,5,-15,'#b9ffde',2);line(c,-2,-5,0,-7,'#9ce4bc',1);line(c,0,-7,2,-5,'#9ce4bc',1);c.shadowBlur=0;bar(c,0,-28,29,g.hp,g.maxHp);c.restore();}
  enemy(c,e,state){
    const x=e.x*TILE,y=e.y*TILE,t=state.time??0;
    if(e.type==='boss'){
      const wind=e.attackPhase==='windup',q=wind?1-(e.windupRemaining??0)/CONFIG.enemies.boss.windup:0;
      if(wind){c.fillStyle='#bc503b33';c.strokeStyle='#efac6c';c.lineWidth=2;c.beginPath();c.arc(x,y,CONFIG.enemies.boss.slamRadius*TILE,0,TAU);c.fill();c.stroke();c.strokeStyle='#f2d392';c.lineWidth=4;c.beginPath();c.arc(x,y,CONFIG.enemies.boss.slamRadius*TILE+3,-Math.PI/2,-Math.PI/2+TAU*q);c.stroke();}
      c.fillStyle='#1b242788';c.beginPath();c.ellipse(x+5,y+15,25,13,0,0,TAU);c.fill();
      c.save();c.translate(x,y);c.rotate(Math.sin(t*3)*.035);c.fillStyle='#5b3e36';c.fillRect(-14,10,11,13);c.fillRect(5,10,11,13);circle(c,0,0,23,'#735d43');circle(c,-18,-2,10,'#9a8662');circle(c,17,-2,10,'#9a8662');c.fillStyle='#4a4940';c.fillRect(-14,-9,28,20);line(c,-12,-5,12,7,'#a19776',3);circle(c,0,-16,10,'#ac9772');c.fillStyle='#424b42';c.fillRect(-10,-22,20,8);line(c,-9,-23,-13,-30,'#c5b78a',3);line(c,9,-23,13,-30,'#c5b78a',3);line(c,-5,-15,-2,-15,'#ffba79',2);line(c,3,-15,6,-15,'#ffba79',2);
      c.save();c.translate(23,2);c.rotate(wind?-1-q*1.6:.2+Math.sin(t*2)*.1);line(c,0,5,9,33,'#a08b60',7);c.fillStyle='#5b6259';c.fillRect(-1,22,22,22);line(c,0,24,19,42,'#949a7e',3);c.restore();c.restore();bar(c,x,y-40,53,e.hp,e.maxHp);return;
    }
    const moving=e.attackPhase==='moving'||!e.attackPhase,bob=moving?Math.sin(t*11+Number(e.id||0))*.8:0;
    c.save();c.translate(x,y+bob);c.scale(1.12,1.12);c.fillStyle='#2e2a2655';c.beginPath();c.ellipse(1,5,7,3,0,0,TAU);c.fill();c.fillStyle='#252729';c.fillRect(-5,1,5,7);c.fillRect(1,1,5,7);circle(c,0,-1,7,'#252729');circle(c,0,-6,4.3,'#252729');c.fillStyle='#4d3431';c.fillRect(-4,2,3,5);c.fillRect(2,2,3,5);circle(c,0,-1,5.6,e.type==='chiseler'?'#9a8061':e.type==='powder'?'#806139':'#935e4b');circle(c,0,-6,3.1,'#c1a27a');c.fillStyle='#51483f';c.fillRect(-4,-9,8,3);
    if(e.type==='powder'){circle(c,-5,0,5,'#493e31');line(c,-8,0,-2,0,'#b39b65',1);line(c,-5,-5,-4,-9,'#d2b374',1);circle(c,-4,-10,1.6,Math.sin(t*15)>0?'#ffe0a0':'#e18b46');}
    else if(e.type==='chiseler'){const chip=e.attackPhase==='attacking'?Math.sin((e.chipClock??t)*20)*3:0;line(c,4,-1,11+chip,-7,'#cfbe8d',2);line(c,8+chip,-10,14+chip,-4,'#d7d3b1',2);}
    else {line(c,5,0,11,-10,'#d2cbb0',1.5);circle(c,-5,0,3,'#8a6750');line(c,-7,-1,-3,1,'#b69d6a',1);}
    if((e.stunRemaining??0)>0){c.strokeStyle='#ffe2a0';c.beginPath();c.ellipse(0,-14,7,2,0,0,TAU);c.stroke();}
    c.restore();if(e.hp<e.maxHp)bar(c,x,y-15,15,e.hp,e.maxHp);
  }
  sweepZone(c,s,alpha,state){
    const p=center(s),r=s.armLength*TILE,a=s.centerAngle-s.halfSweep,b=s.centerAngle+s.halfSweep;
    c.save();c.clip(floorClip,'evenodd');
    // The swept head is a rounded tube, including the two end positions.
    const band=strikeBand(s);
    c.globalAlpha=alpha;c.fillStyle='#f7b94c';c.fill(band);
    c.globalAlpha=Math.min(.8,alpha*2.5);c.strokeStyle='#ffe1a0';c.lineWidth=1.5;c.stroke(band);
    c.globalAlpha=Math.min(.95,alpha*5);c.strokeStyle='#ffe5a5';c.lineWidth=2;c.setLineDash([9,6]);c.beginPath();c.arc(p.x,p.y,r,a,b);c.stroke();c.setLineDash([]);
    c.restore();
  }
  sweepWarnings(c,state,ui){
    // Draw friendly-fire warnings after buildings so opaque roofs cannot hide them.
    for(const s of shownSweeps(state,ui)){c.save();c.clip(floorClip,'evenodd');c.clip(strikeBand(s));c.fillStyle=state.phase==='prep'?'#ff792d80':'#ff792d45';c.strokeStyle='#ffba72';c.lineWidth=2;for(const st of state.structures)if(!st.destroyed&&st.hp>0){c.fillRect(st.x*TILE,st.y*TILE,(st.w||1)*TILE,(st.h||1)*TILE);c.strokeRect(st.x*TILE+1,st.y*TILE+1,(st.w||1)*TILE-2,(st.h||1)*TILE-2);}c.restore();}
  }
  overlays(c,state,ui){
    const prep=state.phase==='prep';
    if(prep)for(const sensor of state.structures)if(sensor.type==='sensor'&&!sensor.destroyed&&sensor.hp>0){const x=(sensor.x+.5)*TILE,y=(sensor.y+.5)*TILE,selected=ui.selectedSensorId===sensor.id;c.save();c.fillStyle=selected?'#98d7b61c':'#98d7b60b';c.strokeStyle=selected?'#c2e8c080':'#a5ceac38';c.lineWidth=1;c.beginPath();c.arc(x,y,CONFIG.sensor.radius*TILE,0,TAU);c.fill();c.stroke();if(selected){c.strokeStyle='#ffe3a0';c.strokeRect(sensor.x*TILE-2,sensor.y*TILE-2,TILE+4,TILE+4);}c.restore();}
    const highlight=state.phase==='prep'&&(ui.tool==='pendulum'||hoveredMount(ui,state));
    for(const s of shownSweeps(state,ui))this.sweepZone(c,s,highlight?.25:state.phase==='siege'?.065:.13,state);
    if(ui.hover){const tower=state.structures.find(s=>!s.destroyed&&s.type==='tower'&&s.x===ui.hover.x&&s.y===ui.hover.y);if(tower||ui.tool==='tower'&&state.phase==='prep'){const x=(ui.hover.x+.5)*20,y=(ui.hover.y+.5)*20;c.fillStyle='#afd5c116';c.strokeStyle='#cce0c18a';c.lineWidth=1;c.beginPath();c.arc(x,y,CONFIG.tower.range*TILE,0,TAU);c.fill();c.stroke();}}
    if(ui.hover&&state.phase==='siege'){
      const e=state.enemies.find(e=>e.hp>0&&Math.hypot(e.x-ui.hover.x-.5,e.y-ui.hover.y-.5)<1);
      if(e){const target=state.structures.find(s=>s.id===e.attackTargetId),p=target?{x:target.x+(target.w||1)/2,y:target.y+(target.h||1)/2}:e.walkTarget?{x:e.walkTarget.x+.5,y:e.walkTarget.y+.5}:null;if(p){c.save();c.setLineDash([3,3]);line(c,e.x*TILE,e.y*TILE,p.x*TILE,p.y*TILE,'#f4d5a3',1);c.setLineDash([]);c.strokeStyle='#edb888';c.beginPath();c.arc(p.x*TILE,p.y*TILE,target?13:4,0,TAU);c.stroke();c.restore();}}
    }
  }
  mechanismLinks(c,state,ui){
    const prep=state.phase==='prep';
    for(const sensor of state.structures)if(sensor.type==='sensor'&&!sensor.destroyed&&sensor.hp>0&&(prep||sensor.flashRemaining>0)){
      const x=(sensor.x+.5)*TILE,y=(sensor.y+.5)*TILE,selected=ui.selectedSensorId===sensor.id,flash=!prep&&sensor.flashRemaining>0;
      c.save();c.globalAlpha=flash?1:selected?.92:.67;c.lineCap='round';
      for(const id of sensor.links||[]){const device=state.structures.find(d=>d.id===id&&!d.destroyed&&d.hp>0);if(!device)continue;const tx=(device.x+.5)*TILE,ty=(device.y+.5)*TILE,dx=tx-x,dy=ty-y,length=Math.hypot(dx,dy),color=flash?'#fff0ae':selected?'#f0d49b':'#c2a474';
        c.setLineDash([7,5]);line(c,x,y,tx,ty,'#252b25',4);line(c,x,y,tx,ty,color,2);c.setLineDash([]);
        for(const [gx,gy]of [[x,y],[tx,ty]]){circle(c,gx,gy,4,'#26342f');for(let a=0;a<4;a++){const angle=a*TAU/4;line(c,gx+Math.cos(angle)*3,gy+Math.sin(angle)*3,gx+Math.cos(angle)*5,gy+Math.sin(angle)*5,color,1.5);}circle(c,gx,gy,2,color);circle(c,gx,gy,.8,'#344037');}
        if(flash&&length){const progress=Math.min(1,1-sensor.flashRemaining/CONFIG.sensor.flashDuration),tail=Math.max(0,progress-.22);line(c,x+dx*tail,y+dy*tail,x+dx*progress,y+dy*progress,'#fff9da',4);}
      }c.restore();
    }
  }
  mount(c,s,p,selected){const q=center(s);if(!p){c.save();c.globalAlpha=selected?1:.6;c.strokeStyle=selected?'#f4ce79':'#b6b18a';c.lineWidth=1;c.setLineDash([3,3]);c.beginPath();c.arc(q.x,q.y,13,0,TAU);c.stroke();c.setLineDash([]);line(c,q.x-6,q.y,q.x+6,q.y,'#e7ce8e',2);line(c,q.x,q.y-6,q.x,q.y+6,'#e7ce8e',2);c.fillStyle='#e0cd98';c.font='9px system-ui';c.textAlign='center';c.fillText(`TITAN ${s.id}`,q.x,q.y-21);c.textAlign='left';c.restore();}}
  gantry(c,s,p){
    const q=center(s);c.save();c.translate(q.x,q.y);c.rotate(s.centerAngle);
    // A-frame extends back from the original pivot into the cliff. Its broad
    // anchors and long structural timbers read as machinery, not a tile icon.
    c.fillStyle='#101c2199';c.beginPath();c.moveTo(9,8);c.lineTo(-53,-26);c.lineTo(-69,-17);c.lineTo(-63,39);c.lineTo(-41,44);c.closePath();c.fill();
    for(const side of [-1,1]){
      c.fillStyle='#555f57';c.fillRect(-66,side*27-10,22,20);c.fillStyle='#9ea98e';c.fillRect(-66,side*27-12,22,16);c.fillStyle='#d0c7a3';c.fillRect(-65,side*27-12,20,4);line(c,-63,side*27-3,-49,side*27-3,'#59685c',1);line(c,-57,side*27-8,-57,side*27-3,'#687367',1);
    }
    const beam=(x1,y1,x2,y2)=>{
      line(c,x1,y1,x2,y2,'#242c29',13);line(c,x1,y1,x2,y2,'#6e5136',10);line(c,x1,y1-2,x2,y2-2,'#b8945d',4);
      const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
      for(const t of [.15,.72]){const x=x1+dx*t,y=y1+dy*t;line(c,x-nx*6,y-ny*6,x+nx*6,y+ny*6,'#293b3c',5);circle(c,x+nx*3,y+ny*3,1.3,'#d2c496');}
    };
    beam(-56,-27,1,0);beam(-56,27,1,0);beam(-52,-25,-52,25);beam(-35,-17,-35,17);
    // Large flanged winding drum with ratchet teeth and a fixed iron pawl.
    c.save();c.translate(-29,0);c.rotate(p.drumAngle??0);
    for(let i=0;i<12;i++){const a=i*TAU/12;c.fillStyle=i%2?'#8b9b8e':'#c2c5a5';c.beginPath();for(const [angle,radius] of [[a-.12,16],[a-.1,21],[a+.1,21],[a+.12,16]]){const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;if(angle===a-.12)c.moveTo(x,y);else c.lineTo(x,y);}c.closePath();c.fill();}
    circle(c,0,0,17,'#24393c');circle(c,0,0,13,'#aa8751');circle(c,0,0,10,'#5d6657');
    for(let i=0;i<6;i++){const a=i*TAU/6;line(c,Math.cos(a)*4,Math.sin(a)*4,Math.cos(a)*13,Math.sin(a)*13,'#ddd0a1',2.5);}
    circle(c,0,0,4,'#22383b');circle(c,-1,-1,2,'#e3c688');c.restore();
    line(c,-48,-19,-39,-14,'#1e3033',6);line(c,-48,-20,-39,-15,'#a4b2a1',2);circle(c,-49,-20,3,'#d5c39b');
    // The axle and lock are separate from the rotating drum.
    line(c,-4,-10,-4,10,'#263c3f',9);line(c,-6,-10,-6,10,'#b7be9d',2);circle(c,0,0,7,'#253c3f');circle(c,-1,-1,4,'#d5bc7f');
    if(p.status==='ready'){c.strokeStyle=`rgba(255,211,116,${.45+Math.sin(this.visualTime*4)*.2})`;c.lineWidth=2;c.beginPath();c.arc(0,0,10,0,TAU);c.stroke();}
    c.restore();
  }
  pendulum(c,p,state){
    const s=siteFor(p),q=center(s),r=s.armLength*TILE,a=p.angle??(s.centerAngle-s.halfSweep),hx=q.x+Math.cos(a)*r,hy=q.y+Math.sin(a)*r;
    // Two offset chains and their deep shadow make the scale immediately legible.
    line(c,q.x+7,q.y+9,hx+9,hy+11,'#14212180',12);
    if(p.status==='released'){
      const start=s.centerAngle-s.halfSweep,tail=Math.max(start,a-.48);
      c.save();c.lineCap='round';for(const [width,opacity]of[[CONFIG.pendulum.radius*TILE*1.9,.08],[CONFIG.pendulum.radius*TILE*1.35,.12],[12,.2]]){c.strokeStyle=`rgba(255,219,144,${opacity})`;c.lineWidth=width;c.beginPath();c.arc(q.x,q.y,r,tail,a);c.stroke();}
      for(let i=8;i>0;i--){const past=Math.max(start,a-i*.052);c.globalAlpha=(9-i)*.027;circle(c,q.x+Math.cos(past)*r,q.y+Math.sin(past)*r,CONFIG.pendulum.radius*TILE*.86,'#ffe4ac');}c.restore();
    }
    const angle=Math.atan2(hy-q.y,hx-q.x),nx=-Math.sin(angle)*6,ny=Math.cos(angle)*6;
    for(const sign of [-1,1]){line(c,q.x+nx*sign,q.y+ny*sign,hx+nx*sign,hy+ny*sign,'#14282d',7);for(let d=10;d<r-24;d+=9){const cx=q.x+Math.cos(angle)*d+nx*sign,cy=q.y+Math.sin(angle)*d+ny*sign;c.save();c.translate(cx,cy);c.rotate(angle);c.strokeStyle=d%18===10?'#d3d4b8':'#8eaaa1';c.lineWidth=2;c.beginPath();c.ellipse(0,0,5.7,3,0,0,TAU);c.stroke();c.restore();}}
    this.gantry(c,s,p);
    // The hammer is a massive iron-bound stone with twelve dangerous spikes.
    c.save();c.translate(hx,hy);c.rotate(a);c.fillStyle='#111f2488';c.beginPath();c.ellipse(7,12,46,39,0,0,TAU);c.fill();for(let i=0;i<12;i++){const sa=i*TAU/12;c.fillStyle=i<6?'#b9bda7':'#788471';c.beginPath();c.moveTo(Math.cos(sa-.13)*31,Math.sin(sa-.13)*31);c.lineTo(Math.cos(sa)*45,Math.sin(sa)*45);c.lineTo(Math.cos(sa+.13)*31,Math.sin(sa+.13)*31);c.closePath();c.fill();}circle(c,0,0,34,'#283c3c');circle(c,-2,-3,29,'#899581');circle(c,-6,-8,22,'#b6b99a');c.fillStyle='#3d5250';c.fillRect(-32,-7,64,13);c.fillRect(-7,-32,13,64);line(c,-29,-5,29,-5,'#c1c4a5',2);line(c,-5,-29,-5,29,'#c1c4a5',2);circle(c,0,0,10,'#3e5653');circle(c,-1,-2,6,'#ceb878');for(const [dx,dy]of[[-23,0],[23,0],[0,-23],[0,23]])circle(c,dx,dy,2,'#ddc889');c.restore();
    const labelX=q.x-Math.cos(s.centerAngle)*33,labelY=q.y-Math.sin(s.centerAngle)*33-44;
    c.fillStyle=p.status==='ready'?'#ffe1a1':'#c4d1bc';c.font='bold 9px system-ui';c.textAlign='center';c.fillText(p.status==='ready'?'TITAN · READY':p.status==='released'?'TITAN · RELEASED':`REWINDING · ${Math.ceil(p.resetRemaining??0)}s`,labelX,labelY);c.textAlign='left';
  }
  preview(c,state,ui){if(state.phase!=='prep'&&!(state.stageId==='frontier'&&state.phase==='siege')||state.growthReport)return;if(ui.tool==='launcher'&&ui.hover||ui.selectedStructureId){const placed=state.structures.find(s=>s.id===ui.selectedStructureId&&s.type==='launcher'&&!s.destroyed),device=placed||(ui.tool==='launcher'&&ui.hover?{...ui.hover,facing:ui.launcherFacing}:null);if(device)this.lane(c,state,device);}if(!ui.hover||!ui.tool)return;if(ui.tool==='sensor'){c.save();c.fillStyle='#a5d6ae10';c.strokeStyle='#c2e8c055';c.lineWidth=1;c.beginPath();c.arc((ui.hover.x+.5)*TILE,(ui.hover.y+.5)*TILE,CONFIG.sensor.radius*TILE,0,TAU);c.fill();c.stroke();c.restore();}const cells=ui.previewCells||[];for(const cell of cells){const result=cell.result||cell,x=cell.x??ui.hover.x,y=cell.y??ui.hover.y,valid=result.valid??result.ok??false;let color=valid?'#b0df9860':'#ed765966';if(ui.tool==='demolish')color='#f4ab6866';if(ui.tool==='repair')color='#8acbd966';if(ui.tool==='link')color='#a9dac233';c.fillStyle=color;c.fillRect(x*20,y*20,20,20);c.strokeStyle=valid?'#d6f6b5':'#ffc2a2';c.lineWidth=1.5;c.strokeRect(x*20+.75,y*20+.75,18.5,18.5);if(!valid&&!['demolish','repair','link'].includes(ui.tool)){line(c,x*20+6,y*20+6,x*20+14,y*20+14,'#ffd2b9',1.5);line(c,x*20+14,y*20+6,x*20+6,y*20+14,'#ffd2b9',1.5);}}}
  lane(c,state,device){const lane=launcherLane(state,device),x=lane.x*TILE,y=lane.y*TILE,tx=lane.endX*TILE,ty=lane.endY*TILE;c.save();line(c,x,y,tx,ty,'#f1cb7f22',TILE*.9);c.setLineDash([7,4]);line(c,x,y,tx,ty,'#ffe0a9aa',1.5);c.setLineDash([]);const a=Math.atan2(lane.dy,lane.dx);line(c,tx,ty,tx-Math.cos(a-.5)*10,ty-Math.sin(a-.5)*10,'#ffe0a9',2);line(c,tx,ty,tx-Math.cos(a+.5)*10,ty-Math.sin(a+.5)*10,'#ffe0a9',2);c.restore();}
}
