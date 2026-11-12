async function withCompanyTitle({ env, next }, url) {
  const page = await next();
  const key = url.searchParams.get('company');
  if (!key || !/^[a-z0-9_-]+$/.test(key) || page.status !== 200 ||
      !page.headers.get('Content-Type')?.startsWith('text/html')) {
    return page;
  }

  let name;
  try {
    const record = await env.ASSETS.fetch(new URL(`/data/companies/${key}.json`, url));
    if (!record.ok) return page;
    name = (await record.json()).profile?.name;
  } catch {
    return page;
  }
  if (typeof name !== 'string' || !name.trim()) return page;

  const canonical = `https://sianaly.com/company?company=${encodeURIComponent(key)}`;
  return new HTMLRewriter()
    .on('head > title', {
      element(title) { title.setInnerContent(`한눈에 보는 ${name} | SIANALY`); },
    })
    .on('head', {
      element(head) { head.append(`<link rel="canonical" href="${canonical}">`, { html: true }); },
    })
    .transform(page);
}

export function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '');

  const communityEnabled = url.hostname === 'dev.sianaly.com' || url.hostname === 'codex-dev.sianaly.pages.dev';

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
