// Authored geography and district envelopes; population, roads and lots are seeded.
export const FRONTIER_ARCHETYPES={
  compact:{name:'Compact Town',districts:[
    {id:'town',name:'Market town',x:13,y:10,w:19,h:17,keep:true,types:['house','house','house','shop','warehouse','workshop','house','shop']},
    {id:'farms',name:'Nearby farming district',x:40,y:23,w:18,h:10,types:['farm','farm','farm','farm','barn']},
    {id:'outskirts',name:'Exposed outskirts',x:43,y:5,w:15,h:11,types:['house','house','shop','warehouse']},
  ]},
  twin:{name:'Twin Settlements',districts:[
    {id:'town',name:'Northbridge community',x:13,y:5,w:19,h:12,keep:true,types:['house','house','shop','warehouse','workshop']},
    {id:'sister',name:'Southbridge community',x:13,y:21,w:19,h:12,keep:true,types:['house','house','shop','warehouse','house']},
    {id:'farms',name:'Shared farming district',x:42,y:12,w:17,h:15,types:['farm','farm','farm','farm','barn']},
  ]},
  outpost:{name:'Town + Outpost',districts:[
    {id:'town',name:'Central town',x:13,y:10,w:19,h:17,keep:true,types:['house','house','house','shop','warehouse','workshop','shop']},
    {id:'outpost',name:'Remote watch hamlet',x:44,y:4,w:15,h:12,types:['house','house','house','shop','warehouse']},
    {id:'farms',name:'Outlying farming district',x:40,y:23,w:18,h:10,types:['farm','farm','farm','farm','barn']},
  ]},
};
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
