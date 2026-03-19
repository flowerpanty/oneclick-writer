# Blog Writer Web App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 14 독립 웹 앱으로 Gemini Google Search + Naver API 리서치, Claude Sonnet-4-5 글쓰기를 조합한 한국어 블로그 자동 작성기를 구현한다.

**Architecture:** 단일 API 라우트(`POST /api/generate`)가 입력 모드 감지 → 리서치 → 글쓰기 파이프라인을 순서대로 실행한다. 리서치는 `lib/search.ts`(Gemini + Naver)와 `lib/fetch-content.ts`(URL fetch)가 담당하고, 글쓰기는 `lib/writer.ts`(Claude)가 담당한다. UI는 단일 `app/page.tsx`에서 컴포넌트를 조합한다.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, @anthropic-ai/sdk, @google/generative-ai, react-markdown, Jest + @testing-library/react

---

## File Structure

```
blog-writer-web/                          ← 새 독립 앱 (기존 repo와 별도)
├── app/
│   ├── layout.tsx                        # 기본 레이아웃, 폰트
│   ├── page.tsx                          # 메인 UI 페이지
│   └── api/
│       └── generate/
│           └── route.ts                  # POST /api/generate 엔드포인트
├── lib/
│   ├── detect-mode.ts                    # 입력 → InputMode 감지
│   ├── fetch-content.ts                  # URL 본문 fetch (Naver 폴백)
│   ├── search.ts                         # Gemini Grounding + Naver API
│   └── writer.ts                         # Claude API 블로그 생성
├── components/
│   ├── InputArea.tsx                     # 통합 입력창 + 모드 뱃지
│   ├── StyleSelector.tsx                 # 스타일 프리셋 선택
│   └── ResultArea.tsx                    # 마크다운 렌더링 + 복사
├── types/
│   └── index.ts                          # 공유 타입 정의
├── __tests__/
│   ├── lib/
│   │   ├── detect-mode.test.ts
│   │   ├── fetch-content.test.ts
│   │   └── writer.test.ts
│   └── api/
│       └── generate.test.ts
├── .env.local                            # API 키 (gitignore)
├── .env.example                          # 키 이름 목록
└── jest.config.ts
```

---

## Chunk 1: 프로젝트 셋업 + 공유 타입

### Task 1: Next.js 프로젝트 생성

**Files:**
- Create: `blog-writer-web/` (새 디렉토리)
- Create: `blog-writer-web/.env.local`
- Create: `blog-writer-web/.env.example`
- Create: `blog-writer-web/types/index.ts`

- [ ] **Step 1: Next.js 앱 생성**

```bash
cd ~/Desktop/daily
npx create-next-app@latest blog-writer-web \
  --typescript --tailwind --app --no-src-dir \
  --no-eslint --import-alias "@/*"
cd blog-writer-web
```

Expected: `blog-writer-web/` 디렉토리 생성, `app/page.tsx` 존재 확인

- [ ] **Step 2: 필요 패키지 설치**

```bash
npm install @anthropic-ai/sdk @google/generative-ai react-markdown
npm install --save-dev jest @types/jest ts-jest \
  @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event jest-environment-jsdom
```

- [ ] **Step 3: jest.config.ts 생성**

```ts
// jest.config.ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', {}] },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
}

export default config
```

- [ ] **Step 4: jest.setup.ts 생성**

```ts
// jest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: package.json에 test 스크립트 추가**

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
}
```

- [ ] **Step 6: .env.example 생성**

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

- [ ] **Step 7: .env.local 생성 (실제 키 입력)**

```
ANTHROPIC_API_KEY=<내 키>
GOOGLE_AI_API_KEY=<내 키>
NAVER_CLIENT_ID=<내 키>
NAVER_CLIENT_SECRET=<내 키>
```

- [ ] **Step 8: .gitignore에 .env.local 확인**

```bash
grep ".env.local" .gitignore
```

Expected: `.env.local` 라인 존재

### Task 2: 공유 타입 정의

**Files:**
- Create: `blog-writer-web/types/index.ts`

- [ ] **Step 1: types/index.ts 작성**

```ts
// types/index.ts

export type InputMode = 'topic_mode' | 'url_mode' | 'content_mode'

export type StylePreset =
  | 'auto'
  | 'informative'
  | 'storytelling'
  | 'how-to'
  | 'listicle'
  | 'opinion'

export interface GenerateRequest {
  input: string
  style: StylePreset
}

export interface GenerateResponse {
  blog: string
  title: string
  wordCount: number
  readingTime: number
  keywords: string[]
  style: StylePreset
  mode: InputMode
}

export interface ResearchContext {
  sources: Array<{
    title: string
    url: string
    content: string
  }>
  query: string
}
```

- [ ] **Step 2: 타입 파일 컴파일 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git init
git add .
git commit -m "feat: initial Next.js setup with types"
```

---

## Chunk 2: lib 모듈 (detect-mode, fetch-content)

### Task 3: lib/detect-mode.ts

**Files:**
- Create: `blog-writer-web/lib/detect-mode.ts`
- Create: `blog-writer-web/__tests__/lib/detect-mode.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/lib/detect-mode.test.ts
import { detectMode } from '@/lib/detect-mode'

describe('detectMode', () => {
  it('URL을 감지한다', () => {
    expect(detectMode('https://blog.naver.com/xxx')).toBe('url_mode')
    expect(detectMode('http://example.com')).toBe('url_mode')
  })

  it('500자 이상 텍스트를 content_mode로 감지한다', () => {
    const longText = 'a'.repeat(500)
    expect(detectMode(longText)).toBe('content_mode')
  })

  it('URL을 포함한 500자 이상 텍스트는 url_mode로 감지한다 (URL 우선)', () => {
    const input = 'https://example.com ' + 'a'.repeat(500)
    expect(detectMode(input)).toBe('url_mode')
  })

  it('짧은 텍스트를 topic_mode로 감지한다', () => {
    expect(detectMode('요즘 두쫀쿠가 유행한다던데')).toBe('topic_mode')
    expect(detectMode('')).toBe('topic_mode')
  })

  it('499자는 topic_mode다', () => {
    expect(detectMode('a'.repeat(499))).toBe('topic_mode')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest detect-mode --no-coverage
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: lib/detect-mode.ts 구현**

```ts
// lib/detect-mode.ts
import type { InputMode } from '@/types'

const URL_PATTERN = /https?:\/\/[^\s]+/

export function detectMode(input: string): InputMode {
  if (URL_PATTERN.test(input)) return 'url_mode'
  if (input.length >= 500) return 'content_mode'
  return 'topic_mode'
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest detect-mode --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/detect-mode.ts __tests__/lib/detect-mode.test.ts
git commit -m "feat: add detect-mode with URL-first priority"
```

### Task 4: lib/fetch-content.ts

**Files:**
- Create: `blog-writer-web/lib/fetch-content.ts`
- Create: `blog-writer-web/__tests__/lib/fetch-content.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/lib/fetch-content.test.ts
import { fetchContent, toMobileNaverUrl } from '@/lib/fetch-content'

describe('toMobileNaverUrl', () => {
  it('blog.naver.com을 m.blog.naver.com으로 변환한다', () => {
    expect(toMobileNaverUrl('https://blog.naver.com/abc/123'))
      .toBe('https://m.blog.naver.com/abc/123')
  })

  it('이미 모바일 URL이면 그대로 반환한다', () => {
    expect(toMobileNaverUrl('https://m.blog.naver.com/abc/123'))
      .toBe('https://m.blog.naver.com/abc/123')
  })

  it('네이버가 아닌 URL은 그대로 반환한다', () => {
    expect(toMobileNaverUrl('https://example.com/post'))
      .toBe('https://example.com/post')
  })
})

describe('fetchContent', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('성공 시 텍스트를 반환한다', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<html><body><p>블로그 내용</p></body></html>'),
    })
    const result = await fetchContent('https://example.com')
    expect(result).toContain('블로그 내용')
  })

  it('실패 시 null을 반환한다 (throw 안 함)', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('timeout'))
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })

  it('blog.naver.com 실패 시 모바일 URL로 재시도한다', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('<p>모바일 내용</p>') })
    const result = await fetchContent('https://blog.naver.com/abc/123')
    expect(result).toContain('모바일 내용')
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('m.blog.naver.com')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest fetch-content --no-coverage
```

Expected: FAIL

- [ ] **Step 3: lib/fetch-content.ts 구현**

```ts
// lib/fetch-content.ts

const TIMEOUT_MS = 10_000
const MAX_CONTENT_LENGTH = 3_000

export function toMobileNaverUrl(url: string): string {
  return url.replace('://blog.naver.com', '://m.blog.naver.com')
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_LENGTH)
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchContent(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (res?.ok) {
      const html = await res.text()
      return extractText(html)
    }

    // 네이버 블로그 모바일 폴백
    if (url.includes('blog.naver.com') && !url.includes('m.blog.naver.com')) {
      const mobileUrl = toMobileNaverUrl(url)
      const mobileRes = await fetchWithTimeout(mobileUrl)
      if (mobileRes?.ok) {
        const html = await mobileRes.text()
        return extractText(html)
      }
    }

    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest fetch-content --no-coverage
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/fetch-content.ts __tests__/lib/fetch-content.test.ts
git commit -m "feat: add fetch-content with Naver mobile fallback"
```

---

## Chunk 3: lib/search.ts + lib/writer.ts

### Task 5: lib/search.ts

**Files:**
- Create: `blog-writer-web/lib/search.ts`

- [ ] **Step 1: lib/search.ts 구현**

```ts
// lib/search.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { fetchContent } from './fetch-content'
import type { ResearchContext } from '@/types'

const NAVER_BLOG_API = 'https://openapi.naver.com/v1/search/blog'

async function searchNaver(query: string): Promise<Array<{ title: string; link: string; description: string }>> {
  const res = await fetch(
    `${NAVER_BLOG_API}?query=${encodeURIComponent(query)}&display=5&sort=sim`,
    {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      },
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.items ?? []
}

async function searchGemini(query: string): Promise<string> {
  const ai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = ai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }] as any,
  })
  const result = await model.generateContent(
    `"${query}"에 대해 한국어로 핵심 정보, 최신 트렌드, 관련 사실들을 정리해줘. 출처 URL도 포함해줘.`
  )
  return result.response.text()
}

export async function research(query: string): Promise<ResearchContext> {
  const [naverItems, geminiSummary] = await Promise.allSettled([
    searchNaver(query),
    searchGemini(query),
  ])

  const naverResults = naverItems.status === 'fulfilled' ? naverItems.value : []
  const geminiText = geminiSummary.status === 'fulfilled' ? geminiSummary.value : ''

  // 네이버 상위 2개 본문 fetch
  const fetchedContents = await Promise.all(
    naverResults.slice(0, 2).map(async (item) => {
      const content = await fetchContent(item.link)
      return {
        title: item.title.replace(/<[^>]+>/g, ''),
        url: item.link,
        content: content ?? item.description.replace(/<[^>]+>/g, ''),
      }
    })
  )

  // 나머지 네이버 결과는 스니펫만
  const snippetContents = naverResults.slice(2).map((item) => ({
    title: item.title.replace(/<[^>]+>/g, ''),
    url: item.link,
    content: item.description.replace(/<[^>]+>/g, ''),
  }))

  const sources = [
    ...(geminiText ? [{ title: 'Google 검색 종합', url: '', content: geminiText }] : []),
    ...fetchedContents,
    ...snippetContents,
  ]

  return { sources, query }
}
```

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/search.ts
git commit -m "feat: add search with Gemini grounding + Naver API"
```

### Task 6: lib/writer.ts

**Files:**
- Create: `blog-writer-web/lib/writer.ts`
- Create: `blog-writer-web/__tests__/lib/writer.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/lib/writer.test.ts
import { buildUserPrompt, resolveStyle } from '@/lib/writer'

describe('resolveStyle', () => {
  it('auto는 주제 유형에 따라 프리셋을 반환한다', () => {
    expect(resolveStyle('auto', '두쫀쿠 유행 트렌드')).toBe('informative')
    expect(resolveStyle('auto', '이란 미사일 뉴스 분석')).toBe('opinion')
    expect(resolveStyle('auto', '파스타 만드는 방법 레시피')).toBe('how-to')
  })

  it('명시적 스타일은 그대로 반환한다', () => {
    expect(resolveStyle('storytelling', '아무 주제')).toBe('storytelling')
    expect(resolveStyle('listicle', '아무 주제')).toBe('listicle')
  })
})

describe('buildUserPrompt', () => {
  it('리서치 컨텍스트를 포함한 프롬프트를 생성한다', () => {
    const prompt = buildUserPrompt('두쫀쿠 유행', 'informative', [
      { title: '소스1', url: 'https://a.com', content: '두쫀쿠 관련 내용' },
    ])
    expect(prompt).toContain('두쫀쿠 유행')
    expect(prompt).toContain('informative')
    expect(prompt).toContain('두쫀쿠 관련 내용')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest writer --no-coverage
```

Expected: FAIL

- [ ] **Step 3: lib/writer.ts 구현**

```ts
// lib/writer.ts
import Anthropic from '@anthropic-ai/sdk'
import type { StylePreset, GenerateResponse, InputMode } from '@/types'

const client = new Anthropic()

const STYLE_SYSTEM: Record<Exclude<StylePreset, 'auto'>, string> = {
  informative: '객관적이고 구조적인 정보전달형 글을 작성한다. 소제목을 활용하고 사실 중심으로 서술한다.',
  storytelling: '친근하고 개인적인 경험담 스타일로 작성한다. 독자와 공감대를 형성하는 어투를 사용한다.',
  'how-to': '단계별 실전 가이드 형식으로 작성한다. 번호 목록과 명확한 지시어를 사용한다.',
  listicle: '핵심을 모은 목록형으로 작성한다. 각 항목은 짧고 임팩트 있게 서술한다.',
  opinion: '주장과 근거 중심의 분석형 글을 작성한다. 다양한 관점을 비교하고 결론을 내린다.',
}

const STYLE_KEYWORDS: Record<Exclude<StylePreset, 'auto'>, string[]> = {
  informative: ['트렌드', '유행', '신제품', '정보', '특징'],
  opinion: ['뉴스', '분석', '이유', '왜', '시사', '미사일', '정치', '경제'],
  'how-to': ['방법', '단계', '레시피', '가이드', '하는법', '만들기', '설치'],
  listicle: ['추천', '순위', 'TOP', '베스트', '비교', '목록'],
  storytelling: ['여행', '일상', '경험', '감상', '후기', '에세이'],
}

export function resolveStyle(style: StylePreset, topic: string): Exclude<StylePreset, 'auto'> {
  if (style !== 'auto') return style

  for (const [preset, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some((kw) => topic.includes(kw))) {
      return preset as Exclude<StylePreset, 'auto'>
    }
  }
  return 'informative'
}

export function buildUserPrompt(
  topic: string,
  style: Exclude<StylePreset, 'auto'>,
  sources: Array<{ title: string; url: string; content: string }>
): string {
  const researchText = sources
    .filter((s) => s.content)
    .map((s) => `[${s.title}]\n${s.content}`)
    .join('\n\n---\n\n')

  return `주제: ${topic}

스타일: ${style}

리서치 내용:
${researchText || '(리서치 없음 — 자체 지식으로 작성)'}

요구사항:
- 마크다운 형식 (## 소제목, 줄글 본문)
- 목표 글자 수: 1,500~2,000자
- SEO: 제목 앞쪽에 핵심 키워드, 첫 문단에 키워드 1회 자연스럽게 포함
- 문단당 5줄 이하 (모바일 가독성)
- 결론에 CTA 포함
- 리서치에서 확인된 사실만 사용 (없으면 자체 지식 활용, 단 불확실한 통계 생성 금지)

출력: 마크다운 블로그 글만 출력 (다른 설명 없이)`
}

const SYSTEM_PROMPT = `당신은 한국어 블로그 전문 작가입니다.
독자가 읽기 쉽고 유익한 한국어 블로그 글을 작성합니다.
사실에 기반하여 작성하며, 확인되지 않은 통계나 수치를 만들어내지 않습니다.`

export async function writeBlog(
  topic: string,
  style: StylePreset,
  sources: Array<{ title: string; url: string; content: string }>,
  mode: InputMode
): Promise<GenerateResponse> {
  const resolvedStyle = resolveStyle(style, topic)
  const systemWithStyle = `${SYSTEM_PROMPT}\n\n글쓰기 스타일: ${STYLE_SYSTEM[resolvedStyle]}`
  const userPrompt = buildUserPrompt(topic, resolvedStyle, sources)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: systemWithStyle,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const blog = message.content[0].type === 'text' ? message.content[0].text : ''

  // 제목 추출 (첫 번째 # 헤딩)
  const titleMatch = blog.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1] : topic

  // 메타데이터 계산
  const wordCount = blog.replace(/\s/g, '').length
  const readingTime = Math.ceil(wordCount / 500)

  // 키워드 추출 (## 헤딩에서)
  const keywords = [...blog.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]).slice(0, 5)

  return { blog, title, wordCount, readingTime, keywords, style: resolvedStyle, mode }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest writer --no-coverage
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/writer.ts __tests__/lib/writer.test.ts
git commit -m "feat: add writer with Claude Sonnet-4-5 and style resolution"
```

---

## Chunk 4: API 라우트

### Task 7: app/api/generate/route.ts

**Files:**
- Create: `blog-writer-web/app/api/generate/route.ts`
- Create: `blog-writer-web/__tests__/api/generate.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// __tests__/api/generate.test.ts
import { POST } from '@/app/api/generate/route'
import { NextRequest } from 'next/server'

// lib 모듈 mock
jest.mock('@/lib/search', () => ({
  research: jest.fn().mockResolvedValue({
    sources: [{ title: '테스트', url: 'https://a.com', content: '테스트 내용' }],
    query: '테스트',
  }),
}))

jest.mock('@/lib/fetch-content', () => ({
  fetchContent: jest.fn().mockResolvedValue('URL 내용'),
}))

jest.mock('@/lib/writer', () => ({
  writeBlog: jest.fn().mockResolvedValue({
    blog: '## 테스트 블로그\n내용',
    title: '테스트',
    wordCount: 100,
    readingTime: 1,
    keywords: ['테스트'],
    style: 'informative',
    mode: 'topic_mode',
  }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/generate', () => {
  it('topic_mode 요청을 처리한다', async () => {
    const req = makeRequest({ input: '두쫀쿠 유행', style: 'auto' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.blog).toBeDefined()
    expect(data.mode).toBe('topic_mode')
  })

  it('빈 input은 400을 반환한다', async () => {
    const req = makeRequest({ input: '', style: 'auto' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('url_mode에서 fetchContent를 호출한다', async () => {
    const { fetchContent } = require('@/lib/fetch-content')
    const req = makeRequest({ input: 'https://example.com', style: 'auto' })
    await POST(req)
    expect(fetchContent).toHaveBeenCalledWith('https://example.com')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest generate --no-coverage
```

Expected: FAIL

- [ ] **Step 3: route.ts 구현**

```ts
// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { detectMode } from '@/lib/detect-mode'
import { research } from '@/lib/search'
import { fetchContent } from '@/lib/fetch-content'
import { writeBlog } from '@/lib/writer'
import type { GenerateRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json()
    const { input, style } = body

    if (!input?.trim()) {
      return NextResponse.json({ error: '입력이 비어있습니다' }, { status: 400 })
    }

    const mode = detectMode(input)
    let sources: Array<{ title: string; url: string; content: string }> = []

    if (mode === 'topic_mode') {
      const ctx = await research(input)
      sources = ctx.sources
    } else if (mode === 'url_mode') {
      const content = await fetchContent(input)
      sources = content
        ? [{ title: '입력 URL', url: input, content }]
        : [{ title: '입력 URL (내용 없음)', url: input, content: '' }]
    } else {
      // content_mode: 입력 텍스트 직접 사용
      sources = [{ title: '입력 내용', url: '', content: input }]
    }

    const result = await writeBlog(input, style, sources, mode)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/generate]', err)
    return NextResponse.json({ error: '블로그 생성 중 오류가 발생했습니다' }, { status: 500 })
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest generate --no-coverage
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/generate/route.ts __tests__/api/generate.test.ts
git commit -m "feat: add generate API route"
```

---

## Chunk 5: UI 컴포넌트 + 메인 페이지

### Task 8: UI 컴포넌트

**Files:**
- Create: `blog-writer-web/components/InputArea.tsx`
- Create: `blog-writer-web/components/StyleSelector.tsx`
- Create: `blog-writer-web/components/ResultArea.tsx`

- [ ] **Step 1: components/InputArea.tsx 작성**

```tsx
// components/InputArea.tsx
'use client'
import { useEffect, useState } from 'react'
import { detectMode } from '@/lib/detect-mode'
import type { InputMode } from '@/types'

const MODE_LABELS: Record<InputMode, string> = {
  topic_mode: '📝 주제 모드',
  url_mode: '🔗 URL 모드',
  content_mode: '📄 내용 재구성 모드',
}

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

export function InputArea({ value, onChange, disabled }: Props) {
  const [mode, setMode] = useState<InputMode>('topic_mode')

  useEffect(() => {
    setMode(detectMode(value))
  }, [value])

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="w-full rounded-xl border border-gray-200 p-4 text-base
                   placeholder-gray-400 resize-none focus:outline-none
                   focus:ring-2 focus:ring-indigo-400 min-h-[120px]
                   disabled:opacity-50"
        placeholder="주제를 입력하세요… URL 붙여넣기, 수집한 글 붙여넣기도 가능해요"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <span className="text-xs text-gray-400 self-end">{MODE_LABELS[mode]}</span>
    </div>
  )
}
```

- [ ] **Step 2: components/StyleSelector.tsx 작성**

```tsx
// components/StyleSelector.tsx
'use client'
import type { StylePreset } from '@/types'

const STYLES: Array<{ value: StylePreset; label: string }> = [
  { value: 'auto', label: '자동' },
  { value: 'informative', label: '정보전달' },
  { value: 'storytelling', label: '스토리텔링' },
  { value: 'how-to', label: '가이드' },
  { value: 'listicle', label: '리스트' },
  { value: 'opinion', label: '의견/분석' },
]

interface Props {
  value: StylePreset
  onChange: (v: StylePreset) => void
  disabled?: boolean
}

export function StyleSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {STYLES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          disabled={disabled}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            ${value === s.value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } disabled:opacity-50`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: components/ResultArea.tsx 작성**

```tsx
// components/ResultArea.tsx
'use client'
import ReactMarkdown from 'react-markdown'
import type { GenerateResponse } from '@/types'

interface Props {
  result: GenerateResponse | null
  error: string | null
}

export function ResultArea({ result, error }: Props) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
        {error}
      </div>
    )
  }

  if (!result) return null

  async function handleCopy() {
    await navigator.clipboard.writeText(result!.blog)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>
          {result.wordCount.toLocaleString()}자 · {result.readingTime}분 읽기 ·{' '}
          <span className="text-indigo-500">{result.style}</span>
        </span>
        <button
          onClick={handleCopy}
          className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs"
        >
          📋 복사
        </button>
      </div>
      <div className="prose prose-sm max-w-none rounded-xl border border-gray-200 p-6 bg-white">
        <ReactMarkdown>{result.blog}</ReactMarkdown>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: tailwind에 typography 플러그인 추가**

```bash
npm install @tailwindcss/typography
```

`tailwind.config.ts`에 추가:
```ts
plugins: [require('@tailwindcss/typography')]
```

- [ ] **Step 5: 커밋**

```bash
git add components/
git commit -m "feat: add UI components (InputArea, StyleSelector, ResultArea)"
```

### Task 9: app/page.tsx — 메인 페이지

**Files:**
- Modify: `blog-writer-web/app/page.tsx`
- Modify: `blog-writer-web/app/layout.tsx`

- [ ] **Step 1: app/layout.tsx 수정**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '블로그 AI 작성기',
  description: '주제를 입력하면 리서치 후 블로그 글을 자동 작성합니다',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: app/page.tsx 작성**

```tsx
// app/page.tsx
'use client'
import { useState } from 'react'
import { InputArea } from '@/components/InputArea'
import { StyleSelector } from '@/components/StyleSelector'
import { ResultArea } from '@/components/ResultArea'
import type { StylePreset, GenerateResponse } from '@/types'

export default function Home() {
  const [input, setInput] = useState('')
  const [style, setStyle] = useState<StylePreset>('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!input.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, style }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '알 수 없는 오류')
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">블로그 AI 작성기</h1>
        <p className="text-sm text-gray-400 mt-1">
          주제, URL, 수집한 글 — 무엇이든 입력하세요
        </p>
      </div>

      <InputArea value={input} onChange={setInput} disabled={loading} />

      <StyleSelector value={style} onChange={setStyle} disabled={loading} />

      <button
        onClick={handleGenerate}
        disabled={loading || !input.trim()}
        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold
                   hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors text-base"
      >
        {loading ? '리서치 중…' : '✨ 블로그 글 생성하기'}
      </button>

      <ResultArea result={result} error={error} />
    </main>
  )
}
```

- [ ] **Step 3: 개발 서버 실행 + 수동 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속, 주제 입력 후 생성 버튼 클릭 확인

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npm test
```

Expected: 전체 PASS

- [ ] **Step 5: 최종 커밋**

```bash
git add app/ components/
git commit -m "feat: add main page UI"
```

---

## Chunk 6: 환경 변수 가이드 + 배포

### Task 10: Vercel 배포 설정

**Files:**
- Create: `blog-writer-web/README.md`

- [ ] **Step 1: README.md 작성**

```markdown
# 블로그 AI 작성기

주제/URL/텍스트를 입력하면 Gemini 리서치 + Claude 글쓰기로 한국어 블로그 글을 자동 생성합니다.

## API 키 설정

`.env.example`을 복사해서 `.env.local` 생성 후 키 입력:

| 키 | 발급처 |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_AI_API_KEY` | aistudio.google.com |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | developers.naver.com → 애플리케이션 등록 → 검색 API 선택 |

## 실행

npm install
npm run dev   # http://localhost:3000

## 배포 (Vercel)

vercel 로그인 후: vercel --prod
환경 변수 4개를 Vercel 대시보드에 추가
```

- [ ] **Step 2: Vercel 배포 테스트 (선택)**

```bash
npx vercel
```

환경 변수 4개 설정 후 배포 URL 확인

- [ ] **Step 3: 최종 커밋**

```bash
git add README.md .env.example
git commit -m "docs: add setup guide and deployment config"
```
