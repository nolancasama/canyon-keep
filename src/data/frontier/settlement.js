import { CONFIG } from '../../config.js';
import { FRONTIER_MAP } from './map.js';

const owner=(name,role)=>({name,role});
const MAYOR=owner('Mayor Mara Vale','Town council');
const authored=[
  {id:'keep',type:'keep',label:'Vale Keep',...FRONTIER_MAP.keep,district:'town',owner:MAYOR,
    importance:'The keep shelters the settlement; losing it fails the commission.',optionalObjective:false},
  {id:'town-house-north',type:'house',label:'Weavers’ homes',x:18,y:12,district:'town',owner:owner('Tessa Reed','Weaver'),
    importance:'Four families rely on these homes and their stored winter cloth.'},
  {id:'town-house-west',type:'house',label:'Masons’ homes',x:15,y:21,district:'town',owner:owner('Ivo Stone','Mason'),
    importance:'The town’s stoneworkers live here with their families.'},
  {id:'town-house-south',type:'house',label:'Carters’ homes',x:22,y:23,district:'town',owner:owner('Lena Brook','Carter'),
    importance:'These families carry grain between the farms and the market.'},
  {id:'market',type:'shop',label:'Market stalls',x:25,y:13,district:'town',owner:owner('Market Guild','Town traders'),
    importance:'The market supplies food and everyday goods to the whole settlement.'},
  {id:'warehouse',type:'warehouse',label:'Merchant warehouse',x:28,y:17,district:'town',owner:owner('Oren Bell','Merchant'),
    importance:'Seed grain and trade stock here will keep the town supplied after the raid.',request:'merchant'},
  {id:'workshop',type:'workshop',label:'Damaged workshop',x:25,y:22,district:'town',owner:owner('Ada Forge','Workshop owner'),
    importance:'Its damaged roof predates your contract; the tools inside rebuild homes and bridges.',request:'workshop',specialObjective:true},
  {id:'town-store',type:'warehouse',label:'Council granary',x:21,y:15,district:'town',owner:owner('Town Council','Public granary'),
    importance:'The council’s reserves feed displaced families through the winter.'},
  {id:'town-house-garden',type:'house',label:'Garden cottages',x:14,y:11,district:'town',owner:owner('Mira Ash','Gardener'),
    importance:'These families tend the kitchen gardens outside the keep.'},
  {id:'town-house-river',type:'house',label:'Ferrymen’s homes',x:14,y:16,district:'town',owner:owner('Daro Beck','Ferryman'),
    importance:'The crossing crews keep the town connected to its eastern farms.'},
  {id:'town-house-lane',type:'house',label:'Bakers’ homes',x:18,y:23,district:'town',owner:owner('Nell Rye','Baker'),
    importance:'The bakers feed families sheltering in the keep.'},
  {id:'town-house-east',type:'house',label:'Potters’ homes',x:28,y:23,district:'town',owner:owner('Jun Clay','Potter'),
    importance:'The potters’ families and kilns supply the market with everyday wares.'},
  {id:'market-cloth',type:'shop',label:'Cloth stalls',x:21,y:11,district:'town',owner:owner('Reed Sisters','Cloth traders'),
    importance:'Winter blankets and work clothes fill these market stalls.'},
  {id:'market-bread',type:'shop',label:'Bread and provisions',x:28,y:11,district:'town',owner:owner('Hale Green','Provisioner'),
    importance:'The provisions stalls supply the farms and the town guard.'},
  {id:'eastern-farm',type:'farm',label:'Eastbank farm',x:41,y:25,district:'farms',owner:owner('Elin Farrow','Eastern farmer'),
    importance:'The seed store and draft animals are next season’s harvest.',request:'farmer'},
  {id:'orchard',type:'farm',label:'Orchard farm',x:49,y:28,district:'farms',owner:owner('Perrin Moss','Orchard keeper'),
    importance:'The orchard’s press and stores provide food for the outlying families.'},
  {id:'river-farm',type:'farm',label:'Riverside fields',x:41,y:29,district:'farms',owner:owner('Sora Farrow','Grain farmer'),
    importance:'The riverside grain fields are the western half of the harvest.'},
  {id:'hill-farm',type:'farm',label:'Hillstead fields',x:53,y:28,district:'farms',owner:owner('Ari Moss','Field farmer'),
    importance:'The eastern fields share the orchard’s carts and harvest store.'},
  {id:'outlying-barn',type:'barn',label:'Old roadside barn',x:58,y:23,district:'farms',owner:owner('Bram Holt','Stubborn barn owner'),
    importance:'Bram refuses to abandon his low-value hay barn and has prepared his own timber defenses.',
    selfDefense:{requested:true,rule:'palisades',status:'deferred',authored:true}},
  {id:'hamlet-hall',type:'house',valueKey:'hamlet',label:'Eastbank meeting house',x:48,y:7,district:'hamlet',owner:owner('Elder Sela','Hamlet elder'),
    importance:'The isolated hamlet meets and stores its emergency supplies here.',request:'elder'},
  {id:'hamlet-house',type:'house',valueKey:'hamlet',label:'Eastbank cottages',x:52,y:9,district:'hamlet',owner:owner('Eastbank families','Hamlet residents'),
    importance:'The hamlet’s families cannot shelter behind the town’s wall line.'},
  {id:'hamlet-house-west',type:'house',valueKey:'hamlet',label:'Bridgeward cottages',x:44,y:6,district:'hamlet',owner:owner('Anja Reed','Hamlet resident'),
    importance:'These families watch the road between Eastbank and the ford.'},
  {id:'hamlet-house-east',type:'house',valueKey:'hamlet',label:'High pasture cottages',x:53,y:5,district:'hamlet',owner:owner('Tovin Dale','Shepherd'),
    importance:'The hamlet’s shepherds live at the edge of the eastern pasture.'},
  {id:'hamlet-shop',type:'shop',label:'Eastbank trading stall',x:48,y:11,district:'hamlet',owner:owner('Faye Bell','Hamlet trader'),
    importance:'This small shop supplies families too far from the main market.'},
  {id:'hamlet-farm',type:'farm',label:'Eastbank kitchen fields',x:44,y:11,district:'hamlet',owner:owner('Wren Dale','Hamlet farmer'),
    importance:'The hamlet depends on its own fields when the town road is unsafe.'},
];

export function frontierSettlement() {
  // Keep authored property layout aligned with the expanded square Frontier map.
  return authored.map(source=>{
    const data=source.id==='keep'?source:{...source,y:source.y+14};
    const def=CONFIG.structures[data.type],property=CONFIG.frontier.property[data.valueKey??data.type];
    const request=data.request?CONFIG.frontier.requests[data.request]:null;
    return {...data,...(data.selfDefense?{selfDefense:{...data.selfDefense}}:{}),owner:{...data.owner},w:def.w,h:def.h,hp:property.initialHp??def.hp,maxHp:def.hp,
      value:property.value,cost:0,paidCost:0,destroyed:false,optionalObjective:data.optionalObjective??true,
      ownerRewardOffer:request?.reward??0,promise:{status:'none',reward:0,negotiated:false}};
  });
}

export function frontierRequests(structures) {
  const dialogue={
    merchant:'Our seed grain is in that warehouse. Keep the building standing and I will pay for your care.',
    farmer:'My eastern farm lies beyond the crossing. Promise it will survive and I will share my savings.',
    workshop:'Save my workshop. I can advance your owner payment immediately; it is reconciled against the promise at settlement.',
    elder:'We cannot fit inside the town walls. Promise our meeting house survives and the hamlet will reward you.',
  };
  return structures.filter(s=>s.request).map(s=>({
    id:s.request,buildingId:s.id,owner:{...s.owner},dialogue:dialogue[s.request],
    communicationRequired:CONFIG.frontier.requests[s.request].communication,
    reward:CONFIG.frontier.requests[s.request].reward,immediate:s.request==='workshop',status:'pending',
    selfDefense:s.request==='merchant'?'hiredGuard':'barricades',
    completionCondition:'Building still standing when the siege ends',
  }));
}
