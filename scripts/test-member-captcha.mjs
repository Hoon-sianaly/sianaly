import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.isConnected=true;this.value='';}
 append(...items){this.children.push(...items);}
 setAttribute(name,value){this[name]=value;}
 before(item){this.parent.children.splice(this.parent.children.indexOf(this),0,item);}
 querySelector(selector){return this.querySelectorAll(selector)[0];}
 querySelectorAll(selector){return this.children.flatMap(child=>[
  ...(selector==='[data-member-captcha]'&&Object.hasOwn(child.dataset,'memberCaptcha')||selector==='input'&&child.tag==='input'||selector==='button[type="submit"]'&&child.tag==='button'&&child.type==='submit'?[child]:[]),
  ...child.querySelectorAll(selector)
 ]);}
}
let options,removed,reset,scriptLoads=0;
const window={turnstile:{render:(el,settings)=>{options=settings;return '0';},remove:id=>{removed=id;},reset:id=>{reset=id;}}};
const document={createElement:tag=>new Element(tag),head:{append:()=>{scriptLoads++;}}};
vm.runInNewContext(await readFile(new URL('../member-captcha.js',import.meta.url),'utf8'),{window,document});
const form=new Element('form'),submit=new Element('button');submit.type='submit';submit.parent=form;form.append(submit);
window.SianalyCaptcha.mount(form,submit,{required:false});assert.equal(scriptLoads,0);assert.equal(form.children.length,1);
window.SianalyCaptcha.mount(form,submit,{required:true,siteKey:'public-test-site-key'});
assert.equal(submit.disabled,true);await Promise.resolve();
assert.equal(options['response-field'],false,'Only captchaToken may be posted: no implicit cf-turnstile-response field');
options.callback('valid-token');assert.equal(submit.disabled,false);assert.equal(form.querySelector('input').value,'valid-token');
options['expired-callback']();assert.equal(submit.disabled,true);assert.equal(form.querySelector('input').value,'');
options.callback('new-token');window.SianalyCaptcha.reset(form);assert.equal(reset,'0');assert.equal(submit.disabled,true);assert.equal(form.querySelector('input').value,'');
window.SianalyCaptcha.clear(form);assert.equal(removed,'0');
const detached=form.querySelector('[data-member-captcha]');detached.isConnected=false;options.callback('late-token');assert.equal(submit.disabled,true);
console.log('Member CAPTCHA: submit gating, token expiry/reset, SDK field isolation and dialog cleanup passed.');
