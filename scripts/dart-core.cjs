const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dart-output');
function amount(v){if(typeof v!=='string'||!v.trim()||!/^[-]?\d+$/.test(v.replaceAll(',','').trim()))throw Error('Missing or invalid financial amount');return BigInt(v.replaceAll(',','').trim());}
async function api(endpoint,params={},binary=false){
 const key=process.env.OPENDART_API_KEY;
 if(!/^[a-f0-9]{40}$/i.test(key||''))throw Error('OpenDART key not configured');
 const url=new URL('https://opendart.fss.or.kr/api/'+endpoint);
 url.search=new URLSearchParams({crtfc_key:key,...params});
 let response;try{response=await fetch(url,{signal:AbortSignal.timeout(binary?180000:45000),redirect:'error'});}catch{throw Error('OpenDART connection failed or timed out');}
 if(!response.ok)throw Error('OpenDART HTTP '+response.status);
 if(binary){try{return Buffer.from(await response.arrayBuffer());}catch{throw Error('OpenDART corporate download failed or timed out');}}
 let p;try{p=await response.json();}catch{throw Error('Invalid OpenDART JSON');}
 if(!['000','013'].includes(p.status))throw Error('OpenDART status '+String(p.status||'missing'));
 return p;
}
function unzipXML(buffer){
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){
  if(buffer.readUInt32LE(i)!==0x06054b50)continue;
  let cursor=buffer.readUInt32LE(i+16),count=buffer.readUInt16LE(i+10);
  for(let n=0;n<count;n++){
   if(buffer.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid ZIP directory');
   const method=buffer.readUInt16LE(cursor+10),size=buffer.readUInt32LE(cursor+20),length=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),local=buffer.readUInt32LE(cursor+42);
   const name=buffer.subarray(cursor+46,cursor+46+length).toString();
   if(name.toUpperCase()==='CORPCODE.XML'){
    if(buffer.readUInt32LE(local)!==0x04034b50)throw Error('Invalid ZIP entry');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),raw=buffer.subarray(start,start+size);
    return (method===8?zlib.inflateRawSync(raw,{maxOutputLength:100000000}):method===0?raw:(()=>{throw Error('Unsupported ZIP method');})()).toString('utf8');
   }
   cursor+=46+length+extra+comment;
  }
 }
 throw Error('OpenDART corporate ZIP not found');
}
function corporateMap(xml){
 const map=new Map();
 for(const block of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)){
  const read=tag=>block[1].match(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>'))?.[1]?.trim();
  const ticker=read('stock_code'),corpCode=read('corp_code');
  if(!/^[0-9A-Z]{6}$/.test(ticker||''))continue;
  if(!/^\d{8}$/.test(corpCode||''))throw Error('Invalid corporate code');
  if(map.has(ticker))throw Error('Duplicate corporate stock code');
  map.set(ticker,{corpCode,corpName:read('corp_name'),modified:read('modify_date')});
 }
 return map;
}
function registryFromXML(xml,catalog,records){
 const map=corporateMap(xml);
 return {schemaVersion:2,source:'https://opendart.fss.or.kr/api/corpCode.xml',companies:catalog.companies.map(c=>{
  const f=records[c.key].financials;
  if(f.companyRef)return {key:c.key,ticker:c.ticker,companyRef:f.companyRef,mode:'shared'};
  const corp=map.get(c.ticker);if(!corp)throw Error('Missing corporate identity: '+c.key);
  return {key:c.key,ticker:c.ticker,...corp,fsDiv:f.basis==='separate'?'OFS':'CFS',currency:'KRW',salesLabel:f.metrics?.sales.label||'매출',opLabel:f.metrics?.op.label||'영업이익',mode:'pending-validation'};
 })};
}
const selectors={
 revenue:{ids:['ifrs-full_Revenue','ifrs_Revenue'],names:['매출액','매출','수익(매출액)','영업수익','수익']},
 operating:{ids:['dart_OperatingIncomeLoss','ifrs-full_ProfitLossFromOperatingActivities'],names:['영업이익','영업이익(손실)','영업손익']},
 net:{ids:['ifrs-full_ProfitLoss','ifrs_ProfitLoss'],names:[]},
 ownerNet:{ids:['ifrs-full_ProfitLossAttributableToOwnersOfParent'],names:['지배기업의소유주에게귀속되는당기순이익','지배기업소유주지분순이익','지배기업소유주지분','지배주주지분순이익','지배기업의소유주']},
 interest:{ids:['dart_InterestIncomeExpense','ifrs-full_InterestRevenueExpense'],names:['순이자손익','순이자이익','이자손익']},
 insuranceRevenue:{ids:['ifrs-full_InsuranceRevenue'],names:['보험수익']},
 insuranceProfit:{ids:['ifrs-full_InsuranceServiceResult'],names:['보험서비스손익','보험서비스결과','보험서비스이익']},
 sga:{ids:['dart_TotalSellingGeneralAdministrativeExpenses','ifrs-full_SellingGeneralAndAdministrativeExpense','ifrs-full_GeneralAndAdministrativeExpense'],names:['판매비와관리비','판매비및관리비','판매관리비','일반관리비']}
};
function pick(rows,selector,field,optional=false){
 const matched=rows.filter(r=>selector.ids.includes(r.account_id));
 const chosen=matched.length?matched:rows.filter(r=>selector.names.includes(r.account_nm?.replace(/\s/g,'')));
 if(!chosen.length){if(optional)return null;throw Error('Account not found: '+field);}
 const values=chosen.map(r=>amount(r.thstrm_amount));
 if(values.some(v=>v!==values[0]))throw Error('Conflicting accounts: '+field);
 return {value:values[0],rows:chosen};
}
function normalize(payload,company,{year,report}){
 if(payload.status!=='000')throw Error('No financial statements');
 const rows=(payload.list||[]).filter(r=>['IS','CIS'].includes(r.sj_div));
 if(!rows.length)throw Error('Missing income statement');
 for(const r of rows){if(r.corp_code!==company.corpCode||r.bsns_year!==String(year)||r.reprt_code!==report||r.currency!==company.currency||r.fs_div&&r.fs_div!==company.fsDiv||!/^\d{14}$/.test(r.rcept_no))throw Error('Company, period, basis, currency or receipt mismatch');}
 const opSelector=/지배주주/.test(company.opLabel)?selectors.ownerNet:selectors.operating;
 const op=pick(rows,opSelector,'op');let sales;
 const label=company.salesLabel;
 if(label==='매출')sales=pick(rows,selectors.revenue,'sales');
 else if(label==='순이자이익'){
  sales=pick(rows,selectors.interest,'sales',true);
  if(!sales){const income=pick(rows,{ids:['ifrs-full_RevenueFromInterest'],names:[]},'interest-income'),expense=pick(rows,{ids:['ifrs-full_InterestExpense'],names:[]},'interest-expense');sales={value:income.value-expense.value,rows:[...income.rows,...expense.rows]};}
 }
 else if(label==='보험수익')sales=pick(rows,selectors.insuranceRevenue,'sales');
 else if(label==='보험서비스손익')sales=pick(rows,selectors.insuranceProfit,'sales');
 else if(label==='판관비 차감 전 영업손익'){
  const sga=pick(rows,selectors.sga,'sga');sales={value:op.value+sga.value,rows:[...op.rows,...sga.rows]};
 }else if(company.key==='kb'&&label==='총영업이익'){
  const sga=pick(rows,selectors.sga,'sga'),credit=pick(rows,{ids:['ifrs-full_ImpairmentLossImpairmentGainAndReversalOfImpairmentLossDeterminedInAccordanceWithIFRS9'],names:[]},'credit-loss');sales={value:op.value+sga.value+credit.value,rows:[...op.rows,...sga.rows,...credit.rows]};
 }else if(company.key==='meritz'&&label==='순영업수익'){
  // Meritz presents this expense with opposite signs across reports; add its cost magnitude.
  const sga=pick(rows,selectors.sga,'sga');sales={value:op.value+(sga.value<0n?-sga.value:sga.value),rows:[...op.rows,...sga.rows]};
 }else sales=pick(rows,{ids:[],names:[label.replace(/\s/g,'')]},'sales');
 const net=pick(rows,selectors.net,'net',true),selected=[...sales.rows,...op.rows,...(net?.rows||[])];
 if(selected.some(r=>r.rcept_no!==selected[0].rcept_no))throw Error('Mixed receipts');
 const quarter={11013:1,11012:2,11014:3}[report],rawKRW={sales:sales.value.toString(),op:op.value.toString(),...(net?{net:net.value.toString()}: {})};
 return {year,...(quarter?{quarter}:{}),sales:Number(sales.value)/1e12,op:Number(op.value)/1e12,...(net?{net:Number(net.value)/1e12}:{}),rawKRW,currency:company.currency,basis:company.fsDiv==='CFS'?'consolidated':'separate',receipt:selected[0].rcept_no,periodBasis:quarter?'three-month':'annual',accounts:{sales:sales.rows.map(r=>r.account_id),op:op.rows.map(r=>r.account_id),...(net?{net:net.rows.map(r=>r.account_id)}:{})}};
}
async function financial(company,period,{cache=false}={}){
 const file=path.join(out,'cache',`${company.corpCode}-${period.year}-${period.report}-${company.fsDiv}.json`);
 if(cache&&fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
 const p=await api('fnlttSinglAcntAll.json',{corp_code:company.corpCode,bsns_year:String(period.year),reprt_code:period.report,fs_div:company.fsDiv});
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(p)+'\n');return p;
}
function tolerance(old){
 if(old===0)return 1e-10;
 const s=String(old),digits=s.includes('.')?s.split('.')[1].length:0;
 return Math.min(.05,.5*10**(-digits))+1e-10;
}
function compare(row,record){
 const old=(row.quarter?record.financials.quarterly:record.financials.annual).find(r=>r.year===row.year&&r.quarter===row.quarter);
 if(!old)return {status:'new-period',differences:[]};
 const differences=['sales','op',...(!row.quarter&&old.net!==undefined?['net']:[])].map(field=>({field,existing:old[field],dart:row[field]??null,difference:row[field]===undefined?null:row[field]-old[field],tolerance:tolerance(old[field])}));
 return {status:differences.every(d=>d.difference!==null&&Math.abs(d.difference)<=d.tolerance)?'compatible':'review-required',differences};
}
module.exports={amount,api,unzipXML,corporateMap,registryFromXML,normalize,financial,compare,tolerance,root,out};
