(function(){
 'use strict';
 let config,session={signedIn:false},favoriteKeys=new Set(),catalog=new Map(),busy=false,pendingCompany=null;
 let nav,signup,dialog,toast,toastTimer,homeList;const wiredFavorites=new WeakSet();
 const api=async(action,body,method=body?'POST':'GET')=>{
  const response=await fetch('/api/account/'+action,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok){const e=new Error(data.code||'unavailable');e.code=data.code;throw e;}return data;
 };
 function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
 function say(text){toast.textContent=text;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},4500);}
 function errorText(error){return ({login_required:'로그인 후 이용할 수 있어요.',reauth_required:'탈퇴하려면 다시 로그인해 주세요.',confirmation_required:'확인 문구를 정확히 입력해 주세요.',invalid_company:'이 기업은 저장할 수 없어요.',invalid_nickname:'별명은 글자·숫자·공백·밑줄·하이픈으로 2~20자 입력해 주세요.',invalid_email:'이메일 주소를 확인해 주세요.',invalid_password:'비밀번호는 10~128자로 설정해 주세요.',too_many_attempts:'요청이 많아요. 잠시 후 다시 시도해 주세요.',email_login_failed:'이메일과 비밀번호를 확인해 주세요.',email_signup_failed:'가입하지 못했어요. 이미 가입한 이메일이라면 로그인해 주세요.',email_confirmation_required:'이메일 가입 설정을 확인 중이에요. 잠시 후 다시 시도해 주세요.'})[error.code]||'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';}
 function showDialog(title){
  dialog.replaceChildren();const h=node('h2',title);h.id='memberDialogTitle';const close=node('button','×','member-dialog-close');close.type='button';close.setAttribute('aria-label','계정 창 닫기');close.onclick=()=>dialog.close();dialog.append(h,close);if(!dialog.open)dialog.showModal();
 }
 function info(){const details=node('details',undefined,'member-information');details.append(node('summary','회원 정보 안내'),node('p','네이버·카카오 또는 이메일로 가입할 수 있어요. 가입 후 사이트에서 사용할 별명을 설정해요.'),node('p','이메일과 비밀번호는 회원 인증 서비스에서 가입·로그인에 사용해요. 소셜 로그인에서 동의한 정보도 인증 서비스에 보관될 수 있어요.'),node('p','탈퇴하면 SIANALY 회원 인증 정보와 저장한 즐겨찾기가 삭제됩니다.'));return details;}
 function loginDialog(signingUp=false){
  showDialog(signingUp?'SIANALY 회원가입':'SIANALY 로그인');
  dialog.append(node('p',signingUp?'이메일·비밀번호·별명을 입력하면 바로 가입돼요.':pendingCompany?'로그인하고 이 기업을 즐겨찾기에 저장하세요.':'가입한 이메일과 비밀번호를 입력해 주세요.'));
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
  const submit=node('button',signingUp?'가입하기':'로그인','member-menu-action member-email-submit');
  submit.type='submit';
  const error=node('p','','member-error');error.setAttribute('role','alert');
  form.append(submit,error);
  form.onsubmit=async event=>{
   event.preventDefault();submit.disabled=true;error.textContent='';
   try{
    await api(signingUp?'email-signup':'email-login',Object.fromEntries(new FormData(form)));
    form.reset();publishChange();
    try{if(pendingCompany)sessionStorage.setItem('sianaly.pendingFavorite',JSON.stringify({key:pendingCompany,createdAt:Date.now()}));}catch{}
    location.reload();
   }catch(e){error.textContent=errorText(e);submit.disabled=false;}
  };
  dialog.append(form);
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
  dialog.append(social,toggle,node('p','비밀번호 찾기는 메일 발송 연결 후 제공 예정이에요. 비밀번호를 안전하게 보관해 주세요.'),info());
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
     const item=node('li'),link=node('a',post.title);
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
  showDialog('마이페이지');dialog.append(node('p',(session.provider||'소셜')+' 계정으로 로그인 중'),nicknameForm());
  const favorites=node('button','내 즐겨찾기','member-menu-action');favorites.type='button';favorites.onclick=()=>{dialog.close();if(homeList){homeList.parentElement.scrollIntoView({behavior:'smooth',block:'center'});}else location.assign('/#memberFavorites');};
  const logout=node('button','로그아웃','member-menu-action');logout.type='button';logout.onclick=async()=>{logout.disabled=true;try{await api('logout',{});session={signedIn:false};favoriteKeys.clear();render();dialog.close();publishChange();say('로그아웃했어요.');}catch(e){logout.disabled=false;say(errorText(e));}};
  dialog.append(favorites,myPosts(),logout);
  const deletion=node('details',undefined,'member-information');deletion.append(node('summary','회원 탈퇴'),node('p','회원 인증 정보와 즐겨찾기가 모두 삭제됩니다. 계속하려면 아래에 ‘회원탈퇴’를 입력하세요.'));
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
  const authButtons=node('div',undefined,'member-auth-buttons');authButtons.append(nav,signup);
  const actions=node('div',undefined,'member-header-actions'),existing=header.lastElementChild;header.dataset.memberPage=document.querySelector('.company-search')?'company':'home';if(existing&&!existing.classList.contains('logo'))actions.append(existing);actions.append(authButtons);header.append(actions);
  dialog=node('dialog',undefined,'member-dialog');dialog.setAttribute('aria-labelledby','memberDialogTitle');dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});document.body.append(dialog);
  toast=node('div',undefined,'member-toast');toast.hidden=true;toast.setAttribute('role','status');document.body.append(toast);
  if(!document.getElementById('app')){const area=node('section',undefined,'member-favorites');area.id='memberFavorites';area.hidden=true;const head=node('div',undefined,'member-favorites-head');head.append(node('h2','내 즐겨찾기'));homeList=node('ul',undefined,'member-favorites-list');const empty=node('p','기업 페이지에서 ☆ 즐겨찾기를 눌러 저장할 수 있어요.','member-favorites-empty');area.append(head,homeList,empty);document.querySelector('main')?.before(area);}
  mountCompany();const app=document.getElementById('app');if(app)new MutationObserver(mountCompany).observe(app,{childList:true,subtree:true});
  await reloadSession();
  if(session.signedIn){let pending;try{pending=JSON.parse(sessionStorage.getItem('sianaly.pendingFavorite')||'null');sessionStorage.removeItem('sianaly.pendingFavorite');}catch{}if(pending?.createdAt>Date.now()-600000&&catalog.has(pending.key)&&!favoriteKeys.has(pending.key))pendingCompany=pending.key;if(!session.nickname)nicknameDialog();else if(pendingCompany){const key=pendingCompany;pendingCompany=null;await changeFavorite(key);}}
  const query=new URLSearchParams(location.search);if(query.has('accountError')){say('로그인을 완료하지 못했어요. 다시 시도해 주세요.');query.delete('accountError');history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash);}
  if(location.hash==='#memberFavorites'&&homeList&&!homeList.parentElement.hidden)homeList.parentElement.scrollIntoView({block:'center'});
  window.addEventListener('storage',event=>{if(event.key==='sianaly.member.changed'){favoriteKeys.clear();session={signedIn:false};render();reloadSession();}});
  window.addEventListener('pageshow',event=>{if(event.persisted){favoriteKeys.clear();session={signedIn:false};render();reloadSession();}});
 }
 init();
})();
