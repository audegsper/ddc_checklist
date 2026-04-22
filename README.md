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
2. `site/index.html`을 브라우저로 열어 데모 모드로 먼저 확인합니다.
3. Supabase 계정을 만든 뒤 [supabase/schema.sql](/home/dohykim/ddc_checklist/supabase/schema.sql) 내용을 실행합니다.
4. `site/app-config.example.js`를 참고해 `site/app-config.js`를 수정합니다.
5. GitHub Pages를 Actions 기반 배포로 활성화합니다.
6. `site/app-config.js`에 값이 들어 있고 `useSupabase: true`면 keepalive 워크플로가 그 설정을 읽어 자동으로 호출합니다.

## GitHub Pages

- 워크플로: [.github/workflows/pages.yml](/home/dohykim/ddc_checklist/.github/workflows/pages.yml)
- 배포 대상: `site/`

## Supabase

- 스키마: [supabase/schema.sql](/home/dohykim/ddc_checklist/supabase/schema.sql)
- 설정 가이드: [site/app-config.example.js](/home/dohykim/ddc_checklist/site/app-config.example.js)
- 실제 런타임 설정: [site/app-config.js](/home/dohykim/ddc_checklist/site/app-config.js)

## keepalive 주의

Free Plan 휴면 완화용으로 스케줄링 요청을 넣어두었지만, 이 방식이 정책상 영구 보장을 뜻하지는 않습니다.  
운영 전에는 Supabase 최신 무료 플랜 정책을 다시 확인하는 것을 권장합니다.
