export function onRequest({ request, next }) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');

  if (pathname === '/api/account' || pathname.startsWith('/api/account/')) {
    return Response.json({ code: 'unavailable' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (/^\/(board|reports)(\.html)?$/.test(pathname)) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Cache-Control': 'no-store' },
    });
  }

  return next();
}
