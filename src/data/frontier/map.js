import { WIDTH, HEIGHT } from '../map.js';

// Authored plains: a north/south river separates the town from the farms and
// hamlet. The broad stone ford is the central approach, not a canyon corridor.
const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill('.'));
for(let x=0;x<WIDTH;x++) {cells[0][x]='#';cells[HEIGHT-1][x]='#';}
for(let y=0;y<HEIGHT;y++) {cells[y][0]='#';cells[y][WIDTH-1]='#';}
for(let y=1;y<HEIGHT-1;y++) for(let x=35;x<=36;x++) if(y<16||y>20) cells[y][x]='#';
for(const [left,top,w,h] of [[12,6,5,3],[29,27,4,4],[43,17,3,3],[54,31,5,3]]) {
  for(let y=top;y<top+h;y++) for(let x=left;x<left+w;x++) cells[y][x]='#';
}
for(let y=11;y<=25;y++) for(let x=15;x<=31;x++) cells[y][x]='C';
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
road(20,20,62,20);road(24,12,24,25);road(24,14,30,14);
road(39,8,39,27);road(39,11,52,11);road(46,27,58,27);

export const FRONTIER_MAP={
  id:'frontier',map:cells.map(row=>row.join('')),keep,spawns,sites:[],roads,
  districts:[
    {id:'town',name:'Main town',x:15,y:11,w:17,h:15},
    {id:'hamlet',name:'Eastbank Hamlet',x:46,y:5,w:10,h:9},
    {id:'farms',name:'Eastern farms',x:39,y:23,w:19,h:8},
  ],
  features:[{kind:'river',x:35,y:1,w:2,h:34},{kind:'ford',x:35,y:16,w:2,h:5}],
};
