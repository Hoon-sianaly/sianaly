# Social member accounts

Company information remains public. The development site supports Naver, Kakao and email/password signup and login, site nicknames, private favorites, logout and own-account deletion. No browser Supabase SDK or tokens in localStorage.

## Live configuration (2026-11-05)

- Supabase project `jprnqliszpqercqrdisi` (`sianaly`), free organization, Seoul region.
- Google: built-in provider disabled on 2026-11-05 at the user's request. The site selector and server OAuth allowlist exclude Google. Existing accounts retain their data and active sessions.
- Email: enabled, Confirm email OFF at the user's request. Signup requires email, a 10–128 character password and a valid site nickname, and signs in immediately. Passwords pass only to managed Auth. Email login uses the same secure server cookies as social login. Password recovery is deferred until an SMTP provider is connected, as explicitly chosen by the user. The signup form discloses this limitation.
- Naver: `custom:naver`, OAuth2, issuer `https://nid.naver.com`, no optional profile fields or scopes, email optional. The user approved the app terms and live identifier-only consent. App remains in development for registered members.
- Kakao: app `1636001`, Login and OpenID Connect ON. `custom:kakao` uses issuer `https://kauth.kakao.com`, discovery, `openid` only and email optional. Actual consent displayed member-number-only access. The former built-in Kakao connection is disabled with explicit user approval because it automatically requested email/photo/nickname scopes. Kakao nickname/photo consent items remain unused. No business upgrade or paid API enabled.
- Provider secrets are stored only in Supabase. The Supabase privileged server key was saved to the development site's encrypted Cloudflare Secret with explicit approval. No secret is in source, screenshots, chat or public GitHub.
- Supabase Site URL `https://dev.sianaly.com`; exact redirect allowlist `https://dev.sianaly.com/api/account/callback`. All social apps use the verified callback `https://jprnqliszpqercqrdisi.supabase.co/auth/v1/callback`. Avoid wildcard redirects.

## Cloudflare Pages

Existing project `sianaly`, environment serving **dev.sianaly.com** and sianaly.pages.dev. This is not a deployment to sianaly.com.

| Setting | Value |
| --- | --- |
| AUTH_ENABLED | `true` on the development site |
| AUTH_SITE_URL | `https://dev.sianaly.com` |
| AUTH_PROVIDERS | `custom:naver,custom:kakao,google` |
| SUPABASE_URL | `https://jprnqliszpqercqrdisi.supabase.co` |
| SUPABASE_PUBLISHABLE_KEY | Project publishable key, environment setting |
| SUPABASE_SECRET_KEY | Encrypted Secret; own-account deletion only |

Build command: `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`. Functions use fail-closed behavior. The existing POPULAR_DB binding is preserved. Dependencies are lockfile pinned and excluded from static uploads.

The legacy Google entry in AUTH_PROVIDERS is ignored by the server's explicit Naver/Kakao allowlist. Email signup/login use the existing POPULAR_DB binding for atomic limits of five signup attempts per IP/hour and thirty login attempts per IP/15 minutes. Only an HMAC of the edge-provided IP is retained, with expired buckets removed on subsequent requests. Supabase's direct Auth endpoints also need platform abuse protection before public launch.

## Nickname signup

All providers use the same first-login nickname screen. Users choose 2–20 Unicode letters/numbers, spaces, underscores or hyphens. The server normalizes NFKC and rejects empty/control/HTML values. Provider nicknames are not copied. A valid site nickname is required before saving a new favorite. Public browsing, reading existing favorites, signout and deletion remain available before nickname setup.

The verified user's Supabase client updates only `user_metadata.sianaly_nickname`. The admin key is not used. Nicknames are display preferences, not authorization fields or unique identities. My Account supports nickname changes. Deleting the Auth user also removes this metadata. Test accounts currently have clearly labeled test nicknames, changeable in My Account.

## Favorites and session security

`public.sianaly_favorites` was created via the SQL dashboard on 2026-11-03. It stores only user UUID, company key and saved time, with a composite primary key and an Auth-user foreign key using ON DELETE CASCADE. RLS is enabled and forced. Three policies allow owner-only SELECT/INSERT/DELETE; anonymous access and authenticated UPDATE are denied. Dashboard execution is not CLI migration history: baseline before adopting CLI migrations, and do not replay this migration against the existing table.

Each request creates a fresh server-side client. Session identity is verified with `getUser`. Responses are private/no-store. Mutations require same-origin JSON. Sessions and PKCE verifiers use Secure host-only HttpOnly SameSite=Lax cookies; no browser script token access. The session API returns sign-in state, provider label and the chosen site nickname, not email/user UUID. Favorites always use the user's client plus RLS.

Own-account deletion requires the exact confirmation text and a sign-in within ten minutes. Only this endpoint uses the privileged server key, and it deletes only the currently verified user. Provider-side unlinking is separate from deleting the SIANALY account. Never delete real customer accounts for testing.

## Naver identity adapter

Authorization `https://nid.naver.com/oauth2.0/authorize`; token `https://nid.naver.com/oauth2.0/token`; userinfo `https://dev.sianaly.com/api/account/naver-userinfo`.

The adapter forwards only a Bearer header to fixed `https://openapi.naver.com/v1/nid/me`, converts `response.id` to top-level `sub`, and returns no email/name/phone. Query tokens and redirects are rejected. It uses AbortController with a cleared ten-second timer and `redirect: manual` plus non-success rejection. Workers does not support `redirect: error`; that caused the initial live failure and was corrected. Do not enable automatic redirect following for provider credentials.

References: [Naver profile API](https://developers.naver.com/docs/login/profile/profile.md), [Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers), [Cloudflare request options](https://developers.cloudflare.com/workers/runtime-apis/request/).

## Verification

- Real Google, Naver and Kakao login completed on dev.sianaly.com. All three reached the common nickname screen and saved a site nickname; Google nickname changes and reload persistence verified.
- Google Samsung favorite saved, displayed on home, persisted after reload and logout. Naver's separate account did not see that favorite. This is distinct from the browser's public recent-history feature.
- API tests cover provider allowlisting, CSRF, host-only PKCE cookies, safe redirects, verified identity, nickname validation/owner update, signup completion gating and fresh-login deletion.
- PGlite runs actual PostgreSQL tests for owner isolation, cross-user insertion/deletion, anonymous denial, disallowed updates and cascade deletion. Real account deletion was not exercised.
- Build: `node scripts/test-member-account.mjs`, `node scripts/test-member-rls.mjs`, `npx --yes wrangler@3.114.17 pages functions build functions --outdir tmp/member-functions-build`. The argument must be `functions`, not project root `.`.

## Before public member launch

Finish Naver logo/review and required disclosures, provider-unlink callbacks, accurate operator/privacy notices and any applicable overseas-processing information. Connect custom SMTP and password recovery, and configure platform CAPTCHA/abuse protection for public email signup. Anonymous/phone/manual linking are off. Do not request phone/address/birth date/gender/contacts. Public provider approval is separate from successful owner-account development tests.
