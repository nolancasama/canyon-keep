import { SIM_DT } from './config.js';
import { createGame } from './sim/campaign.js';
import { Renderer } from './render/renderer.js';
import { Audio } from './ui/audio.js';
import { Interface } from './ui/interface.js';

const game=createGame();
window.__game=game;
const canvas=document.getElementById('battlefield'),audio=new Audio(),renderer=new Renderer(canvas,audio),ui=new Interface(game,canvas,audio);
let previous=performance.now(),accumulator=0;
function frame(now){
  const elapsed=Math.min(.1,Math.max(0,(now-previous)/1000));previous=now;accumulator=Math.min(accumulator+elapsed,SIM_DT*6);
  if(!game.state.scoutReport)game.api.advancePrep(elapsed);
  while(accumulator>=SIM_DT){
    const state=game.state;
    if(state.phase==='siege'&&state.speed>0)for(let i=0;i<state.speed&&game.state.phase==='siege';i++)game.api.tick();
    accumulator-=SIM_DT;
  }
  renderer.draw(game.state,ui,elapsed);ui.update(elapsed,renderer.effects);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
