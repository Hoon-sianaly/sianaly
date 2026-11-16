# SIANALY 서버 전면 개편 계획안 (상세판)

작성: 2026-11-16 · 상태: **제안** (사장님 결정 전에는 아무것도 바꾸지 않음)
목표: **휴대폰에서도 빠른 사이트.** 화면에 보이는 내용은 그대로 두고, 뒤에서 돌아가는 것을 모두 새로 짠다.

- 1부 (사장님용): 무엇이, 왜, 얼마나 바뀌는지, 비용, 일정, 정해 주실 것
- 2부 (작업용 기술 상세): 실제로 만들 때 따라갈 설계, 옮기는 방법, 검사, 전환 절차

---

# 1부. 사장님용 요약

## 1. 한 줄 요약

서버를 **서울**로 옮기고, 흩어진 자료를 **데이터베이스 하나**로 모으고, 페이지를 **서버가 미리 완성해서** 보내게 바꿉니다. 손님 휴대폰은 완성된 페이지를 받아서 보여 주기만 하면 됩니다.

## 2. 왜 지금 느린가 (재 본 숫자)

| 원인 | 지금 상태 | 영향 |
|---|---|---|
| 서버가 멀다 | 한국 접속이 미국 로스앤젤레스(LAX)를 거침 | 한 번 다녀오는 데 0.3초 이상. 처음 방문 때 화면 뼈대에만 0.9~2.9초 |
| 휴대폰이 화면을 조립 | 빈 페이지를 받은 뒤 자료 파일 3~5개를 따로 받아 그림 | 서버를 여러 번 다녀와야 하고, 휴대폰이 할 일이 많음 |
| 자료가 파일 2,800여 개 | 기업 하나에 기본·과거 실적·검토 파일이 따로 있음 | 기업 페이지마다 파일을 여러 개 받음 |
| 첫 화면에서 목록 전체 다운로드 | 기업 목록 약 97KB를 매번 받음 | 휴대폰 데이터에서 특히 느림 |
| 실적이 바뀌면 사이트 전체 재배포 | 하루 4번 저장소에 저장 → 전체 다시 올리기 | 반영이 수 분 걸리고, 배포가 실패하면 반영도 멈춤 |

## 3. 속도 목표 (한국, 휴대폰 기준)

| 항목 | 지금 (측정·추정) | 목표 |
|---|---|---|
| 서버 한 번 다녀오기 | 0.3초 이상 | **0.03초 안팎** |
| 첫 화면이 눈에 보이기 | 2~5초 | **1초 안팎** |
| 기업 페이지 숫자까지 다 보이기 | 2~4초 | **1초 안팎** (숫자가 처음부터 들어 있음) |
| 다른 기업으로 넘어가기 | 0.5~2초 | **0.3초 안팎** |
| 실적 반영 (자동 업데이트 후) | 수 분 | **수 초** |

목표치는 보장이 아니에요. 개편 중에 실제로 재면서 맞춰 갈게요(2부 7장).

## 4. 그대로 지키는 것

- **기업 내용:** 2,763개 기업의 설명 문장, 실적 숫자, 과거 실적, 검토 기록, 출처 링크, 용어 설명. 말투 다듬기도 지금과 똑같이 나옴
- **화면:** 홈, 기업, 비교, 자유게시판, 자료 안내, 처리방침·약관, 마이페이지의 배치와 색
- **주소:** `sianaly.com/company?company=samsung` 등 지금 주소 전부. 검색 노출이 그대로 유지됨
- **회원과 글:** 계정, 즐겨찾기, 게시글·댓글·추천·조회수, 오류 제보, 동의 기록
- **기능:** 검색(초성 포함), 인기 기업, 비교, 공시 요약, 증감 표시, 실적 자동 업데이트, 오류 제보, 운영자 관리

## 5. 바뀌는 것 한눈에

| 부분 | 지금 | 바꾼 뒤 |
|---|---|---|
| 서버 | Cloudflare (미국 경유) | **Vercel, 서울 지역 고정** |
| 페이지 | 휴대폰이 조립 | **서버가 미리 완성해 두고 바로 보냄** |
| 기업 자료 | 파일 2,800여 개 | **Supabase 데이터베이스 (서울)** |
| 게시판·인기·제보·기록 | Cloudflare D1 | **같은 데이터베이스로 합침** |
| 회원·즐겨찾기 | Supabase | 그대로 |
| 검색 | 목록 전체 다운로드 | **입력할 때 서버에 물어봄** |
| 실적 자동 업데이트 | 저장소 저장 → 전체 재배포 | **데이터베이스에 바로 저장 → 바뀐 페이지만 새로 고침** |
| 개발 사이트 | 저장 공간 두 개를 손으로 구분 | **바꿀 때마다 미리보기 주소가 자동으로 생기고, 확인 후 실제 반영** |
| 버전 표시(`?v=`) | 손으로 올림 | 자동 |
| 처리방침 버전 | 동의 버전과 묶임 | **분리** (중요한 변경 때만 다시 동의) |
| 도메인 | Cloudflare에서 관리 | 관리는 그대로, 연결 대상만 Vercel로 |
| 보안 확인·메일 | Turnstile·Resend | 그대로 |

## 6. 비용 (월)

| 항목 | 금액 | 설명 |
|---|---|---|
| Vercel Pro | 약 $20 | 광고 계획이 있어 무료(비상업용)는 쓸 수 없음 |
| Supabase Pro | 약 $25 | 실제 사이트용. 매일 백업 7일치, 잠들지 않음 |
| Supabase 무료 프로젝트 | $0 | 개발 사이트용 (잠들어도 괜찮음) |
| Resend·Turnstile·GitHub·도메인 | $0 | 지금처럼 |
| **합계** | **약 $45 (약 6만 원)** | 요금은 시작 전에 다시 확인 |

## 7. 일정 (예상)

| 주 | 하는 일 | 사장님 할 일 |
|---|---|---|
| 0주 | 계정 준비, 결정 | Vercel·Supabase 결제, 4가지 결정 |
| 1주 | 데이터베이스 만들기, 자료 옮기기, 숫자 전부 대조 | - |
| 2주 | 페이지 다시 만들기 (홈·기업·비교·안내·문서) | 중간 화면 확인 |
| 3주 | 회원·게시판·제보·인기 기업·운영 기능 옮기기 | - |
| 4주 | 실적 자동 업데이트 다시 연결, 속도 다듬기 | 미리보기 사이트를 휴대폰으로 써 보기 |
| 5주 | 처리방침 새 버전 안내, 전환 준비 | 안내문 확인 |
| 6주 | **전환** (도메인 연결 변경), 일주일 지켜보기 | 전환 날 함께 설정 |

**합계 약 5~6주.** 전환 전까지 지금 사이트는 그대로 돌아갑니다.

## 8. 문제가 생기면

- **전환 뒤 일주일 동안 옛 사이트를 그대로 둬요.** 도메인 연결만 되돌리면 몇 분 안에 원래대로 돌아가요.
- **자료 확인:** 옮기기 전과 후의 기업 자료 2,763개를 자동으로 전부 대조해요. 하나라도 다르면 전환하지 않아요.
- **회원:** 계정은 Supabase에 그대로 있어요. 전환 때 한 번 다시 로그인해야 할 수 있어요.

## 9. 정해 주실 것

1. **옮길 곳:** Vercel (추천)
2. **Supabase:** 실제 사이트 Pro($25) + 개발용 무료 (추천)
3. **시작 시점**
4. **주가 표시:** 금융위원회 답변이 오면 이번 개편에 같이 넣을지 (나중에 따로 넣어도 됨)

---

# 2부. 작업용 기술 상세

## 1. 목표 구조

```
손님 휴대폰 ──(서울)──▶ Vercel CDN (서울 지점, 완성된 페이지 저장)
                              │ 저장된 페이지가 없거나 오래되면
                              ▼
                       Vercel 서버 기능 (icn1 서울)
                              │ 같은 지역 안 (수 ms)
                              ▼
                       Supabase Postgres + Auth (ap-northeast-2 서울)
                              ▲
GitHub Actions (DART 자동 업데이트) ── 저장 → 바뀐 기업 페이지 새로 고침 요청
```

- **도메인:** Cloudflare DNS 유지. `sianaly.com` 레코드를 Vercel로 연결하고 Cloudflare 프록시(주황 구름)는 끔. 끄지 않으면 다시 LAX를 거침
- **서버 지역:** Vercel 기본값은 iad1(워싱턴)이므로 **반드시 `regions: ["icn1"]`로 고정**하고 배포 검사에 넣음
- **화면 프레임워크:** Next.js 최신 안정 버전 (App Router, 서버 컴포넌트)
- **데이터베이스 접근:** 서버에서만. 공개 자료도 서버를 통해 읽음 (브라우저에 DB 키 노출 없음, RLS는 이중 안전장치)

## 2. 페이지별 만드는 방식

| 페이지 | 방식 | 다시 만드는 시점 |
|---|---|---|
| 홈 `/` | 미리 만든 페이지 + 사람마다 다른 부분(즐겨찾기·로그인 버튼)은 화면이 뜬 뒤 채움 | 실적 업데이트 때, 그 외 5분마다 |
| 기업 `/company?company=` | **미리 만든 페이지**. 숫자·차트·설명이 HTML에 처음부터 들어 있음 | 그 기업 실적이 바뀔 때만 (DART 작업이 요청) |
| 비교 `/compare` | 서버가 그때그때 만들고 짧게 저장 (검색 제외 유지) | 요청 시 |
| 자유게시판 `/board` | 목록은 서버가 만들고 30초 저장. 글쓰기·추천은 서버 기능 | 글 작성·수정 시 해당 목록 새로 고침 |
| 자료 안내·처리방침·약관·보관본 | 완전 정적 | 배포 때 |
| 사이트맵 | 데이터베이스에서 생성, 1시간 저장 | 자동 |

- **주소 유지:** `/company?company=` 형태 그대로. `.html` 옛 주소는 영구 이동(308) 유지. 없는 기업은 404 + 검색 제외 유지. 우선주는 보통주를 대표 주소로 유지
- **검색엔진 정보:** 제목·설명·대표 주소·공유 그림·구조화 정보를 서버가 페이지에 넣음 (지금 middleware가 하던 일을 기본으로)
- **페이지 무게 상한:** 페이지당 자바스크립트 압축 100KB 이하, 첫 HTML 50KB 이하

## 3. 데이터베이스 설계 (Postgres, 스키마 `sianaly`)

### 기업 자료

| 표 | 주요 열 | 출처 (지금) |
|---|---|---|
| `companies` | key(기본키), name, ticker, market, alias, type, industry_group, rank, common_key(우선주→보통주), presentation(json), availability(json) | company-index.json, companies/*.json profile, company-industries.js |
| `company_texts` | company_key, short, summary, takeaways(json), business(json), drivers(json), glossary(json), section_source_ids(json) | companies/*.json overview·glossary |
| `financial_periods` | company_key, kind(annual/quarter), year, quarter, period_label, report_period, sales, op, net, currency, basis, unit, metrics(json), disclosure_status, comparable_to_previous, partial_period, receipt, raw_krw(json), source_ids, origin(canonical/history/period_review) | companies/*.json, history/*.json, financial-period-review.json |
| `financial_notes` | company_key, year, quarter, reason, source | financial-period-review.json notes, history issues |
| `sources` | id, company_key, label, url, published, verified_at | companies/*.json sources, history sources |
| `company_trends` (뷰 또는 저장 표) | company_key, text, label, year, quarter, preliminary | build-company-trends.cjs와 같은 규칙 |
| `dart_updates` | id, published_at, company_key, year, quarter, receipt, preliminary, fields | dart-updates.json |
| `dart_changes` | 변경 전후 값, 접수번호, 시각 | 지금은 git 이력이 대신함 → 표로 남김 |

- **과거 실적 합치기 규칙**(지금 `addFinancialHistory`·`addFinancialPeriodReview`의 기준값 비교, 정규값 우선)은 옮길 때 한 번 적용하고, 결과에 `origin`을 남김
- **말투 다듬기**(`prepareCompanyCopy`)는 저장된 원문에 서버가 화면 직전에 적용 (원문 보존)
- 검토용 JSON(review-*, numeric-review 등)은 운영 기록이므로 DB 대신 저장소 보관 유지

### 회원·게시판·운영 (D1에서 옮김)

D1 테이블 14개(`board_posts`, `board_comments`, `board_recommendations`, `board_post_stats`, `board_view_visitors`, `board_hidden_posts`, `board_departed_members`, `company_reports`, `popular_views`, `member_legal_acceptances`, `member_email_attempts`, `operator_access_audit`, `operator_audit_keys`, `privacy_recovery_journal`)를 같은 이름·같은 보관 규칙으로 옮김. Supabase 쪽 `sianaly_favorites`, `sianaly_member_departures`는 그대로.
- 탈퇴 동기화가 한 데이터베이스 안에서 처리되므로 "D1 반영 뒤 확인" 같은 두 저장소 간 재시도 장치를 단순화
- 처리방침 문서 버전과 동의 버전을 분리: `member_legal_acceptances.policy_version`은 "동의가 필요한 버전"만 올림

### 검색

- `pg_trgm` 확장 + 이름·종목코드·별칭·초성 열에 인덱스
- `/api/search?q=` 결과 최대 8개, 같은 검색어는 CDN에 1시간 저장. 입력할 때마다 묻되 0.15초 기다렸다 물음
- 첫 화면에서 기업 목록 전체를 받지 않음

## 4. 서버 기능 옮기기

| 지금 (`/api/account/*`, `/api/popular`) | 옮긴 뒤 | 비고 |
|---|---|---|
| config, session(+favorites), login, callback, email-signup/login/confirm/resend, password-forgot/recovery/update, logout, nickname, delete, legal | Next.js 서버 기능, 같은 주소 | `@supabase/ssr`, 쿠키 이름(`__Host-sianaly-auth`)·보안 속성 유지 |
| favorites | 같음 | 회원 본인 권한으로만 읽기·쓰기 (관리자 키 사용 금지 유지) |
| board (목록·글·댓글·추천·조회·숨김·삭제·관리) | 같음 | 공개 목록 `?public=1` 동작 유지 |
| reports (오류 제보) | 같음 | 요청 제한·중복 방지 유지 |
| popular (조회 기록·순위) | 같음 | 순위 결과는 CDN 5분 저장 |
| naver-userinfo | 보류 (소셜 로그인 꺼져 있음) | 다시 켤 때 옮김 |

- **검사 재사용:** `test-member-account`, `test-member-legal`, `test-company-reports`, `test-popular`, `test-member-rls` 등은 요청·응답 기준이라 대상만 바꿔 그대로 다시 통과시킴
- **보안 유지:** 같은 출처 JSON 요청만 허용(CSRF), Turnstile, 요청 횟수 제한, 운영자 기록 서명, 응답 `no-store`

## 5. 실적 자동 업데이트 (DART)

- GitHub Actions 일정은 유지 (하루 4번, 필요하면 더 자주)
- 지금: 후보 파일 생성 → 저장소 커밋 → 배포 → 실제 사이트에서 확인
- 바꾼 뒤:
  1. 후보 계산 (지금 `dart-portfolio`·`dart-earnings` 로직 재사용)
  2. 검사 통과 시 **한 번의 데이터베이스 트랜잭션**으로 저장 + `dart_changes` 기록
  3. 바뀐 기업 페이지와 홈만 **새로 고침 요청** (비밀키로 보호된 주소)
  4. 실제 페이지를 열어 새 숫자가 보이는지 확인 (지금 `live()` 확인과 같은 원칙)
- 상태 저장(`codex/dart-state` 브랜치)은 데이터베이스 표로 옮김
- 매일 밤 기업 자료 전체를 JSON으로 내보내 백업 (지금처럼 파일로도 볼 수 있게)

## 6. 개발·실제 사이트 운영

- **개발용:** Supabase 무료 프로젝트 + Vercel 미리보기 배포 (브랜치마다 자동 주소, Vercel 로그인 보호)
- **실제:** Supabase Pro + Vercel Production (`main`). 미리보기에서 확인한 것을 "승격"
- **버전 표시 자동화:** 프레임워크가 파일 이름에 내용 해시를 붙임. 수동 `?v=` 없음
- **배포 전 자동 검사:** 지역 icn1 확인, 기업 2,763개 자료 대조, 회원·게시판 검사, 주요 페이지 속도 측정

## 7. 속도 측정과 기준

- **측정 도구:** 한국에서 접속하는 실제 측정(사장님 휴대폰 + 서울 측정 지점), 브라우저 성능 지표(LCP·INP·CLS) 수집
- **통과 기준 (휴대폰 4G 가정):** LCP 1.5초 이하, 서버 응답(TTFB) 0.2초 이하(저장된 페이지), CLS 0.05 이하, 페이지당 JS 100KB 이하
- **비교 측정:** 개편 전·후 같은 페이지(홈, 삼성전자, 셀트리온, 비교, 게시판)를 같은 휴대폰으로 측정해서 표로 남김

## 8. 처리방침·문서

- 맡기는 업체 변경: **Vercel Inc. 추가**(서버·로그, 미국 법인, 서울 지역 처리), **Cloudflare D1 저장 삭제**(DNS·Turnstile만 남음), Supabase 항목에 게시판·제보·운영 기록 추가
- 새 버전 발급, 전환 최소 7일 전 사이트에 안내, 보관본 생성. 이번에 문서·동의 버전을 분리해서 회원 재동의가 필요한지 판단
- 자료 안내 페이지의 "갱신 시점" 문구 확인 (반영이 수 초로 빨라짐)

## 9. 전환 절차 (전환 당일)

1. **D-3:** Cloudflare DNS TTL을 짧게(1~5분), Supabase Auth 허용 주소에 새 도메인 설정 확인, Turnstile 허용 도메인 확인, Resend 링크 주소 확인
2. **D-0, 시작:** 사이트에 "몇 분간 글쓰기 일시 중지" 표시 → D1 쓰기 중지
3. D1 마지막 자료를 Postgres로 옮기고 표마다 개수·내용 해시 대조
4. 새 사이트에서 회원 로그인, 즐겨찾기, 게시판, 기업 페이지 점검
5. **DNS 전환:** `sianaly.com` → Vercel (프록시 끔)
6. 한국 휴대폰·PC에서 접속 확인, 속도 측정, 검색 로봇 접속 확인
7. 글쓰기 재개, 안내 표시 제거
8. **D+7:** 문제가 없으면 Cloudflare Pages·D1 정리 (최종 백업 후). 문제가 있으면 DNS를 되돌림

## 10. 위험 목록

| 위험 | 가능성 | 대비 |
|---|---|---|
| Vercel 지역이 기본값(워싱턴)으로 배포됨 | 중 | 설정 고정 + 배포 검사에서 응답 헤더로 확인 |
| Cloudflare 프록시를 켠 채 연결 | 중 | DNS 레코드 회색 구름 확인을 전환 체크리스트에 |
| 기업 숫자가 다르게 옮겨짐 | 낮음 | 2,763개 전체 자동 대조, 불일치 0일 때만 진행 |
| 회원 로그인 끊김 | 중 | 전환 안내에 "한 번 다시 로그인" 명시 |
| 검색 순위 변동 | 낮음 | 주소·제목·설명·사이트맵 동일 유지, 전환 뒤 서치 콘솔 확인 |
| 비용 초과 | 낮음 | Vercel·Supabase 사용량 알림, 지출 한도 설정 |
| 자동 업데이트 실패 | 중 | 실패 시 이전 자료 유지(트랜잭션), 운영 화면·메일 알림 |

## 11. 작업 순서 체크리스트

- [ ] 0. 결정 4가지, 계정·결제 (사장님)
- [ ] 1. Supabase 개발 프로젝트, 스키마, 옮기기 스크립트, **전체 대조 통과**
- [ ] 2. Next.js 프로젝트, 서울 지역 고정, 홈·기업·비교·안내·문서 페이지, 주소·검색 정보 동일
- [ ] 3. 회원·즐겨찾기·게시판·제보·인기 기업·운영 기록 서버 기능 + 기존 검사 통과
- [ ] 4. DART 자동 업데이트 → 데이터베이스 저장 + 페이지 새로 고침
- [ ] 5. 속도 측정, 기준 통과까지 다듬기
- [ ] 6. 사장님 미리보기 확인 (PC·휴대폰)
- [ ] 7. 처리방침 새 버전, 7일 전 안내
- [ ] 8. 실제용 Supabase Pro 준비, 자료 최종 이전 리허설
- [ ] 9. 전환 (9장 절차)
- [ ] 10. 일주일 지켜본 뒤 옛 사이트 정리, 새 백업 체계 문서화

## 참고 자료

- Vercel 서버 지역: https://vercel.com/docs/functions/regions · https://vercel.com/docs/regions
- Vercel 요금과 상업적 이용: https://vercel.com/docs/plans/hobby · https://vercel.com/docs/limits/fair-use-guidelines
- Supabase 요금: https://supabase.com/pricing.md
