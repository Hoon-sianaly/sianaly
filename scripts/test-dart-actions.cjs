const assert=require('node:assert/strict'),{validateFiles,buildNoticeFeed}=require('./dart-actions.cjs');
const registry={companies:[{key:'samsung',mode:'automatic'},{key:'bobcat',mode:'review'}]},base={status:'validated',strategy:'new-disclosures',files:[]};
validateFiles({...base,files:[{path:'data/companies/samsung.json',content:'{}'}]},registry);
for(const files of [[{path:'data/companies/bobcat.json',content:'{}'}],[{path:'.env',content:'{}'}],[{path:'data/companies/samsung.json',content:'bad'}],[{path:'data/companies/samsung.json',content:'{}'},{path:'data/companies/samsung.json',content:'{}'}]])assert.throws(()=>validateFiles({...base,files},registry));
assert.throws(()=>validateFiles({...base,status:'running'},registry));
const publishedAt='2026-11-05T05:00:00Z';
const company={profile:{key:'samsung',name:'삼성전자'},financials:{quarterly:[
 {year:2026,quarter:3,sales:105,op:12,disclosureStatus:'preliminary',dart:{receipt:'20261105000001'}}
]}};
const candidate={files:[{content:JSON.stringify(company)}],results:[{key:'samsung',changes:[
 {year:2026,quarter:3,fields:[{field:'sales',before:100},{field:'op',before:12}]},
 {year:2026,quarter:3,fields:[{field:'sales',before:102},{field:'op',before:13}]}
]},{key:'held',status:'review'}]};
const history=Array.from({length:20},()=>({publishedAt:'2026-11-04T05:00:00Z',companies:[]}));
const feed=buildNoticeFeed(candidate,{updates:history},publishedAt);
assert.equal(feed.updates.length,20);
assert.deepEqual(feed.updates[0],{publishedAt,companies:[{key:'samsung',name:'삼성전자',periods:[
 {year:2026,quarter:3,receipt:'20261105000001',preliminary:true,fields:['sales']}
]}]});
console.log('Actions candidate boundary tests passed.');
