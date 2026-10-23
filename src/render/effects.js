import { CONFIG } from '../config.js';
const hash = n => {const a=Math.sin(n*127.13)*43758.5453;return a-Math.floor(a);};
export class Effects {
  constructor(audio){this.audio=audio;this.particles=Array.from({length:280},()=>({life:0}));this.rings=[];this.scorches=[];this.bounties=[];this.powderHits=new Set();this.powderDeaths=[];this.clock=0;this.cursor=0;this.state=null;this.shake=0;this.stop=0;this.banner=0;this.bannerText='';this.serial=1;}
  shakeAt(strength){this.shake=Math.min(7,Math.max(this.shake,strength));}
  burst(x,y,count,color,force=55,kind='chip'){for(let i=0;i<count;i++){const p=this.particles.find(p=>p.life<=0);if(!p)break;const n=this.serial++,a=hash(n)*Math.PI*2,s=(.25+hash(n+200))*force;Object.assign(p,{x:x*20,y:y*20,vx:Math.cos(a)*s,vy:Math.sin(a)*s-15,life:.35+hash(n+100)*.6,maxLife:.95,size:1+hash(n+9)*3,color,kind});}}
  ingest(state){
    if(this.state!==state){this.state=state;this.cursor=0;this.rings=[];this.scorches=[];this.bounties=[];this.powderHits.clear();this.powderDeaths=[];this.particles.forEach(p=>p.life=0);this.shake=0;this.stop=0;this.banner=0;}
    const events=state.events||[];
    const showBounties=state.phase!=='prep'&&state.phase!=='complete';
    if(!showBounties)this.bounties=[];
    // Events are observed, never consumed or changed by the presentation.
    if(events.length<this.cursor)this.cursor=0;
    for(let index=this.cursor;index<events.length;index++){const e=events[index];
      const x=e.x??0,y=e.y??0;this.audio?.event(e);
      if(e.type==='explosion'){const titan=this.powderHits.has(e.sourceId);this.powderHits.delete(e.sourceId);if(titan)for(const death of this.powderDeaths)if(Math.abs((e.t??0)-(death.t??0))<.02&&Math.hypot(x-death.x,y-death.y)<=(e.radius??CONFIG.explosion.radius))this.powderHits.add(death.entityId??death.id);this.burst(x,y,40,'#f8c275',125);this.burst(x,y,20,'#58564a',90);this.rings.push({x,y,age:0,radius:e.radius??CONFIG.explosion.radius,kind:'blast',titan});this.scorches.push({x,y,age:0});this.shakeAt(titan?7:5);}
      if(e.type==='pendulumRelease'){this.shakeAt(1);}
      if(e.type==='pendulumHit'){this.burst(x,y,7,'#d9c6a0',38,'cloud');this.burst(x,y,4,'#5b5e51',95);if(e.enemyType==='powder')this.powderHits.add(e.entityId??e.id);}
      if(e.type==='pendulumImpact'){const hits=e.hits??1;this.burst(x,y,Math.min(16,6+hits*2),'#d9c6a0',45,'cloud');this.burst(x,y,Math.min(8,3+hits),'#5b5e51',105);this.rings.push({x,y,age:0,radius:2.1,kind:'dust'});this.shakeAt(2+Math.sqrt(hits)*1.5);this.stop=.045;}
      if(e.type==='bossSlam'){this.burst(x,y,30,'#c7b398',100);this.rings.push({x,y,age:0,radius:e.radius??CONFIG.enemies.boss.slamRadius,kind:'dust'});this.shakeAt(6);}
      if(e.type==='chisel'){this.burst(e.targetX??x,e.targetY??y,4,'#ded0ae',27);}
      if(e.type==='sensorFire'){this.rings.push({x,y,age:0,radius:.8,kind:'spark'});}
      if(e.type==='launcherFire'){this.burst(x,y,5,'#ffe5a1',28);}
      if(e.type==='wallRaise'||e.type==='wallLower'){this.burst(x,y,8,'#b8bba1',22);}
      if(e.type==='spikeHit'){this.burst(x,y,5,'#fff0b9',32);this.rings.push({x,y,age:0,radius:.38,kind:'spark'});}
      if(e.type==='golemAwaken'){this.burst(x,y,38,'#b8b99a',95);this.burst(x,y,16,'#526e5d',75);this.rings.push({x,y,age:0,radius:1.5,kind:'emerge'});this.shakeAt(5);}
      if(e.type==='golemSlam'){this.burst(x,y,14,'#c4c8aa',65);this.rings.push({x,y,age:0,radius:e.radius,kind:'dust'});this.shakeAt(2);}
      if(e.type==='golemCrumble'){this.burst(x,y,22,'#88957b',60);this.rings.push({x,y,age:0,radius:.9,kind:'dust'});}
      if(e.type==='structureDestroyed'){this.burst(x,y,16,'#c1b69b',60);}
      if(e.type==='enemyDeath'){this.burst(x,y,3,'#7d463b',12);if(e.enemyType==='powder'){this.powderDeaths.push(e);this.powderDeaths=this.powderDeaths.filter(d=>(e.t??0)-(d.t??0)<.5);}}
      if(e.type==='bounty'&&showBounties){
        const config=CONFIG.bountyFeedback,time=this.clock;
        const label=this.bounties.find(b=>time>=b.time&&time-b.time<=config.mergeSeconds&&Math.hypot(x-b.x,y-b.y)<=config.mergeRadius);
        if(label){label.amount+=e.amount;label.age=0;label.time=time;}
        else this.bounties.push({x,y,amount:e.amount,time,age:0});
        this.bounties=this.bounties.slice(-config.maxLabels);
      }
      if(e.type==='bossSpawn'){this.banner=4;this.bannerText='THE BRUTE APPROACHES';}
      if(e.type==='keepReached'){this.banner=3;this.bannerText='THE KEEP IS UNDER ATTACK';}
    }
    this.cursor=events.length;this.rings=this.rings.slice(-20);this.scorches=this.scorches.slice(-32);
  }
  update(dt){this.clock+=dt;this.stop=Math.max(0,this.stop-dt);this.shake=Math.max(0,this.shake-dt*22);this.banner=Math.max(0,this.banner-dt);for(const p of this.particles)if(p.life>0){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.max(0,1-dt*2);p.vy+=25*dt;}for(const r of this.rings)r.age+=dt;for(const s of this.scorches)s.age+=dt;for(const b of this.bounties)b.age+=dt;this.rings=this.rings.filter(r=>r.age<.7);this.scorches=this.scorches.filter(r=>r.age<15);this.bounties=this.bounties.filter(b=>b.age<CONFIG.bountyFeedback.duration);}
  ground(c){for(const s of this.scorches){c.globalAlpha=.4*Math.min(1,(15-s.age)/4);c.fillStyle='#3b302c';c.beginPath();c.ellipse(s.x*20,s.y*20,26,20,0,0,Math.PI*2);c.fill();}for(const r of this.rings)if(r.kind==='emerge'){c.globalAlpha=1-r.age/.7;c.strokeStyle='#d8efc3';c.lineWidth=2;c.beginPath();for(let i=0;i<7;i++){const a=i*Math.PI*2/7,n=Math.min(1,r.age*8);c.moveTo(r.x*20+Math.cos(a)*4,r.y*20+Math.sin(a)*4);c.lineTo(r.x*20+Math.cos(a+.2)*12*n,r.y*20+Math.sin(a+.2)*12*n);c.lineTo(r.x*20+Math.cos(a)*25*n,r.y*20+Math.sin(a)*25*n);}c.stroke();}c.globalAlpha=1;}
  bountyLayout(c){
    const labels=[];
    for(const b of this.bounties){const size=14+Math.min(4,Math.floor(Math.log2(Math.max(1,b.amount/10)))),text=`+${b.amount} G`,t=b.age/CONFIG.bountyFeedback.duration;c.font=`bold ${size}px system-ui`;const width=c.measureText(text).width+8,x=Math.max(width/2+2,Math.min(1278-width/2,b.x*20));let y=b.y*20-12-t*CONFIG.bountyFeedback.rise;
      // Stack measured text boxes, including labels from a whole batched sim step.
      let below=false;for(let attempt=0;attempt<=labels.length*2+2;attempt++){const collision=labels.find(p=>Math.abs(x-p.x)<(width+p.width)/2&&y-size-3<p.y+4&&y+4>p.y-p.size-3);if(!collision)break;const next=below?collision.y+size+8:collision.y-collision.size-8;if(next-size<2){below=true;y=b.y*20+size+8;}else y=next;}
      labels.push({text,x,y,width,size,alpha:Math.min(1,(1-t)*3)});
    }return labels;
  }
  draw(c){let flash=0;for(const r of this.rings){const t=r.age/.7;if(r.kind==='spark'&&r.age>.18)continue;c.globalAlpha=(1-t)*.85;c.strokeStyle=r.kind==='blast'?'#ffe4a7':r.kind==='emerge'?'#b6f0cb':'#e4d4b0';c.lineWidth=4*(1-t)+1;c.beginPath();c.arc(r.x*20,r.y*20,r.radius*20*Math.min(1,t*2.5),0,Math.PI*2);c.stroke();if((r.kind==='blast'||r.kind==='emerge'||r.kind==='spark')&&t<(r.titan?.3:.15)){c.fillStyle=r.kind==='emerge'?'#d7f9ce':r.titan?'#fff9e4':'#fff2ce';c.globalAlpha=Math.min(.95,((r.titan?.3:.15)-t)*(r.titan?5:4));c.fill();}if(r.titan&&t<.3)flash=Math.max(flash,(.3-t)*.35);}if(flash){c.globalAlpha=flash;c.fillStyle='#fff0c6';c.fillRect(0,0,1280,720);}
    for(const p of this.particles)if(p.life>0){c.fillStyle=p.color;if(p.kind==='cloud'){const age=1-p.life/p.maxLife;c.globalAlpha=Math.max(0,p.life)*.22;c.beginPath();c.arc(p.x,p.y,p.size*2+age*14,0,Math.PI*2);c.fill();}else{c.globalAlpha=Math.min(1,p.life*3);c.fillRect(p.x,p.y,p.size,p.size);}}
    c.save();c.textAlign='center';c.lineWidth=3;for(const b of this.bountyLayout(c)){c.font=`bold ${b.size}px system-ui`;c.globalAlpha=b.alpha;c.strokeStyle='#20251c';c.fillStyle='#ffe09a';c.strokeText(b.text,b.x,b.y);c.fillText(b.text,b.x,b.y);}c.restore();c.globalAlpha=1;
  }
}
