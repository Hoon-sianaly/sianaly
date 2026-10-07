// Bump this release when deploying catalog or company JSON changes.
const COMPANY_DATA_VERSION = "20261007-adaptive-units-1";
const companyDataCache = new Map();
let companyCatalogPromise;

async function readCompanyJSON(path) {
 const response = await fetch(`${path}?v=${COMPANY_DATA_VERSION}`);
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
 return {...record, financials:parent.financials, financialSources:parent.sources};
}

function financialDisplayUnit(value) {
 const magnitude=Math.abs(value);
 if (magnitude >= 1) return {label:"조원",factor:1};
 if (magnitude >= 0.0001) return {label:"억원",factor:10000};
 if (magnitude >= 0.00000001) return {label:"만원",factor:100000000};
 return {label:"원",factor:1000000000000};
}

function formatFinancialNumber(value, maximumFractionDigits=2) {
 return Number(value).toLocaleString("ko-KR",{maximumFractionDigits});
}

function formatFinancialHighlight(value) {
 if (value == null || !Number.isFinite(value)) return "-";
 const unit=financialDisplayUnit(value);
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
  annual:annual.map(row => ({...row,period:String(row.year)})),
  quarterly:quarterly.map(row => ({...row,period:`${row.quarter}Q ${row.year}`})),
  allQuarters,
  latestQuarter, quarterlyYear:latestQuarter?.year || "",
  latestYear:String(latest?.year || ""),
  latestSales:formatFinancialHighlight(latest?.sales, financials.highlightFormat),
  latestOp:formatFinancialHighlight(latest?.op, financials.highlightFormat),
  latestNet:latest?.net == null ? null : formatFinancialHighlight(latest.net),
  financialBasis:financials.basis === "consolidated" ? "K-IFRS 연결 기준" : "K-IFRS 별도 기준",
  financialMetrics:financials.metrics || {
   sales:{label:"매출",help:"제품과 서비스를 팔아 얻은 전체 금액"},
   op:{label:"영업이익",help:"매출에서 매출원가와 판매·관리 비용 등을 차감한 본업의 이익"}
  },
  verifiedAt:financials.verification.verifiedAt,
  sourceLinks, sources:record.sources.map(source => source.label),
  annualSourceIds:[...new Set(annual.flatMap(row => row.sourceIds))],
  latestAnnualSourceId:latest?.sourceIds[0],
  quarterlySourceIds:[...new Set(quarterly.flatMap(row => row.sourceIds))],
  sectionSourceIds:record.sectionSourceIds,
  glossary:record.glossary, presentation:record.presentation
 };
}

async function loadCompanyData(key) {
 const record = await loadCompanyRecord(key);
 return record ? companyPageData(record) : null;
}
