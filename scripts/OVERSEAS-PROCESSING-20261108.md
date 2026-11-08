# 해외 처리·보관 조건 대조 — 2026-11-08

범위: dev.sianaly.com의 현재 Supabase·Cloudflare Pages/Functions·D1·Turnstile·Resend. 설정 읽기와 공식 계약/문서 대조. 별도 법률 적합성 인증, 모든 실제 이전 국가 확정 또는 외부 제공자 답변 수령을 의미하지 않음.

## 실제 확인 결과

| 대상 | 확인 방법 | 결과 | 확인 범위 밖 |
| --- | --- | --- | --- |
| Supabase 지역·플랜 | 커넥터 get_project/get_organization | ap-northeast-2, Free, 정상 | 주 리전만으로 지원·로그 처리까지 한국이라고 단정 못 함 |
| Supabase DB 인증 감사 기록 | 회원 내용 없이 count/min/max 집계만 조회 | 조회 시 auth.audit_log_entries 0건 | 0건만으로 DB 기록 기능이 꺼졌거나 자동 만료된다고 단정 못 함 |
| Cloudflare D1 위치 | 사용자 로그인 후 해당 저장소 Settings 읽기 | Region Asia Pacific, Jurisdiction None, Read replication Disabled | 특정 국가 위치 또는 국내 보관 보장 아님. 기존 DB에 관할 제한 추가 불가 |
| D1 복구 이력 | 해당 저장소 Time Travel 화면 | past 7 days 명시 | 복구 실행·DB 이동/삭제 안 함 |
| Resend 발송 도메인 | mail.sianaly.com Configuration 읽기 | Verified, Tokyo/ap-northeast-1, Forge Enabled | 발송 리전이 저장 리전이라는 뜻 아님 |
| Resend 메일 TLS | 실제 설정 변경 및 새로고침 재확인 | Opportunistic → Enforced. TLS 미지원 수신 서버에는 전달 실패 | 실제 회원 메일·비밀번호 복구 링크를 새로 발송해 시험하지 않음 |
| Resend 추적 도메인 | Configure 화면 진입 | New tracking subdomain 화면, 새 도메인 생성 안 함 | 이를 모든 계정 추적·내부 처리가 없다는 증거로 사용하지 않음 |

Cloudflare CLI에는 인증이 없었지만 새 API 키를 만들지 않고 기존 대시보드 로그인으로 읽기 확인. 회원 원문·비밀번호·토큰·발송 메일 내용은 읽거나 내보내지 않음. Supabase 집계 결과는 회원 내용이나 이메일 없이 확인.

## 공식 문서와 대조

- Supabase Free API/Database 로그 표준 보관은 1일. 초과 사용량에 따른 제한 시 더 짧아질 수 있음. auth.audit_log_entries의 선택적 DB 저장, 내부 운영/보안 기록, 지원 기록, 플랫폼 관리자 감사 기록을 같은 보관기간으로 묶지 않음. 자료: https://supabase.com/pricing / https://supabase.com/docs/guides/auth/audit-logs / https://supabase.com/docs/guides/platform/manage-your-usage/logs-query
- Supabase 주 DB·Auth·백업은 선택 리전에 있고, 지원·운영 및 EU 소재 로그 처리 등 예외가 있음. 수탁 주체와 지원 계열사의 역할·처리국은 계약과 유형별로 구분. 하위 처리자 회사의 본점 국가를 모든 실제 데이터 저장국으로 사용하지 않음. 자료: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq / https://supabase.com/legal/subprocessor-list/October-12-2026.pdf
- D1 jurisdiction은 생성 때만 지정 가능. APAC 표시와 관할 없음은 다른 정보이며 국가 하나로 추정하지 않음. 읽기 복제 꺼짐도 Pages/Turnstile의 전 세계 요청 처리를 제한하지 않음. 자료: https://developers.cloudflare.com/d1/configuration/data-location/
- Pages Functions tail/dashboard 실시간 로그는 비영속 스트림. Workers Logs의 3/7일 요금제 수치를 Pages에 그대로 적용하지 않음. Cloudflare 내부 보안 처리·분석 기록과도 구분. 자료: https://developers.cloudflare.com/pages/functions/debugging-and-logging/
- Resend는 발송 지역과 관계없이 고객 데이터 미국 저장. 표준 메일/로그 30일, 백업 7일, 서비스 종료 후 잔존 데이터 90일 이내 삭제. 개별 메일 조기 삭제 API는 없고 계정 이메일에서 지원 문의로 요청. 사이트 회원 탈퇴가 Resend 서비스 계약 종료와 같지 않음. 자료: https://resend.com/security/gdpr
- Resend의 일반 발송에도 TypeSafe가 스팸/피싱 탐지용 샘플을 처리할 수 있으며 제공자는 저장·모델 학습 안 함을 명시. 별도 AI 편집/지원 입력은 별도 처리이므로 회원 메일을 입력하지 않는 운영 원칙. 자료: https://resend.com/security / https://resend.com/legal/subprocessors
- Turnstile의 사이트 보안 위탁과 자체 탐지 기능 개선을 구분. 보유·삭제를 사이트의 30일 제보 보관과 동일하게 안내하지 않음. 자료: https://www.cloudflare.com/turnstile-privacy-policy/

## 고지·계약 적용 판단

개인정보 보호법 제28조의8은 국외 제공/조회·위탁·보관에 적법 근거를 요구. 계약 체결/이행에 필요한 위탁·보관은 해당 고지 요건 충족 시 별도 동의 외의 경로가 있으나, 단순히 해외 업체의 DPA나 EU SCC가 있다는 이유만으로 한국법 요건이 자동 충족되지는 않음. 보안 제공자 자체 목적 처리, 회원가입 전 접속자 처리, Gmail 직접 문의는 각각의 실제 관계에 맞게 판단해야 함.

확인 조문: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334743

## 보완 내용

privacy.html과 문서 묶음을 2026-11-08-r2로 개정. 기존 2026-11-08 보관본은 변경하지 않음. 실제 D1 위치/관할/복제, Pages 실시간 로그, Supabase 로그의 범위, Resend 보관/조기 삭제·TLS·스팸 처리, 가입 전 접속에도 처리 가능함을 구체화. 24시간 가입 확인 쿠키도 누락 없이 기재. 서버 확인 버전 및 서명 쿠키 파서는 개정 버전에 맞춰 검사하고 SQLite/API 회귀 검증.

## 공급업체에 답변을 받아야 확정할 수 있는 항목

1. Cloudflare: 이 APAC/관할 없음 D1의 실제 국가 단위 주 저장·복구 위치, Pages/Turnstile 글로벌 처리 국가의 적용 범위, 내부 보안·서비스 기록의 유형별 정확한 보유기간/삭제 조건.
2. Supabase: 이 구성에서 주 DB 외에 처리되는 지원/운영/보안 로그의 실제 국가와 유형별 보유·삭제 조건, Free의 1일 외부 로그 기준과 내부 보안/지원 기록의 구분.

두 문의의 정확한 초안은 tmp/legal-prep/vendor-questions.md에 준비. 외부 메일 전송은 별도 사용자 지시 전 미실행. 답변을 받지 않았는데 업체 확인 완료 또는 일반 공개 법적 적합 완료로 표시하지 않음.

## 변경하지 않은 사항

DB 위치 이전·새 DB/요금제/키 생성·읽기 복제 활성화·보안 로그 차단·회원 데이터 삭제·복구 작업 없음. 기존 이메일 인증·Turnstile·회원 권한 유지. D1 국가 제한을 맞추려고 원본을 옮기거나 인증 보안을 끄지 않음.

증거: output/resend-enforced-tls.jpg (저장·새로고침 유지). 공개 정책 화면 및 배포 검증은 개정 배포 후 별도 기록.
