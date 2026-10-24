import { WIDTH, HEIGHT } from '../map.js';

// The river bends around the town's eastern bank. A broad central stone ford
// joins branching lanes to two farm groups and the distant hamlet.
const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill('.'));
for(let x=0;x<WIDTH;x++) {cells[0][x]='#';cells[HEIGHT-1][x]='#';}
for(let y=0;y<HEIGHT;y++) {cells[y][0]='#';cells[y][WIDTH-1]='#';}
const features=[];
for(let y=1;y<HEIGHT-1;y++) {
  const x=y<6?37:y<11?36:y<22?35:y<26?36:y<30?37:36;
  features.push({kind:'river',x,y,w:2,h:1});
  if(y<16||y>20) for(let dx=0;dx<2;dx++) cells[y][x+dx]='#';
}
features.push({kind:'ford',x:35,y:16,w:2,h:5});
for(const [left,top,w,h] of [[12,6,5,3],[29,27,4,4],[43,17,3,3],[54,31,5,3]]) {
  for(let y=top;y<top+h;y++) for(let x=left;x<left+w;x++) cells[y][x]='#';
}
for(let y=10;y<=26;y++) for(let x=13;x<=31;x++) cells[y][x]='C';
const keep={x:18,y:17};
for(let y=keep.y;y<keep.y+3;y++) for(let x=keep.x;x<keep.x+3;x++) cells[y][x]='K';
const spawns=[{x:63,y:8},{x:63,y:18},{x:63,y:27}];
for(const p of spawns) cells[p.y][p.x]='S';
const roadSet=new Set(),roads=[];
function road(x0,y0,x1,y1) {
  for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++) for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++) {
    const key=`${x},${y}`;
    if(!roadSet.has(key)&&cells[y][x]!=='#') {roadSet.add(key);roads.push({x,y});}
  }
}
function lane(points) {for(let i=1;i<points.length;i++) road(...points[i-1],...points[i]);}
lane([[20,20],[30,20],[30,19],[38,19],[38,18],[46,18],[46,20],[54,20],[54,19],[62,19],[62,18]]);
lane([[24,11],[24,20],[24,26],[30,26]]);
lane([[16,14],[24,14],[24,15],[30,15]]);
lane([[20,20],[20,22],[24,22]]);
lane([[39,19],[39,13],[42,13],[46,13],[46,10],[51,10],[51,7],[56,7]]);
lane([[39,19],[39,27],[51,27],[51,26],[58,26]]);
lane([[44,27],[44,32],[53,32],[53,30]]);

export const FRONTIER_MAP={
  id:'frontier',map:cells.map(row=>row.join('')),keep,spawns,sites:[],roads,
  districts:[
    {id:'town',name:'Main town',x:13,y:10,w:19,h:17},
    {id:'hamlet',name:'Eastbank Hamlet',x:43,y:4,w:13,h:10},
    {id:'farms',name:'Eastern farms',x:39,y:23,w:21,h:10},
  ],
  features,
};
