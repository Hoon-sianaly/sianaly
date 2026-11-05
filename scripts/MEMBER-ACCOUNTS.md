# Social member accounts

Company information remains public. The development site supports Naver, Kakao and email/password signup and login, site nicknames, private favorites, logout and own-account deletion. No browser Supabase SDK or tokens in localStorage.

## Live configuration (2026-11-05)

- Supabase project `jprnqliszpqercqrdisi` (`sianaly`), free organization, Seoul region.
- Google: built-in provider disabled on 2026-11-05 at the user's request. The site selector and server OAuth allowlist exclude Google. Existing accounts retain their data and active sessions.
- Email: enabled, Confirm email OFF at the user's request. Signup requires email, a 10–128 character password and a valid site nickname, and signs in immediately. Passwords pass only to managed Auth. Email login uses the same secure server cookies as social login. Password recovery is available from the login form using a one-use email link. See the password recovery section below.
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
| SUPABASE_SECRET_KEY | Encrypted Secret; own-account deletion and private departure synchronization |

Build command: `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`. Functions use fail-closed behavior. The existing POPULAR_DB binding is preserved. Dependencies are lockfile pinned and excluded from static uploads.

The legacy Google entry in AUTH_PROVIDERS is ignored by the server's explicit Naver/Kakao allowlist. Email signup/login use the existing POPULAR_DB binding for atomic limits of five signup attempts per IP/hour and thirty login attempts per IP/15 minutes. Only an HMAC of the edge-provided IP is retained, with expired buckets removed on subsequent requests. Supabase's direct Auth endpoints also need platform abuse protection before public launch.

## Password recovery

- Resend free account, verified sending domain `mail.sianaly.com`, Tokyo region, sender `SIANALY <noreply@mail.sianaly.com>`.
- Custom SMTP uses `smtp.resend.com:465`, username `resend`. The domain-restricted Sending access key is stored only in Supabase's encrypted SMTP password setting.
- Cloudflare authentication DNS records are scoped to the mail subdomain. The development site's DNS record is preserved.
- Recovery subject `[SIANALY] 비밀번호 재설정`; body is versioned in `supabase/templates/recovery.html`. The one-use token hash is carried in the URL fragment, removed from the address bar when the account script loads, and exchanged only after the user clicks the confirmation button.
- Supabase verifies the recovery token. A server-signed, HttpOnly, user-bound recovery cookie grants ten minutes to set a new 10–128 character password. A normal login or a different user's session cannot grant this permission. The server attempts global signout and clears local authentication/recovery cookies after success. A signout failure is explicitly reported to the user.
- Reset requests use a generic success response to avoid revealing account existence and are limited to three attempts per edge IP/hour, in addition to Supabase's email limits. The sender's free quotas also apply.
- Use a disposable account when testing recovery; do not change an existing member's password. Disable click/open tracking for authentication emails.

## Nickname signup

All providers use the same first-login nickname screen. Users choose 2–20 Unicode letters/numbers, spaces, underscores or hyphens. The server normalizes NFKC and rejects empty/control/HTML values. Provider nicknames are not copied. A valid site nickname is required before saving a new favorite. Public browsing, reading existing favorites, signout and deletion remain available before nickname setup.

The verified user's Supabase client updates only `user_metadata.sianaly_nickname`. The admin key is not used. Nicknames are display preferences, not authorization fields or unique identities. My Account supports nickname changes. Deleting the Auth user also removes this metadata. Test accounts currently have clearly labeled test nicknames, changeable in My Account.

## Favorites and session security

`public.sianaly_favorites` was created via the SQL dashboard on 2026-11-03. It stores only user UUID, company key and saved time, with a composite primary key and an Auth-user foreign key using ON DELETE CASCADE. RLS is enabled and forced. Three policies allow owner-only SELECT/INSERT/DELETE; anonymous access and authenticated UPDATE are denied. Dashboard execution is not CLI migration history: baseline before adopting CLI migrations, and do not replay this migration against the existing table.

Each request creates a fresh server-side client. Session identity is verified with `getUser`. Responses are private/no-store. Mutations require same-origin JSON. Sessions and PKCE verifiers use Secure host-only HttpOnly SameSite=Lax cookies; no browser script token access. The session API returns sign-in state, provider label and the chosen site nickname, not email/user UUID. Favorites always use the user's client plus RLS.

Own-account deletion requires the exact confirmation text and a sign-in within ten minutes. The privileged server key deletes only the currently verified user and synchronizes the server-only member-departure queue with the board. Board posts and comments remain after withdrawal. Their author becomes `탈퇴한 회원`, and their former account ownership is removed. Provider-side unlinking is separate from deleting the SIANALY account. Never delete real customer accounts for testing.

## Board operation and withdrawal

- Operator permission comes only from the verified Auth user's server-managed `app_metadata.sianaly_role = admin`. User-editable metadata, display nicknames and request payloads grant no permissions. The owner's Naver account with site nickname `운영자` was assigned this role on 2026-11-05.
- Operators can hide, restore and delete posts. The `숨긴 글` list and `마이페이지 → 게시판 관리` link are visible to operators. Public lists and direct links exclude hidden content. Its author can still see and edit the hidden post; it stays hidden until an operator restores it. Hidden posts reject new comments. Deleting a post also deletes its comments.
- Supabase migration `20261105055637_board_member_departures.sql` records Auth deletions transactionally. The public queue table has forced RLS and allows only server-role reads/deletes; its trigger function is private and unavailable to anonymous or signed-in members.
- Board requests drain that queue before returning data. D1 atomically marks a hash of the departed owner, replaces the post/comment author label and removes original ownership. The queue is acknowledged only after D1 commits, so retries preserve content and finish interrupted work. SQL write guards reject late requests from departed users. A synchronization failure temporarily blocks board responses instead of serving stale author information.
- The D1 tables for hidden posts and departed-owner hashes are added idempotently alongside existing board tables. Existing posts and account data are preserved. Record the hosted migration baseline before adopting CLI migration replay, since the original favorites table was created separately through the dashboard.

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

Finish Naver logo/review and required disclosures, provider-unlink callbacks, accurate operator/privacy notices and any applicable overseas-processing information. Configure platform CAPTCHA/abuse protection for public email signup. Anonymous/phone/manual linking are off. Do not request phone/address/birth date/gender/contacts. Public provider approval is separate from successful owner-account development tests.
