(function(){
 'use strict';
 let loading;
 function load(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!loading)loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.onload=()=>{if(window.turnstile)resolve(window.turnstile);else{script.remove();loading=null;reject(Error('captcha_unavailable'));}};script.onerror=()=>{script.remove();loading=null;reject(Error('captcha_unavailable'));};document.head.append(script);
  });
  return loading;
 }
 function clear(root){for(const el of root.querySelectorAll('[data-member-captcha]')){if(el.dataset.widget&&window.turnstile)window.turnstile.remove(el.dataset.widget);}}
 function mount(form,submit,settings){
  if(!settings?.required)return;
  const area=document.createElement('div'),widget=document.createElement('div'),message=document.createElement('p'),token=document.createElement('input');
  area.className='member-captcha';area.dataset.memberCaptcha='';message.className='member-captcha-status';message.setAttribute('role','status');message.textContent='보안 확인을 불러오는 중…';token.type='hidden';token.name='captchaToken';area.append(widget,message,token);submit.before(area);
  submit.disabled=true;
  const invalidate=text=>{token.value='';submit.disabled=true;message.textContent=text;};
  if(!settings.siteKey){invalidate('보안 확인 설정을 준비 중이에요. 잠시 후 다시 이용해 주세요.');return;}
  load().then(api=>{
   if(!area.isConnected)return;
   area.dataset.widget=api.render(widget,{sitekey:settings.siteKey,theme:'light',size:'flexible','response-field':false,callback:value=>{if(!area.isConnected)return;token.value=value;message.textContent='보안 확인 완료';submit.disabled=false;},'expired-callback':()=>invalidate('보안 확인이 만료됐어요. 다시 확인해 주세요.'),'error-callback':()=>{invalidate('보안 확인을 불러오지 못했어요. 잠시 후 창을 다시 열어 주세요.');},'timeout-callback':()=>invalidate('보안 확인 시간이 지났어요. 다시 확인해 주세요.')});
  }).catch(()=>invalidate('보안 확인을 불러오지 못했어요. 네트워크를 확인하고 창을 다시 열어 주세요.'));
 }
 function reset(form){const area=form.querySelector('[data-member-captcha]');if(!area)return;const token=area.querySelector('input');if(token)token.value='';const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;if(area.dataset.widget&&window.turnstile)window.turnstile.reset(area.dataset.widget);}
 window.SianalyCaptcha={mount,reset,clear};
})();
