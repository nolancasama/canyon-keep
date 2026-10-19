// A gate-centred curtain wall spans the basin, with four towers covering the
// southern approach and a short inner return extending their firing time.
// Cost: 1000 gold.
// No automatic pendulum triggers are needed to reproduce it.
export const REFERENCE_BUILD = [
  ...Array.from({length:19},(_,i)=>({type:i+8===19?'gate':'wall',x:48,y:i+8})),
  ...Array.from({length:5},(_,i)=>({type:'wall',x:54,y:i+19})),
  {type:'tower',x:50,y:20},
  {type:'tower',x:53,y:20},
  {type:'tower',x:50,y:25},
  {type:'tower',x:53,y:25},
];

export function applyReferenceBuild(game) {
  const api=game.api||game;
  const results=REFERENCE_BUILD.map(({type,x,y})=>{
    const result=api.place(type,x,y);
    if(!result?.ok) throw new Error(`HARNESS_PRECONDITION_FAILED: reference ${type} at ${x},${y}: ${result?.reason}`);
    return result;
  });
  return results;
}
