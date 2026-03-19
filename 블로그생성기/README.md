# 네이버 블로그 생성기

첨부된 프롬프트 구조를 그대로 반영해서 만든 반자동 웹앱입니다.  
네이버 API로 조사 데이터를 모으고, STEP 1/2/3를 각각 별도 페이지에서 진행한 뒤, 외부 AI에서 받은 JSON 결과를 다시 붙여넣어 다음 단계로 이어갈 수 있습니다.

## 실행

```bash
npm start
```

기본 주소는 `http://127.0.0.1:3217` 입니다.

- `/`
  홈과 진행 상태 요약
- `/step1.html`
  조사 + STEP 1 프롬프트/결과
- `/step2.html`
  선택 제목 기반 STEP 2 프롬프트/결과
- `/step3.html`
  최종 STEP 3 프롬프트/결과 + 워드프레스 HTML 미리보기

## 구성

- `server.js`
  정적 웹앱 서빙과 API 프록시를 담당합니다.
- `lib/naver-api.js`
  네이버 검색, 카페, 데이터랩, 검색광고 API 호출을 처리합니다.
- `lib/prompt-templates.js`
  STEP 1/2/3 프롬프트 템플릿을 읽고 입력값을 채워 넣습니다.
- `prompts/`
  첨부 문서를 바탕으로 정리한 프롬프트 원본입니다.
- `public/`
  홈, STEP 1, STEP 2, STEP 3 페이지와 공용 상태 스크립트가 들어 있습니다.

## 환경 변수

`.env` 또는 시스템 환경 변수로 아래 값을 사용할 수 있습니다.

- `PORT`
- `HOST`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `NAVER_DATALAB_CLIENT_ID`
- `NAVER_DATALAB_CLIENT_SECRET`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_SEARCHAD_ACCESS_LICENSE`
- `NAVER_SEARCHAD_SECRET_KEY`

## 사용 흐름

1. `/step1.html`에서 주제와 검색의도를 입력하고 `데이터 수집`으로 네이버 조사 데이터를 채웁니다.
2. STEP 1 프롬프트를 생성해서 원하는 AI에 넣고 JSON 결과를 붙여넣습니다.
3. 제목을 하나 선택한 뒤 `/step2.html`에서 본문 설계도 JSON을 만듭니다.
4. `/step3.html`에서 최종 본문 패키지 JSON을 붙여넣고 HTML 미리보기를 확인합니다.
