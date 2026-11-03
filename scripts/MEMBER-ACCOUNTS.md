# Social member accounts

Public company information remains available without signing in. Members can save companies, sign out, and delete their own account. Authentication uses Supabase Auth through Cloudflare Pages Functions; no browser Supabase SDK or tokens in localStorage.

## Current setup

- Supabase project: `jprnqliszpqercqrdisi` (`sianaly`), free organization, Seoul region.
- `public.sianaly_favorites` created on 2026-11-03 via the SQL dashboard. Verified RLS enabled and forced, three owner-only SELECT/INSERT/DELETE policies, no anonymous grants, no authenticated UPDATE grant. Dashboard execution does not automatically enter the CLI migrations history; baseline this migration before adopting CLI migration deployment. Do not replay it against this existing table.
- Google OAuth configured on 2026-11-03: Cloud project `root-unison-513613-v5` (`sianaly-login`), app display name SIANALY. Web client created with the exact Supabase callback, secret saved only in Supabase's Google provider, provider verified ENABLED. Nonce checks remain enabled. App remains in testing with the owner's approved service email as its one test account. The user approved publishing that service email for support. No Google billing/free trial was enabled.
- Kakao app `1636001` created on 2026-11-03 with user approval (name/operator SIANALY, Finance category, dev domain). Kakao Login enabled; default REST key's login redirect saved to the exact Supabase callback. The default login Client Secret remains enabled. REST key and login secret saved only in Supabase. The original built-in connection is enabled, but its automatic profile scopes were discovered during validation; use the custom OIDC replacement described below. No business upgrade or paid API was enabled. Before public registration, finish the provider-unlink webhook and verify no optional user-info scopes are requested.
- Naver SIANALY app registered on 2026-11-03 with user approval of its two service/data-use confirmations. PC web service URL is `https://dev.sianaly.com`; callback is the exact Supabase callback. All optional profile fields remain unchecked. Client ID/secret saved only to the Supabase custom provider `custom:naver`; OAUTH2 / ENABLED verified, email optional, empty scopes, manual issuer `https://nid.naver.com` and endpoints below. Naver app remains in development (registered members only). End-to-end testing, logo, review, provider-unlink callback and overseas-processing disclosure remain before public registration.
- Supabase Site URL saved as `https://dev.sianaly.com`; the exact `/api/account/callback` redirect was added and verified. Cloudflare environment settings are configured on the Pages environment serving dev.sianaly.com; the privileged server key is an encrypted Secret, saved with explicit user approval. Google login, Samsung favorite storage, persistence after reload, and logout were exercised on the live development site. Other provider tests remain pending.
- Google uses its built-in provider. Kakao is being migrated to custom OIDC `custom:kakao` with issuer `https://kauth.kakao.com` and only `openid` scope; OpenID Connect is ON in Kakao and the custom provider is ENABLED in Supabase. The built-in Kakao provider requests email/profile scopes regardless of the email-optional flag; do not describe it as ID-only. Switching the site and disabling that old connection await the user response to the action-specific approval. Naver uses `custom:naver`; `/api/account/naver-userinfo` converts Naver's nested `response.id` to a top-level `sub`, returning no name, email or phone. Verify upstream PKCE compatibility before enabling it. Do not expose an untested provider just because its button exists.

## Cloudflare Pages settings

Use the existing `sianaly` Pages project, environment serving `dev.sianaly.com`. Do not copy secrets into source or preview fixtures.

| Setting | Value |
| --- | --- |
| AUTH_ENABLED | `true` on development only; public member launch remains pending provider validation |
| AUTH_SITE_URL | `https://dev.sianaly.com` |
| AUTH_PROVIDERS | Currently `custom:naver,kakao,google`; planned `custom:naver,custom:kakao,google` after approved Kakao transition |
| SUPABASE_URL | `https://jprnqliszpqercqrdisi.supabase.co` |
| SUPABASE_PUBLISHABLE_KEY | Project publishable key, environment setting |
| SUPABASE_SECRET_KEY | Server secret key, encrypted Cloudflare secret; own-account deletion only |

Supabase Site URL: `https://dev.sianaly.com`. Redirect allowlist: exact `https://dev.sianaly.com/api/account/callback` (callback's next query is validated by our server). Avoid wildcard domains. Social apps receive the callback shown by their corresponding Supabase provider; built-in provider callback is `https://jprnqliszpqercqrdisi.supabase.co/auth/v1/callback`. Custom provider callback must be copied from its create form rather than guessed.

Naver custom provider endpoints: authorization `https://nid.naver.com/oauth2.0/authorize`, token `https://nid.naver.com/oauth2.0/token`, userinfo `https://dev.sianaly.com/api/account/naver-userinfo`. Use `email_optional: true`; app-scoped ID is sufficient for favorites. Request no optional Naver profile fields. Do not mark an unverified email as verified or add literal subject mappings. The adapter forwards only a Bearer header to Naver's fixed endpoint, rejects query tokens/redirects, and uses private/no-store responses. References: [Naver profile API](https://developers.naver.com/docs/login/profile/profile.md), [Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers), [official mapping implementation](https://github.com/supabase/auth/blob/master/internal/api/provider/custom_oauth.go).

Do not enable password, anonymous or phone registration for this feature. Request minimal profile scopes; do not request phone, address, birth date, gender or contacts. Managed Auth may retain the consented social profile and email; the application table stores only user UUID, company key and saved time. Supply accurate operator/privacy contact details before releasing registration publicly.

## Verification

Run `npm ci --ignore-scripts`, `node scripts/test-member-account.mjs`, `node scripts/test-member-rls.mjs`, and `npx --yes wrangler@3.114.17 pages functions build functions --outdir tmp/member-functions-build`. The functions argument must be `functions`, not project root `.` (which would scan dependencies as routes).

The RLS suite runs actual PostgreSQL in PGlite: cross-user reads/inserts/deletes, anonymous access, disallowed updates and account-deletion cascade. API suite verifies CSRF origin checks, fixed provider allowlist, PKCE HttpOnly cookies, safe return URL, verified identity and fresh-login deletion requirement. Frontend local fixture tests do not prove real provider setup.

Before enabling, verify all three real login/cancel/return flows, token refresh, signed-out browsing, saving/removing favorites across devices, separate-account isolation, signout and deletion using disposable test accounts. Explicitly authorize test-account removal. Never use real customer accounts for destructive tests.

## Security boundaries

Each API request creates a fresh server-side Supabase client. Session identity is verified with getUser. All account API responses are private/no-store. Mutations require a same-origin JSON request. Secure host-only HttpOnly SameSite=Lax cookies contain the session and PKCE verifier; browser script cannot read these cookies. No user ID/email is returned by the session API. Favorites use the user client plus RLS. The server secret is used only to delete the currently verified account after exact confirmation and a sign-in within ten minutes. Provider-account unlinking at Naver/Kakao/Google is separate from deleting the SIANALY account.

Cloudflare deployment build command: `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`. Functions use fail-closed behavior; the existing POPULAR_DB binding remains intact. Release e35c64a passed both member and popular GitHub checks and deployed successfully after adding the dependency installation step.
