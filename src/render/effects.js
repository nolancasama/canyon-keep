import { CONFIG } from '../config.js';
const hash = n => {const a=Math.sin(n*127.13)*43758.5453;return a-Math.floor(a);};
export class Effects {
  constructor(audio){this.audio=audio;this.particles=Array.from({length:280},()=>({life:0}));this.rings=[];this.scorches=[];this.cursor=0;this.state=null;this.shake=0;this.stop=0;this.banner=0;this.bannerText='';this.serial=1;}
  burst(x,y,count,color,force=55){for(let i=0;i<count;i++){const p=this.particles.find(p=>p.life<=0);if(!p)break;const n=this.serial++,a=hash(n)*Math.PI*2,s=(.25+hash(n+200))*force;Object.assign(p,{x:x*20,y:y*20,vx:Math.cos(a)*s,vy:Math.sin(a)*s-15,life:.35+hash(n+100)*.6,maxLife:.95,size:1+hash(n+9)*3,color});}}
  ingest(state){
    if(this.state!==state){this.state=state;this.cursor=0;this.rings=[];this.scorches=[];this.particles.forEach(p=>p.life=0);this.stop=0;this.banner=0;}
    const events=state.events||[];
    // Events are observed, never consumed or changed by the presentation.
    if(events.length<this.cursor)this.cursor=0;
    for(let index=this.cursor;index<events.length;index++){const e=events[index];
      const x=e.x??0,y=e.y??0;this.audio?.event(e);
      if(e.type==='explosion'){this.burst(x,y,40,'#f8c275',125);this.burst(x,y,20,'#58564a',90);this.rings.push({x,y,age:0,radius:e.radius??CONFIG.explosion.radius,kind:'blast'});this.scorches.push({x,y,age:0});this.shake=Math.max(this.shake,5);}
      if(e.type==='pendulumRelease'){this.shake=Math.max(this.shake,1);}
      if(e.type==='pendulumHit'||e.type==='pendulumImpact'){this.burst(x,y,25,'#d9c6a0',95);this.burst(x,y,15,'#5b5e51',120);this.rings.push({x,y,age:0,radius:2.1,kind:'dust'});this.shake=Math.max(this.shake,e.type==='pendulumImpact'?8:4);this.stop=.06;}
      if(e.type==='bossSlam'){this.burst(x,y,30,'#c7b398',100);this.rings.push({x,y,age:0,radius:e.radius??CONFIG.enemies.boss.slamRadius,kind:'dust'});this.shake=Math.max(this.shake,6);}
      if(e.type==='chisel'){this.burst(e.targetX??x,e.targetY??y,4,'#ded0ae',27);}
      if(e.type==='structureDestroyed'){this.burst(x,y,16,'#c1b69b',60);}
      if(e.type==='enemyDeath'){this.burst(x,y,3,'#7d463b',12);}
      if(e.type==='bossSpawn'){this.banner=4;this.bannerText='THE BRUTE APPROACHES';}
      if(e.type==='keepReached'){this.banner=3;this.bannerText='THE KEEP IS UNDER ATTACK';}
    }
    this.cursor=events.length;this.rings=this.rings.slice(-20);this.scorches=this.scorches.slice(-32);
  }
  update(dt){this.stop=Math.max(0,this.stop-dt);this.shake=Math.max(0,this.shake-dt*15);this.banner=Math.max(0,this.banner-dt);for(const p of this.particles)if(p.life>0){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.max(0,1-dt*2);p.vy+=25*dt;}for(const r of this.rings)r.age+=dt;for(const s of this.scorches)s.age+=dt;this.rings=this.rings.filter(r=>r.age<.7);this.scorches=this.scorches.filter(r=>r.age<15);}
  ground(c){for(const s of this.scorches){c.globalAlpha=.4*Math.min(1,(15-s.age)/4);c.fillStyle='#3b302c';c.beginPath();c.ellipse(s.x*20,s.y*20,26,20,0,0,Math.PI*2);c.fill();}c.globalAlpha=1;}
  draw(c){for(const r of this.rings){const t=r.age/.7;c.globalAlpha=(1-t)*.85;c.strokeStyle=r.kind==='blast'?'#ffe4a7':'#e4d4b0';c.lineWidth=4*(1-t)+1;c.beginPath();c.arc(r.x*20,r.y*20,r.radius*20*Math.min(1,t*2.5),0,Math.PI*2);c.stroke();if(r.kind==='blast'&&t<.15){c.fillStyle='#fff2ce';c.globalAlpha=(.15-t)*4;c.fill();}}for(const p of this.particles)if(p.life>0){c.globalAlpha=Math.min(1,p.life*3);c.fillStyle=p.color;c.fillRect(p.x,p.y,p.size,p.size);}c.globalAlpha=1;}
}
