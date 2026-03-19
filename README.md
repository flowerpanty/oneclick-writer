# 원클릭 글 생성기 (Instagram / 네이버 블로그 / WordPress)

이 프로젝트는 **ChatGPT 구독(웹)** 기반으로,
**“이야기 입력 → 프롬프트 생성 → ChatGPT에 붙여넣기 → 결과 JSON 붙여넣기”** 흐름으로 3채널 글을 정리해주는 로컬 웹앱입니다.

- OpenAI API Key가 필요하지 않습니다.
- 상단의 **“버전 2개 생성”** 토글을 켜면 각 채널 결과가 **A/B 두 버전**으로 검증/표시됩니다.
- **초기화 버튼**, **Ctrl/Cmd+Enter 단축키**, **사용 팁 패널**이 포함되어 입력/반복 작업이 더 빠릅니다.
- **SEO 강화 옵션**(핵심 키워드/의도/반복 목표/FAQ)을 통해 WordPress 결과를 더 SEO 중심으로 생성할 수 있습니다.
- **블로그 지침서 톤**(허당+솔직+질문형 CTA+다음화 여운)을 네이버 결과에 고정 반영했습니다.
- `[형식]` 입력(블로그/인스타/카드뉴스/릴스)으로 원하는 채널 느낌을 더 강하게 줄 수 있습니다.
- **워드프레스 지침서 톤**(에피소드형 흐름, 사장 일기 말투, 마지막 질문+해시태그 라인)을 고정 반영했습니다.

## 준비물
- Node.js 18+ (권장: 20+)
- ChatGPT 구독 계정(웹 사용)

## 설치/실행
1) 폴더로 이동
```bash
cd oneclick-writer
```

2) 의존성 설치
```bash
npm install
```

3) 서버 실행
```bash
npm start
```

4) 브라우저에서 열기
- http://localhost:8787

## 사용 방법
1) 주제/내 이야기 입력 후 **"1) 프롬프트 만들기"** 클릭
2) 생성된 프롬프트를 복사해서 ChatGPT 웹에 붙여넣고 실행
3) ChatGPT가 준 JSON 결과를 앱의 **"3) 결과(JSON) 붙여넣기"**에 넣기
4) **"4) 결과 불러오기"**를 누르면 탭(Instagram/Naver/WordPress)으로 표시
5) WordPress 탭의 **SEO 체크**에서 핵심 키워드 반영 상태를 확인

## 참고
- ChatGPT가 샘플 JSON 값(`string`)을 그대로 반환하면 앱에서 자동으로 거절하고 재생성을 안내합니다.

## 네이버 리서치 툴
패션 가방처럼 네이버 블로그/카페 기반으로 글감을 모을 때는 `/research` 화면을 사용할 수 있습니다.

### 준비
1) [네이버 개발자센터](https://developers.naver.com/)에서 애플리케이션 생성
2) 검색 API 사용 설정
3) `.env`에 아래 값 추가

```bash
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
NAVER_DATALAB_CLIENT_ID=...
NAVER_DATALAB_CLIENT_SECRET=...
NAVER_SEARCHAD_CUSTOMER_ID=...
NAVER_SEARCHAD_ACCESS_LICENSE=...
NAVER_SEARCHAD_SECRET_KEY=...
```

### 기능
- 네이버 블로그/카페 공개 검색 결과 수집
- 검색 깊이(페이지 수) 확장
- 제목/요약/날짜/출처 정리
- 중복 링크 제거
- 반복 키워드/연관 구문/추천 글감 각도 자동 정리
- 검색광고 API 기반 연관검색어 / 세부 연관검색어 추천
- 카페 질문 추출 / 콘텐츠 공백 / 토픽 군집 / 검색어별 진단
- CSV 다운로드
- 블로그 초안 작성용 프롬프트 복사

### 참고
- 데이터랩 검색어 트렌드 API 권한까지 켜면 `/research`의 트렌드 보드가 활성화됩니다.
- 검색 API 키와 데이터랩 키를 분리해서 넣어도 됩니다.
- 검색광고 API 키까지 넣으면 제목 후보와 후속 검색어가 연관검색어 데이터 기반으로 더 좋아집니다.
- 데이터랩 권한이 없으면 검색 결과 기반 인사이트만 표시하고, 트렌드 보드는 안내 메시지로 대체됩니다.

### 열기
- 글 생성기: http://localhost:8787
- 리서치 툴: http://localhost:8787/research

## 개발 모드
```bash
npm run dev
```

## 아이폰에서 쓰는 방법 (Render 배포)
맥을 계속 켜두지 않고 아이폰 Safari에서도 쓰려면, 이 앱을 Render 같은 클라우드 웹 서비스로 배포하면 됩니다.

### 중요한 차이
- 클라우드 배포에서는 `DISABLE_BROWSER_AUTOMATION=true`로 실행하도록 설정했습니다.
- 따라서 **자동 생성 버튼은 숨겨지고**, 대신 **프롬프트 복사 → ChatGPT 앱/웹에 붙여넣기 → 결과 붙여넣기** 방식으로 사용합니다.
- `/research`와 `/strategy`는 아이폰에서도 그대로 사용할 수 있습니다.

### HTTPS 동작 방식
- Render 웹 서비스는 기본 `onrender.com` 주소에 HTTPS를 자동 적용합니다.
- HTTP로 들어와도 HTTPS로 자동 리디렉션됩니다.
- 별도 인증서 설정 없이 배포 직후 `https://서비스명.onrender.com/oneclick-writer` 형태로 접속할 수 있습니다.

### 빠른 배포 순서
1) 이 저장소를 GitHub에 올립니다.
2) Render에서 새 Web Service를 만듭니다.
3) 이 저장소를 연결합니다.
4) Blueprint를 선택하면 저장소의 `render.yaml` 설정을 그대로 읽어 배포합니다.
5) 배포가 끝나면 `https://서비스명.onrender.com/oneclick-writer`로 접속합니다.

### Render 설정값
- Region: `Singapore`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Node Version: `22.22.0`

### Render 환경변수
```bash
NODE_ENV=production
DISABLE_BROWSER_AUTOMATION=true
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
NAVER_DATALAB_CLIENT_ID=...
NAVER_DATALAB_CLIENT_SECRET=...
NAVER_SEARCHAD_CUSTOMER_ID=...
NAVER_SEARCHAD_ACCESS_LICENSE=...
NAVER_SEARCHAD_SECRET_KEY=...
```

### 커스텀 도메인 연결
1) Render 서비스의 `Settings > Custom Domains`에서 도메인을 추가합니다.
2) Render가 안내하는 DNS 레코드를 도메인 업체에 등록합니다.
3) 인증서 발급이 끝나면 해당 도메인도 HTTPS로 자동 열립니다.

### 참고 문서
- [Deploy a Node Express App on Render](https://render.com/docs/deploy-node-express-app)
- [Web Services](https://render.com/docs/web-services)
- [Render Blueprints (IaC)](https://render.com/docs/infrastructure-as-code)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
