import { MAP, WIDTH, HEIGHT } from '../data/map.js';

export const TILE = 20;
export function terrainAt(x, y) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return '#';
  const row = MAP[y];
  return typeof row === 'string' || Array.isArray(row) ? row[x] : '#';
}
export const isCliff = (x,y) => /[#123]/.test(terrainAt(x,y));
const noise = (x,y,n=0) => { const a = Math.sin(x*127.1+y*311.7+n*19.9)*43758.5453; return a-Math.floor(a); };

function cliffContours() {
  const edges=new Map();
  const solid=(x,y)=>x>=0&&y>=0&&x<WIDTH&&y<HEIGHT&&isCliff(x,y);
  const add=(x,y,ex,ey)=>{const key=`${x},${y}`;if(!edges.has(key))edges.set(key,[]);edges.get(key).push({x,y,ex,ey});};
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(solid(x,y)) {
    if(!solid(x,y-1))add(x,y,x+1,y);
    if(!solid(x+1,y))add(x+1,y,x+1,y+1);
    if(!solid(x,y+1))add(x+1,y+1,x,y+1);
    if(!solid(x-1,y))add(x,y+1,x,y);
  }
  const path=new Path2D();
  while(edges.size) {
    const first=edges.values().next().value[0],points=[];
    let edge=first;
    do {
      const list=edges.get(`${edge.x},${edge.y}`);list.splice(list.indexOf(edge),1);
      if(!list.length)edges.delete(`${edge.x},${edge.y}`);
      // Extend outer edges beyond the canvas so smoothing cannot expose sand
      // at its corners. The map's walkable entrance remains open at the edge.
      const px=edge.x===0?-2:edge.x===WIDTH?WIDTH+2:edge.x;
      const py=edge.y===0?-2:edge.y===HEIGHT?HEIGHT+2:edge.y;
      points.push({x:px*TILE,y:py*TILE});
      if(edge.ex===first.x&&edge.ey===first.y)break;
      const next=edges.get(`${edge.ex},${edge.ey}`),dx=edge.ex-edge.x,dy=edge.ey-edge.y;
      edge=next.find(e=>dx*(e.ey-e.y)-dy*(e.ex-e.x)>0)||next[0];
    }while(edge);
    // Smooth across several tile corners, rather than rounding each step in
    // isolation. Tile occupancy is unchanged; this is only the cached artwork.
    let smooth=points;
    for(let pass=0;pass<3;pass++)smooth=smooth.map((p,i)=>{
      const a=smooth[(i+smooth.length-1)%smooth.length],b=smooth[(i+1)%smooth.length];
      return {x:(a.x+2*p.x+b.x)/4,y:(a.y+2*p.y+b.y)/4};
    });
    smooth=smooth.map(p=>({x:p.x+(noise(Math.floor(p.x/47),Math.floor(p.y/43),7)-.5)*2.2,y:p.y+(noise(Math.floor(p.x/53),Math.floor(p.y/41),8)-.5)*2.2}));
    const firstPoint=smooth[0],last=smooth.at(-1);
    path.moveTo((last.x+firstPoint.x)/2,(last.y+firstPoint.y)/2);
    for(let i=0;i<smooth.length;i++) {
      const p=smooth[i],next=smooth[(i+1)%smooth.length];
      path.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);
    }
    path.closePath();
  }
  return path;
}

export function createFloorClip() {
  const path=new Path2D();
  path.rect(0,0,WIDTH*TILE,HEIGHT*TILE);
  path.addPath(cliffContours());
  return path; // Use the even-odd fill rule to subtract the organic cliffs.
}

function drawRock(c,w,h) {
  c.fillStyle='#29312f';c.fillRect(0,0,w,h);
  // A jittered, staggered mesh gives the cliff angular mineral plates rather
  // than repeated horizontal waves. Each shared edge stays continuous.
  const cols=Math.ceil(w/57)+2,rows=Math.ceil(h/45)+2;
  const vertex=(x,y)=>({x:(x-1)*57+(y%2)*23+(noise(x,y,21)-.5)*30,y:(y-1)*45+(noise(x,y,22)-.5)*25});
  const plate=(points,x,y,face=0)=>{
    const shade=Math.floor(noise(x,y,23+face)*21),warm=Math.floor(noise(x,y,29)*8);
    c.beginPath();c.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))c.lineTo(p.x,p.y);
    c.closePath();c.fillStyle=`rgb(${37+shade+warm},${45+shade},${43+shade})`;c.fill();
    c.lineWidth=1.2;c.strokeStyle='#101a1d70';c.stroke();
    c.beginPath();c.moveTo(points[0].x,points[0].y+1.4);c.lineTo(points[1].x,points[1].y+1.4);
    c.lineWidth=.8;c.strokeStyle='#bac0a52b';c.stroke();
  };
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
    const a=vertex(x,y),b=vertex(x+1,y),d=vertex(x,y+1),e=vertex(x+1,y+1);
    if(noise(x,y,24)>.48){plate([a,b,e],x,y);plate([a,e,d],x,y,1);}
    else plate([a,b,e,d],x,y);
  }
  // Broad value variation breaks up mesh regularity without banded grain.
  for(let i=0;i<90;i++) {
    const x=noise(i,30)*w,y=noise(i,31)*h,r=22+noise(i,32)*85;
    const wash=c.createRadialGradient(x,y,0,x,y,r);
    wash.addColorStop(0,i%3?'#07131948':'#b7b39a16');wash.addColorStop(1,'#29312f00');
    c.fillStyle=wash;c.fillRect(x-r,y-r,r*2,r*2);
  }
  // Broken, branching fissures read at the whole-map scale as fractured rock.
  for(let i=0;i<145;i++) {
    let x=noise(i,40)*w,y=noise(i,41)*h;
    const direction=noise(i,42)*Math.PI*2;
    c.beginPath();c.moveTo(x,y);
    for(let j=0;j<3;j++) {
      const angle=direction+(noise(i,j,43)-.5)*1.2,length=7+noise(i,j,44)*15;
      x+=Math.cos(angle)*length;y+=Math.sin(angle)*length;c.lineTo(x,y);
      if(j===1){const bx=x+Math.cos(angle+.9)*10,by=y+Math.sin(angle+.9)*10;c.lineTo(bx,by);c.moveTo(x,y);}
    }
    c.strokeStyle='#111c20a0';c.lineWidth=.8+noise(i,45)*.7;c.stroke();
  }
}

export function createTerrain() {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH*TILE; canvas.height = HEIGHT*TILE;
  const c = canvas.getContext('2d');
  const w=canvas.width,h=canvas.height,cliffs=cliffContours();
  c.fillStyle='#b7a079';c.fillRect(0,0,w,h);
  // Broad washes replace per-tile colour changes on the continuous sand floor.
  for(let i=0;i<36;i++) {
    const x=noise(i,2)*w,y=noise(i,3)*h,r=65+noise(i,4)*150;
    const wash=c.createRadialGradient(x,y,0,x,y,r);
    wash.addColorStop(0,i%2?'#eed4a32b':'#77664520');wash.addColorStop(1,'#b7a07900');
    c.fillStyle=wash;c.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++) {
    const t=terrainAt(x,y), px=x*TILE,py=y*TILE;
    if(!isCliff(x,y)) {
      if(t==='C'||t==='K'){c.fillStyle='#8f9b6b75';c.fillRect(px,py,TILE,TILE);}
      for(let i=0;i<3;i++){c.fillStyle=i===0?'#504e3820':'#e8d2a82c';c.fillRect(px+noise(x,y,i+1)*18,py+noise(x,y,i+5)*18,1.5,1);}
      if(t==='S') {c.fillStyle='#7c4b3b55';c.fillRect(px,py,TILE,TILE);c.strokeStyle='#dfac7480';c.beginPath();c.moveTo(px+3,py+5);c.lineTo(px+10,py+10);c.lineTo(px+3,py+15);c.stroke();}
    }
  }
  // This rounded visual mask never changes the exact gameplay terrain tiles.
  c.save();c.shadowColor='#111a1bdd';c.shadowBlur=17;c.shadowOffsetX=3;c.shadowOffsetY=10;
  c.fillStyle='#303633';c.fill(cliffs);c.restore();
  c.save();c.clip(cliffs);
  drawRock(c,w,h);
  // Inward rock shelves and a bright lip sit above the soft floor shadow.
  c.lineJoin='round';
  for(const [width,colour] of [[38,'#101b2070'],[26,'#68705a80'],[15,'#89907780'],[6,'#a5aa87b8'],[2,'#e0cea4']]){c.lineWidth=width;c.strokeStyle=colour;c.stroke(cliffs);}
  c.restore();
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(terrainAt(x,y)===',')for(let i=0;i<4;i++) {
    const rx=x*TILE+3+noise(x,y,i+9)*14,ry=y*TILE+4+noise(x,y,i+14)*12,r=3+noise(x,y,i)*4;
    c.save();c.shadowColor='#302f2966';c.shadowBlur=3;c.shadowOffsetY=3;
    c.fillStyle=i%2?'#737765':'#626a60';c.beginPath();c.moveTo(rx-r,ry);c.lineTo(rx-r*.5,ry-r*.7);c.lineTo(rx+r*.4,ry-r*.8);c.lineTo(rx+r,ry);c.lineTo(rx+r*.5,ry+r*.5);c.lineTo(rx-r*.6,ry+r*.6);c.closePath();c.fill();c.restore();
    c.strokeStyle='#b6b69a';c.lineWidth=1;c.beginPath();c.moveTo(rx-r*.8,ry-1);c.lineTo(rx-r*.4,ry-r*.6);c.lineTo(rx+r*.3,ry-r*.7);c.stroke();
  }
  c.setLineDash([3,5]);c.strokeStyle='#e7e3bb4d';c.lineWidth=1;
  const castle=(x,y)=>/[CK]/.test(terrainAt(x,y));
  for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++) if(castle(x,y)) {
    const px=x*TILE,py=y*TILE;
    for(const [dx,dy,x1,y1,x2,y2] of [[-1,0,px,py,px,py+TILE],[1,0,px+TILE,py,px+TILE,py+TILE],[0,-1,px,py,px+TILE,py],[0,1,px,py+TILE,px+TILE,py+TILE]])if(!castle(x+dx,y+dy)&&!isCliff(x+dx,y+dy)){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
  }
  c.setLineDash([]);
  const vignette=c.createRadialGradient(w/2,h/2,h*.32,w/2,h/2,w*.58);vignette.addColorStop(0,'#07131500');vignette.addColorStop(1,'#07131550');c.fillStyle=vignette;c.fillRect(0,0,w,h);
  return canvas;
}
