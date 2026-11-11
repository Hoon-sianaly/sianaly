const publicOrigin = 'https://sianaly.com';

export async function onRequestGet({ request, env }) {
  try {
    const indexResponse = await env.ASSETS.fetch(new URL('/data/company-index.json', request.url));
    if (!indexResponse.ok) throw new Error('Company index is unavailable');

    const { companies } = await indexResponse.json();
    const paths = ['/', '/dart-notices', ...companies.map(({ key }) =>
      `/company?company=${encodeURIComponent(key)}`,
    )];
    const entries = paths.map(path => `  <url><loc>${publicOrigin}${path}</loc></url>`);
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      '</urlset>',
      '',
    ].join('\n');

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503 });
  }
}
