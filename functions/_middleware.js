const escapeAttribute = value => String(value)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  const canonical = `https://sianaly.com/company?company=${encodeURIComponent(key)}`;
  const replaceContent = value => ({ element(meta) { meta.setAttribute('content', value); } });
  return new HTMLRewriter()
    .on('head > title', {
      element(element) { element.setInnerContent(title); },
    })
    .on('meta[name="description"]', replaceContent(description))
    .on('meta[property="og:title"]', replaceContent(title))
    .on('meta[property="og:description"]', replaceContent(description))
    .on('meta[property="og:url"]', replaceContent(canonical))
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
