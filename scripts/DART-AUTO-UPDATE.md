# 삼성전자 자동 업데이트

대상은 삼성전자(005930, DART 00126380)의 원화 연결 정기보고서입니다. 우선주 삼성전자우는 기존 companyRef를 통해 같은 실적을 사용합니다. 기업 설명, 사업 전망, 주가, 시총은 이 자동화에서 변경하지 않습니다.

이 채팅의 Codex 예약 실행을 매일 오후 6시(Asia/Seoul)에 설정합니다. 현재 방식은 컴퓨터가 켜져 있고 Codex 앱이 실행 중이며 프로젝트와 암호화 키에 접근할 수 있어야 합니다. 컴퓨터가 꺼져 있어도 실행되는 서버 자동화는 별도 서버 비밀 저장소 설정이 필요합니다.

## 실행과 배포

1. GitHub 커넥터로 Hoon-sianaly/sianaly main의 최신 커밋 SHA를 읽습니다.
2. 이 프로젝트에서 아래 명령을 실행합니다. Windows DPAPI 때문에 실제 Windows 사용자로 실행해야 하며, 샌드박스에서 암호화 파일을 복호화할 수 없다면 승인된 require_escalated 실행을 사용합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-dart-samsung.ps1 -BaseSha <main의 커밋 SHA>
```

3. 명령이 성공했고 dart-output/auto-update.json의 status가 validated이며 baseSha가 같을 때만 files를 배포합니다. files가 비어 있으면 변경 없이 종료합니다. 인증/통신/데이터 오류가 있으면 배포하지 않습니다. API 013은 아직 제공되지 않은 기간으로 건너뛰며 기존 값을 삭제하지 않습니다.
4. scripts/test-dart-samsung.cjs와 scripts/test-dart-update.cjs를 실행합니다. 후보 파일의 기업번호·기간·단위·출처가 검증됐는지 확인합니다. 파일 경로는 data/companies/samsung.json 하나만 허용합니다.
5. GitHub의 현재 main이 baseSha와 같을 때 커넥터로 트리와 커밋을 만들고 expected_sha를 지정해 main을 갱신합니다. 다른 변경이 생겼다면 최신 main을 기준으로 다시 수집합니다. force push는 하지 않습니다.
6. Cloudflare Pages 배포 후 https://dev.sianaly.com/data/companies/samsung.json 을 새 캐시 쿼리로 조회해 후보의 실적/접수번호와 비교합니다. 반영 확인에 실패하면 실패를 알리고 다음 실행에서 기존 main과 라이브 사이트를 대조합니다. 생산 사이트 sianaly.com의 별도 배포는 포함하지 않습니다.

## 데이터 범위와 안전장치

매일 전년도 사업/분기/반기보고서와 올해 종료된 1~3분기를 확인합니다. API 요청은 하루 최대 8개입니다. 전년도 보고서 정정도 다시 확인합니다. 이전 연도의 오래된 정정은 수동 재검토 대상입니다. 4분기 숫자를 연간에서 역산하지 않습니다. 잠정실적 발표는 이번 자동화에 포함하지 않습니다.

분기 매출·영업이익은 thstrm_amount의 3개월 값이며 누적값을 쓰지 않습니다. 연간 매출·영업이익·당기순이익은 검증된 표준 계정에서 읽습니다. 원화 정수 원본과 접수번호를 각 행의 dart 필드에 저장합니다. 계정 중복 충돌, 단위/기간/기업 불일치, 누락 금액은 중단 사유입니다. 오류를 0으로 처리하지 않습니다.

같은 숫자와 같은 접수번호면 새 커밋을 만들지 않습니다. 새로운 접수번호의 정정은 숫자가 같아도 출처를 갱신합니다. 전체 수집이 성공한 경우에만 후보를 내보내며 실패하면 이전 후보를 무효화합니다.

인증키는 .secrets/opendart-key.dpapi에서 자식 프로세스 환경으로만 전달합니다. 키/요청 URL/환경변수를 로그로 출력하지 않습니다. .secrets, .env, dart-output, tmp는 Git과 Cloudflare 배포에서 제외합니다. 예약 실행은 파일 변경과 배포에 사용자 승인을 이미 받은 범위 내에서 수행하며, 오류 또는 실제 변경이 있을 때만 알립니다.

공식 API 문서: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020
