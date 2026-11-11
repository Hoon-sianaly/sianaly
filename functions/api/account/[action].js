export function onRequest() {
  return Response.json({ code: 'unavailable' }, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}
