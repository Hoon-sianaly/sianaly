(function(){
 'use strict';
 const categories={financial:'실적·숫자 오류',description:'기업·사업 설명 오류',source:'출처·링크 오류',display:'화면·기능 오류',other:'기타'};
 const statuses={pending:'접수',reviewing:'검토 중',resolved:'처리 완료',dismissed:'보류'};
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const api=async(query='',body,method=body?'POST':'GET')=>{
  const response=await fetch('/api/account/reports'+query,{method,credentials:method==='POST'?'omit':'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.code),{code:data.code});return data;
 };
 function errorText(e){return ({login_required:'운영자 계정으로 로그인해 주세요.',forbidden:'운영자만 확인할 수 있어요.',too_many_attempts:'접수 요청이 많아요. 잠시 후 다시 시도해 주세요.',invalid_report:'오류 유형과 내용(5~2,000자)을 확인해 주세요.'})[e.code]||'접수하지 못했어요. 잠시 후 다시 시도해 주세요.';}
 let dialog;
 function openReport(button){
  if(!dialog){dialog=node('dialog',undefined,'report-dialog');dialog.setAttribute('aria-labelledby','report-title');document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}
  dialog.replaceChildren();const title=node('h2','오류 제보');title.id='report-title';
  const close=node('button','×','report-close');close.type='button';close.setAttribute('aria-label','오류 제보 창 닫기');close.onclick=()=>dialog.close();
  const company=node('p',button.dataset.name,'report-company');
  const form=node('form'),label=node('label','오류 유형'),select=node('select');select.id='report-category';select.name='category';label.htmlFor=select.id;
  const placeholder=node('option','선택해 주세요');placeholder.value='';placeholder.disabled=true;placeholder.selected=true;select.append(placeholder);select.required=true;
  for(const [key,text]of Object.entries(categories)){const option=node('option',text);option.value=key;select.append(option);}
  const bodyLabel=node('label','어떤 내용이 잘못됐나요?'),body=node('textarea');body.id='report-body';bodyLabel.htmlFor=body.id;body.name='body';body.rows=5;body.minLength=5;body.maxLength=2000;body.required=true;body.placeholder='오류가 있는 항목과 내용을 적어 주세요. 참고 자료가 있으면 함께 남겨 주세요.';
  const note=node('p','로그인 없이 제보할 수 있어요. 이름·이메일 등 개인정보는 적지 마세요. 내용은 운영자에게만 전달돼요.','report-help');
  const feedback=node('p','','report-feedback');feedback.setAttribute('role','status');
  const submit=node('button','제보 접수','report-submit');submit.type='submit';
  const requestId=crypto.randomUUID();
  form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;feedback.textContent='접수 중…';try{await api('',{id:requestId,company:button.dataset.company,category:select.value,body:body.value});form.replaceChildren(node('p','제보가 접수됐어요. 내용을 확인하고 검토할게요.','report-success'));const done=node('button','닫기','report-submit');done.type='button';done.onclick=()=>dialog.close();form.append(done);done.focus();}catch(error){feedback.textContent=errorText(error);submit.disabled=false;}};
  form.append(label,select,bodyLabel,body,note,feedback,submit);dialog.append(title,close,company,form);dialog.showModal();
 }
 document.addEventListener('click',e=>{const button=e.target.closest('[data-company-report]');if(button)openReport(button);});
 const management=document.getElementById('report-management');if(!management)return;
 let next=null,busy=false,loaded=false;
 const filters=node('div',undefined,'report-filters'),list=node('div'),feedback=node('p','','report-feedback'),more=node('button','더 보기','report-more');feedback.setAttribute('role','status');more.type='button';more.hidden=true;
 let selected='pending';
 for(const [key,text]of Object.entries(statuses)){const button=node('button',text);button.type='button';button.dataset.status=key;button.setAttribute('aria-pressed',String(key===selected));button.onclick=()=>{if(busy)return;selected=key;for(const b of filters.children)b.setAttribute('aria-pressed',String(b===button));void load(true);};filters.append(button);}
 async function load(reset=false){
  if(busy)return;busy=true;more.disabled=true;feedback.textContent='불러오는 중…';if(reset){next=null;list.replaceChildren();}more.hidden=true;
  try{
   const data=await api('?status='+selected+(next?'&before='+next:''));
   for(const report of data.reports){
    const card=node('article',undefined,'report-card'),heading=node('h2'),link=node('a',catalog.get(report.company_key)?.name||report.company_key);link.href='/company?company='+encodeURIComponent(report.company_key);heading.append(link);
    const date=new Date(report.created_at).toLocaleString('ko-KR'),meta=node('p','#'+report.id+' · '+categories[report.category]+' · '+date,'report-help');
    const content=node('p',report.body,'report-body'),actions=node('div',undefined,'report-actions'),label=node('label','처리 상태'),select=node('select');select.id='report-status-'+report.id;label.htmlFor=select.id;
    for(const [key,text]of Object.entries(statuses)){const option=node('option',text);option.value=key;select.append(option);}select.value=report.status;
    const save=node('button','저장');save.type='button';const result=node('span');result.setAttribute('role','status');
    save.onclick=async()=>{save.disabled=true;result.textContent='';try{await api('',{id:report.id,status:select.value},'PATCH');if(select.value!==selected){card.remove();if(!list.childElementCount)feedback.textContent='이 상태의 제보가 없어요.';}else result.textContent='저장했어요.';}catch{result.textContent='저장하지 못했어요. 다시 시도해 주세요.';}finally{save.disabled=false;}};
    actions.append(label,select,save,result);card.append(heading,meta,content,actions);list.append(card);
   }
   loaded=true;next=data.next;more.hidden=!next;feedback.textContent=list.childElementCount?'':'이 상태의 제보가 없어요.';
  }catch(e){feedback.textContent=errorText(e);more.textContent='다시 시도';more.hidden=false;}
  finally{busy=false;more.disabled=false;}
 }
 const catalog=new Map();
 more.onclick=()=>{more.textContent='더 보기';void load(!loaded);};management.append(filters,feedback,list,more);
 loadCompanyCatalog().then(data=>{for(const c of data.companies)catalog.set(c.key,c);return load(true);}).catch(()=>{feedback.textContent='기업 목록을 불러오지 못했어요. 새로고침해 주세요.';});
})();
