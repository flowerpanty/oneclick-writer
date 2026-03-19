# 발견 사항 & 공유 자료

(팀원이 유용한 발견을 여기에 기록)

---

## [strategist] 전체 아키텍처 + 프리셋 전략 보고서

### 1. 전체 파이프라인 설계

```
┌─────────────────────────────────────────────────────────────────┐
│                     BLOG WRITER PIPELINE                         │
│                                                                  │
│  [INPUT]                                                         │
│    │  사용자: 주제/URL/본문 텍스트                                  │
│    ▼                                                             │
│  [STEP 1: INPUT ANALYSIS]                                        │
│    │  입력 모드 감지 (topic / url / content)                       │
│    │  핵심 토픽 + 키워드 추출                                      │
│    │  대상 독자/플랫폼 추론                                        │
│    ▼                                                             │
│  [STEP 2: RESEARCH & REFERENCE COLLECTION]                       │
│    │  ┌─────────────────────┬──────────────────────┐              │
│    │  │ topic_mode          │ url_mode             │              │
│    │  │ WebSearch (3-5쿼리) │ WebFetch (대상 URL)   │              │
│    │  │ WebFetch (상위 3-5) │ + 관련 검색 보완      │              │
│    │  └─────────────────────┴──────────────────────┘              │
│    │  ※ 네이버 블로그 → Playwright MCP or 대안 (아래 별도 분석)     │
│    │  결과: 팩트/데이터/관점/출처 수집                               │
│    ▼                                                             │
│  [STEP 3: STYLE PRESET SELECTION]                                │
│    │  ┌───────────────────────────────────────┐                   │
│    │  │ 동적 추천 로직 (토픽 유형 기반)         │                   │
│    │  │   → 자동 추천 + 사용자 확인/오버라이드  │                   │
│    │  │   → 커스텀 옵션 (어투/구조 직접 지정)   │                   │
│    │  └───────────────────────────────────────┘                   │
│    ▼                                                             │
│  [STEP 4: DRAFT GENERATION]                                      │
│    │  프리셋 톤/구조 + writing-guide 품질 기준 적용                 │
│    │  제목 → 도입 → 본문 → 결론/CTA 순서 생성                      │
│    ▼                                                             │
│  [STEP 5: REVIEW & OUTPUT]                                       │
│    │  자체 검증 (톤 일관성, 팩트, 길이, 모바일 가독성)               │
│    │  마크다운 + 메타데이터 출력                                    │
│    │  사용자 수정 요청 시 부분 재생성                                │
│    ▼                                                             │
│  [OUTPUT] 완성된 블로그 글 (마크다운)                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 프리셋 유형 분석 — 현재 5개, 개선 제안

**현재 프리셋 (기존 skill에 이미 구현됨):**

| # | 프리셋 | 목적 | 평가 |
|---|--------|------|------|
| 1 | `informative` 정보전달형 | 객관적 설명 | 핵심 프리셋, 유지 |
| 2 | `storytelling` 스토리텔링형 | 경험담/에세이 | 핵심 프리셋, 유지 |
| 3 | `how-to` 실용/가이드형 | 단계별 가이드 | 핵심 프리셋, 유지 |
| 4 | `listicle` 리스트/큐레이션형 | 목록형 큐레이션 | 핵심 프리셋, 유지 |
| 5 | `opinion` 의견/분석형 | 주장+근거 | 핵심 프리셋, 유지 |

**추가 고려 프리셋 (v2에서 검토):**

| # | 프리셋 | 목적 | 추가 근거 |
|---|--------|------|----------|
| 6 | `seo-optimized` SEO 최적화형 | 네이버/구글 검색 상위 노출 특화 | 키워드 밀도, 메타태그, 구조화 데이터 중심 — informative와 다른 축 |
| 7 | `review` 리뷰형 | 제품/서비스 체험 리뷰 | 장단점 구조, 평점, 구매 가이드 — listicle과 겹치지만 구조가 다름 |

**전략적 판단: 현재 5개 프리셋으로 충분하다.**
- 이유: 5개가 한국 블로그의 주요 유형을 거의 커버함
- SEO 최적화는 별도 프리셋이 아니라 **모든 프리셋에 적용되는 레이어**로 설계하는 것이 더 나음
- 리뷰형은 `listicle` + `opinion`의 조합으로 커스텀 옵션에서 대응 가능
- 프리셋을 늘리면 선택 피로도가 증가하고 유지보수 비용이 올라감

### 3. 프리셋 동적 선택 로직 설계

**현재 구현된 방식 (SKILL.md 기준):**
- 사용자에게 번호 선택 요청
- 스킵 시 토픽 유형 기반 자동 추천

**개선된 동적 선택 전략:**

```
[동적 선택 흐름]

입력 분석 결과 (토픽, 키워드, 모드)
    │
    ├─ 1차: 규칙 기반 매칭 (현재와 동일)
    │   "기술 주제" → informative / how-to
    │   "경험담" → storytelling
    │   "비교/추천" → listicle
    │   "뉴스/트렌드" → opinion
    │
    ├─ 2차: 입력 텍스트 신호 분석 (새로 추가)
    │   "~하는 방법" / "~하는 법" → how-to
    │   "TOP" / "N가지" / "추천" → listicle
    │   "왜" / "~해야 하는 이유" → opinion
    │   URL 입력 + 원문이 에세이 → storytelling
    │
    ├─ 3차: 사용자 이력 기반 (v2)
    │   이전에 자주 선택한 프리셋 가중치 부여
    │
    └─ 최종: 추천 + 사용자 확인
        "이 주제에는 [how-to] 스타일을 추천합니다.
         다른 스타일을 원하시면 번호를 선택하세요."
```

**핵심 원칙:**
- **항상 추천하되, 항상 오버라이드 가능**해야 함
- "고정값이 아닌 동적"이라는 요구사항은 이미 토픽 기반 추천으로 충족됨
- 매번 LLM에게 프리셋을 "생성"시키는 것은 비용 대비 효과가 낮음 — 5개 프리셋의 파라미터를 조합하는 것이 더 예측 가능

### 4. 스킬 vs 에이전트 — 전략적 선택

**결론: 스킬(Skill) 방식이 맞다. 에이전트는 불필요하다.**

| 기준 | 스킬 | 에이전트 |
|------|------|----------|
| 호출 방식 | `/blog-writer` 한 번으로 시작 | 에이전트를 명시적으로 스폰해야 함 |
| 사용자 경험 | 단순, 직관적 | 오버헤드 — 사용자가 에이전트 개념 이해 필요 |
| 워크플로 복잡도 | 단일 흐름 (5단계) | 에이전트 간 통신 필요 시 복잡 |
| 상태 관리 | 대화 컨텍스트 내에서 충분 | 별도 상태 관리 필요 |
| 확장성 | 프리셋/레퍼런스 파일 추가로 확장 | 에이전트 추가/조율 필요 |
| 현재 구현 | 이미 SKILL.md 기반 구조 존재 | 처음부터 새로 설계 필요 |

**근거:**
1. 블로그 작성은 **선형 파이프라인**이다 (입력→리서치→스타일→생성→검토). 병렬 처리나 복잡한 분기가 없다.
2. 에이전트가 유리한 경우는 "여러 독립적인 작업을 병렬로 수행"하거나 "반복적으로 자율 판단이 필요"할 때인데, 블로그 작성은 그런 패턴이 아니다.
3. 이미 `/blog-writer` 스킬 구조가 존재하므로 이를 개선하는 것이 합리적이다.
4. 사용자 입장에서 `/blog-writer AI 마케팅 트렌드` 한 줄이면 끝나는 것이 가장 좋은 UX이다.

**유일하게 에이전트가 고려되는 경우:**
- 리서치 단계를 **서브에이전트**로 분리해서 메인 컨텍스트 윈도우를 보호하는 것은 고려할 만함
- 하지만 이는 스킬 내부에서 Agent 도구를 호출하는 것으로 해결 가능 (스킬의 프롬프트에서 "리서치는 Agent 도구로 위임" 지시)

### 5. 네이버 블로그 수집 전략

**문제:** 네이버 블로그는 iframe 기반 렌더링으로 단순 WebFetch로 본문을 가져오기 어려움

**선택지 분석:**

| 방법 | 장점 | 단점 | 추천 |
|------|------|------|------|
| WebFetch 직접 | 가장 단순 | 네이버 블로그 본문 못 가져올 가능성 높음 | 1차 시도로 사용 |
| 네이버 블로그 모바일 URL 변환 | `m.blog.naver.com` + `PostView.naver` 형태로 변환하면 일부 본문 접근 가능 | 모든 글에 적용 안 될 수 있음 | 2차 시도 |
| Playwright MCP | 완전한 렌더링 후 콘텐츠 추출 | 설치/설정 복잡, 속도 느림, MCP 서버 필요 | 최후 수단 |
| 네이버 Open API (Blog Search) | 공식 API, 안정적 | 본문 전체가 아닌 요약만 제공 | 검색 단계에 유용 |

**추천 전략 (계층적 폴백):**
1. WebFetch로 직접 시도
2. 실패 시 → 모바일 URL로 변환 후 재시도
3. 그래도 실패 시 → 사용자에게 내용 직접 붙여넣기 요청
4. Playwright는 **온보딩에서 옵션으로 제공** (설치 가이드 포함, 필수는 아님)

### 6. 온보딩 설계 방향

```
[온보딩 흐름]

1. 스킬 첫 실행 감지
   └─ 설정 파일 존재 여부 확인 (~/.blog-writer/config.json 등)

2. 필수 설정
   ├─ 기본 언어 확인 (한국어 기본값)
   ├─ 선호 플랫폼 (네이버/브런치/티스토리/기타)
   └─ 기본 프리셋 선호도 (선택 사항)

3. 선택 설정
   ├─ 네이버 API 키 (Blog Search API 활용 시)
   └─ Playwright 설치 여부 확인

4. 설정 저장 → 다음 실행부터 자동 적용
```

**주의: API 키 세팅은 최소화해야 한다.**
- Claude Code의 WebSearch/WebFetch는 API 키 없이 사용 가능
- 네이버 Open API를 쓸 경우에만 API 키가 필요
- "API 키가 없어도 기본 기능은 모두 동작"이 원칙

### 7. 기존 스킬 대비 개선 포인트 요약

| 영역 | 현재 (SKILL.md) | 개선 제안 |
|------|-----------------|----------|
| 프리셋 선택 | 번호 선택 or 자동 추천 | 입력 텍스트 신호 분석 추가, 추천 이유 명시 |
| 리서치 | WebSearch + WebFetch | 리서치를 서브에이전트로 위임 (컨텍스트 보호) |
| 네이버 대응 | 없음 | 모바일 URL 폴백 + Playwright 옵션 |
| 온보딩 | 없음 | 첫 실행 시 플랫폼/선호도 설정 |
| 프리셋 커스텀 | 6번 선택 시 질문 | 기존 프리셋 파라미터 조합 방식으로 개선 |
| SEO | 프리셋별 개별 적용 | 공통 SEO 레이어로 분리 (모든 프리셋에 적용) |

### 8. 핵심 설계 결정 요약

1. **스킬 방식 채택** — 에이전트 불필요, 단일 스킬이 최적
2. **프리셋 5개 유지** — 추가보다 기존 5개의 품질을 높이는 것이 우선
3. **동적 선택 = 규칙 기반 추천 + 사용자 확인** — LLM 동적 생성은 비효율
4. **리서치를 서브에이전트로 위임** — 메인 컨텍스트 보호
5. **네이버는 계층적 폴백** — Playwright는 선택 사항
6. **SEO는 프리셋이 아닌 공통 레이어** — 모든 글에 적용
7. **온보딩은 최소화** — API 키 없이도 핵심 기능 동작

---

## tech-reviewer 검토 결과

### 1. 기존 프로젝트 구조 파악

**server.js (Node.js/Express, ESM, ~5600줄)**
- 주요 API 엔드포인트:
  - `/api/agent/research` — 네이버 블로그/카페 검색 + SearchAD 키워드 볼륨 (SSE 스트리밍)
  - `/api/agent/naver-blog` — 리서치 → 블로그 프롬프트 생성 (LLM에 붙여넣는 방식)
  - `/api/agent/real-blog-write` — STEP7 프롬프트 빌드 + ChatGPT Puppeteer 자동화
  - `/api/style-memory/*` — 스타일 학습 메모리 CRUD
  - `/api/auto-generate` — ChatGPT Puppeteer 자동화 (로컬 전용)
- **핵심 패턴**: 서버가 프롬프트를 조립 → 실제 LLM 호출은 ChatGPT Puppeteer 자동화 or 수동 복붙. **Anthropic API 직접 호출 없음**
- **네이버 API 사용**: Naver Search API (blog/cafe 검색) + Naver SearchAD API (키워드 볼륨)
  - 반환값: 제목, 링크, 발행일, 설명 snippets — **본문 전체 없음**
- **의존성**: express, dotenv, zod, jsonrepair (핵심), puppeteer-core/extra/stealth (optional)
- **스타일 메모리**: JSON 파일 기반, URL fetch로 텍스트 추출 후 저장

**기존 URL fetch 방식 (style-memory.js:272)**
- `node fetch` + User-Agent 스푸핑으로 단순 HTTP 요청
- HTML 파싱은 자체 `extractReadableHtml()` 함수 (cheerio 없음)
- 네이버 블로그 본문은 iframe 내부 → **단순 fetch로는 본문 불가**

**기존 스킬 (`/Users/nahmsoochan/skills/blog-writer/SKILL.md`)**
- WebSearch + WebFetch 기반, 5가지 스타일 프리셋 이미 존재
- 네이버 API 연동 없음, Playwright 없음
- 현재 블로그 스킬과 새로 만들 네이버 특화 스킬은 분리해서 보완하는 구조가 맞음

---

### 2. 스킬 vs 에이전트 — 기술적 제약 차이 (전략가 판단 보완)

전략가의 "스킬 방식 채택" 결론에 동의. 기술적 근거 추가:

**Claude Code 스킬로 만들 때**
- `WebSearch` + `WebFetch` 사용 가능 → 일반 URL fetch 됨
- Bash 도구로 Node.js 스크립트 실행 가능 → Playwright 이론상 가능
- **실제 제약**: Claude Code sandbox에서 Playwright headless Chromium 다운로드/실행이 sandbox 정책에 따라 막힐 수 있음. **검증 필요, 믿고 설계하면 안 됨**
- 롱러닝 프로세스 유지 불가 (각 스킬 호출은 일회성) → 배치/스케줄 불가
- 네이버 API 키는 `~/.env` 또는 CLAUDE.md로 사전 설정 필요 → 온보딩 필수

**Claude Agent SDK (서버 기반)**
- 기존 Express 서버에 라우터 추가 or 독립 서버
- Playwright 완전히 자유롭게 사용 가능
- Anthropic API 키 직접 필요 (현재 기존 코드에는 없음 — ChatGPT Puppeteer 사용 중)
- 더 복잡한 설정, 하지만 본문 수집이 필요하면 유일한 옵션

**기술 판단**: MVP는 스킬. 네이버 본문 수집이 핵심 요건이 되면 에이전트(서버) 방식으로 전환.

---

### 3. 네이버 블로그 콘텐츠 수집 — 현실적 분석

**현재 프로젝트에서 이미 확인된 사실**
- Naver Search API → 제목 + snippet(150자 미만) + 링크. **본문 없음. 기존 코드도 이 방식만 사용.**
- `blog.naver.com` 직접 fetch → 로그인 여부 무관하게 iframe redirect 구조. 본문 접근 불가
- `m.blog.naver.com` 모바일 URL → JS 렌더링 없이 일부 공개 글 HTML 접근 가능하나 불안정

**Playwright로 네이버 블로그 본문 수집**
- 로컬 환경: 가능. headless Chromium + JS 렌더링 → `#postViewArea` / `.se-main-container` 선택 → 텍스트 추출
- Render 배포 환경: 어려움. 현재 프로젝트에 `render.yaml` 존재 → headless Chromium 바이너리(300MB+) 문제
- 네이버 rate limiting: IP 차단 위험. 공개 포스트에만 적용 가능

**실제 구현 가능한 수집 방법 (난이도순)**

| 방법 | 난이도 | 실제 가능 여부 | 비고 |
|---|---|---|---|
| Naver Search API snippets | 쉬움 | 확실 | 제목+snippets만, 본문 없음 |
| 모바일 URL fetch | 중간 | 부분적 | `m.blog.naver.com/xxx/yyy` — 공개글만, JS없이 |
| Playwright 로컬 | 어려움 | 가능 (로컬만) | 배포 불가 |
| 티스토리 WebFetch | 쉬움 | 가능 | 일반 HTML 구조, 단순 fetch로 본문 추출 가능 |
| 브런치 WebFetch | 중간 | 부분적 | SSR 페이지, 일부 fetch 가능 |

**권장 구현 전략 (전략가 계층적 폴백 안 지지)**:
1. WebFetch 직접 시도 (현재 style-memory.js와 동일한 방식)
2. 네이버 블로그라면 모바일 URL 변환 후 재시도
3. 실패 시 사용자에게 본문 직접 붙여넣기 요청
4. Playwright는 온보딩에서 옵션으로 제공 (설치 안내 포함)

---

### 4. API 키 목록 및 온보딩 설계

**필요한 API 키 (기존 서버 코드 기준)**

| 키 | 용도 | 발급처 | 필수 여부 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API 직접 호출 (에이전트 방식) | console.anthropic.com | 에이전트 방식 필수, 스킬 방식 불필요 |
| `NAVER_CLIENT_ID` | 네이버 Search API (블로그/카페 검색) | developers.naver.com | 선택 (없으면 WebSearch fallback) |
| `NAVER_CLIENT_SECRET` | 위와 동일 | developers.naver.com | 선택 |
| `NAVER_SEARCHAD_CUSTOMER_ID` | 키워드 검색량 조회 | searchad.naver.com | 선택 (없어도 동작) |
| `NAVER_SEARCHAD_ACCESS_LICENSE` | 위와 동일 | searchad.naver.com | 선택 |
| `NAVER_SEARCHAD_SECRET_KEY` | 위와 동일 | searchad.naver.com | 선택 |

**스킬 방식에서 최소 온보딩**: NAVER_CLIENT_ID + SECRET만 있으면 검색 기능 강화. 없어도 WebSearch로 동작.

**온보딩 흐름 (스킬 방식)**
```
첫 실행 감지:
1. ~/.blog-writer/config.json 또는 CLAUDE.md에 네이버 API 키 존재 여부 확인
2. 없으면:
   "네이버 블로그 검색 API를 연결하면 더 정확한 리서치가 가능합니다.
    (없어도 기본 웹 검색으로 동작합니다)
    API 키를 지금 설정하시겠어요? (y/n)"
3. y → developers.naver.com 링크 + 설정 방법 안내
4. n → WebSearch fallback으로 진행
```

**에러 핸들링**
- 키 없음: graceful skip + 안내 메시지
- 키 잘못됨 (401/403): 명확한 에러 + 재발급 링크
- Rate limit (429): 기존 서버 코드에 이미 3회 자동 재시도 구현됨 (재사용 가능)

---

### 5. 기존 프로젝트와 새 스킬의 연동/독립 관계

**독립으로 설계하는 것이 맞다**:
- 기존 서버는 Express + 자체 프롬프트 조립 + ChatGPT Puppeteer 방식
- 새 스킬은 Claude Code 환경 + Anthropic SDK 직접 사용
- 연동 시도하면 의존성이 복잡해짐

**기존 서버에서 재사용 가능한 것**:
- 네이버 API 호출 로직 (`fetchNaverSource`, `fetchSearchAdKeywords`) → 새 스킬의 research step에서 참조 가능 (Node.js 환경이면 직접 호출, 스킬이면 동일 로직을 WebSearch로 대체)
- 스타일 메모리 패턴 (`style-memory.js`) → 새 스킬의 레퍼런스 수집 구조로 참고
- BAG_ANGLE_LIBRARY, INSIGHT_CLUSTERS 패턴 → 프리셋 동적 선택 로직에서 참고

---

## [researcher] 코드베이스 심층 분석 + 스타일 유형 레퍼런스 — 2026-03-17

### 1. 기존 코드에서 발견한 핵심 패턴 (전략가/기술검토자와 중복 제거)

**blog-writer.js에서 발견한 리뷰형 구조 (확인됨):**
- `summaryBox` 렌더링 필드: brand, productName, price, size, material, color, features, recommendPoints
- `betterComment` (베러의 한마디): 브랜드 특화 코멘트 기능
- `htmlToNaverText()`: 네이버 블로그용 순수 텍스트 변환 함수 (HTML→텍스트)
- `inferBlogCategory()`: 정규식 기반 카테고리 자동 감지 — 가방/쿠키 카테고리
- **시사점**: 리뷰/제품소개형이 렌더링에는 구현되어 있으나 style-presets.md에는 미정의

**agent.js 데이터 흐름 (확인됨):**
- bridge TTL: 10분, 트리거: `?from=agent` URL 파라미터
- 전달 필드: brandName, blogType, targetAudience, toneAndManner, avoidDirection, workGoals, researchData, writingPlan
- **시사점**: 새 스킬에서도 리서치→생성 단계 간 구조화된 데이터 전달 패턴 필요

### 2. 스타일 유형 보완 분석

전략가 "5개 유지" 판단에 **부분 동의**, 보완 근거:

| 프리셋 | 커버 못하는 영역 |
|--------|---------------|
| `informative` | 제품 리뷰 장단점 구조, 평점 |
| `listicle` | 비교(A vs B)와 큐레이션 혼재 |
| `opinion` | 뉴스 속보와 개인 분석 혼재 |

blog-writer.js에 `summaryBox`, `betterComment`, `inferBlogCategory`가 이미 구현 → **리뷰형 콘텐츠가 실 사용례에서 빈번**. v1은 5개 + 커스텀 강화, v2에서 리뷰형 검토 권고.

### 3. 스킬 references/ 확장 제안

```
references/
├── style-presets.md       # 5가지 프리셋 (기존)
├── writing-guide.md       # 범용 품질 기준 (기존)
├── seo-layer.md           # SEO 공통 레이어 (신규)
├── naver-optimization.md  # 네이버 블로그 최적화 가이드 (신규)
└── preset-examples/       # 프리셋별 실제 예시 (v2)
```

### 4. 네이버 URL 변환 패턴

스킬 WebFetch 시도 순서:
1. 원본 URL → WebFetch
2. PC URL → `m.blog.naver.com` 변환 후 재시도
3. PostView URL → `m.blog.naver.com/{blogId}/{logNo}` 변환
4. 모두 실패 → 사용자 본문 붙여넣기 요청

---

## [researcher] 블로그 AI 도구 사례 조사 + 한국 블로그 패턴 분석 — 2026-03-17 (추가)

### 1. 기존 블로그 자동작성 AI 도구 사례 조사

#### 1.1 글로벌 도구 — "리서치→글 생성" 파이프라인 보유 도구

**Frase.io** (리서치→글 생성 파이프라인 가장 강력)
- 핵심: SERP 상위 20개 경쟁 페이지 분석 → 자동 콘텐츠 브리프 생성 → AI 초안 작성
- 워크플로우: 키워드 입력 → 경쟁사 헤딩/질문/토픽 자동 수집 → 아웃라인 빌더 → AI 초안 → SEO 스코어 최적화
- 강점: 리서치 단계가 자동화되어 있음. "사람들이 묻는 질문", "경쟁자 헤딩 구조" 자동 추출
- **우리 스킬에 시사점**: Step 2 리서치를 "경쟁 블로그 구조 분석"까지 확장 가능

**Surfer SEO**
- 핵심: "Content Score" 대시보드 — NLP 기반 최적화 제안
- 워크플로우: 키워드 리서치 → 콘텐츠 에디터 (실시간 SEO 스코어) → 최적화
- 강점: SEO 최적화가 글쓰기 과정에 내장. 키워드 밀도, 헤딩 구조, 글 길이 실시간 피드백
- **우리 스킬에 시사점**: SEO 레이어를 글 생성 후 "검증 단계"에 적용하는 패턴 참고

**KoalaWriter**
- 핵심: 원클릭 SEO 최적화 블로그 글 생성
- 워크플로우: 키워드 입력 → 자동 아웃라인 → 완성 글 (핵심 단어 강조, 목록, 짧은 단락, 테이블 자동 삽입)
- 강점: "한 번에 끝" 워크플로우. 사용자 개입 최소화
- **우리 스킬에 시사점**: 프리셋 자동 추천 + 자동 생성 모드("빠른 생성") 옵션

**Copy.ai Workflows**
- 핵심: 다단계 콘텐츠 프로세스 자동화
- 워크플로우: 리서치 → 아웃라인 → 초안 → 최적화를 커스텀 파이프라인으로 구성
- 강점: 단계별 자동화 템플릿. 각 단계의 출력이 다음 단계 입력으로 자동 전달
- **우리 스킬에 시사점**: 스킬의 5단계 파이프라인과 유사. Step간 데이터 전달 구조 참고

**Jasper**
- 핵심: 브랜드 보이스 일관성 + 50+ 템플릿
- 강점: 장문 콘텐츠 coherence. 브랜드 톤 학습
- 약점: SEO 기능 내장 없음, 가격 높음 (5인 $625/월)
- **우리 스킬에 시사점**: "브랜드 보이스 학습" 기능은 style-memory.js 패턴으로 이미 기존 프로젝트에 구현됨

**Writesonic**
- 핵심: SEO 내장 + 이미지 생성 (Photosonic)
- 강점: SEO 기능 빌트인, 가격 대비 기능 (5인 $399/월)
- **우리 스킬에 시사점**: SEO를 별도 단계가 아닌 생성 과정에 녹이는 접근

#### 1.2 한국 도구 — 뤼튼(Wrtn)

- 한국어 특화 AI 글쓰기 도구. 무제한 무료 제공
- 블로그, SNS, 이메일, 뉴스레터, 제안서 등 다양한 콘텐츠 자동 생성
- 30대 이하 한국인 생성형 AI 사용자 수 2위
- 2025년 GPT-5 업그레이드
- **한계**: "리서치→글 생성" 파이프라인 없음. 템플릿 기반 단발성 생성
- **우리 스킬에 시사점**: 뤼튼은 리서치 단계가 없으므로, 리서치 통합이 우리의 차별화 포인트

#### 1.3 핵심 인사이트 — 시장 트렌드

| 트렌드 | 설명 | 우리 설계 반영 |
|--------|------|-------------|
| 리서치 자동화 | Frase/Copy.ai가 경쟁 분석 자동화 | Step 2에 경쟁 블로그 구조 분석 추가 |
| SEO 내장 | Surfer/Writesonic이 실시간 SEO 제공 | SEO 공통 레이어로 반영 |
| 원클릭 워크플로우 | KoalaWriter가 한 번에 생성 | "빠른 생성" 모드 옵션 |
| 브랜드 보이스 | Jasper가 톤 학습 | style-memory.js 패턴 활용 |
| 단계별 파이프라인 | Copy.ai Workflows | 이미 5단계 구조로 설계됨 |

### 2. 한국 블로그 생태계 실제 글쓰기 패턴

#### 2.1 네이버 블로그 상위노출 글 구조 (웹 조사 결과)

**네이버 SEO 핵심 규칙:**
- 제목: 25자 이내, 목표 키워드 가장 앞에 배치
- 본문: 600~800자 적절 (현재 프리셋의 1,500~4,000자보다 훨씬 짧음 — 확인 필요)
- 이미지: 6~13개 삽입 권장
- 키워드: 본문 내 정확한 키워드 3~5개 + 유사 세부 키워드
- **경험 기반 어투**: "~했는데 어땠습니다", "~를 알아보았는데 장단점은 아래와 같더라구요"

**C-Rank 알고리즘 관련:**
- 특정 주제에 대한 전문성/신뢰도 평가
- 꾸준한 포스팅 + 하나의 주제에 집중하는 것이 유리
- 저자의 활동 패턴, 글쓰기 패턴, 독자 활용도 분석

#### 2.2 한국 블로그 실제 유형 분류 (현장 기반)

기존 5개 프리셋 외, 한국 블로그에서 실제로 많이 쓰이는 패턴:

| # | 유형 | 특징 | 기존 프리셋 매핑 | 별도 필요 여부 |
|---|------|------|---------------|-------------|
| 1 | **체험단/협찬 리뷰** | 제품 수령→사용→장단점→추천. "이 제품 000 사용해봤어요" | `listicle`에 가깝지만 구조 다름 | v2에서 `review` 프리셋 |
| 2 | **맛집/카페 탐방** | 위치→외관→메뉴→맛평가→정보(주차/영업시간). 이미지 중심 | `storytelling` + 정보형 혼합 | 커스텀으로 대응 |
| 3 | **일상/육아 에세이** | 개인 경험 + 감성 + 사진. ~요체/~거든요 어투 | `storytelling` 매핑됨 | 불필요 |
| 4 | **IT/개발 튜토리얼** | 코드 블록 + 스크린샷 + 단계별 설명 | `how-to` 매핑됨 | 불필요 |
| 5 | **쇼핑/비교 가이드** | TOP N + 가격대별 비교 + 최종 추천 | `listicle` 매핑됨 | 불필요 |
| 6 | **뉴스/이슈 정리** | 최신 이슈 요약 + 의견 + 전망 | `opinion` 매핑됨 | 불필요 |
| 7 | **레시피/DIY** | 재료→과정→완성→팁. 이미지 필수 | `how-to` 매핑됨 | 불필요 |
| 8 | **여행 후기** | 일정별 코스→장소 설명→팁→비용. 사진 다수 | `storytelling` + `listicle` 혼합 | 커스텀으로 대응 |

**결론**: 기존 5개 프리셋이 한국 블로그 유형의 약 80%를 커버. 체험단/협찬 리뷰만 구조적으로 다름 (summaryBox 등 전용 필드 필요). 맛집/여행 등은 커스텀 옵션으로 대응 가능.

#### 2.3 네이버 블로그 글 길이에 대한 주의사항

웹 조사에서 "600~800자"가 네이버 상위노출에 적절하다는 정보가 나왔으나, 이는 **짧은 정보성 글** 기준. 실제로는:
- 체험 리뷰: 1,000~2,000자
- 정보/가이드: 1,500~3,000자
- 일상 에세이: 500~1,500자

현재 style-presets.md의 길이 설정(1,000~4,000자)은 적절한 범위. 다만 **네이버 최적화 시 이미지 삽입 위치 가이드**가 추가로 필요 (200~300자마다 이미지 권장).

### 3. 스킬 vs 에이전트 — 리서처 최종 의견

전략가와 기술검토자 모두 "스킬 방식 채택"에 동의. 리서처도 **동의**.

추가 근거:
- 조사한 AI 도구들 (Frase, Surfer, KoalaWriter 등) 모두 **단일 파이프라인** 구조. 멀티 에이전트를 사용하는 도구는 없음
- Copy.ai의 "Workflows"도 단일 흐름의 단계별 자동화이지, 병렬 에이전트가 아님
- 우리 스킬의 5단계 파이프라인은 시장의 검증된 패턴과 일치

**단, 리서치 단계에서 서브에이전트 활용은 찬성:**
- Frase처럼 경쟁 블로그 20개를 분석하려면 대량의 컨텍스트가 필요
- 이를 메인 스킬 컨텍스트에 넣으면 품질 저하 → Agent 도구로 위임이 합리적

---

## strategist 설계 결과 — 상세 파이프라인 확장 + 프리셋 전략 + Phase 계획

> team-lead 요청 기반. tech-reviewer(네이버 본문 제약, API 키) + researcher(리뷰형 코드, Frase/경쟁 분석, 한국 블로그 패턴) 결과 반영.

### 1. 전체 파이프라인 확장 설계

**기존 (SKILL.md):** `Analyze → Collect → Select Style → Generate → Review`

**확장:**
```
[STEP 0: ONBOARDING] (첫 실행 시만)
  │
  ▼
[STEP 1: INPUT ANALYSIS] ← 기존 동일
  모드 감지, 토픽+키워드 추출
  │
  ▼
[STEP 2: RESEARCH] ← 기존 + 2b/2c 추가 (서브에이전트로 위임)
  ├─ 2a. 팩트/데이터 리서치 (기존)
  ├─ 2b. 레퍼런스 블로그 수집 ★신규
  └─ 2c. 레퍼런스 스타일 분석 ★신규
  │
  ▼
[STEP 3: STYLE SELECTION] ← 기존 + 동적 매칭/미세조정
  ├─ 3a. 프리셋 매칭 (규칙 + 레퍼런스 프로필 기반)
  ├─ 3b. 미세 조정 (불일치 축을 override)
  └─ 3c. 사용자 확인/오버라이드
  │
  ▼
[STEP 4: GENERATE] ← 기존 동일 (조정된 프리셋 적용)
  │
  ▼
[STEP 5: REVIEW & OUTPUT] ← 기존 동일
  │
  ▼
[STEP 6: PRESET SAVE] ★신규 (선택적)
```

**변경 요약:**

| 단계 | 기존 | 추가/변경 |
|------|------|----------|
| Step 0 | 없음 | 온보딩 (첫 실행) |
| Step 2 | WebSearch+WebFetch | 2b 레퍼런스 수집 + 2c 스타일 분석 |
| Step 3 | 번호선택/토픽추천 | 레퍼런스 기반 5축 매칭 + override |
| Step 6 | 없음 | 커스텀 프리셋 저장 |

#### Step 2b: 레퍼런스 블로그 수집 상세

> tech-reviewer: 네이버 API는 snippets만, 직접 fetch는 iframe 불가.
> researcher: 기존 코드도 네이버 본문 포기, snippets만 사용. 티스토리/브런치는 WebFetch 가능.

```
1. 검색 쿼리 (WebSearch)
   ├─ "[주제] 블로그"
   ├─ "[주제] 후기 OR 정리"
   └─ "[주제] site:tistory.com OR site:brunch.co.kr" (수집 성공률 높은 플랫폼 우선)

2. URL 우선순위 (본문 수집 성공률 기준)
   ① tistory.com → 단순 HTML, 성공률 높음
   ② brunch.co.kr → SSR, 부분 가능
   ③ 기타 블로그 → WebFetch 직접
   ④ blog.naver.com → 최후순위 (모바일 URL 폴백)

3. 네이버 블로그 폴백 (researcher URL 변환 패턴 참조)
   ① WebFetch 시도
   ② m.blog.naver.com 변환 재시도
   ③ m.blog.naver.com/{blogId}/{logNo} 변환
   ④ 실패 → 건너뛰기 (snippets만 활용)

4. 성공 기준
   최소 2개 본문 수집 → 진행
   부족 → 쿼리 변경 1회 재시도
   여전히 부족 → snippets + 팩트 리서치만으로 진행 (graceful degradation)
```

**Frase 패턴 차용 (researcher 조사 반영):**
- Frase는 경쟁 페이지 20개를 분석하여 "어떤 헤딩을 쓰는지", "어떤 질문에 답하는지" 추출
- 우리는 3-5개로 축소하되, 수집된 블로그의 **헤딩 구조 + 다루는 소주제**를 정리하여 Step 4 아웃라인에 반영
- 이를 서브에이전트(Agent 도구)로 위임하여 메인 컨텍스트 보호

#### Step 2c → Step 3: 스타일 분석 → 프리셋 매칭

**5축 스타일 프로필:**

| 축 | 값 | 설명 |
|---|---|------|
| ending | formal / casual / mixed | 어미 (~합니다 vs ~해요) |
| paragraph | short / medium / long | 문단 길이 |
| structure | list / narrative / step-by-step / qa | 글 구조 |
| emotion | objective / subjective / emotional | 감정 톤 |
| reader_relation | distant / friendly / intimate | 독자 관계 |

**기존 프리셋의 기본 프로필 (style-presets.md에 추가 예정):**

| 프리셋 | ending | paragraph | structure | emotion | reader_relation |
|--------|--------|-----------|-----------|---------|-----------------|
| informative | formal | medium | list | objective | distant |
| storytelling | casual | short | narrative | emotional | intimate |
| how-to | mixed | medium | step-by-step | objective | friendly |
| listicle | mixed | short | list | subjective | friendly |
| opinion | formal | long | narrative | subjective | distant |

**매칭 흐름:**
1. 수집된 블로그에서 각각 5축 분석
2. 다수결로 "지배적 프로필" 결정
3. 각 프리셋과 축별 일치 수 계산 (최대 5)
4. 최고 스코어 프리셋 추천 + 불일치 축을 override로 전달

**예시:**
> 입력: "ChatGPT 활용법"
> 지배적 프로필: casual / short / step-by-step / subjective / friendly
> 매칭: how-to 3/5, listicle 3/5, storytelling 2/5
> 추천: **how-to** (structure 축 일치가 결정적)
> override: ending→casual, paragraph→short, emotion→subjective
>
> 사용자에게:
> "인기 블로그 분석 결과, 친근한 어투의 단계별 가이드가 많습니다.
>  **실용/가이드형 + 친근한 어투**로 작성하겠습니다.
>  변경: 1.정보전달 2.스토리텔링 3.가이드 4.리스트 5.의견 6.커스텀"

### 2. 프리셋 동적 선택/생성 전략

#### 핵심: 프리셋 = base + override (프리셋 수를 늘리지 않음)

```
최종 스타일 = base_preset + style_overrides

예: base=how-to, overrides={ending:casual, paragraph:short, emotion:subjective}
→ how-to 구조를 따르되, 어투는 친근, 문단은 짧게, 톤은 주관적
```

- 5개 프리셋 x 5축 조합 → 수십 가지 변형 가능
- researcher 조사의 "체험단/맛집/여행" 등 혼합형도 base + override로 표현 가능
  - 맛집 탐방: base=storytelling, override={structure:list} (이야기형이지만 메뉴별 리스트 구조)
  - 체험 리뷰: base=listicle, override={emotion:subjective, reader_relation:intimate}

#### 커스텀 프리셋 생성 — 두 가지 경로

**경로 1: 레퍼런스 URL 기반 자동 생성**
```
트리거: "이 블로그 스타일로 써줘: [URL]"

1. WebFetch로 본문 수집
2. 5축 스타일 프로필 추출
3. 추가 추출: 도입부/전환어/마무리 패턴, 특징적 표현
4. base 프리셋 선택 + override 결정
5. 커스텀 프리셋 생성:
   name: "user_custom_1"
   display_name: "테크 블로그 친근체" (LLM 자동 명명)
   base: how-to
   overrides: {ending:casual, paragraph:short, ...}
   example_patterns:
     intro: "오늘은 제가 직접 써본 ~에 대해 이야기해볼게요."
     transition: "자, 그럼 다음으로"
     closing: "여러분도 한번 시도해보세요!"
   source_url: [URL]
   created: 2026-03-17
```

**경로 2: 사용자 직접 지정 (기존 "6.커스텀" 구조화)**
```
"커스텀 스타일 설정:
 어미: ① ~합니다 ② ~해요 ③ 혼용
 문단: ① 짧게 ② 보통 ③ 길게
 구조: ① 리스트 ② 서술 ③ 단계별 ④ Q&A
 톤:  ① 객관적 ② 주관적 ③ 감성적
 독자: ① 격식 ② 친근 ③ 친밀"
```

#### 프리셋 저장/재사용

- 저장 위치: `references/custom-presets.md`
- 스타일 선택 시 기존 1-6번 뒤에 저장된 커스텀 자동 표시
- "저번 스타일로" → 가장 최근 커스텀 프리셋 적용

### 3. 구현 단계 (Phase 1, 2, 3)

#### Phase 1: 리서치 강화 + 네이버 대응 — MVP

| 항목 | 내용 |
|------|------|
| **목표** | 레퍼런스 블로그 수집으로 글 품질 향상 |
| **변경 파일** | `SKILL.md`만 |
| **핵심 변경** | Step 2에 2b(레퍼런스 수집) 추가. 티스토리/브런치 우선 + 네이버 모바일 URL 폴백. 리서치를 서브에이전트로 위임. 경쟁 블로그 헤딩/소주제 분석(Frase 패턴). |
| **MVP 기준** | `/blog-writer [주제]` → 관련 블로그 2-3개 참고하여 글 작성 |
| **안 건드리는 것** | 스타일 분석, 동적 선택, 온보딩, 커스텀 저장 |

#### Phase 2: 스타일 분석 + 동적 프리셋 선택

| 항목 | 내용 |
|------|------|
| **목표** | 레퍼런스 스타일 분석 → 프리셋 자동 추천 + 미세 조정 |
| **변경 파일** | `SKILL.md`, `references/style-presets.md` |
| **핵심 변경** | Step 2c(5축 스타일 분석) 추가. Step 3을 스코어 기반 매칭으로 교체. style-presets.md에 프리셋별 기본 프로필 추가. |
| **MVP 기준** | "인기 블로그 분석 결과, [listicle + 친근 어투] 추천합니다" — 근거 있는 자동 추천 |
| **안 건드리는 것** | 커스텀 생성/저장, 온보딩 |

#### Phase 3: 커스텀 프리셋 + 온보딩

| 항목 | 내용 |
|------|------|
| **목표** | "이 블로그처럼 써줘" → 커스텀 스타일 생성/저장/재사용. 온보딩. |
| **변경 파일** | `SKILL.md`, `references/custom-presets.md` (신규) |
| **핵심 변경** | Step 0(온보딩) + Step 6(프리셋 저장) 추가. URL 기반 커스텀 프리셋 자동 생성. |
| **MVP 기준** | URL → 커스텀 스타일 생성 → 저장 → 재사용 |

#### Phase 의존성 + 파일 변경 범위

```
Phase 1 → Phase 2 → Phase 3 (순차)
각 Phase 독립 배포 가능, 기존 스킬 정상 동작 보장
```

| 파일 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| `SKILL.md` | Step 2 확장 | Step 2c, 3 변경 | Step 0, 6 추가 |
| `style-presets.md` | - | 5축 프로필 추가 | - |
| `writing-guide.md` | - | - | - |
| `custom-presets.md` | - | - | 신규 |
| `seo-layer.md` (researcher 제안) | - | 검토 | - |
| `naver-optimization.md` (researcher 제안) | Phase 1과 함께 | - | - |

---

# DEAD_ENDS (시도했으나 실패한 접근)

(실패한 접근을 여기에 기록 — 같은 실수 반복 방지)

- 네이버 블로그 단순 fetch: `blog.naver.com` URL을 직접 fetch하면 iframe redirect 구조로 본문 접근 불가. 기존 서버 코드에서도 Naver Search API의 snippets만 사용하고 본문 fetch는 하지 않음 (이미 포기한 접근).
