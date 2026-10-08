# 100개 종목 DART 자동 업데이트

공식 corpCode.xml로 100개 종목을 98개 기업과 실적 공유 우선주 2개에 연결했습니다. 구성은 data/dart-companies.json, 검증 상태는 data/dart-status.json과 data/DART-STATUS.md에 있습니다.

90개 기업은 자동 갱신 대상입니다. 68개는 비교 기간 전체 검증을 통과했고, 22개는 IR와 정기보고서의 차이가 있는 특정 기간만 보류합니다. 나머지 8개는 공시를 감시하되 수치는 자동으로 덮어쓰지 않습니다. 금융회사의 지표 차이와 두산밥캣의 달러 보고를 제조업 매출이나 원화로 임의 변환하지 않습니다.

## 매일 실행과 배포

한국시간 매일 오후 6시에 이 채팅의 기존 예약 한 개로 실행합니다. 컴퓨터와 Codex 앱이 켜져 있고 Windows 암호화 키에 접근할 수 있어야 합니다. 서버 예약은 아직 이전하지 않았습니다.

1. GitHub 커넥터로 Hoon-sianaly/sianaly main의 최신 SHA를 읽습니다.
2. 아래 명령을 실제 Windows 사용자로 실행합니다. DPAPI/네트워크 접근이 필요하면 승인된 require_escalated를 사용합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\dart-portfolio.ps1 -Mode update -BaseSha <main SHA>
```

매일 실행에는 -UseCache를 사용하지 않습니다. 이 옵션은 오늘 수집한 원자료의 검증/재현용입니다. 최근 연간, 올해 종료된 1~3분기, 사이트가 보관 중인 전년도 분기를 재확인합니다. 없는 과거 분기를 무작정 추가하거나 4분기를 역산하지 않습니다. 동시 작업은 3개이며 최대 약 700회 재무 요청입니다.

3. 명령이 성공하고 dart-output/portfolio-update.json이 status=validated, baseSha=확인한 SHA일 때만 files를 처리합니다. 성공한 기업만 files에 포함되며 error 기업의 기존 값은 유지됩니다. review 기업과 held 기간은 검토 대상으로 남습니다. API 013은 미제공 기간으로 건너뛰고 기존 값을 삭제하지 않습니다.
4. test-dart-core.cjs, test-dart-portfolio.cjs, test-dart-samsung.cjs, test-dart-update.cjs를 실행합니다. files가 등록 기업의 data/companies/<key>.json만 포함하는지 검사합니다. 공유 우선주나 review 기업 파일은 금지합니다. 변경 없으면 커밋하지 않습니다.
5. main이 baseSha와 같은지 재확인하고 GitHub 커넥터 create_tree/create_commit/update_ref로 후보 files만 커밋합니다. 정확한 Git tree SHA를 기준으로 하며 expected_sha=baseSha, force:false를 사용합니다. main이 바뀌면 재수집합니다. 다른 작업 파일을 섞지 않습니다.
6. Cloudflare 배포 후 dev.sianaly.com/data/companies/<key>.json을 새 캐시 쿼리로 읽어 변경된 모든 회사의 값과 접수번호를 대조합니다. 변경이 없어도 이전 배포 실패가 없는지 main과 라이브를 확인합니다. 생산 사이트 sianaly.com의 별도 배포는 포함하지 않습니다.

## 지표와 안전장치

기업 번호·기간·보고서·연결/별도·KRW·접수번호·계정 중복을 검증합니다. 분기 thstrm_amount의 3개월 값을 쓰며 누적 thstrm_add_amount를 분기 값으로 쓰지 않습니다. 원화 정수와 접수번호를 저장하고 누락을 0으로 처리하지 않습니다. 연간 당기순이익이 원래 있으면 해당 계정이 없을 때 덮어쓰지 않습니다.

금융회사는 기존 metrics를 유지합니다. 카카오뱅크 순이자이익은 이자수익−이자비용, KB 총영업이익은 영업이익+일반관리비+신용손실, 증권사의 판관비 차감 전 손익은 영업이익+판관비로 대조했습니다. 메리츠는 보고서별 판관비 비용 부호를 고려합니다. 현재 세 기간과 저장된 전년 동기로 검증했고 기준이 안 맞는 값은 보류했습니다.

IR 정밀도/반올림한 누적값 차감의 작은 차이는 특정 접수번호·원화 원본·기존 값이 정확히 일치할 때만 한 번 대조했습니다. reconciliation은 다른 접수번호에 적용되지 않습니다. 큰 차이는 자동 허용하지 않습니다. DART 원본으로 전환된 행은 이후 공식 정정을 갱신하고, 같은 값과 같은 접수번호면 새 커밋을 만들지 않습니다.

기업 설명·주가·시총·잠정실적은 변경하지 않습니다. 회계 범위·분할·합병·통화/금융 지표 변경, 오래된 정정은 별도 검토합니다. 계정 오류는 해당 기업만 차단합니다.

## 검토와 알림

results의 review·held·error와 접수번호를 dart-output/notification-state.json 등 배포 제외된 상태 파일에 기록합니다. 새 공시나 새로운 오류가 있을 때만 알리고 기존 예외를 매일 반복 통지하지 않습니다. 정상 무변경 실행은 조용히 종료합니다.

보류 해제는 원문과 지표·보고 범위·통화를 대조한 뒤 검증해야 합니다. build-dart-plan.cjs는 최초 연결 계획 생성 도구이며 매일 실행하지 않습니다. 현재 DART 전환 데이터로 계획을 임의 재생성해 보류를 없애지 않습니다.

인증키는 .secrets/opendart-key.dpapi에서 자식 환경으로만 전달합니다. 내용·환경변수·키 포함 URL을 출력하거나 업로드하지 않습니다. .secrets, .env, dart-output, tmp는 Git/Cloudflare 배포 제외 대상입니다.

공식 API: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020
