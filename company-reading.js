// Presentation copy only. Financial records, dates, source titles and URLs stay intact.
(function(scope){
 'use strict';
 const irregular={만듭니다:'만듦',어렵습니다:'어려움',쉽습니다:'쉬움',돕습니다:'도움',짓습니다:'지음',팝니다:'팖',엽니다:'엶',쓰입니다:'쓰임',움직입니다:'움직임',보입니다:'보임',높입니다:'높임'};
 function compactCompanyText(value){
  return String(value).replace(/([가-힣]*?(?:입니다|습니다|니다))(?=[.!?](?:\s|$)|\s*$)/g,word=>{
   for(const [ending,replacement]of Object.entries(irregular))if(word.endsWith(ending))return word.slice(0,-ending.length)+replacement;
   if(word.endsWith('입니다'))return word.slice(0,-3);
   if(word.endsWith('습니다'))return word.slice(0,-3)+'음';
   if(word.endsWith('니다')){
    const stem=word.slice(0,-2),last=stem.charCodeAt(stem.length-1)-0xac00;
    if(last>=0&&last<11172&&last%28===17)return stem.slice(0,-1)+String.fromCharCode(0xac00+last-17+16);
   }
   return word;
  }).replace(/\.(?=\s*$)/,'');
 }
 function prepareCompanyCopy(company){
  const map=value=>typeof value==='string'?compactCompanyText(value):Array.isArray(value)?value.map(map):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,map(v)])):value;
  const result={...company};
  for(const key of ['summary','short','takeaways','business','drivers','glossary','financialNote','annualNote','quarterlyNote','quarterlyCalendarNote'])if(company[key]!==undefined)result[key]=map(company[key]);
  return result;
 }
 function companyReadingTerms(company){
  const basics=[
   {name:company.financialMetrics.sales.label,desc:company.financialMetrics.sales.help},
   {name:company.financialMetrics.op.label,desc:company.financialMetrics.op.help},
   {name:'연결 기준',desc:'회사와 지배하는 자회사의 재무 정보를 합친 기준. 회사 사이의 내부 거래는 제거함'},
   {name:'별도 기준',desc:'자회사 실적을 합산하지 않고 해당 회사 자체의 재무 정보만 표시한 기준'},
   {name:'PER',desc:'주가를 주당순이익으로 나눈 값. 현재 주가가 이익의 몇 배인지 보는 지표'},
   {name:'PBR',desc:'주가를 주당순자산으로 나눈 값. 현재 주가가 회계상 순자산의 몇 배인지 보는 지표'},
   {name:'영업이익률',desc:'매출에서 영업이익이 차지하는 비율. 영업이익을 매출로 나눈 뒤 100을 곱해 계산함'},
   {name:'매출원가',desc:'판매한 제품·상품을 만들거나 사들이는 데 직접 들어간 비용'},
   {name:'매출채권',desc:'제품·서비스를 판매하고 아직 받지 못한 대금'},
   {name:'시가총액',desc:'주가에 상장 주식 수를 곱한 값. 주식시장에서 평가한 회사의 전체 주식 가치'}
  ];
  const terms=[...company.glossary,...basics].filter((t,i,all)=>t.name&&t.desc&&all.findIndex(x=>x.name===t.name)===i);
  const aliases={'순이자마진':['NIM'],'보통주자본비율':['CET1'],'보험계약서비스마진':['CSM'],'프로젝트 금융':['PF'],'IFRS 17':['IFRS17'],'연결 기준':['연결기준'],'별도 기준':['별도기준'],'렌털':['렌탈']};
  const entries=new Map();
  terms.forEach((term,index)=>{
   const names=[term.name,...term.name.split(/\s*[·/]\s*/),...term.name.matchAll(/\(([^)]+)\)/g)].flatMap(x=>typeof x==='string'?[x]:[x[1]]);
   const main=term.name.replace(/\s*\([^)]*\)/g,'').trim();names.push(main,...(aliases[main]||[]));
   for(const name of [...names,...names.map(n=>n.replace(/\s/g,''))])if(name.length>1&&!entries.has(name.toUpperCase()))entries.set(name.toUpperCase(),{name,index});
  });
  return {terms,entries:[...entries.values()].sort((a,b)=>b.name.length-a.name.length)};
 }
 function findCompanyTerms(text,entries){
  if(!entries.length)return [];
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const regex=new RegExp(entries.map(e=>escape(e.name)).join('|'),'gi'),byName=new Map(entries.map(e=>[e.name.toUpperCase(),e.index])),matches=[];
  for(const match of text.matchAll(regex)){
   const start=match.index,end=start+match[0].length,name=match[0];
   if(/[A-Za-z]/.test(name[0])&&/[A-Za-z]/.test(text[start-1]||''))continue;
   if(/[A-Za-z]/.test(name.at(-1))&&/[A-Za-z]/.test(text[end]||''))continue;
   if(name==='방산'&&text.slice(start-1,end+1)==='전방산업')continue;
   if(name==='리스'&&['스테인리스','폴리스티렌'].some(word=>{const left=text.lastIndexOf(word,start);return left>=0&&start<left+word.length;}))continue;
   matches.push({start,end,index:byName.get(name.toUpperCase())});
  }
  return matches;
 }
 function initCompanyReading(root,company){
  const {terms,entries}=companyReadingTerms(company),doc=root.ownerDocument;
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
   const parent=node.parentElement;
   if(!parent||parent.closest('script,style,svg,a,button,nav,summary,table,h1,.source-links,.source,.data-freshness,.num,.vcard,.term b'))continue;
   const text=compactCompanyText(node.textContent);node.textContent=text;
   if(parent.closest('.glossary'))continue;
   const matches=findCompanyTerms(text,entries);if(!matches.length)continue;
   const fragment=doc.createDocumentFragment();let offset=0;
   for(const m of matches){
    fragment.append(doc.createTextNode(text.slice(offset,m.start)));
    const button=doc.createElement('button');button.type='button';button.className='inline-term';button.dataset.termIndex=m.index;button.textContent=text.slice(m.start,m.end);
    button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','company-term-memo');
    button.setAttribute('aria-label',button.textContent+' 용어 설명');fragment.append(button);offset=m.end;
   }
   fragment.append(doc.createTextNode(text.slice(offset)));node.replaceWith(fragment);
  }
  const memo=doc.createElement('aside');memo.id='company-term-memo';memo.className='term-memo';memo.hidden=true;memo.tabIndex=-1;memo.setAttribute('role','dialog');memo.setAttribute('aria-labelledby','company-term-title');
  const eyebrow=doc.createElement('small');eyebrow.textContent='용어 메모';
  const title=doc.createElement('strong');title.id='company-term-title';
  const description=doc.createElement('p');
  const dismiss=doc.createElement('button');dismiss.type='button';dismiss.className='term-memo-close';dismiss.textContent='×';dismiss.setAttribute('aria-label','용어 설명 닫기');
  memo.append(eyebrow,title,description,dismiss);doc.body.append(memo);
  let active=null;
  function close(restore=false){const previous=active;memo.hidden=true;active?.setAttribute('aria-expanded','false');active=null;if(restore)previous?.focus({preventScroll:true});}
  function open(button){
   if(active===button){close(true);return;}
   close();active=button;const term=terms[Number(button.dataset.termIndex)];
   title.textContent=term.name;description.textContent=compactCompanyText(term.desc);memo.hidden=false;active.setAttribute('aria-expanded','true');
   const rect=button.getBoundingClientRect(),width=memo.offsetWidth,height=memo.offsetHeight,gap=16;
   memo.style.left=Math.max(gap,Math.min(rect.left,window.innerWidth-width-gap))+'px';
   const below=rect.bottom+8;memo.style.top=Math.max(gap,Math.min(below+height<=window.innerHeight-gap?below:rect.top-height-8,window.innerHeight-height-gap))+'px';
   memo.focus({preventScroll:true});
  }
  root.addEventListener('click',event=>{const button=event.target.closest('.inline-term');if(button)open(button);else if(!memo.contains(event.target))close();});
  doc.addEventListener('click',event=>{if(!memo.contains(event.target)&&!event.target.closest('.inline-term'))close();});
  dismiss.addEventListener('click',()=>close(true));
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();close(true);}});
  window.addEventListener('scroll',()=>close(),{passive:true});window.addEventListener('resize',()=>close());
 }
 Object.assign(scope,{compactCompanyText,prepareCompanyCopy,companyReadingTerms,findCompanyTerms,initCompanyReading});
})(typeof globalThis!=='undefined'?globalThis:this);
