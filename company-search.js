(function initCompanySearch(){
 const input=document.getElementById("companySearch"),results=document.getElementById("companySearchResults");
 if(!input || !results)return;
 let companies=[],state="loading",matches=[],active=-1;
 const normalize=value=>value.toLowerCase().replace(/\s+/g,"");
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 function close(){results.hidden=true;input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");active=-1;}
 function render(){
  const query=normalize(input.value.trim());active=-1;input.removeAttribute("aria-activedescendant");matches=[];
  if(!query){close();return;}
  if(state!=="ready")results.innerHTML=`<div class="company-search-status" role="status">${state==="loading"?"기업 목록을 불러오는 중입니다.":"기업 목록을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요."}</div>`;
  else {
   matches=companies.filter(company=>[company.name,company.ticker,company.alias||""].some(value=>normalize(value).includes(query)));
   results.innerHTML=matches.length?matches.map((company,i)=>`<a id="companySearchOption${i}" class="company-search-result" role="option" aria-selected="false" href="company.html?company=${encodeURIComponent(company.key)}"><b>${escape(company.name)}</b><span>${escape(company.ticker)} · ${escape(company.market||"KOSPI")}</span></a>`).join(""):'<div class="company-search-status" role="status">검색 결과가 없습니다.</div>';
  }
  results.hidden=false;input.setAttribute("aria-expanded","true");
 }
 function select(index){
  active=index;const options=results.querySelectorAll('[role="option"]');
  options.forEach((option,i)=>option.setAttribute("aria-selected",String(i===active)));
  if(options[active]){input.setAttribute("aria-activedescendant",options[active].id);options[active].scrollIntoView({block:"nearest"});}
 }
 loadCompanyCatalog().then(catalog=>{companies=catalog.companies;state="ready";if(document.activeElement===input)render();}).catch(error=>{console.error(error);state="error";if(document.activeElement===input)render();});
 input.addEventListener("input",render);
 input.addEventListener("focus",render);
 input.addEventListener("keydown",event=>{
  if(event.isComposing || event.keyCode===229)return;
  if(event.key==="Escape"){event.preventDefault();close();return;}
  if(event.key==="ArrowDown" || event.key==="ArrowUp"){
   event.preventDefault();if(results.hidden)render();if(!matches.length)return;
   select(active<0?(event.key==="ArrowDown"?0:matches.length-1):(active+(event.key==="ArrowDown"?1:-1)+matches.length)%matches.length);return;
  }
  if(event.key==="Enter"){
   if(results.hidden || !matches.length)return;event.preventDefault();
   location.href=`company.html?company=${encodeURIComponent(matches[active<0?0:active].key)}`;
  }
 });
 document.addEventListener("click",event=>{if(!event.target.closest(".company-search"))close();});
 document.addEventListener("focusin",event=>{if(!event.target.closest(".company-search"))close();});
})();
