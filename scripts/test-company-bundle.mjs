// The company page's inline data (functions/_middleware.js + scripts/company-bundle.mjs) must give exactly
// the same company as fetching the files, without fetching the company or extras files at all.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { companyBundle, companyBundleScript } from './company-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'scripts/build-company-extras.cjs'), '--check'], { stdio: 'inherit' });

const readLocal = path => { const file = join(root, path.split('?')[0]); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; };
const loaderSource = readFileSync(join(root, 'company-reading.js'), 'utf8') + '\n' + readFileSync(join(root, 'company-data.js'), 'utf8');

function loader(key, bundleText) {
  const requests = [];
  const element = bundleText === undefined ? null : { textContent: bundleText };
  const context = vm.createContext({
    console, URLSearchParams,
    document: {
      getElementById: id => (id === 'sianaly-company-bundle' ? element : null),
      querySelector: selector => (selector === `#app [data-company="${key}"]` ? {} : null),
    },
    fetch: async url => { requests.push(url); const data = readLocal(url); return data ? { ok: true, json: async () => data } : { ok: false, status: 404 }; },
  });
  vm.runInContext(loaderSource, context);
  return { load: vm.runInContext('loadCompanyData', context), requests };
}
const payload = script => script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));

const catalog = readLocal('data/company-index.json');
let inlineCount = 0;
for (const { key } of catalog.companies) {
  const record = readLocal(`data/companies/${key}.json`);
  const bundle = await companyBundle(async path => readLocal(path), key, record);
  assert.ok(bundle, key + ' builds a bundle');
  const script = companyBundleScript(bundle);
  const inline = loader(key, payload(script)), plain = loader(key);
  const [a, b] = [await inline.load(key), await plain.load(key)];
  assert.equal(JSON.stringify(a), JSON.stringify(b), key + ': inline data gives the same page data');
  assert.ok(inline.requests.every(url => url.includes('company-index.json')), key + ': only the catalog is fetched, got ' + inline.requests.join(', '));
  inlineCount++;
}

// Escaping: text that looks like HTML cannot close the script element early.
const tricky = JSON.parse(JSON.stringify(readLocal('data/companies/samsung.json')));
tricky.overview.summary = '</script><script>alert(1)</script><!--';
const trickyScript = companyBundleScript(await companyBundle(async path => readLocal(path), 'samsung', tricky));
assert.equal(trickyScript.indexOf('</script>'), trickyScript.length - '</script>'.length, 'only the closing tag');
assert.ok(!payload(trickyScript).includes('<'), 'no raw < inside the JSON');
assert.equal(JSON.parse(payload(trickyScript)).records.samsung.overview.summary, tricky.overview.summary);

// Bad or mismatched input never becomes a bundle, and a bundle for another company is ignored.
assert.equal(await companyBundle(async path => readLocal(path), '../x', tricky), null);
assert.equal(await companyBundle(async path => readLocal(path), 'hynix', tricky), null);
const other = loader('hynix', payload(companyBundleScript(await companyBundle(async path => readLocal(path), 'samsung', readLocal('data/companies/samsung.json')))));
await other.load('hynix');
assert.ok(other.requests.some(url => url.includes('companies/hynix.json')), 'a bundle for another company is not used');
const broken = loader('samsung', '{not json');
assert.equal((await broken.load('samsung')).name, '삼성전자', 'broken inline data falls back to fetching');

console.log(`Company bundle passed: ${inlineCount} pages identical with inline data and no extra requests, escaping, mismatches and fallback.`);
