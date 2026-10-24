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
  {id:'eastern-farm',type:'farm',label:'Eastbank farm',x:41,y:25,district:'farms',owner:owner('Elin Farrow','Eastern farmer'),
    importance:'The seed store and draft animals are next season’s harvest.',request:'farmer'},
  {id:'orchard',type:'farm',label:'Orchard farm',x:49,y:28,district:'farms',owner:owner('Perrin Moss','Orchard keeper'),
    importance:'The orchard’s press and stores provide food for the outlying families.'},
  {id:'hamlet-hall',type:'house',valueKey:'hamlet',label:'Eastbank meeting house',x:48,y:7,district:'hamlet',owner:owner('Elder Sela','Hamlet elder'),
    importance:'The isolated hamlet meets and stores its emergency supplies here.',request:'elder'},
  {id:'hamlet-house',type:'house',valueKey:'hamlet',label:'Eastbank cottages',x:52,y:9,district:'hamlet',owner:owner('Eastbank families','Hamlet residents'),
    importance:'The hamlet’s families cannot shelter behind the town’s wall line.'},
];

export function frontierSettlement() {
  return authored.map(data=>{
    const def=CONFIG.structures[data.type],property=CONFIG.frontier.property[data.valueKey??data.type];
    const request=data.request?CONFIG.frontier.requests[data.request]:null;
    return {...data,owner:{...data.owner},w:def.w,h:def.h,hp:property.initialHp??def.hp,maxHp:def.hp,
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
