import { WIDTH as CANYON_WIDTH } from '../map.js';

export const FRONTIER_WIDTH=CANYON_WIDTH;
export const FRONTIER_HEIGHT=64;
const WIDTH=FRONTIER_WIDTH, HEIGHT=FRONTIER_HEIGHT;

// The river bends around the town's eastern bank. A broad central stone ford
// joins branching lanes to two farm groups and the distant hamlet.
const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill('.'));
for(let x=0;x<WIDTH;x++) {cells[0][x]='#';cells[HEIGHT-1][x]='#';}
for(let y=0;y<HEIGHT;y++) {cells[y][0]='#';cells[y][WIDTH-1]='#';}
const features=[];
for(let y=1;y<HEIGHT-1;y++) {
  const x=y<11?37:y<20?36:y<43?35:y<50?36:y<57?37:36;
  features.push({kind:'river',x,y,w:2,h:1});
  if(y<30||y>34) for(let dx=0;dx<2;dx++) cells[y][x+dx]='#';
}
features.push({kind:'ford',x:35,y:30,w:2,h:5});
for(const [left,top,w,h] of [[12,15,5,3],[29,46,4,4],[43,33,3,3],[54,52,5,3]]) {
  for(let y=top;y<top+h;y++) for(let x=left;x<left+w;x++) cells[y][x]='#';
}
for(let y=24;y<=40;y++) for(let x=13;x<=31;x++) cells[y][x]='C';
const keep={x:18,y:31};
for(let y=keep.y;y<keep.y+3;y++) for(let x=keep.x;x<keep.x+3;x++) cells[y][x]='K';
const spawns=[{x:63,y:14},{x:63,y:31},{x:63,y:49}];
for(const p of spawns) cells[p.y][p.x]='S';
const roadSet=new Set(),roads=[];
function road(x0,y0,x1,y1) {
  for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++) for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++) {
    const key=`${x},${y}`;
    if(!roadSet.has(key)&&cells[y][x]!=='#') {roadSet.add(key);roads.push({x,y});}
  }
}
function lane(points) {for(let i=1;i<points.length;i++) road(...points[i-1],...points[i]);}
lane([[20,34],[30,34],[30,33],[38,33],[38,32],[46,32],[46,34],[54,34],[54,33],[62,33],[62,31]]);
lane([[24,25],[24,34],[24,42],[30,42]]);
lane([[16,28],[24,28],[24,29],[30,29]]);
lane([[20,34],[20,38],[24,38]]);
lane([[39,33],[39,25],[42,25],[46,25],[46,19],[51,19],[51,14],[56,14]]);
lane([[39,33],[39,43],[51,43],[51,47],[58,47]]);
lane([[44,43],[44,52],[53,52],[53,54]]);

export const FRONTIER_MAP={
  id:'frontier',map:cells.map(row=>row.join('')),keep,spawns,sites:[],roads,
  districts:[
    {id:'town',name:'Main town',x:13,y:24,w:19,h:17},
    {id:'hamlet',name:'Eastbank Hamlet',x:43,y:14,w:13,h:14},
    {id:'farms',name:'Eastern farms',x:39,y:41,w:21,h:15},
  ],
  features,
};
