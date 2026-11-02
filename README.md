# ddc_checklist

병원 체크리스트용 모바일 웹 시작 프로젝트입니다.

정적 프론트는 `GitHub Pages`에 배포하고, 데이터는 `Supabase`에 저장하는 구성을 기준으로 만들었습니다.  
현재 버전은 아래 두 가지 모드로 동작합니다.

- `데모 모드`: Supabase 설정 전에도 `localStorage`로 바로 사용 가능
- `실서비스 모드`: `site/app-config.js`에 Supabase 정보를 넣으면 DB 연동

## 포함된 내용

- 모바일 우선 체크리스트 웹 UI
- 직원 추가/공간 추가/공간별 체크 항목 메모 편집
- 직원 선택 후 공간별 확인 기록 저장
- 공간별 코멘트 저장
- 최근 기록 보관 개수 설정
- Supabase 스키마 예시 SQL
- GitHub Pages 배포 워크플로
- Supabase keepalive GitHub Actions 템플릿

## 빠른 시작

1. GitHub 저장소에 이 코드를 올립니다.
2. Node.js 22 이상에서 `npm ci`, `npm run build`를 실행한 뒤 `site/`를 정적 HTTP 서버로 열어 확인합니다. 데모 모드는 `site/app-config.js`의 `useSupabase: false`로 선택합니다.
3. Supabase 계정을 만든 뒤 [supabase/schema.sql](supabase/schema.sql) 내용을 실행합니다.
4. `site/app-config.example.js`를 참고해 `site/app-config.js`를 수정합니다.
5. GitHub Pages를 Actions 기반 배포로 활성화합니다.
6. `site/app-config.js`에 값이 들어 있고 `useSupabase: true`면 keepalive 워크플로가 그 설정을 읽어 자동으로 호출합니다.

## GitHub Pages

- 워크플로: [.github/workflows/pages.yml](.github/workflows/pages.yml)
- 배포 대상: `site/`

## Supabase

- 스키마: [supabase/schema.sql](supabase/schema.sql)
- 설정 가이드: [site/app-config.example.js](site/app-config.example.js)
- 실제 런타임 설정: [site/app-config.js](site/app-config.js)

## keepalive 주의

Free Plan 휴면 완화용으로 스케줄링 요청을 넣어두었지만, 이 방식이 정책상 영구 보장을 뜻하지는 않습니다.  
운영 전에는 Supabase 최신 무료 플랜 정책을 다시 확인하는 것을 권장합니다.

## 개발 및 검증

- 설치: `npm ci`
- 회귀 테스트: `npm test`
- 배포 파일 생성: `npm run build` (`site/dist/app.js`)
- 브라우저 테스트: Microsoft Edge 설치 후 `npm run test:browser`
- GitHub Pages Actions가 테스트와 빌드를 실행합니다. 배포 파일은 직접 수정하지 않습니다.
- Supabase 라이브러리는 잠금 파일에 고정한 버전을 번들에 포함하므로, 접속할 때 외부 JavaScript CDN을 기다리지 않습니다.

## 연결 문제 확인

체크리스트가 나타나지 않으면 Supabase 대시보드에서 프로젝트가 실행 중인지 확인합니다. 일시중지 상태에서는 Resume 후 복원이 완료될 때까지 기다립니다. 서버가 중단되었을 때 데모 데이터로 바꾸지 않으며, 연결 오류와 재시도 버튼을 표시합니다.

현재 체크리스트를 먼저 표시한 뒤 지난 기록을 정리합니다. 데이터 요청은 10초 후 중단하며 자동 재시도로 대기 시간을 늘리지 않습니다. 목록은 페이지별로 끝까지 읽고, 지난 기록 조회 실패는 현재 체크리스트 표시를 막지 않고 안내합니다.
