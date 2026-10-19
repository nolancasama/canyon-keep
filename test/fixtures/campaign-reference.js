// Only public preparation actions spend money. No free structures, healing,
// treasury injections, or pendulum triggers are used by the campaign plan.
// The shorter outer curtain buys six towers initially instead of the accepted
// four-tower basin reference's longer curtain. Cost: 960 gold.
export const CAMPAIGN_INITIAL_BUILD = [
  ...Array.from({length:10},(_,i)=>({type:i+15===20?'gate':'wall',x:43,y:i+15})),
  {type:'tower',x:42,y:22},
  {type:'tower',x:42,y:24},
  {type:'tower',x:46,y:20},
  {type:'tower',x:46,y:23},
  {type:'tower',x:50,y:20},
  {type:'tower',x:53,y:20},
];
export const CAMPAIGN_ADDITIONS = {
  2: [
    {type:'house',x:59,y:11},
    {type:'farm',x:59,y:20},
    {type:'tower',x:50,y:25},
    {type:'tower',x:53,y:25},
  ],
  3: [
    {type:'house',x:60,y:14},
    {type:'farm',x:58,y:23},
    ...Array.from({length:7},(_,i)=>({type:'wall',x:54,y:i+17})),
    {type:'tower',x:49,y:17},
    {type:'tower',x:52,y:17},
  ],
};

function requireAction(result, description) {
  if(!result?.ok) throw new Error(`HARNESS_PRECONDITION_FAILED: ${description}: ${result?.reason}`);
}

export function prepareCampaignSiege(game) {
  const {api}=game;
  if(game.state.phase!=='prep') throw new Error('HARNESS_PRECONDITION_FAILED: campaign must be in preparation');
  if(game.state.siegeIndex===1) {
    for(const {type,x,y} of CAMPAIGN_INITIAL_BUILD) requireAction(api.place(type,x,y),`initial ${type} at ${x},${y}`);
    return;
  }
  // Breaches are rebuilt at full cost; surviving buildings retain their damage
  // until this explicitly budgeted repair action.
  for(const s of [...game.state.structures]) if(s.destroyed&&s.type!=='tower'&&!game.state.structures.some(live=>!live.destroyed&&live.x===s.x&&live.y===s.y)) {
    requireAction(api.place(s.type,s.x,s.y),`rebuild ${s.type} at ${s.x},${s.y}`);
  }
  requireAction(api.repairAll(),'repair surviving castle');
  for(const {type,x,y} of CAMPAIGN_ADDITIONS[game.state.siegeIndex]) {
    requireAction(api.place(type,x,y),`campaign ${type} at ${x},${y}`);
  }
  if(game.state.gold<0) throw new Error('HARNESS_PRECONDITION_FAILED: reference overspent treasury');
}

export function simulateCampaign(createGame,seed=123456) {
  const game=createGame(seed), reports=[];
  for(let siege=1;siege<=3;siege++) {
    prepareCampaignSiege(game);
    requireAction(game.api.startSiege(),`start Siege ${siege}`);
    game.api.stepSeconds(420);
    reports.push({siege,phase:game.state.phase,time:game.state.time,
      payout:game.state.results?.payout,structuresDestroyed:game.state.stats.buildingsDestroyed,
      keepDamage:game.state.results?.keepDamage,goldBefore:game.state.snapshot.gold,
      bossHp:game.state.enemies.find(e=>e.type==='boss')?.hp,
      destroyed:game.state.structures.filter(s=>s.destroyed).map(s=>`${s.type}@${s.x},${s.y}`),
      towers:game.state.structures.filter(s=>s.type==='tower').map(s=>({x:s.x,y:s.y,hp:s.hp})),
      bossSlams:game.state.eventLog.filter(e=>e.type==='bossSlam').map(e=>({x:e.x,y:e.y,t:e.t}))});
    if(game.state.phase!=='victory') return {game,reports};
    if(!game.api.continueCampaign()) throw new Error(`HARNESS_PRECONDITION_FAILED: Continue Siege ${siege}`);
  }
  return {game,reports};
}
