(function(){
 'use strict';
 let config,session={signedIn:false},favoriteKeys=new Set(),catalog=new Map(),busy=false,pendingCompany=null;
 let nav,signup,dialog,toast,toastTimer,homeList;const wiredFavorites=new WeakSet();
 let recoveryToken=new URLSearchParams(location.hash.slice(1)).get('password-reset')||'',confirmationToken=new URLSearchParams(location.hash.slice(1)).get('email-confirm')||'';
 if(recoveryToken||confirmationToken)history.replaceState(null,'',location.pathname+location.search);
 const api=async(action,body,method=body?'POST':'GET')=>{
  const response=await fetch('/api/account/'+action,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok){const e=new Error(data.code||'unavailable');e.code=data.code;throw e;}return data;
 };
 function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
 function say(text){toast.textContent=text;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},4500);}
 function errorText(error){return ({legal_required:'회원 이용 안내와 만 14세 이상 여부를 확인해 주세요.',login_required:'로그인 후 이용할 수 있어요.',captcha_required:'보안 확인을 완료해 주세요.',captcha_invalid:'보안 확인이 만료됐어요. 다시 확인해 주세요.',captcha_unavailable:'보안 확인을 준비 중이에요. 잠시 후 다시 이용해 주세요.',reauth_required:'탈퇴하려면 다시 로그인해 주세요.',confirmation_required:'확인 문구를 정확히 입력해 주세요.',invalid_company:'이 기업은 저장할 수 없어요.',invalid_nickname:'별명은 글자·숫자·공백·밑줄·하이픈으로 2~20자 입력해 주세요.',invalid_email:'이메일 주소를 확인해 주세요.',invalid_password:'비밀번호는 10~128자로 설정해 주세요.',too_many_attempts:'요청이 많아요. 잠시 후 다시 시도해 주세요.',email_login_failed:'이메일과 비밀번호를 확인해 주세요.',email_signup_failed:'가입하지 못했어요. 이미 가입한 이메일이라면 로그인해 주세요.',email_not_confirmed:'받은 메일에서 이메일 인증을 완료해 주세요. 메일이 없다면 아래에서 다시 받을 수 있어요.',email_confirmation_invalid:'인증 링크가 만료됐거나 이미 사용됐어요. 로그인하거나 인증 메일을 다시 받아 주세요.',email_send_unavailable:'인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',recovery_unavailable:'메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',recovery_invalid:'링크가 만료됐거나 이미 사용됐어요. 재설정 메일을 다시 받아 주세요.',recovery_required:'비밀번호 변경 시간이 지났어요. 재설정 메일을 다시 받아 주세요.',password_reused:'이전과 다른 비밀번호를 입력해 주세요.',password_update_failed:'비밀번호를 변경하지 못했어요. 다른 비밀번호로 다시 시도해 주세요.'})[error.code]||'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';}
 function showDialog(title){
  window.SianalyCaptcha?.clear(dialog);dialog.replaceChildren();const h=node('h2',title);h.id='memberDialogTitle';const close=node('button','×','member-dialog-close');close.type='button';close.setAttribute('aria-label','계정 창 닫기');close.onclick=()=>dialog.close();dialog.append(h,close);if(!dialog.open)dialog.showModal();
 }
 function info(){const details=node('details',undefined,'member-information');details.append(node('summary','회원 정보 안내'),node('p',config.providers.length?'이메일 또는 연결된 소셜 계정으로 가입하고 사이트 별명을 설정해요.':'이메일·비밀번호·별명으로 가입해요. 받은 메일에서 이메일 인증을 완료하면 이용할 수 있어요.'),node('p','이메일과 비밀번호는 회원 인증 서비스에서 가입·로그인에 사용해요.'),node('p','탈퇴하면 회원 인증 정보와 즐겨찾기가 삭제돼요. 작성한 글·댓글은 남으며 작성자는 ‘탈퇴한 회원’으로 표시돼요.'));return details;}
 function mountCaptcha(form,submit){
  if(!config.captcha?.required)return;
  if(window.SianalyCaptcha)window.SianalyCaptcha.mount(form,submit,config.captcha);
  else {submit.disabled=true;form.append(node('p','보안 확인을 불러오지 못했어요. 새로고침 후 다시 이용해 주세요.','member-error'));}
 }
 function legalFields(form){
  const group=node('fieldset',undefined,'member-legal');group.append(node('legend','가입 전 확인'));
  const policy=config.policy;
  const summary=node('p','수집: 이메일·비밀번호 검증 정보·별명·회원 식별자. 목적: 회원 인증·계정 관리·회원 기능 제공. 보유: 회원 탈퇴 시까지(활동 기록·외부 처리의 별도 기준은 개인정보 처리방침 참고). 필수 동의를 거부하면 가입·회원 기능 이용이 제한되며 기업 정보는 계속 볼 수 있어요.','member-legal-summary');
  for(const [name,text,href,caption]of [['age14','만 14세 이상입니다.'],['termsAccepted','이용약관에 동의합니다.',policy.terms,'이용약관 읽기'],['privacyConsent','회원가입에 필요한 개인정보 수집·이용에 동의합니다.',policy.privacy,'수집 항목·보관 기준 읽기']]){
   const row=node('div',undefined,'member-legal-row'),label=node('label'),checkbox=node('input');checkbox.type='checkbox';checkbox.name=name;checkbox.value='true';checkbox.required=true;
   label.append(checkbox,node('span','[필수] '+text));row.append(label);
   if(href){const link=node('a',caption);link.href=href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}group.append(row);
  }
  group.append(summary);form.append(group);
 }
 function legalBody(form){const values=Object.fromEntries(new FormData(form));for(const name of ['age14','termsAccepted','privacyConsent'])values[name]=values[name]==='true';values.policyVersion=config.policy.version;return values;}
 function legalDialog(){
  showDialog('회원 이용 안내 확인');dialog.append(node('p','새 회원 안내를 확인해 주세요. 이전에 동의한 것으로 처리하지 않으며, 생년월일이나 휴대전화는 받지 않아요.'));
  const form=node('form',undefined,'member-email-form');legalFields(form);
  const submit=node('button','확인하고 계속','member-menu-action member-email-submit'),error=node('p','','member-error');submit.type='submit';error.setAttribute('role','alert');form.append(submit,error);
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{await api('legal',legalBody(form));await reloadSession();publishChange();dialog.close();if(!session.nickname)nicknameDialog();else if(pendingCompany){const key=pendingCompany;pendingCompany=null;await changeFavorite(key);}}catch(e){error.textContent=errorText(e);submit.disabled=false;}};
  const later=node('button','나중에 확인','member-auth-toggle');later.type='button';later.onclick=()=>dialog.close();dialog.append(form,later,node('p','동의하지 않아도 공개 정보 열람·기존 글 삭제·로그아웃·탈퇴는 이용할 수 있어요.'));
 }
 function loginDialog(signingUp=false){
  showDialog(signingUp?'SIANALY 회원가입':'SIANALY 로그인');
  dialog.append(node('p',signingUp?'이메일·비밀번호·별명을 입력하고 인증 메일을 확인해 주세요.':pendingCompany?'로그인하고 이 기업을 즐겨찾기에 저장하세요.':'가입한 이메일과 비밀번호를 입력해 주세요.'));
  const form=node('form',undefined,'member-email-form');
  const fields=[['email','이메일','email','email'],['password','비밀번호','password',signingUp?'new-password':'current-password']];
  if(signingUp)fields.push(['nickname','별명','text','nickname']);
  for(const [name,caption,type,autocomplete] of fields){
   const label=node('label',caption),input=node('input',undefined,'member-delete-input');
   input.id='memberEmail-'+name;input.name=name;input.type=type;input.autocomplete=autocomplete;input.required=true;
   input.maxLength=name==='email'?254:name==='password'?128:20;
   if(signingUp&&name==='password')input.minLength=10;
   if(name==='nickname')input.minLength=2;
   label.htmlFor=input.id;
   form.append(label,input);
  }
  if(signingUp)form.append(node('p','비밀번호 10자 이상 · 별명 2~20자'));
  if(signingUp)legalFields(form);
  const submit=node('button',signingUp?'가입하기':'로그인','member-menu-action member-email-submit');
  submit.type='submit';
  const error=node('p','','member-error');error.setAttribute('role','alert');
  form.append(submit,error);
  form.onsubmit=async event=>{
   event.preventDefault();submit.disabled=true;error.textContent='';
   try{
    const result=await api(signingUp?'email-signup':'email-login',signingUp?legalBody(form):Object.fromEntries(new FormData(form)));
    if(result.confirmationRequired){form.reset();signupMailDialog();return;}
    form.reset();publishChange();
    try{if(pendingCompany)sessionStorage.setItem('sianaly.pendingFavorite',JSON.stringify({key:pendingCompany,createdAt:Date.now()}));}catch{}
    location.reload();
   }catch(e){error.textContent=errorText(e);submit.disabled=false;window.SianalyCaptcha?.reset(form);}
  };
  dialog.append(form);mountCaptcha(form,submit);
  if(!signingUp){const forgot=node('button','비밀번호를 잊었나요?','member-auth-toggle');forgot.type='button';forgot.onclick=passwordForgotDialog;const resend=node('button','인증 메일 다시 받기','member-auth-toggle');resend.type='button';resend.onclick=emailResendDialog;dialog.append(forgot,resend);}
  const providers=['custom:kakao','custom:naver'].map(id=>config.providers.find(provider=>provider.id===id)).filter(Boolean);
  if(providers.length)dialog.append(node('div','또는','member-auth-divider'));
  const social=node('div',undefined,'member-social-options');
  for(const provider of providers){const button=node('button',provider.name+(signingUp?'로 가입하기':'로 로그인'),'member-provider');button.type='button';button.dataset.provider=provider.id;
   button.onclick=async()=>{for(const b of dialog.querySelectorAll('.member-provider'))b.disabled=true;error.textContent='';try{
    try{if(pendingCompany)sessionStorage.setItem('sianaly.pendingFavorite',JSON.stringify({key:pendingCompany,createdAt:Date.now()}));}catch{}
    const next=location.pathname+location.search,data=await api('login',{provider:provider.id,next});location.assign(data.url);
   }catch(e){error.textContent=errorText(e);for(const b of dialog.querySelectorAll('.member-provider'))b.disabled=false;}};social.append(button);
  }
  const toggle=node('button',signingUp?'이미 가입했나요? 로그인':'처음이신가요? 회원가입','member-auth-toggle');toggle.type='button';toggle.onclick=()=>loginDialog(!signingUp);
  dialog.append(social,toggle,info());
 }
 function signupMailDialog(){
  showDialog('이메일을 확인해 주세요');
  dialog.append(node('p','처음 가입한 이메일이라면 받은 메일에서 인증을 완료해 주세요.'),node('p','메일이 보이지 않으면 스팸함을 확인해 주세요. 이미 가입한 이메일에는 새 인증 메일이 오지 않을 수 있어요. 예전에 소셜 계정으로 가입했다면 아래에서 비밀번호를 설정해 이메일로 로그인할 수 있어요.'));
  const resend=node('button','인증 메일 다시 받기','member-menu-action');resend.type='button';resend.onclick=emailResendDialog;
  const password=node('button','비밀번호 설정·찾기','member-auth-toggle');password.type='button';password.onclick=passwordForgotDialog;
  const login=node('button','로그인으로 돌아가기','member-auth-toggle');login.type='button';login.onclick=()=>loginDialog();dialog.append(resend,password,login);
 }
 function emailResendDialog(){
  showDialog('인증 메일 다시 받기');
  dialog.append(node('p','가입을 요청한 이메일을 입력해 주세요. 잠시 전에 요청했다면 잠깐 기다린 뒤 다시 시도해 주세요.'));
  const form=node('form',undefined,'member-email-form'),label=node('label','이메일'),email=node('input',undefined,'member-delete-input');
  email.id='memberConfirmEmail';email.name='email';email.type='email';email.autocomplete='email';email.required=true;email.maxLength=254;label.htmlFor=email.id;
  const submit=node('button','인증 메일 받기','member-menu-action member-email-submit'),error=node('p','','member-error');submit.type='submit';error.setAttribute('role','alert');form.append(label,email,submit,error);
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;error.textContent='';try{await api('email-resend',Object.fromEntries(new FormData(form)));signupMailDialog();}catch(e){error.textContent=errorText(e);submit.disabled=false;window.SianalyCaptcha?.reset(form);}};
  dialog.append(form);mountCaptcha(form,submit);
 }
 function emailConfirmationDialog(){
  showDialog('이메일 인증');dialog.append(node('p','아래 버튼을 눌러 가입한 이메일 인증을 완료해 주세요.'));
  const proceed=node('button','이메일 인증 완료하기','member-menu-action'),error=node('p','','member-error');proceed.type='button';error.setAttribute('role','alert');
  proceed.onclick=async()=>{proceed.disabled=true;error.textContent='';try{await api('email-confirm',{tokenHash:confirmationToken});confirmationToken='';publishChange();location.reload();}catch(e){error.textContent=errorText(e);proceed.disabled=false;}};
  const resend=node('button','인증 메일 다시 받기','member-auth-toggle');resend.type='button';resend.onclick=emailResendDialog;dialog.append(proceed,error,resend);
 }
 function passwordForgotDialog(){
  showDialog('비밀번호 찾기');
  dialog.append(node('p','가입한 이메일로 비밀번호 재설정 링크를 보내드려요.'));
  const form=node('form',undefined,'member-email-form'),label=node('label','이메일'),email=node('input',undefined,'member-delete-input');
  email.id='memberRecoveryEmail';email.name='email';email.type='email';email.autocomplete='email';email.required=true;email.maxLength=254;label.htmlFor=email.id;
  const submit=node('button','재설정 메일 받기','member-menu-action member-email-submit'),error=node('p','','member-error');
  submit.type='submit';error.setAttribute('role','alert');
  form.append(label,email,submit,error);
  form.onsubmit=async event=>{
   event.preventDefault();submit.disabled=true;error.textContent='';
   try{
    await api('password-forgot',Object.fromEntries(new FormData(form)));
    showDialog('메일함을 확인해 주세요');
    dialog.append(node('p','가입된 이메일이라면 재설정 메일을 보냈어요. 메일이 보이지 않으면 스팸함도 확인해 주세요.'),node('p','메일의 링크에서 새 비밀번호를 설정할 수 있어요. 링크는 한 번만 사용할 수 있어요.'));
    const back=node('button','로그인으로 돌아가기','member-menu-action');back.type='button';back.onclick=()=>loginDialog();dialog.append(back);
   }catch(e){error.textContent=errorText(e);submit.disabled=false;window.SianalyCaptcha?.reset(form);}
  };
  dialog.append(form);mountCaptcha(form,submit);
 }
 function recoveryLinkDialog(){
  showDialog('새 비밀번호 설정');
  dialog.append(node('p','아래 버튼을 눌러 이메일 재설정 링크를 확인해 주세요.'));
  const proceed=node('button','새 비밀번호 설정하기','member-menu-action'),error=node('p','','member-error');
  proceed.type='button';error.setAttribute('role','alert');
  proceed.onclick=async()=>{
   proceed.disabled=true;error.textContent='';
   try{
    await api('password-recovery',{tokenHash:recoveryToken});
    recoveryToken='';publishChange();await reloadSession();passwordUpdateDialog();
   }catch(e){error.textContent=errorText(e);proceed.disabled=false;}
  };
  const retry=node('button','재설정 메일 다시 받기','member-auth-toggle');retry.type='button';retry.onclick=passwordForgotDialog;
  dialog.append(proceed,error,retry);
 }
 function passwordUpdateDialog(){
  showDialog('새 비밀번호 설정');
  dialog.append(node('p','10자 이상의 새 비밀번호를 입력해 주세요.'));
  const form=node('form',undefined,'member-email-form');
  for(const [name,caption] of [['password','새 비밀번호'],['confirmation','새 비밀번호 확인']]){
   const input=node('input',undefined,'member-delete-input'),label=node('label',caption);
   input.id='memberReset-'+name;input.name=name;input.type='password';input.autocomplete='new-password';input.minLength=10;input.maxLength=128;input.required=true;label.htmlFor=input.id;form.append(label,input);
  }
  const submit=node('button','비밀번호 변경','member-menu-action member-email-submit'),error=node('p','','member-error');
  submit.type='submit';error.setAttribute('role','alert');form.append(submit,error);
  form.onsubmit=async event=>{
   event.preventDefault();error.textContent='';
   const data=new FormData(form);
   if(data.get('password')!==data.get('confirmation')){error.textContent='두 비밀번호가 같지 않아요.';return;}
   submit.disabled=true;
   try{
    const result=await api('password-update',{password:data.get('password')});
    form.reset();session={signedIn:false};favoriteKeys.clear();render();publishChange();
    showDialog('비밀번호 변경 완료');
    dialog.append(node('p','새 비밀번호로 다시 로그인해 주세요.'));
    if(result.sessionWarning)dialog.append(node('p','다른 기기의 로그인 정리가 완료되지 않았어요. 사용 중인 기기에서도 로그아웃해 주세요.'));
    const login=node('button','로그인하기','member-menu-action');login.type='button';login.onclick=()=>loginDialog();dialog.append(login);
   }catch(e){error.textContent=errorText(e);submit.disabled=false;window.SianalyCaptcha?.reset(form);}
  };
  const retry=node('button','재설정 메일 다시 받기','member-auth-toggle');retry.type='button';retry.onclick=passwordForgotDialog;
  dialog.append(form,retry);
 }
 function publishChange(){try{localStorage.setItem('sianaly.member.changed',String(Date.now()));}catch{}}
 function render(){
  nav.textContent=session.signedIn?'마이페이지':'로그인';
  signup.hidden=session.signedIn;
  const favorite=document.querySelector('.member-favorite');if(favorite){const selected=favoriteKeys.has(favorite.dataset.company);favorite.setAttribute('aria-pressed',String(selected));favorite.textContent=selected?'★ 저장됨':'☆ 즐겨찾기';}
  if(homeList){homeList.parentElement.hidden=!session.signedIn;homeList.replaceChildren();for(const key of favoriteKeys){const company=catalog.get(key);if(!company)continue;const li=node('li'),link=node('a',company.name);link.href='company.html?company='+encodeURIComponent(key);li.append(link);homeList.append(li);}const empty=homeList.parentElement.querySelector('.member-favorites-empty');empty.hidden=Boolean(favoriteKeys.size);}
 }
 async function changeFavorite(key){
  if(!session.signedIn){pendingCompany=key;loginDialog();return;}
  if(session.legalRequired&&!favoriteKeys.has(key)){pendingCompany=key;legalDialog();return;}
  if(!session.nickname){pendingCompany=key;nicknameDialog();return;}
  if(busy)return;busy=true;const remove=favoriteKeys.has(key);try{await api('favorites',{company:key},remove?'DELETE':'POST');if(remove)favoriteKeys.delete(key);else favoriteKeys.add(key);render();publishChange();say(remove?'즐겨찾기에서 삭제했어요.':'즐겨찾기에 저장했어요.');}catch(e){if(e.code==='login_required'){session={signedIn:false};favoriteKeys.clear();render();pendingCompany=key;loginDialog();}else if(e.code==='nickname_required'){session.nickname='';pendingCompany=key;nicknameDialog();}else say(errorText(e));}finally{busy=false;}
 }
 function nicknameForm(onSaved,first=false){
  const profile=node('form',undefined,'member-profile'),label=node('label','별명'),nickname=node('input',undefined,'member-delete-input');
  nickname.id='memberNickname';label.htmlFor=nickname.id;nickname.type='text';nickname.value=session.nickname||'';nickname.required=true;nickname.minLength=2;nickname.maxLength=20;nickname.autocomplete='nickname';nickname.placeholder='내가 사용할 별명';nickname.setAttribute('aria-describedby','memberNicknameHelp');
  const help=node('p','2~20자 · 본명 대신 별명을 사용해 주세요.');help.id='memberNicknameHelp';
  const save=node('button',first?'가입 완료':'별명 저장','member-menu-action'),profileStatus=node('p','','member-error');save.type='submit';profileStatus.setAttribute('role','status');
  profile.onsubmit=async event=>{event.preventDefault();save.disabled=true;profileStatus.textContent='';try{const data=await api('nickname',{nickname:nickname.value});session.nickname=data.nickname;nickname.value=data.nickname;publishChange();say(first?'가입을 완료했어요.':'별명을 저장했어요.');if(onSaved)await onSaved();}catch(e){profileStatus.textContent=errorText(e);}finally{save.disabled=false;}};
  profile.append(label,nickname,help,save,profileStatus);return profile;
 }
 function nicknameDialog(){
  showDialog('어떤 별명으로 시작할까요?');dialog.append(node('p','SIANALY에서 사용할 별명을 정하면 가입이 완료돼요. 소셜 계정의 이름은 사용하지 않아요.'),nicknameForm(async()=>{dialog.close();if(pendingCompany){const key=pendingCompany;pendingCompany=null;if(!favoriteKeys.has(key))await changeFavorite(key);}},true));
 }
 function myPosts(){
  const section=node('details',undefined,'member-information');
  const summary=node('summary','내가 쓴 글'), list=node('ul'), status=node('p'), more=node('button','더 보기','member-menu-action');
  const pagination=node('div');pagination.hidden=true;pagination.append(more);
  status.setAttribute('role','status');more.type='button';
  let next=null,loaded=false,busy=false;
  async function load(){
   if(busy)return;
   busy=true;more.disabled=true;status.textContent='불러오는 중…';
   try{
    const page=await api('board?mine=1'+(next?'&before='+encodeURIComponent(next):''));
    for(const post of page.posts){
     const item=node('li'),link=node('a',(post.hidden?'[숨김] ':'')+post.title);
     link.href='/board?post='+encodeURIComponent(post.id);item.append(link);list.append(item);
    }
    next=page.next;loaded=true;pagination.hidden=!next;
    status.textContent=list.childElementCount?'':'아직 작성한 글이 없어요.';
   }catch(error){status.textContent=errorText(error);more.textContent='다시 시도';pagination.hidden=false;}
   finally{busy=false;more.disabled=false;}
  }
  more.onclick=()=>{more.textContent='더 보기';void load();};
  section.ontoggle=()=>{if(section.open&&!loaded)void load();};
  section.append(summary,list,status,pagination);return section;
 }
 function accountDialog(){
  if(!session.signedIn){pendingCompany=null;loginDialog();return;}
  showDialog('마이페이지');dialog.append(node('p',config.providers.length?(session.provider||'소셜')+' 계정으로 로그인 중':'로그인 중'),nicknameForm());
  if(session.legalRequired){const check=node('button','회원 이용 안내 확인','member-menu-action');check.type='button';check.onclick=legalDialog;dialog.append(check);}
  const favorites=node('button','내 즐겨찾기','member-menu-action');favorites.type='button';favorites.onclick=()=>{dialog.close();if(homeList){homeList.parentElement.scrollIntoView({behavior:'smooth',block:'center'});}else location.assign('/#memberFavorites');};
  const logout=node('button','로그아웃','member-menu-action');logout.type='button';logout.onclick=async()=>{logout.disabled=true;try{await api('logout',{});session={signedIn:false};favoriteKeys.clear();render();dialog.close();publishChange();say('로그아웃했어요.');}catch(e){logout.disabled=false;say(errorText(e));}};
  dialog.append(favorites,myPosts(),logout);
  if(session.isAdmin){const management=node('a','게시판 관리','member-menu-action');management.href='/board?moderation=1';dialog.append(management);}
  if(session.isAdmin){const reports=node('a','오류 제보 관리','member-menu-action');reports.href='/reports';dialog.append(reports);}
  const deletion=node('details',undefined,'member-information');deletion.append(node('summary','회원 탈퇴'),node('p','회원 인증 정보와 즐겨찾기가 삭제돼요. 글·댓글은 남으며 작성자는 ‘탈퇴한 회원’으로 표시돼요. 계속하려면 아래에 ‘회원탈퇴’를 입력하세요.'));
  const input=node('input',undefined,'member-delete-input');input.type='text';input.placeholder='회원탈퇴';input.setAttribute('aria-label','회원 탈퇴 확인 문구');input.autocomplete='off';
  const confirm=node('button','탈퇴하기','member-menu-action member-danger');confirm.type='button';confirm.disabled=true;input.oninput=()=>{confirm.disabled=input.value!=='회원탈퇴';};
  const error=node('p','','member-error');error.setAttribute('role','alert');confirm.onclick=async()=>{confirm.disabled=true;try{await api('delete',{confirmation:input.value});session={signedIn:false};favoriteKeys.clear();render();dialog.close();publishChange();say('회원 탈퇴가 완료됐어요.');}catch(e){if(e.code==='reauth_required'){loginDialog();return;}error.textContent=errorText(e);confirm.disabled=false;}};
  deletion.append(input,confirm,error);dialog.append(deletion,info());
 }
 async function reloadSession(){
  try{session=await api('session');favoriteKeys.clear();if(session.signedIn){const data=await api('favorites');favoriteKeys=new Set(data.companies.map(c=>c.key).filter(key=>catalog.has(key)));}render();}
  catch(e){session={signedIn:false};favoriteKeys.clear();render();}
 }
 function mountCompany(){
  const key=new URLSearchParams(location.search).get('company'),hero=document.querySelector('#app .hero');
  if(!hero||!catalog.has(key))return;
  let button=hero.querySelector('.member-favorite');if(button&&wiredFavorites.has(button))return;
  if(!button){const controls=node('div',undefined,'member-company-controls');button=node('button','☆ 즐겨찾기','member-favorite');button.type='button';button.dataset.company=key;button.setAttribute('aria-pressed','false');controls.append(button);hero.append(controls);}
  wiredFavorites.add(button);button.onclick=()=>changeFavorite(key);render();
 }
 async function init(){
  try{config=await api('config');if(!config.ready||(!config.providers.length&&!config.email))return;const data=await loadCompanyCatalog();catalog=new Map(data.companies.map(c=>[c.key,c]));}catch{return;}
  const header=document.querySelector('header');if(!header)return;
  nav=node('button','로그인','member-nav-button');nav.type='button';nav.onclick=accountDialog;
  signup=node('button','회원가입','member-nav-button member-signup');signup.type='button';
  signup.onclick=()=>{pendingCompany=null;loginDialog(true);};
  const authButtons=node('div',undefined,'member-auth-buttons');
  const companyCommunity=header.querySelector('.company-board-nav');if(companyCommunity)authButtons.append(companyCommunity);
  authButtons.append(nav,signup);
  const actions=node('div',undefined,'member-header-actions'),existing=header.lastElementChild;header.dataset.memberPage=document.querySelector('.company-search')?'company':'home';if(existing&&!existing.classList.contains('logo'))actions.append(existing);actions.append(authButtons);header.append(actions);
  dialog=node('dialog',undefined,'member-dialog');dialog.setAttribute('aria-labelledby','memberDialogTitle');dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});document.body.append(dialog);
  toast=node('div',undefined,'member-toast');toast.hidden=true;toast.setAttribute('role','status');document.body.append(toast);
  if(!document.getElementById('app')){const area=node('section',undefined,'member-favorites');area.id='memberFavorites';area.hidden=true;const head=node('div',undefined,'member-favorites-head');head.append(node('h2','내 즐겨찾기'));homeList=node('ul',undefined,'member-favorites-list');const empty=node('p','기업 페이지에서 ☆ 즐겨찾기를 눌러 저장할 수 있어요.','member-favorites-empty');area.append(head,homeList,empty);document.querySelector('main')?.before(area);}
  mountCompany();const app=document.getElementById('app');if(app)new MutationObserver(mountCompany).observe(app,{childList:true,subtree:true});
  await reloadSession();
  if(confirmationToken)emailConfirmationDialog();
  else if(recoveryToken)recoveryLinkDialog();
  else if(session.passwordReset)passwordUpdateDialog();
  else if(session.signedIn&&session.legalRequired)legalDialog();
  else if(session.signedIn){let pending;try{pending=JSON.parse(sessionStorage.getItem('sianaly.pendingFavorite')||'null');sessionStorage.removeItem('sianaly.pendingFavorite');}catch{}if(pending?.createdAt>Date.now()-600000&&catalog.has(pending.key)&&!favoriteKeys.has(pending.key))pendingCompany=pending.key;if(!session.nickname)nicknameDialog();else if(pendingCompany){const key=pendingCompany;pendingCompany=null;await changeFavorite(key);}}
  const query=new URLSearchParams(location.search);if(query.has('accountError')){say('로그인을 완료하지 못했어요. 다시 시도해 주세요.');query.delete('accountError');history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash);}
  if(location.hash==='#memberFavorites'&&homeList&&!homeList.parentElement.hidden)homeList.parentElement.scrollIntoView({block:'center'});
  window.addEventListener('storage',event=>{if(event.key==='sianaly.member.changed'){favoriteKeys.clear();session={signedIn:false};render();reloadSession();}});
  window.addEventListener('pageshow',event=>{if(event.persisted){favoriteKeys.clear();session={signedIn:false};render();reloadSession();}});
 }
 init();
})();
