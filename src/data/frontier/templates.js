// District recipes placed relative to the map centre and the siege plan:
// 'centre' sits near the middle, 'ring' and 'far' are pushed outward along a
// seeded bearing, and 'twinA'/'twinB' flank the centre on a shared axis.
export const FRONTIER_ARCHETYPES={
  compact:{name:'Compact Town',districts:[
    {id:'town',name:'Market town',place:'centre',w:19,h:15,keep:true,types:['house','house','house','shop','warehouse','workshop','house','shop']},
    {id:'farms',name:'Nearby farming district',place:'ring',w:16,h:9,types:['farm','farm','farm','farm','barn']},
    {id:'outskirts',name:'Exposed outskirts',place:'ring',w:14,h:10,types:['house','house','shop','warehouse']},
  ]},
  twin:{name:'Twin Settlements',districts:[
    {id:'town',name:'Northbridge community',place:'twinA',w:17,h:12,keep:true,types:['house','house','shop','warehouse','workshop']},
    {id:'sister',name:'Southbridge community',place:'twinB',w:17,h:12,keep:true,types:['house','house','shop','warehouse','house']},
    {id:'farms',name:'Shared farming district',place:'ring',w:15,h:10,types:['farm','farm','farm','farm','barn']},
  ]},
  outpost:{name:'Town + Outpost',districts:[
    {id:'town',name:'Central town',place:'centre',w:19,h:15,keep:true,types:['house','house','house','shop','warehouse','workshop','shop']},
    {id:'outpost',name:'Remote watch hamlet',place:'far',w:14,h:11,types:['house','house','house','shop','warehouse']},
    {id:'farms',name:'Outlying farming district',place:'ring',w:16,h:9,types:['farm','farm','farm','farm','barn']},
  ]},
};
// Twin axes: half-separation of the two communities from the centre.
export const TWIN_AXES=[{x:11,y:0},{x:10,y:6},{x:10,y:-6},{x:0,y:9}];
export const TERRAIN_TEMPLATES=[
  {id:'river-fords',kind:'river',bend:false},
  {id:'river-bend',kind:'river',bend:true},
  {id:'ridge-passes',kind:'ridge'},
  {id:'open-outcrops',kind:'plain'},
];
export const OWNER_NAMES=['Elin Farrow','Oren Bell','Mira Ash','Sela Brook','Ada Forge','Ivo Stone','Nell Rye','Tessa Reed','Perrin Moss','Anja Dale'];
export const REQUEST_TEMPLATES=[
  {key:'merchant',types:['warehouse','shop'],role:'Merchant',dialogue:'Our trade stock will feed the settlement after the raid. Promise to keep this building standing.',selfDefense:'hiredGuard'},
  {key:'farmer',types:['farm'],role:'Farmer',dialogue:'This outlying farm holds next season’s seed. Your protection would be worth my savings.',selfDefense:'barricades'},
  {key:'elder',types:['house'],role:'Community elder',dialogue:'Our families depend on these homes. Promise that they will still be here after the raid.',selfDefense:'barricades'},
  {key:'workshop',types:['workshop'],role:'Workshop owner',dialogue:'Save our tools. I can advance the owner payment now, reconciled when the contract ends.',selfDefense:'barricades'},
];
export const SPECIAL_BUILDING_NAMES=['Bridge-side warehouse','Watermill store','District infirmary'];
