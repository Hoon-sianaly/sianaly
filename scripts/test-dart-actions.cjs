const assert=require('node:assert/strict'),{validateFiles}=require('./dart-actions.cjs');
const registry={companies:[{key:'samsung',mode:'automatic'},{key:'bobcat',mode:'review'}]},base={status:'validated',strategy:'new-disclosures',files:[]};
validateFiles({...base,files:[{path:'data/companies/samsung.json',content:'{}'}]},registry);
for(const files of [[{path:'data/companies/bobcat.json',content:'{}'}],[{path:'.env',content:'{}'}],[{path:'data/companies/samsung.json',content:'bad'}],[{path:'data/companies/samsung.json',content:'{}'},{path:'data/companies/samsung.json',content:'{}'}]])assert.throws(()=>validateFiles({...base,files},registry));
assert.throws(()=>validateFiles({...base,status:'running'},registry));
console.log('Actions candidate boundary tests passed.');
