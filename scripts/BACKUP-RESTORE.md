# SIANALY 데이터 백업·복원

상태: 2026-11-09 로컬 암호화 백업 및 실제 Auth/PostgREST/사이트 API를 연결한 통합 복원 시험 완료. [통합 시험 결과](RESTORE-TEST-20261109.md). 사용자 요청으로 클라우드 보관은 보류, USB 이전과 자동 실행은 추후.

## 현재 확인한 결과

후속: `-RunPrivacyReplay -RunIntegrated`로 실제 이전 회원 백업과 이후 생성한 독립 삭제 기록의 재적용 및 실제 인증/회원 통합 검사 통과. 이후 최신 기록 병합·만료 자료 정리 보완도 실제 이전 백업 재적용으로 재검증. 새 복구 개인키는 DPAPI 및 `backups/sianaly-recovery-key.sianaly-backup`으로 암호화 보관. 서버에는 공개키만 배포. D1 백업에서 운영자 기록 서명 1건·암호화 복구 기록 1건 검증. 최신 절차/한계는 `PRIVACY-OPERATIONS-20261109.md`. 현재 자동 예약·Drive 업로드·USB 실물 복사는 없으며 이 점은 그대로다.

2026-11-09 개인정보 대조 후 보완: 로컬 백업 보관 기준을 30일로 준비. `expire-local-backups.ps1`은 기본 미리보기이며 `-Apply`에서 생성 후 30일이 지난 정해진 이름의 파일만 삭제한다. 두 백업 실행 스크립트의 성공 뒤 정리를 연결했다. 자동 예약은 아직 없으므로 매일 수동 만료 점검이 필요하다. USB 사본은 운영자가 같은 기준으로 정리해야 한다. 실제 파일은 현재 만료 대상 0건이며 삭제하지 않았다. 테스트 파일을 통한 만료·비대상 보존 검사 통과. 자세한 대조 결과는 `LEGAL-AUDIT-20261109.md`.

이번에 운영자 본인의 사용하지 않는 과거 Google `name/full_name/picture/avatar_url`을 인증 원본과 연결 정보에서 제거했다. 그 전에 생성한 백업에는 남을 수 있으므로 해당 백업을 복원할 때 본인 운영자 계정의 동일 네 항목을 비공개 상태에서 다시 제거해야 한다. 다른 회원에 일괄 적용하지 않는다. 삭제·정정 요청 전체를 자동 재적용하는 기능은 아직 없으며 사고 복원 전 요청 대조 절차를 확정해야 한다.

- 최신 사용자 선택: 이 컴퓨터에만 암호화 보관하고 추후 USB로 복사. Google Drive 업로드 승인 거절 이후 업로드를 중단했고 실제 파일 업로드는 없었음. Drive에 빈 백업 폴더만 생성됨. 브라우저 업로드 제한을 우회하지 않음.
- Supabase Free / PostgreSQL 17.11. 사용자 테이블: `sianaly_favorites`, `sianaly_member_departures`; 회원은 `auth` 스키마. 첨부파일 객체는 이번 점검에서 0개.
- `auth,public,sianaly_internal`을 일관된 pg_dump 스냅샷으로 내보내고 비밀번호 없는 역할 정의·카탈로그·집계 점검표를 같이 암호화함. 원본은 수정하지 않음.
- 실제 회원 4 / 인증 식별자 4 / 즐겨찾기 4 / 대기 탈퇴 0건이 새 로컬 PostgreSQL 17에 복원됨. 강제 RLS·정책 3개·탈퇴 트리거 확인. 합성 시험 회원으로 본인 데이터만 읽기, 다른 회원 즐겨찾기 삽입 거부, 탈퇴 즐겨찾기 삭제·탈퇴 큐 동작 시험 통과. 로컬 변경은 롤백, 시험 서버 종료.
- 로컬 시험 역할 파일에서 Supabase 관리용 `GRANTED BY supabase_admin`만 시험 복원자의 부여로 바꿈. 원본 백업은 보존. 실제 관리형 새 프로젝트로 복원 시 공식 Supabase 절차에 맞는 역할 조정이 별도로 필요함.
- 후속 통합 시험에서 실제 Auth HTTP 가입·로컬 메일 확인·비밀번호 로그인·글쓰기·권한·재백업/복원·탈퇴와 D1 동기화·로그아웃까지 검증. 외부 SMTP 전달·OAuth·Turnstile·관리형 공급업체 설정 및 암호화 루트 키 재구축은 별도 실제 환경 점검.
- Cloudflare D1의 공식 export API는 조회 키로 401이었으나 `/query`의 읽기 전용 SELECT는 허용됨. 권한을 확대하지 않고 스키마·열 목록 확인 후 한 SELECT에서 전체 사용자 테이블·자동 증가 시퀀스의 일관된 스냅샷 생성. 수집 전후 스키마가 다르면 실패 처리. 현재 구현은 일반 SQLite 테이블 대상이며 가상 테이블은 지원하지 않고 중단함.
- D1 실제 11개 테이블의 구조·행·인덱스·뷰·트리거·시퀀스를 JSON 및 SQL로 암호화. 두 가지 독립 복원 경로에서 내용 해시·무결성·외래 키 확인 통과. 복원 시 조회수 트리거는 행 삽입 후 복구해 중복 집계 방지. 실제 게시글/댓글은 당시 0건이었고, 제보·집계·탈퇴 기록 등 나머지 데이터가 보존됨. 합성 자료로 큰 정수·바이너리·NUL 문자·FK 실패·조회수 트리거·삭제된 최대 자동 증가 값 보존 시험도 통과.

## 파일과 실행

- 원본/실제 회원 정보 및 키: `.secrets/backup/` 아래 접근 제한 폴더. Git·Pages 제외. 암호화 설정은 Windows CurrentUser DPAPI로만 저장.
- 암호화 파일: `backups/`. Git·Pages 제외 확인. 미래 USB에는 `.sianaly-backup` 파일, `SHA256SUMS.txt`, `USB-복구안내.txt`, 공개 `recovery-tools/`만 복사. `.secrets`, 평문 SQL, 로그, 복원 DB, 설정 파일은 복사하지 않음. 파일 암호화는 Windows DPAPI에 종속되지 않으며 복구 도구와 별도 보관 암호로 해독 가능.
- 백업 설정: `pwsh -STA -File scripts/setup-backup-window.ps1`. DB 비밀번호와 별도 백업 암호를 사용자가 직접 입력. 파일 암호는 컴퓨터/백업 파일과 별도 안전한 곳에 보관해야 다른 컴퓨터에서도 해독 가능.
- 캡처: `pwsh -File scripts/backup-supabase.ps1`.
- 게시판 캡처/복원 검증: `pwsh -File scripts/backup-d1.ps1`. 현재 조회 키는 2026-11-15 만료. 이후 재발급/안전한 갱신이 필요하며 기존 키를 영구 자동 백업에 사용할 수 있다고 가정하지 않음.
- 로컬 복원 시험: `pwsh -File scripts/test-supabase-backup-restore.ps1`. 대상 호스트는 127.0.0.1, 포트 55439로 고정. 실서비스 복원 명령이 아님.
- 실제 인증/API까지 통합 시험: 동일 명령에 `-RunIntegrated` 추가. Windows용 시험 Auth 바이너리와 PostgREST가 `tmp/restore-stack-tools/`에 필요. 모든 서버는 루프백에만 바인딩하고 Node 요청은 지정된 루프백 포트 밖으로 나가지 못하게 제한. 로컬 메일 수신기는 합성 `@example.test` 주소만 수신하며 외부 SMTP는 사용하지 않음. 임시 HTTPS 인증서는 Windows 시스템 신뢰 저장소에 설치하지 않음.
- PostgreSQL 도구: PostgreSQL 공식 Windows 다운로드 페이지가 연결한 EDB 17.11 바이너리 ZIP. 현재는 `tmp/backup-tools/`에만 풀고 Windows 서비스를 설치하지 않음. 도구 재설치 시 공식 배포와 버전 확인.
- TLS: Supabase Database Settings의 공식 CA를 저장하고 `verify-full` 유지. TLS 검증을 꺼서 문제를 우회하지 않음.
- 암호화: AES-256-GCM, 파일마다 새 salt/nonce, scrypt(N=65536,r=8,p=1). 내용·파일명·점검표까지 암호화. 평문 SHA-256만으로 보안을 대신하지 않음. 별도 기기에서의 수동 암호 입력 복호화 시험은 향후 필요.

## 아직 필요한 일

1. 추후 USB로 복사하고 복사본 SHA-256·복호화 검사. 현재는 이 컴퓨터 고장/분실에 대비한 외부 사본이 없음.
2. Supabase/D1은 서로 다른 시점의 백업이며 원자적인 공동 스냅샷이 아님. 실제 두 백업 통합 복원, 시험 데이터 추가 후 두 번째 백업/복원, 복원 후 정상 탈퇴의 두 저장소 동기화는 시험 완료. 사고 시 백업 이후 발생한 별도 탈퇴/글 삭제 요청·기간 만료 제보의 재적용 자동화는 별도 과제이며, 복원은 비공개 상태에서 이런 최신 내역까지 대조한 뒤 공개.
3. Auth 설정·서버 Secret·SMTP/Turnstile 설정·도메인·암호화 루트 키 복구 항목을 분리해 비공개 복구 절차 작성. 신규 환경은 새 키 사용과 세션 재로그인을 전제로 점검.
4. 다른 Windows 사용자/기기에서 파일 암호만으로 해독되는지 확인하는 실기기 시험은 미실시. 암호화 포맷의 독립 복호화/오류 암호/변조 거부는 합성 및 실제 파일로 검사함.
5. 매일 1회/최근 7일 보관은 제안 상태. 사용자 주기·보관 승인, 실패 알림, 오프사이트 보관과 보존기간 만료 시 Drive 휴지통·버전 포함 삭제 범위를 정하고 자동화.
6. 2026-11-09 서버 종료 여부·정확한 경로를 확인하고 이번 작업의 평문 임시 내보내기/복원 디렉터리 7개 삭제 완료. 암호화 백업·DPAPI 설정·공개 CA·내용 없는 집계 검증 기록은 보존.

통합 서비스 시험 후 추가 평문 시험 디렉터리 5개도 서버 종료·통과 증거 확인 후 삭제. 시험용 인증서/키·SMTP 원문·PostgreSQL/SQLite 사본은 남기지 않았고 원본 암호화 백업 4개의 SHA-256은 보존됨.

## 공식 근거

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://developers.cloudflare.com/d1/reference/time-travel/

공식 문서에 따르면 Free 프로젝트는 정기 논리 내보내기와 외부 백업이 권장됨. Supabase 자동 일일 백업을 Free 보장으로 간주하지 않음. D1 Time Travel 7일은 외부 사본을 대체하지 않음.
