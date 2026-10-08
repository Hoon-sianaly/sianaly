const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const config=require('../data/dart-companies.json').companies.find(c=>c.key==='samsung');
function amount(value){
 if(typeof value!=='string'||!value.trim())throw Error('Missing financial amount; refusing to use zero.');
 const clean=value.replace(/,/g,'').trim();if(!/^-?\d+$/.test(clean))throw Error('Invalid financial amount.');return BigInt(clean);
}
function normalize(payload,{year,report}){
 if(payload.status!=='000')throw Error('OpenDART status '+String(payload.status||'missing')+'; no website changes.');
 if(!Array.isArray(payload.list)||!payload.list.length)throw Error('Empty financial statement.');
 const rows=payload.list.filter(r=>['IS','CIS'].includes(r.sj_div));
 function pick(ids,names,required=true){const candidates=rows.filter(r=>ids.includes(r.account_id));const selected=candidates.length?candidates:rows.filter(r=>names.includes(r.account_nm?.replace(/\s/g,'')));if(!selected.length){if(!required)return null;throw Error('Required financial account not found.');}
  for(const r of selected){if(r.corp_code!==config.corpCode||r.bsns_year!==String(year)||r.reprt_code!==report||r.currency!==config.currency||!/^\d{14}$/.test(r.rcept_no))throw Error('Company, period, currency or receipt mismatch.');}
  const amounts=selected.map(r=>amount(r.thstrm_amount));if(amounts.some(v=>v!==amounts[0]))throw Error('Conflicting financial accounts.');return selected[0];
 }
 const sales=pick(['ifrs-full_Revenue','ifrs_Revenue'],['매출액','매출','수익(매출액)']);
 const op=pick(['dart_OperatingIncomeLoss'],['영업이익','영업이익(손실)','영업손익']);
 const net=pick(['ifrs-full_ProfitLoss','ifrs_ProfitLoss'],[],false);
 if(sales.rcept_no!==op.rcept_no)throw Error('Mixed report receipts.');
 if(net&&net.rcept_no!==sales.rcept_no)throw Error('Mixed report receipts.');
 const quarter={'11013':1,'11012':2,'11014':3}[report];
 const convert=v=>Number(v)/1e12;
 return {year,...(quarter?{quarter}:{}),sales:convert(amount(sales.thstrm_amount)),op:convert(amount(op.thstrm_amount)),...(net?{net:convert(amount(net.thstrm_amount))}:{}),rawKRW:{sales:amount(sales.thstrm_amount).toString(),op:amount(op.thstrm_amount).toString(),...(net?{net:amount(net.thstrm_amount).toString()}: {})},currency:'KRW',basis:'consolidated',receipt:sales.rcept_no,sourceUrl:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+sales.rcept_no,periodBasis:quarter?'three-month':'annual',accounts:{sales:sales.account_id,op:op.account_id,...(net?{net:net.account_id}: {})}};
}
async function fetchReport({year,report,allowMissing=false}){
 const apiKey=process.env.OPENDART_API_KEY;if(!/^[0-9a-fA-F]{40}$/.test(apiKey||''))throw Error('Missing key. Use the PowerShell setup and check scripts.');
 const url=new URL('https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json');url.search=new URLSearchParams({crtfc_key:apiKey,corp_code:config.corpCode,bsns_year:String(year),reprt_code:report,fs_div:config.fsDiv});
 let response;try{response=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});}catch{throw Error('DART connection failed or timed out. Key and request URL were not logged.');}if(!response.ok)throw Error('DART HTTP status '+response.status);let payload;try{payload=await response.json();}catch{throw Error('DART returned invalid JSON.');}
 if(allowMissing&&payload.status==='013')return null;
 return normalize(payload,{year,report});
}
function compare(row,record){const existing=(row.quarter?record.financials.quarterly:record.financials.annual).find(r=>r.year===row.year&&(!row.quarter||r.quarter===row.quarter));if(!existing)return {status:'new-period',differences:[]};
 const differences=['sales','op'].map(field=>({field,existing:existing[field],dart:row[field],difference:row[field]-existing[field]}));
 // Company IR amounts may be rounded to 0.1 trillion. Differences still require review.
 return {status:differences.every(d=>Math.abs(d.difference)<1e-9)?'match':'review-required',differences};
}
async function main(){const args=process.argv.slice(2);const read=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};const year=Number(read('--year','2025')),report=read('--report','11011');if(!Number.isInteger(year)||year<2015||year>new Date().getFullYear()||!['11011','11012','11013','11014'].includes(report))throw Error('Invalid year or report.');
 const row=await fetchReport({year,report}),record=JSON.parse(fs.readFileSync(path.join(root,'data/companies/samsung.json'),'utf8')),comparison=compare(row,record),result={schemaVersion:1,key:'samsung',collectedAt:new Date().toISOString(),...row,comparison,websiteModified:false};
 const output=path.join(root,'dart-output');fs.mkdirSync(output,{recursive:true});const file=path.join(output,`samsung-${year}-${report}.json`);fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(`Samsung DART check complete: ${year} ${row.quarter?'Q'+row.quarter:'annual'}; ${comparison.status}.`);console.log('Candidate saved locally. Website data was not changed.');
}
module.exports={amount,normalize,compare,fetchReport};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
