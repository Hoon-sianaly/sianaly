// Home "두 기업 비교하기": choose two companies, then open /compare?a=<key>&b=<key>.
(function initHomeCompare(){
 const form=document.getElementById('homeCompareForm');
 if(!form||typeof loadCompanyCatalog!=='function')return;
 const fields=[...form.querySelectorAll('.hc-field')],submit=form.querySelector('.hc-submit'),keys=['',''];
 const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const normalize=value=>value.toLowerCase().replace(/\s+/g,'');
 const CHOSUNG='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',toChosung=v=>[...v].map(ch=>{const code=ch.charCodeAt(0)-44032;return code>=0&&code<11172?CHOSUNG[Math.floor(code/588)]:ch}).join('');
 let companies=[];
 loadCompanyCatalog().then(catalog=>{companies=catalog.companies;}).catch(()=>{});
 function find(query){
  const q=normalize(query);if(!q)return [];
  const chosung=/^[ㄱ-ㅎ]+$/.test(q);
  return companies.filter(c=>chosung?[c.name,c.alias||''].some(v=>toChosung(normalize(v)).includes(q)):[c.name,c.ticker,c.alias||''].some(v=>normalize(v).includes(q))).slice(0,7);
 }
 function update(){submit.disabled=!(keys[0]&&keys[1]&&keys[0]!==keys[1]);}
 fields.forEach((field,slot)=>{
  const input=field.querySelector('input'),list=field.querySelector('.hc-results'),clear=field.querySelector('.hc-clear');
  let matches=[],active=-1;
  const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;};
  function choose(company){
   keys[slot]=company.key;input.value=company.name;field.classList.add('is-chosen');close();update();
   const next=fields[slot+1]?.querySelector('input');
   if(next&&!keys[slot+1])next.focus();else if(!submit.disabled)submit.focus();
  }
  function render(){
   matches=find(input.value);active=-1;
   if(!input.value.trim()){close();return;}
   list.innerHTML=!companies.length?'<p>기업 목록을 불러오는 중입니다.</p>':matches.length?matches.map((c,i)=>`<button type="button" role="option" data-index="${i}">${esc(c.name)}<small>${esc(c.ticker)} · ${c.market==='KOSDAQ'?'코스닥':'코스피'}</small></button>`).join(''):'<p>검색 결과가 없습니다.</p>';
   list.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',()=>{keys[slot]='';field.classList.remove('is-chosen');update();render();});
  input.addEventListener('focus',()=>{if(!keys[slot]&&input.value.trim())render();});
  input.addEventListener('keydown',event=>{
   if(event.key==='Escape'){close();return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    if(list.hidden||!matches.length)return;event.preventDefault();
    active=(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;
    list.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('is-active',i===active));return;
   }
   if(event.key==='Enter'&&!keys[slot]){event.preventDefault();const pick=matches[Math.max(active,0)];if(pick)choose(pick);}
  });
  list.addEventListener('mousedown',event=>event.preventDefault());
  list.addEventListener('click',event=>{const button=event.target.closest('[data-index]');if(button)choose(matches[Number(button.dataset.index)]);});
  clear.addEventListener('click',()=>{keys[slot]='';input.value='';field.classList.remove('is-chosen');update();input.focus();});
  input.addEventListener('blur',()=>setTimeout(close,120));
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(submit.disabled)return;
  location.href=`/compare?a=${encodeURIComponent(keys[0])}&b=${encodeURIComponent(keys[1])}`;
 });
 update();
})();
