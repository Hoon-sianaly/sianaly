const escapeAttribute = value => String(value)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const textList = values => (Array.isArray(values) ? values : [])
  .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim());

function formatTrillionKRW(value) {
  if (!Number.isFinite(value)) return null;
  const abs = Math.abs(value), sign = value < 0 ? '-' : '';
  if (abs >= 1) return `${sign}${abs.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}조원`;
  return `${sign}${Math.round(abs * 10000).toLocaleString('ko-KR')}억원`;
}

// Plain HTML for crawlers, link previews and text-only readers. company.html replaces it on load.
function companySummaryHTML(record, name) {
  const { profile = {}, overview = {}, financials = {} } = record;
  const parts = [`<section class="empty" role="status" data-company="${escapeAttribute(profile.key)}"><h1>${escapeAttribute(name)}</h1>`];
  const meta = [profile.ticker, profile.type].filter(value => typeof value === 'string' && value.trim());
  if (meta.length) parts.push(`<p>${meta.map(escapeAttribute).join(' · ')}</p>`);
  if (typeof overview.short === 'string' && overview.short.trim()) parts.push(`<p>${escapeAttribute(overview.short.trim())}</p>`);
  const takeaways = textList(overview.takeaways);
  if (takeaways.length) parts.push(`<h2>${escapeAttribute(name)} 한눈에 보기</h2><ol>${takeaways.map(line => `<li>${escapeAttribute(line)}</li>`).join('')}</ol>`);
  const business = (Array.isArray(overview.business) ? overview.business : []).filter(item => typeof item?.name === 'string');
  if (business.length) {
    parts.push(`<h2>주요 사업</h2><ul>${business.map(item => `<li><strong>${escapeAttribute(item.name)}</strong>${typeof item.desc === 'string' ? ` · ${escapeAttribute(item.desc)}` : ''}</li>`).join('')}</ul>`);
  }
  const annual = Array.isArray(financials.annual) ? financials.annual : [];
  const latest = financials.unit === 'KRW_trillion' && !financials.metrics
    ? [...annual].reverse().find(row => Number.isFinite(row?.sales) && Number.isFinite(row?.op) && !row.partialPeriod) : null;
  if (latest) {
    const basis = financials.basis === 'separate' ? '별도' : '연결';
    parts.push(`<p>${latest.year}년 연간 실적(${basis} 기준): 매출 ${formatTrillionKRW(latest.sales)}, 영업이익 ${formatTrillionKRW(latest.op)}</p>`);
  }
  parts.push('<p>기업 정보를 불러오는 중입니다.</p></section>');
  return parts.join('');
}

// The page renders "기업 정보를 찾을 수 없습니다" itself; tell crawlers it is a real 404, not a soft one.
function companyNotFound(page) {
  const headers = new Headers(page.headers);
  headers.set('X-Robots-Tag', 'noindex');
  headers.set('Cache-Control', 'no-store');
  return new Response(page.body, { status: 404, headers });
}

async function withCompanyTitle({ env, next }, url) {
  const page = await next();
  const key = url.searchParams.get('company');
  if (key === null || page.status !== 200 ||
      !page.headers.get('Content-Type')?.startsWith('text/html')) {
    return page;
  }
  if (!/^[a-z0-9_-]+$/.test(key)) return companyNotFound(page);

  let record;
  try {
    const response = await env.ASSETS.fetch(new URL(`/data/companies/${key}.json`, url));
    // Pages answers unknown paths with an HTML fallback, so only a JSON response counts as found.
    if (!response.ok || !response.headers.get('Content-Type')?.includes('json')) return companyNotFound(page);
    record = await response.json();
  } catch {
    return page;
  }
  const name = record?.profile?.name;
  if (typeof name !== 'string' || !name.trim()) return page;

  const title = `한눈에 보는 ${name} | SIANALY`;
  const summary = typeof record.overview?.short === 'string' && record.overview.short.trim()
    ? record.overview.short.trim() : `${name}의 사업과 실적`;
  const description = `${name}: ${summary}. 주요 사업, 연간·분기 실적과 핵심 변수를 공식 공시 출처와 함께 쉽게 정리했습니다.`;
  // A preferred share has no business or figures of its own (financials.companyRef points to the common
  // stock), so search engines should treat the common stock's page as the original.
  const canonicalKey = typeof record.financials?.companyRef === 'string' && /^[a-z0-9_-]+$/.test(record.financials.companyRef)
    ? record.financials.companyRef : key;
  const canonical = `https://sianaly.com/company?company=${encodeURIComponent(canonicalKey)}`;
  const pageURL = `https://sianaly.com/company?company=${encodeURIComponent(key)}`;
  const replaceContent = value => ({ element(meta) { meta.setAttribute('content', value); } });
  return new HTMLRewriter()
    .on('head > title', {
      element(element) { element.setInnerContent(title); },
    })
    .on('meta[name="description"]', replaceContent(description))
    .on('meta[property="og:title"]', replaceContent(title))
    .on('meta[property="og:description"]', replaceContent(description))
    .on('meta[property="og:url"]', replaceContent(pageURL))
    .on('#app', {
      element(app) { app.setInnerContent(companySummaryHTML(record, name), { html: true }); },
    })
    .on('head', {
      element(head) { head.append(`<link rel="canonical" href="${escapeAttribute(canonical)}">`, { html: true }); },
    })
    .transform(page);
}

export function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '');

  const communityEnabled = url.hostname === 'sianaly.com' || url.hostname === 'dev.sianaly.com' || url.hostname === 'codex-dev.sianaly.pages.dev';

  if (!communityEnabled && (pathname === '/api/account' || pathname.startsWith('/api/account/'))) {
    return Response.json({ code: 'unavailable' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (!communityEnabled && /^\/(board|reports)(\.html)?$/.test(pathname)) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Cache-Control': 'no-store' },
    });
  }

  if ((request.method === 'GET' || request.method === 'HEAD') &&
      (pathname === '/company' || pathname === '/company.html')) {
    return withCompanyTitle(context, url);
  }

  return next();
}
