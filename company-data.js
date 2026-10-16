// Bump this release when deploying catalog or company JSON changes.
const COMPANY_DATA_VERSION = "20261016-kosdaq1500-1";
const companyDataCache = new Map();
const financialHistoryCache = new Map();
let companyCatalogPromise;

async function readCompanyJSON(path) {
 const response = await fetch(`${path}?v=${COMPANY_DATA_VERSION}`, {cache:'no-cache'});
 if (!response.ok) throw new Error(`기업 데이터를 불러오지 못했습니다 (${response.status}).`);
 const data = await response.json();
 if (data.schemaVersion !== 1) throw new Error("지원하지 않는 기업 데이터 형식입니다.");
 return data;
}

function loadCompanyCatalog() {
 if (!companyCatalogPromise) companyCatalogPromise = readCompanyJSON("data/company-index.json");
 return companyCatalogPromise;
}

async function loadCompanyRecord(key, ancestors = []) {
 if (ancestors.includes(key)) throw new Error("회사 실적 참조가 순환합니다.");
 const catalog = await loadCompanyCatalog();
 const entry = catalog.companies.find(company => company.key === key);
 if (!entry) return null;
 if (!companyDataCache.has(key)) companyDataCache.set(key, readCompanyJSON(`data/companies/${entry.file}`));
 const record = await companyDataCache.get(key);
 if (record.profile.key !== key) throw new Error("기업 식별자가 일치하지 않습니다.");
 if (!record.financials.companyRef) return record;
 const parent = await loadCompanyRecord(record.financials.companyRef, [...ancestors, key]);
 if (!parent) throw new Error("참조한 회사의 실적이 없습니다.");
 return {...record, financials:parent.financials, financialSources:parent.sources,financialHistoryIdentity:parent.financialHistoryIdentity||{key:parent.profile.key,ticker:parent.profile.ticker}};
}

async function addFinancialHistory(record) {
 const identity=record.financialHistoryIdentity||record.profile;
 const shard=[...identity.key].reduce((n,ch)=>(n+ch.charCodeAt(0))%16,0).toString(16);
 try {
  if(!financialHistoryCache.has(shard))financialHistoryCache.set(shard,readCompanyJSON(`data/history/${shard}.json`));
  const data=await financialHistoryCache.get(shard),history=data.companies[identity.key];
  if(!history)return record;
  if(history.ticker!==identity.ticker||history.basis!==record.financials.basis||history.currency!==(record.financials.currency||'KRW'))throw Error('과거 실적의 기업·통화·재무 범위가 일치하지 않습니다.');
  const f=record.financials,anchor=row=>row?{sales:row.sales,op:row.op,sourceIds:row.sourceIds}:null;
  const current={annual2025:anchor(f.annual.find(q=>q.year===2025)),quarter2025Q2:anchor(f.quarterly.find(q=>q.year===2025&&q.quarter===2)),quarter2026Q2:anchor(f.quarterly.find(q=>q.year===2026&&q.quarter===2))};
  if(JSON.stringify(current)!==JSON.stringify(history.anchors))return {...record,historyStatus:'baseline-changed'};
  const merge=(primary,extra)=>[...primary,...extra.filter(row=>!primary.some(p=>p.year===row.year&&p.quarter===row.quarter))];
  const sources=[...(record.financialSources||record.sources),...history.sources];
  return {...record,financials:{...f,annual:merge(f.annual,history.annual),quarterly:merge(f.quarterly,history.quarterly)},...(record.financialSources?{financialSources:sources}:{sources}),historyStatus:'loaded',historyIssues:history.issues,historyAsOf:data.asOf.replaceAll('-','.')};
 } catch {return {...record,historyStatus:'unavailable'};}
}

function financialDisplayUnit(value, currency) {
 if(currency==="USD"||currency==="CNY"||currency==="JPY"||currency==="GBP"){const a=Math.abs(value),name=currency==="USD"?"달러":currency==="CNY"?"위안":currency==="GBP"?"파운드":"엔";if(a>=0.0001)return{label:"억"+name,factor:10000};if(a>=0.00000001)return{label:"만"+name,factor:100000000};return{label:name,factor:1000000000000};}
 const magnitude=Math.abs(value);
 if (magnitude >= 1) return {label:"조원",factor:1};
 if (magnitude >= 0.0001) return {label:"억원",factor:10000};
 if (magnitude >= 0.00000001) return {label:"만원",factor:100000000};
 return {label:"원",factor:1000000000000};
}

function formatFinancialNumber(value, maximumFractionDigits=2) {
 return Number(value).toLocaleString("ko-KR",{maximumFractionDigits});
}

function formatFinancialHighlight(value, currency) {
 if (value == null || !Number.isFinite(value)) return "-";
 const unit=financialDisplayUnit(value,currency);
 if (value !== 0 && Math.abs(value*unit.factor)<1) return (value*unit.factor).toLocaleString("ko-KR",{maximumSignificantDigits:3})+unit.label;
 return formatFinancialNumber(value*unit.factor,unit.label==="조원"?2:0)+unit.label;
}

function companyPageData(record) {
 const financials = record.financials;
 const annual = [...financials.annual].sort((a,b) => a.year-b.year);
 const allQuarters = [...financials.quarterly].sort((a,b) => a.year-b.year || a.quarter-b.quarter);
 const latest = annual.at(-1), latestQuarter = allQuarters.at(-1);
 const quarterly = allQuarters.filter(row => row.year === latestQuarter?.year);
 const sourceList = [...(record.financialSources || []), ...record.sources];
 const sourceLinks = Object.fromEntries(sourceList.filter(source => source.url).map(source => [source.id,source]));
 return {
  ...record.profile, ...record.overview, ...record.market,
  marketDate:record.market.date,
  annual:annual.map(row => ({...row,period:row.periodLabel || String(row.year)})),
  quarterly:quarterly.map(row => ({...row,period:row.periodLabel || `${row.quarter}Q ${row.year}`})),
  allQuarters,
  latestQuarter, quarterlyYear:latestQuarter?.year || "",
  latestYear:String(latest?.year || ""),
  annualPeriodLabel:latest?.reportPeriod || "",
  annualTerm:financials.annualTerm || "연간",
  annualSourceLabel:financials.annualSourceLabel || "공식 연간 실적 자료",
  financialAvailability:financials.availability || null,
  financialCurrency:financials.currency || "KRW",
  quarterlyCalendarNote:financials.quarterlyCalendarNote || "",
  quarterlyTerm:financials.quarterlyTerm || "분기",
  quarterlyBasisLabel:financials.quarterlyBasisLabel || "각 분기 3개월 실적(누적 아님)",
  latestSales:formatFinancialHighlight(latest?.sales, financials.highlightFormat),
  latestOp:formatFinancialHighlight(latest?.op, financials.highlightFormat),
  latestNet:latest?.net == null ? null : formatFinancialHighlight(latest.net,financials.highlightFormat),
  financialBasis:(financials.accountingStandard || "K-IFRS")+(financials.basis === "consolidated" ? " 연결 기준" : " 별도 기준"),
  financialMetrics:financials.metrics || {
   sales:{label:"매출",help:"제품과 서비스를 팔아 얻은 전체 금액"},
   op:{label:"영업이익",help:"매출에서 매출원가와 판매·관리 비용 등을 차감한 본업의 이익"}
  },
  verifiedAt:financials.verification.verifiedAt,
  historyStatus:record.historyStatus,historyIssues:record.historyIssues||[],historyAsOf:record.historyAsOf,
  sourceLinks, sources:record.sources.map(source => source.label),
  annualSourceIds:[...new Set(annual.flatMap(row => row.sourceIds))],
  latestAnnualSourceId:latest?.sourceIds[0],
  quarterlySourceIds:[...new Set(quarterly.flatMap(row => row.sourceIds))],
  sectionSourceIds:record.sectionSourceIds,
  glossary:record.glossary.filter(term => term.name.replace(/\s/g, "") !== "연결기준"), presentation:record.presentation
 };
}

async function loadCompanyData(key) {
 let record = await loadCompanyRecord(key);
 if(record)record=await addFinancialHistory(record);
 return record ? companyPageData(record) : null;
}
