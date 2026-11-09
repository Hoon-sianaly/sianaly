# 2026-11-09 통합 백업 복원 시험 — 통과

실제 로컬 암호화 백업 두 개를 함께 복원한 격리 환경에서 실시. 운영 Supabase·D1·개발 사이트에는 변경하지 않았으며 실제 회원에게 메일을 보내지 않음.

## 시험 대상

- 회원 백업: `sianaly-supabase-20261109T123518431Z.sianaly-backup`
- 게시판 백업: `sianaly-d1-20261109T123420936Z.sianaly-backup`
- PostgreSQL 17.11, 실제 Supabase Auth v2.197.0, 실제 PostgREST 16.5, 실제 사이트 `account-handler.mjs` 및 Supabase SDK, SQLite에 복원한 D1 데이터.
- 기존 회원 4명·즐겨찾기 4건과 원본의 RLS/정책/탈퇴 트리거를 복원. 시험에는 합성 계정만 사용.
- Windows 로컬 실행을 위해 Auth 소스의 Unix 전용 SO_REUSEPORT 소켓 설정만 제외. 인증 로직은 수정하지 않음. 로컬에서 존재하지 않는 Supabase `supautils` 사전 로드를 시험 역할에서 해제하고, 관리용 역할 부여 주체를 시험 복원자로 조정. 원본 백업·운영 설정은 보존.

## 확인한 흐름

1. 회원 PostgreSQL과 게시판 SQLite를 실제 백업에서 함께 복원.
2. 실제 Auth·PostgREST·사이트 API를 HTTPS 루프백에서 연결. 인증 서버가 만든 확인 메일 2건은 로컬 SMTP 수신기에서만 수신.
3. 임시 회원 두 명의 가입 → 받은 확인 링크 검증 → HttpOnly/Secure 쿠키 로그인 → 약관 확인 연결. 확인 링크 재사용 및 잘못된 비밀번호 거부 확인.
4. 글쓰기·댓글·추천·즐겨찾기 저장. 다른 회원의 즐겨찾기가 보이지 않고 타인 글 편집·일반 회원의 숨김 요청은 거부. 임시 운영자의 숨김·복원 확인.
5. 시험 회원과 게시글이 들어간 두 DB를 다시 백업. PostgreSQL은 새 `restore_verify` DB로 복원하고 SQLite는 실제 백업 파일에서 다시 열어 서비스 연결을 전환.
6. 재복원 후 동일 비밀번호로 실제 로그인. 회원별 동의·즐겨찾기·글·댓글·추천 보존 확인.
7. 복원된 임시 회원 탈퇴 → 실제 Auth 삭제 → 즐겨찾기 CASCADE 삭제 → PostgreSQL 탈퇴 큐 → D1 작성자 익명화 → 큐 처리 완료 확인. 글은 유지되고 작성자는 ‘탈퇴한 회원’. 탈퇴 전 쿠키로 쓰기 거부 및 다른 회원 로그아웃 후 세션 해제 확인.

기계 판독 결과: `tmp/backup-verification/restored-service-integration.json`. 7개 확인 묶음 모두 통과. 실행은 `pwsh -File scripts/test-supabase-backup-restore.ps1 -RunIntegrated`.

## 결과의 범위

로컬 데이터 통합 복원 및 실제 인증/API 동작 검증을 완료함. 실제 외부 메일 발송·Cloudflare Turnstile·소셜 로그인·정식 도메인 배포는 이 격리 시험 범위가 아니며 출시 전 실제 환경 점검에 남음. 관리형 Supabase 프로젝트 자체 소실 시의 키/SMTP/암호화 루트 키 설정 재구축도 별도 운영 절차임.

현재는 사용자가 선택한 로컬 보관 방식. USB 이전과 자동 백업 예약은 아직 실행하지 않음. Cloudflare 조회 키 만료 예정일은 2026-11-15.
