# Blog Writer Web App — Design Spec

**Date:** 2026-03-17
**Status:** Approved

## Overview

Next.js 기반 독립 웹 앱. 주제/URL/텍스트를 입력하면 리서치 후 한국어 블로그 글을 자동 생성한다.

**핵심 구조:** Gemini Google Search + Naver API로 리서치, Claude Sonnet-4-5로 글쓰기.

---

## Architecture

### Stack

- **Frontend + Backend:** Next.js 14 (App Router)
- **리서치:** Google AI SDK (Gemini 2.0 Flash, Google Search Grounding) + Naver 검색 API
- **글쓰기:** Anthropic SDK (claude-sonnet-4-5)
- **스타일링:** Tailwind CSS

### Directory Structure

```
blog-writer-web/
├── app/
│   ├── page.tsx                  # 메인 UI (단일 페이지)
│   ├── layout.tsx
│   └── api/
│       └── generate/
│           └── route.ts          # POST /api/generate
├── lib/
│   ├── detect-mode.ts            # 입력 모드 자동 감지
│   ├── search.ts                 # Gemini Grounding + Naver API 통합
│   ├── fetch-content.ts          # URL 본문 fetch (Naver 모바일 폴백)
│   └── writer.ts                 # Claude API 블로그 글쓰기
├── components/
│   ├── InputArea.tsx             # 통합 입력창 + 모드 뱃지
│   ├── StyleSelector.tsx         # 스타일 프리셋 선택
│   ├── GenerateButton.tsx
│   └── ResultArea.tsx            # 마크다운 렌더링 + 복사
└── .env.local
    # ANTHROPIC_API_KEY
    # GOOGLE_AI_API_KEY
    # NAVER_CLIENT_ID
    # NAVER_CLIENT_SECRET
```

---

## Data Flow

```
사용자 입력
    ↓
detect-mode.ts
  - URL 패턴 → url_mode
  - 500자+ → content_mode
  - 그 외  → topic_mode
    ↓
POST /api/generate
    ↓
[topic_mode]
  search.ts
    1. Gemini Google Grounding (3~5개 결과)
    2. Naver 블로그 API (3~5개 결과)
    3. 주요 URL 본문 fetch (fetch-content.ts)
  → 수집된 리서치 컨텍스트
    ↓
[url_mode]
  fetch-content.ts
    - blog.naver.com → 실패 시 m.blog.naver.com
    - 일반 URL → 직접 fetch
    ↓
[content_mode]
  입력 텍스트 직접 사용
    ↓
writer.ts
  Claude Sonnet-4-5 호출
  스타일 프리셋 + SEO 공통 레이어 적용
    ↓
응답: { blog, title, wordCount, readingTime, keywords, style }
    ↓
ResultArea.tsx — 마크다운 렌더링 + 메타데이터
```

---

## UI Design

### 단일 페이지 레이아웃

```
┌─────────────────────────────────────┐
│  블로그 AI 작성기                      │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ 주제를 입력하세요…                 ││
│  │ (URL 붙여넣기, 내 글 붙여넣기 가능)  ││
│  │                    [📝 주제 감지] ││
│  └─────────────────────────────────┘│
│                                     │
│  스타일: [자동] [정보] [스토리] [가이드] │
│          [리스트] [의견]              │
│                                     │
│  ┌──────────────────────────────┐   │
│  │    ✨ 블로그 글 생성하기         │   │
│  └──────────────────────────────┘   │
│                                     │
│  ──────── 결과 ────────────────────  │
│  [마크다운 렌더링된 블로그 글]          │
│                                     │
│  글자수: 1,200자 | 읽기: 3분 | [복사] │
└─────────────────────────────────────┘
```

### 입력 모드 자동 감지 뱃지

- URL 감지 시: `🔗 URL 모드`
- 500자+ 감지 시: `📄 내용 재구성 모드`
- 기본: `📝 주제 모드`

---

## API Routes

### POST /api/generate

**Request:**
```json
{
  "input": "요즘 두쫀쿠가 유행한다던데",
  "style": "auto" | "informative" | "storytelling" | "how-to" | "listicle" | "opinion"
}
```

**Response:**
```json
{
  "blog": "## 마크다운 블로그 글...",
  "title": "두쫀쿠 열풍, 왜 지금 유행하는가",
  "wordCount": 1200,
  "readingTime": 3,
  "keywords": ["두쫀쿠", "디저트 트렌드"],
  "style": "informative",
  "mode": "topic_mode"
}
```

---

## Search Strategy (lib/search.ts)

### topic_mode 리서치

1. **Gemini Google Grounding** — 일반 정보, 트렌드, 뉴스
   - `gemini-2.0-flash` + `googleSearch` tool
   - 검색 결과 3~5개 소스 참조

2. **Naver 블로그 API** — 한국 블로그 특화 검색
   - `https://openapi.naver.com/v1/search/blog`
   - 상위 5개 결과 title + description 수집
   - 상위 2개 URL 본문 fetch 시도 (fetch-content.ts)

3. **컨텍스트 통합** — 두 소스 결과를 Claude에 전달

---

## Error Handling

| 상황 | 처리 |
|---|---|
| Naver API 실패 | Google 결과만으로 진행 |
| 특정 URL fetch 실패 | 스니펫만 사용, 계속 진행 |
| blog.naver.com 차단 | m.blog.naver.com 자동 재시도 |
| Claude API 실패 | 에러 메시지 표시, 재시도 버튼 |
| 검색 결과 없음 | LLM 자체 지식으로 글쓰기, 사용자에게 안내 |

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

---

## Module Contracts

### lib/detect-mode.ts

우선순위 순서 (반드시 이 순서로 체크):
1. URL 패턴 (`http://`, `https://`, 도메인) → `url_mode`
2. 500자 이상 → `content_mode`
3. 그 외 → `topic_mode`

```ts
export type InputMode = 'topic_mode' | 'url_mode' | 'content_mode'
export function detectMode(input: string): InputMode
```

### lib/fetch-content.ts

```ts
export async function fetchContent(url: string): Promise<string | null>
// - blog.naver.com → 실패 시 m.blog.naver.com 재시도
// - 타임아웃: 10초
// - 최대 반환 길이: 3,000자 (이후 잘라냄)
// - 실패 시 null 반환 (throw 안 함)
```

### lib/search.ts — Naver API 상세

```
엔드포인트: GET https://openapi.naver.com/v1/search/blog
쿼리 파라미터: query={검색어}&display=5&sort=sim
헤더: X-Naver-Client-Id, X-Naver-Client-Secret
반환: items[].title, items[].link, items[].description
```

### lib/search.ts — Gemini Grounding 상세

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
// model: gemini-2.0-flash
// tools: [{ googleSearch: {} }]
// 검색 결과는 response.candidates[0].groundingMetadata에서 추출
```

### lib/writer.ts — Claude 프롬프트 구조

시스템 프롬프트:
- 역할: 한국어 블로그 전문 작가
- SEO 규칙: 제목 앞쪽 키워드, 첫 문단 키워드 1회, H2/H3 롱테일 키워드, 문단 5줄 이하
- 스타일 프리셋별 어조/구조 지시

유저 프롬프트:
```
주제: {topic}
리서치 내용: {research_context}  ← Gemini + Naver 결과
스타일: {style}
출력 형식: 마크다운, 1500~2000자 목표
```

### API 응답 mode 값

```ts
mode: 'topic_mode' | 'url_mode' | 'content_mode'
```

---

## UI 상세

- **기본 스타일:** `auto` (페이지 로드 시)
- **ResultArea:** `react-markdown`으로 렌더링 (heading, list 표시)
- **wordCount:** 공백 제거 후 글자 수 (`content.replace(/\s/g, '').length`)
- **readingTime:** `Math.ceil(wordCount / 500)` 분 (한국어 기준 분당 500자)

---

## Key Decisions

1. **검색:** Gemini Google Grounding + Naver 블로그 API → Claude Code WebSearch보다 한국어 커버리지 높음
2. **글쓰기:** Claude Sonnet-4-5 — 한국어 품질 우선
3. **스트리밍:** 미사용 (한 번에 응답) — MVP 단순화. Vercel 60초 타임아웃 내 처리
4. **인증:** 없음 — 개인 툴, `.env.local` 키로 접근 제어
5. **배포:** Vercel 최적화 (Next.js 기본)
