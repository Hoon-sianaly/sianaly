// The company page's own data, sent inside its HTML so the browser does not fetch it separately:
// the company file, its issuer's file for a preferred share (financials.companyRef), and the issuer's
// data/extras slice. company-data.js reads it from <script id="sianaly-company-bundle">.
const safeKey = value => typeof value === 'string' && /^[a-z0-9_-]+$/.test(value);

export async function companyBundle(readJSON, key, record) {
  if (!safeKey(key) || record?.schemaVersion !== 1 || record.profile?.key !== key) return null;
  const records = { [key]: record };
  let issuer = key;
  const ref = record.financials?.companyRef;
  if (ref !== undefined) {
    if (!safeKey(ref)) return null;
    const parent = await readJSON(`/data/companies/${ref}.json`);
    if (parent?.schemaVersion !== 1 || parent.profile?.key !== ref) return null;
    records[ref] = parent;
    issuer = ref;
  }
  const extras = await readJSON(`/data/extras/${issuer}.json`);
  return { schemaVersion: 1, key, records, extras: extras?.schemaVersion === 1 ? { [issuer]: extras } : {} };
}

// JSON inside <script> must not contain "</script>" or "<!--"; escaping every "<" covers both.
export function companyBundleScript(bundle) {
  return `<script type="application/json" id="sianaly-company-bundle">${JSON.stringify(bundle).replace(/</g, '\\u003c')}</script>`;
}
