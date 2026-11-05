# Company error reports

The company footer opens an in-site dialog with error categories and a 5–2,000 character description. No login, email app, email address or profile is required. The separate public footer email remains for inquiries and suggestions.

`POST /api/account/reports` validates a known company key, category and UUID v4 request ID. The same ID prevents duplicate insertion on retry. Requests must use same-origin JSON and are limited to five attempts per hour per HMAC-hashed network address using the existing expiring attempt table. Raw IPs are not stored. Report records contain only the request ID, company key, category, supplied text, state and server timestamps. The dialog asks users not to enter personal information. No email is sent.

Existing Cloudflare D1 `POPULAR_DB` stores `company_reports` and its status/ID index, created idempotently on first authorized operation. Existing account and board data are unchanged. No new provider, key or binding is needed.

`GET` and `PATCH` require a server-verified Supabase user with `app_metadata.sianaly_role = admin`. The account menu links to `/reports`; hiding that link is only a convenience, and all data authorization is enforced on the server. Reports are never exposed publicly. The operator can filter pending/reviewing/resolved/dismissed and change status without deleting reports. Lists are paginated by ID, 20 per page. Browser rendering uses textContent for submitted content.

Verification: `node scripts/test-company-reports.mjs`, `node scripts/test-member-account.mjs`, `node scripts/test-company-data.cjs`, and the existing Pages Functions build. The report tests exercise actual SQLite statements and the shared account-handler security boundary, including forged user metadata and anonymous access denial for reads.
