import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../company.html',import.meta.url),'utf8');
const companyCode=source.slice(source.indexOf('const recentList='),source.indexOf('const esc=v=>'));
const catalog=[{key:'samsung',name:'삼성전자',ticker:'005930'},{key:'hynix',name:'SK하이닉스',ticker:'000660'}];
function harness({values=new Map(),blocked=false}={}){
 const listeners={},elements={};
 const localStorage={getItem(key){if(blocked)throw Error('blocked');return values.get(key)??null},setItem(key,value){if(blocked)throw Error('blocked');values.set(key,value)},removeItem(key){if(blocked)throw Error('blocked');values.delete(key)}};
 const document={getElementById(id){return elements[id]??= {innerHTML:'',classes:new Set(),classList:{toggle(name,enabled){const classes=elements[id].classes;enabled?classes.add(name):classes.delete(name)}},addEventListener(type,callback){this[type]=callback},replaceChildren(){this.innerHTML=''}}}};
 const context=vm.createContext({localStorage,document,key:'samsung',c:catalog[0],recentCatalog:catalog,esc:String,encodeURIComponent,addEventListener(type,cb){listeners[type]=cb}});
 vm.runInContext(companyCode,context);
 return {context,values,elements,listeners};
}
const page=harness();
vm.runInContext('updateRecent()',page.context);
assert.equal(JSON.parse(page.values.get('sianalyRecent'))[0].key,'samsung');
page.elements.recentToggle.click();
assert.equal(page.values.get('sianalyRecentEnabled'),'false');
assert.equal(page.values.has('sianalyRecent'),false);
assert.equal(page.elements.recentList.innerHTML,'');
vm.runInContext('updateRecent()',page.context);
assert.equal(page.values.has('sianalyRecent'),false,'disabled page must not write new history');
const reload=harness({values:page.values});
vm.runInContext('updateRecent()',reload.context);
assert.equal(reload.values.has('sianalyRecent'),false,'opt out must survive page navigation');
reload.elements.sideOpen.click();
assert.equal(JSON.parse(reload.values.get('sianalyRecent'))[0].key,'samsung');
reload.values.set('sianalyRecentEnabled','false');reload.values.delete('sianalyRecent');
reload.listeners.storage({key:'sianalyRecentEnabled'});
vm.runInContext('updateRecent()',reload.context);
assert.equal(reload.elements.recentList.innerHTML,'');
assert.equal(reload.values.has('sianalyRecent'),false,'other tabs must honor opt out');
const blocked=harness({blocked:true});
assert.doesNotThrow(()=>vm.runInContext('updateRecent()',blocked.context));
assert.doesNotThrow(()=>blocked.elements.sideOpen.click());

const homeSource=readFileSync(new URL('../home-discovery.js',import.meta.url),'utf8');
const homeCode=homeSource.slice(homeSource.indexOf('function renderRecent()'),homeSource.indexOf('function initPanel('));
for(const enabled of ['false','true']){
 const section={hidden:false},recent={innerHTML:'stale'};
 const stored=new Map([['sianalyRecentEnabled',enabled],['sianalyRecent',JSON.stringify(catalog)]]);
 const context=vm.createContext({companies:catalog,recent,card:c=>c.name,document:{getElementById:()=>section},localStorage:{getItem:key=>stored.get(key),removeItem:key=>stored.delete(key)}});
 vm.runInContext(homeCode+';renderRecent()',context);
 assert.equal(section.hidden,enabled==='false');
 assert.equal(recent.innerHTML,enabled==='false'?'':catalog.map(c=>c.name).join(''));
 assert.equal(stored.has('sianalyRecent'),enabled!=='false','homepage must clear legacy opted-out history');
}
console.log('Recent history privacy: recording, opt-out deletion, reload, other tabs, blocked storage and homepage passed.');
