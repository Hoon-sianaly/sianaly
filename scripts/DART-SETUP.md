# 삼성전자 OpenDART 수집 시험

이 문서는 수동 수집·비교 시험 안내입니다. 삼성전자 예약 수집·배포는 DART-AUTO-UPDATE.md를 참고하세요.

프로젝트 폴더의 PowerShell 터미널에서 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-dart-key.ps1
```

암호 입력 프롬프트에 인증키를 붙여 넣고 Enter를 누릅니다. 키는 표시하거나 채팅에 보내지 않습니다. Windows DPAPI로 암호화해 `.secrets/opendart-key.dpapi`에 저장하며 현재 Windows 계정에서만 복호화합니다. 저장 경로는 Git·Cloudflare 배포 제외 목록에 들어 있습니다. 평문 환경설정 파일이나 브라우저 JavaScript에는 키를 넣지 않습니다.

저장 후 확인:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-dart-samsung.ps1
```

기본은 2025년 연결 사업보고서입니다. 2026년 2분기 확인:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-dart-samsung.ps1 -Year 2026 -Report 11012
```

공식 `fnlttSinglAcntAll.json` API의 `thstrm_amount`는 분·반기 손익계산서에서 3개월 금액입니다. `thstrm_add_amount` 누적 금액을 분기 실적으로 쓰지 않습니다. 원화·기업번호·보고서 기간·접수번호·매출/영업이익 계정을 검증하며 누락을 0으로 바꾸지 않습니다. API 오류나 기준 불일치 시 중단합니다.

결과는 배포 제외된 `dart-output/samsung-연도-보고서코드.json`에 저장합니다. 원화 정수·조원 환산값·원문 링크·확인 시각·기존 수치와 차이를 기록합니다. `review-required`는 기존 IR 값과 차이가 있으니 보고서·회계 범위·반올림·정정을 대조하라는 의미입니다. `match`도 이번 요청에서 비교한 매출·영업이익만 일치한다는 뜻입니다. 사이트의 원본 JSON은 변경하지 않습니다.

인증키를 변경하려면 설정 스크립트를 다시 실행합니다. Windows 계정/장치가 바뀌면 기존 암호 파일을 복사하는 대신 다시 설정합니다. 수집 스크립트를 서버로 옮길 때는 서버의 비밀 저장소를 사용합니다. `.secrets` 폴더를 공유·업로드하지 않습니다.

공식 문서: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020
