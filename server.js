import express from "express";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { jsonrepair } from "jsonrepair";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as cheerio from "cheerio";
import {
  addStyleSample,
  buildStyleMemoryPrompt,
  clearStyleMemory,
  importStyleFromUrl,
  loadStyleMemory,
  summarizeStyleMemory,
  updateStyleNotes,
} from "./style-memory.js";
import {
  addResearchSearchSnapshot,
  loadResearchMemory,
  summarizeResearchMemory,
} from "./research-memory.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISABLE_BROWSER_AUTOMATION = /^(1|true|yes)$/i.test((process.env.DISABLE_BROWSER_AUTOMATION || "").trim());

// Dynamic import of ChatGPT automation (requires Puppeteer — only works locally)
let ChatGPTAutomation = null;
if (DISABLE_BROWSER_AUTOMATION) {
  console.log("ℹ️  브라우저 자동 생성이 비활성화되어 수동 모드로 실행합니다.");
} else {
  try {
    const mod = await import("./chatgpt-automation.js");
    ChatGPTAutomation = mod.ChatGPTAutomation;
  } catch {
    console.log("⚠️  ChatGPT 자동화 모듈 로드 실패 (Puppeteer 없음) — 수동 모드로 실행합니다.");
  }
}

// ── 서버 크래시 방지 ─────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason?.message || reason);
});

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

// ─────────────────────────────────────────────────────────────
// SSE 공통 래퍼 (try-catch 자동화)
// ─────────────────────────────────────────────────────────────
const withSSE = (handler) => async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    await handler(req, res, send);
  } catch (err) {
    send({ type: "error", message: err?.message || "서버 처리 중 오류가 발생했습니다." });
  } finally {
    res.end();
  }
};

const PORT = process.env.PORT || 8787;
const NAVER_CLIENT_ID = (process.env.NAVER_CLIENT_ID || "").trim();
const NAVER_CLIENT_SECRET = (process.env.NAVER_CLIENT_SECRET || "").trim();
const NAVER_DATALAB_CLIENT_ID = (process.env.NAVER_DATALAB_CLIENT_ID || NAVER_CLIENT_ID || "").trim();
const NAVER_DATALAB_CLIENT_SECRET = (process.env.NAVER_DATALAB_CLIENT_SECRET || NAVER_CLIENT_SECRET || "").trim();
const NAVER_SEARCHAD_CUSTOMER_ID = (process.env.NAVER_SEARCHAD_CUSTOMER_ID || "").trim();
const NAVER_SEARCHAD_ACCESS_LICENSE = (process.env.NAVER_SEARCHAD_ACCESS_LICENSE || "").trim();
const NAVER_SEARCHAD_SECRET_KEY = (process.env.NAVER_SEARCHAD_SECRET_KEY || "").trim();
const NAVER_SEARCH_BASE_URL = "https://openapi.naver.com/v1/search";
const NAVER_SEARCHAD_BASE_URL = "https://api.searchad.naver.com";
const MAX_RESEARCH_QUERIES = 8;
const CAFE_QUESTION_TARGET_COUNT = 60;
const MAX_CAFE_QUESTION_PAGES = 15;

const RESEARCH_STOPWORDS = new Set([
  "가방",
  "추천",
  "후기",
  "리뷰",
  "정리",
  "비교",
  "사용",
  "실사용",
  "착용",
  "요즘",
  "진짜",
  "정말",
  "이번",
  "관련",
  "느낌",
  "스타일",
  "정보",
  "콘텐츠",
  "블로그",
  "카페",
  "naver",
  "blog",
  "cafe",
  "the",
  "and",
  "with",
  "this",
  "that",
  "from",
  "have",
  "your"
]);

const BAG_ANGLE_LIBRARY = [
  {
    key: "storage",
    title: "수납력/보부상 관점",
    summary: "파우치, 텀블러, 노트북처럼 실제 소지품이 얼마나 들어가는지가 강한 관심 포인트입니다.",
    terms: ["수납", "보부상", "포켓", "칸막이", "넉넉", "짐", "소지품", "파우치", "노트북"]
  },
  {
    key: "commute",
    title: "출근/직장인 데일리백",
    summary: "출퇴근, 노트북, 도시락, 편한 숄더 착용감처럼 평일 실사용 맥락이 먹히는 주제입니다.",
    terms: ["출근", "직장인", "데일리", "출퇴근", "회사", "노트북", "평일", "오피스"]
  },
  {
    key: "lightweight",
    title: "가벼운 무게와 착용감",
    summary: "오래 메도 어깨가 편한지, 무게 스트레스가 적은지가 구매 판단 포인트로 보입니다.",
    terms: ["가벼운", "무게", "어깨", "편한", "착용감", "부담", "데일리백", "휘뚜루"]
  },
  {
    key: "styling",
    title: "코디/계절 스타일링",
    summary: "봄옷, 출근룩, 하객룩, 캐주얼룩과 같이 옷차림에 어떻게 붙는지 설명하는 글이 잘 맞습니다.",
    terms: ["코디", "룩", "스타일링", "봄", "여름", "가을", "겨울", "하객", "캐주얼", "데님"]
  },
  {
    key: "value",
    title: "브랜드/가성비 비교",
    summary: "명품 대체, 가격 대비 만족감, 브랜드 이미지 비교처럼 구매 결정을 돕는 글감입니다.",
    terms: ["명품", "가성비", "브랜드", "가격", "비슷", "대체", "비교", "만족", "입문"]
  },
  {
    key: "shape",
    title: "형태별 선택 가이드",
    summary: "토트, 숄더, 크로스, 백팩, 미니백처럼 형태별 쓰임새를 비교하는 구성이 자연스럽습니다.",
    terms: ["토트", "숄더", "크로스", "백팩", "미니백", "호보백", "버킷백", "빅백"]
  }
];

const INSIGHT_CLUSTERS = [
  {
    key: "storage",
    label: "수납/보부상",
    patterns: ["수납", "보부상", "포켓", "칸막이", "넉넉", "짐", "노트북", "텀블러", "소지품"]
  },
  {
    key: "commute",
    label: "출근/직장인",
    patterns: ["출근", "직장인", "출퇴근", "오피스", "회사", "평일", "노트북"]
  },
  {
    key: "styling",
    label: "코디/스타일링",
    patterns: ["코디", "룩", "스타일링", "착샷", "데일리룩", "출근룩", "하객룩", "핏"]
  },
  {
    key: "review",
    label: "후기/실사용",
    patterns: ["후기", "리뷰", "사용기", "실사용", "정착", "만족", "착용샷"]
  },
  {
    key: "comparison",
    label: "비교/고민",
    patterns: ["비교", "vs", "고민", "고를", "뭐가", "어떤", "추천해주세요", "골라주세요"]
  },
  {
    key: "value",
    label: "브랜드/가성비",
    patterns: ["브랜드", "가성비", "명품", "대체", "가격", "입문", "쿠론", "헤지스", "투미"]
  },
  {
    key: "shape",
    label: "형태/사이즈",
    patterns: ["숄더백", "토트백", "크로스백", "미니백", "빅백", "버킷백", "호보백", "백팩"]
  }
];

const QUESTION_MARKERS = [
  "?",
  "？",
  "추천해주세요",
  "추천 부탁",
  "추천좀",
  "어떤",
  "어디",
  "뭐가",
  "괜찮을까요",
  "괜찮나요",
  "있을까요",
  "있나요",
  "가능할까요",
  "가능한가요",
  "알려주세요",
  "문의",
  "궁금",
  "고민",
  "vs",
  "골라주세요",
  "살까요",
  "찾아요",
  "찾고있어요",
  "해보신분",
  "부탁드려요"
];

const SEARCHAD_KEYWORD_BLACKLIST = [
  "배대지",
  "편집샵",
  "OEM",
  "여성의류",
  "여성쇼핑몰",
  "여성의류쇼핑몰",
  "원피스",
  "모자",
  "비니",
  "양말",
  "워킹화",
  "골프웨어"
];

const DISPLAY_KEYWORD_TOKENS = [
  "직장인",
  "출근",
  "보부상",
  "숄더백",
  "토트백",
  "크로스백",
  "버킷백",
  "데일리백",
  "노트북가방",
  "백팩",
  "핸드백",
  "미니백",
  "빅백",
  "가방",
  "여성",
  "여자",
  "남성",
  "남자",
  "추천",
  "후기",
  "비교",
  "브랜드",
  "수납력"
].sort((a, b) => b.length - a.length);

const HEADLINE_AUDIENCE_MARKERS = [
  "여자",
  "여성",
  "남자",
  "남성",
  "직장인",
  "대학생",
  "20대",
  "30대",
  "40대",
  "엄마",
  "신혼",
  "하객"
];

const HEADLINE_SITUATION_MARKERS = [
  "출근",
  "데일리",
  "여행",
  "선물",
  "답례품",
  "결혼식",
  "돌잔치",
  "퇴사",
  "입학",
  "졸업",
  "하객",
  "집들이",
  "직장인",
  "회사",
  "노트북",
  "유치원",
  "어린이집"
];

const HEADLINE_SEASON_MARKERS = [
  "봄",
  "여름",
  "가을",
  "겨울",
  "입학",
  "졸업",
  "연말",
  "명절",
  "크리스마스",
  "화이트데이",
  "발렌타인",
  "어버이날",
  "스승의날",
  "결혼식"
];

const HEADLINE_TOPIC_STOPWORDS = new Set([
  "추천",
  "후기",
  "리뷰",
  "정리",
  "비교",
  "기준",
  "선택",
  "검색",
  "블로그",
  "카페",
  "글",
  "정보",
  "실사용",
  "사용",
  "포인트"
]);

const InstagramVersionSchema = z.object({
  caption: z.string(),
  hashtags: z.string(),
  alt_text: z.string()
});

const NaverVersionSchema = z.object({
  title: z.string(),
  body: z.string(),
  hashtags: z.string()
});

const WordPressVersionSchema = z.object({
  seo: z.object({
    seo_title: z.string(),
    slug: z.string(),
    meta_description: z.string(),
    focus_keyphrase: z.string(),
    lsi_keywords: z.array(z.string())
  }),
  body: z.string()
});

const ThreadsVersionSchema = z.object({
  text: z.string(),
  hashtags: z.string(),
  alt_text: z.string().optional().default("")
});

const SnsSummaryVersionSchema = z.object({
  threads_text: z.string(),
  instagram_text: z.string(),
  hashtags: z.string()
});

const OutputMetaSchema = z.object({
  input_type: z.enum(["topic_only", "short_note", "full_story"]).or(z.literal("")).default(""),
  line: z.enum(["bakery", "bag", "mixed", "unclear"]).or(z.literal("")).default(""),
  core_angle: z.string().default(""),
  missing_info: z.array(z.string()).default([])
});

const StyleNotesSchema = z.object({
  notes: z.string().max(1600).optional().default("")
});

const StyleSampleSchema = z.object({
  sourceType: z.enum(["manual", "blog", "instagram", "url"]).optional().default("manual"),
  sourceLabel: z.string().max(80).optional().default("직접 입력 샘플"),
  text: z.string().min(30).max(5000)
});

const StyleUrlSchema = z.object({
  url: z.string().min(3).max(500)
});

const NaverResearchSchema = z.object({
  query: z.string().min(2).max(500),
  sources: z.array(z.enum(["blog", "cafe"])).min(1).max(2).default(["blog", "cafe"]),
  display: z.coerce.number().int().min(1).max(30).default(10),
  pages: z.coerce.number().int().min(1).max(5).default(2),
  recentDays: z.coerce.number().int().min(14).max(365).default(90),
  sort: z.enum(["sim", "date"]).default("sim"),
  dedupe: z.boolean().optional().default(true)
});

const ResearchStrategySchema = z.object({
  brandName: z.string().max(120).optional().default(""),
  blogType: z.string().max(120).optional().default(""),
  primaryCategory: z.string().max(160).optional().default(""),
  targetAudience: z.string().max(200).optional().default(""),
  toneAndManner: z.string().max(200).optional().default(""),
  avoidDirection: z.string().max(240).optional().default(""),
  workGoals: z.string().max(2000).optional().default(""),
  researchData: z.string().min(20).max(120000),
});

const Step7WriterSchema = z.object({
  brandName: z.string().max(120).optional().default(""),
  blogType: z.string().max(120).optional().default(""),
  primaryCategory: z.string().max(160).optional().default(""),
  targetAudience: z.string().max(200).optional().default(""),
  toneAndManner: z.string().max(200).optional().default(""),
  avoidDirection: z.string().max(240).optional().default(""),
  workGoals: z.string().max(2000).optional().default(""),
  researchData: z.string().max(120000).optional().default(""),
  selectedPlan: z.string().min(20).max(50000),
});

function buildOutputSchema(variantCount) {
  return z.object({
    meta: OutputMetaSchema,
    instagram: z.object({
      versions: z.array(InstagramVersionSchema).min(1).max(2)
    }),
    naver: z.object({
      versions: z.array(NaverVersionSchema).min(1).max(2)
    }),
    wordpress: z.object({
      versions: z.array(WordPressVersionSchema).min(1).max(2)
    }),
    threads: z.object({
      versions: z.array(ThreadsVersionSchema).min(1).max(2)
    }),
    sns_summary: z.object({
      versions: z.array(SnsSummaryVersionSchema).min(1).max(2)
    })
  });
}

function parseVariantCount(raw) {
  const parsed = parseInt((raw ?? 1).toString(), 10);
  return parsed === 2 ? 2 : 1;
}

function parseSeoLevel(raw) {
  return raw === "strong" ? "strong" : "balanced";
}

function parseKeywordIntent(raw) {
  const allowed = ["정보형", "구매형", "브랜드형"];
  return allowed.includes(raw) ? raw : "정보형";
}

function parseKeywordMentions(raw) {
  const allowed = ["2-3", "3-5", "5-7"];
  return allowed.includes(raw) ? raw : "3-5";
}

function parsePreferredFormat(raw) {
  return (raw || "").toString().trim();
}

function parseImagePlanned(raw) {
  if (raw === true) return true;
  if (raw === false) return false;

  const value = (raw || "").toString().trim().toLowerCase();
  if (["planned", "true", "예정", "있음", "yes", "y"].includes(value)) {
    return true;
  }
  if (["none", "false", "없음", "no", "n"].includes(value)) {
    return false;
  }
  return null;
}

function ensureNaverCredentials() {
  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    return;
  }

  throw new Error(
    "네이버 검색 API 키가 필요해요. .env에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 넣고 서버를 다시 실행해 주세요."
  );
}

function splitResearchQueries(raw) {
  const seen = new Set();
  const queries = [];

  for (const part of (raw || "").split(/\r?\n|,/)) {
    const query = part.trim();
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= MAX_RESEARCH_QUERIES) break;
  }

  return queries;
}

function decodeHtmlEntities(value) {
  if (!value) return "";

  const entityMap = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " "
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (entity) => entityMap[entity] || entity);
}

function cleanSearchText(value) {
  return decodeHtmlEntities(
    (value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function normalizePostDate(raw) {
  const value = (raw || "").toString().trim();
  if (/^\d{8}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    return {
      isoDate: `${year}-${month}-${day}`,
      displayDate: `${year}.${month}.${day}`
    };
  }

  return {
    isoDate: "",
    displayDate: value
  };
}

function canonicalizeLink(link) {
  const value = (link || "").toString().trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    url.protocol = "https:";
    if (url.hostname.startsWith("m.")) {
      url.hostname = url.hostname.slice(2);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/^http:\/\//i, "https://").replace(/\/$/, "");
  }
}

function daysAgo(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function isoDateToDate(isoDate) {
  if (!isoDate) return null;
  const value = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isFreshItem(item, recentDays) {
  const itemDate = isoDateToDate(item.isoDate);
  if (!itemDate) return false;
  return itemDate >= daysAgo(recentDays);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ─── 크롤러 헬퍼 함수 ─────────────────────────────────────────

// 모바일 아이폰으로 접속한 것처럼 속이는 헤더
const SCRAPER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

// 1. 네이버 블로그 본문 크롤러
async function scrapeNaverBlogBody(url) {
  if (!url) return "";
  try {
    // PC 주소를 모바일 주소로 변환 (모바일 페이지가 크롤링 방어가 훨씬 약함)
    const mobileUrl = url.replace("blog.naver.com", "m.blog.naver.com");

    const res = await fetch(mobileUrl, {
      headers: SCRAPER_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";

    const html = await res.text();
    const $ = cheerio.load(html);

    // 불필요한 요소(이미지 캡션, 링크 카드, 스티커 등) 제거
    $(".se-is-blind, .se-module-image, .se-module-oglink, .se-sticker").remove();

    // 본문 컨테이너 텍스트 추출
    let text = $(".se-main-container").text() || $(".post_ct").text() || "";

    // 텍스트 정제 및 길이 제한 (AI 토큰 아끼기 위해 최대 800자로 제한)
    return text.replace(/\s+/g, " ").trim().slice(0, 800);
  } catch (err) {
    return ""; // 에러 나면 조용히 빈 문자열 반환 (서버 안 터지게)
  }
}

// 2. 네이버 카페 본문 크롤러 (공개글 한정)
async function scrapeNaverCafeBody(url) {
  if (!url) return "";
  try {
    // PC 카페 주소를 모바일 주소로 변환
    const mobileUrl = url.replace("cafe.naver.com", "m.cafe.naver.com");

    const res = await fetch(mobileUrl, {
      headers: SCRAPER_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";

    const html = await res.text();
    const $ = cheerio.load(html);

    // 카페 모바일 본문 컨테이너 추출
    let text = $(".post_cont").text() || $("#postContent").text() || "";
    return text.replace(/\s+/g, " ").trim().slice(0, 600);
  } catch (err) {
    return "";
  }
}

async function buildEnrichedResearchSummary(topBlog, cafeQ, keywords) {
  const scrapedBlogs = [];
  const blogTitlesOnly = [];
  for (let i = 0; i < (topBlog || []).length; i += 1) {
    if (i < 2) {
      const bodyText = await scrapeNaverBlogBody(topBlog[i].link);
      if (bodyText) {
        scrapedBlogs.push(`- 제목: ${topBlog[i].title}\n- 본문요약: ${bodyText}...`);
      }
      await sleep(500);
    } else if (i < 15) {
      blogTitlesOnly.push(`- ${topBlog[i].title}`);
    }
  }

  const scrapedCafes = [];
  const cafeTitlesOnly = [];
  for (let i = 0; i < (cafeQ || []).length; i += 1) {
    if (i < 2) {
      const bodyText = await scrapeNaverCafeBody(cafeQ[i].link);
      if (bodyText) {
        scrapedCafes.push(`- 질문: ${cafeQ[i].title}\n- 내용요약: ${bodyText}...`);
      }
      await sleep(500);
    } else if (i < 15) {
      cafeTitlesOnly.push(`- ${cafeQ[i].title}`);
    }
  }

  const kwLine = (keywords || [])
    .slice(0, 8)
    .map((item) => item?.keyword || item?.term || item)
    .filter(Boolean)
    .join(", ");

  return [
    scrapedBlogs.length ? `[상위 2개 블로그 딥다이브 (본문 포함)]\n${scrapedBlogs.join("\n\n")}` : "",
    blogTitlesOnly.length ? `\n[기타 상위 블로그 글감 (제목 최대 13개)]\n${blogTitlesOnly.join("\n")}` : "",
    scrapedCafes.length ? `\n[카페 유저들의 핵심 고민 딥다이브 (본문 포함)]\n${scrapedCafes.join("\n\n")}` : "",
    cafeTitlesOnly.length ? `\n[그 외 유저들이 많이 묻는 질문들 (제목 최대 13개)]\n${cafeTitlesOnly.join("\n")}` : "",
    kwLine ? `\n[주요 검색 키워드] ${kwLine}` : "",
  ].filter(Boolean).join("\n");
}

function extractKeywordTokens(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !RESEARCH_STOPWORDS.has(token));
}

const STEP7_PLAN_FOCUS_LABELS = [
  "선택한 글감",
  "글감 주제",
  "선정 이유",
  "검색 의도",
  "핵심 키워드",
  "핵심 독자",
  "도입 방향",
  "추천 흐름",
  "반드시 다룰 내용",
  "주의할 점",
  "브랜드 연결 포인트",
];

function compactFocusText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gi, "");
}

function parseStep7PlanFocus(selectedPlan) {
  const lines = (selectedPlan || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labeled = new Map();
  lines.forEach((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) return;
    const label = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!label || !value) return;
    if (!labeled.has(label)) labeled.set(label, []);
    labeled.get(label).push(value);
  });

  const focusTexts = STEP7_PLAN_FOCUS_LABELS
    .flatMap((label) => labeled.get(label) || [])
    .filter(Boolean);

  const phrases = Array.from(new Set(
    focusTexts
      .flatMap((value) => value.split(/\s*[\/,|]\s*/))
      .map((value) => value.trim())
      .filter((value) => value.length >= 2)
  )).slice(0, 14);

  const tokens = Array.from(new Set(
    extractKeywordTokens([selectedPlan, ...focusTexts].join(" "))
  )).slice(0, 24);

  return {
    labeled,
    focusTexts,
    phrases,
    tokens,
    topic: focusTexts[0] || lines[0] || "",
  };
}

function parseResearchSections(researchData) {
  const sections = [];
  let currentTitle = "";
  let currentLines = [];

  const pushSection = () => {
    const content = currentLines.join("\n").trim();
    if (!currentTitle && !content) return;
    sections.push({
      title: currentTitle || "[기타 리서치]",
      content,
    });
    currentLines = [];
  };

  (researchData || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (headingMatch) {
      pushSection();
      currentTitle = `[${headingMatch[1]}]`;
      currentLines = headingMatch[2] ? [headingMatch[2].trim()] : [];
      return;
    }

    currentLines.push(line);
  });

  pushSection();
  return sections.filter((section) => section.content);
}

function splitResearchEntries(content) {
  const normalizedContent = (content || "").trim();
  if (!normalizedContent) return [];

  const chunks = normalizedContent
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 1) {
    const lines = chunks[0]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const includesBodyPair = lines.some((line) => /본문요약:|내용요약:/.test(line));
    if (!includesBodyPair && lines.every((line) => line.startsWith("-"))) {
      return lines;
    }
  }

  return chunks;
}

function trimResearchEntry(entry, maxLength = 240) {
  return (entry || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => (line.length > maxLength ? `${line.slice(0, maxLength - 3)}...` : line))
    .join("\n");
}

function scoreResearchEntry(entry, focus) {
  if (!entry || !focus) return 0;

  const compactEntry = compactFocusText(entry);
  if (!compactEntry) return 0;

  let score = 0;
  focus.phrases.forEach((phrase, index) => {
    const compactPhrase = compactFocusText(phrase);
    if (!compactPhrase || compactPhrase.length < 2) return;
    if (compactEntry.includes(compactPhrase)) {
      score += index < 3 ? 52 : 24;
    }
  });

  const entryTokens = new Set(extractKeywordTokens(entry));
  focus.tokens.forEach((token) => {
    if (entryTokens.has(token)) {
      score += token.length >= 4 ? 8 : 4;
    }
  });

  if (/본문요약:|내용요약:/.test(entry)) score += 8;
  if (/^- 제목:|^- 질문:/m.test(entry)) score += 4;
  return score;
}

function buildFocusedResearchBrief(researchData, selectedPlan) {
  if (!researchData?.trim()) return "";

  const focus = parseStep7PlanFocus(selectedPlan);
  const sections = parseResearchSections(researchData);

  const lines = ["[STEP 7 집중 리서치 브리프]"];
  if (focus.topic) {
    lines.push(`- 중심 글감: ${focus.topic}`);
  }

  const mainKeywords = focus.labeled.get("핵심 키워드")?.[0];
  if (mainKeywords) {
    lines.push(`- 우선 키워드: ${mainKeywords}`);
  }

  const readerContext = focus.labeled.get("핵심 독자")?.[0] || focus.labeled.get("검색 의도")?.[0];
  if (readerContext) {
    lines.push(`- 독자 맥락: ${readerContext}`);
  }

  const mustCover = focus.labeled.get("반드시 다룰 내용")?.[0];
  if (mustCover) {
    lines.push(`- 반드시 살릴 포인트: ${mustCover}`);
  }

  lines.push("- 사용 규칙: 아래에 남긴 항목만 먼저 읽고 결론과 구조를 세운 뒤, 원본 리서치는 교차 확인 용도로만 참고할 것.");

  let hasRelevantEntries = false;

  sections.forEach((section) => {
    const rankedEntries = splitResearchEntries(section.content)
      .map((entry, index) => ({
        entry: trimResearchEntry(entry),
        index,
        score: scoreResearchEntry(entry, focus),
      }))
      .filter((entry) => entry.entry);

    let selectedEntries = rankedEntries
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);

    if (!selectedEntries.length) {
      selectedEntries = rankedEntries.slice(0, section.title.includes("주요 검색 키워드") ? 1 : 2);
    }

    const limit = section.title.includes("주요 검색 키워드")
      ? 1
      : section.title.includes("기타") || section.title.includes("그 외")
        ? 3
        : 2;

    selectedEntries = selectedEntries.slice(0, limit);
    if (!selectedEntries.length) return;

    hasRelevantEntries = true;
    lines.push("");
    lines.push(section.title);
    selectedEntries.forEach(({ entry }) => {
      lines.push(entry);
    });
  });

  if (!hasRelevantEntries) {
    const fallback = (researchData || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((line) => trimResearchEntry(line, 180));

    if (fallback.length) {
      lines.push("");
      lines.push("[원본 리서치 앞부분 요약]");
      lines.push(...fallback);
    }
  }

  return lines.join("\n").trim().slice(0, 3600);
}

function normalizeSeedKeyword(value) {
  return (value || "")
    .toString()
    .replace(/\s+/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .trim();
}

function formatKeywordForDisplay(value) {
  const source = normalizeSeedKeyword(value);
  if (!source) return "";

  const parts = [];
  let index = 0;

  while (index < source.length) {
    const matched = DISPLAY_KEYWORD_TOKENS.find((token) => source.startsWith(token, index));
    if (matched) {
      parts.push(matched);
      index += matched.length;
      continue;
    }

    let nextIndex = index + 1;
    while (
      nextIndex < source.length &&
      !DISPLAY_KEYWORD_TOKENS.some((token) => source.startsWith(token, nextIndex))
    ) {
      nextIndex += 1;
    }
    parts.push(source.slice(index, nextIndex));
    index = nextIndex;
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function parseSearchCount(value) {
  if (typeof value === "number") return value;
  const text = (value || "").toString().replace(/,/g, "").trim();
  if (!text) return 0;
  if (text.startsWith("<")) return 5;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMetricCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "확인 어려움";
  }

  return Number(value).toLocaleString("ko-KR");
}

function formatMetricPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "확인 어려움";
  }

  return `${Number(value).toFixed(2)}%`;
}

function formatMetricValueWithUnit(value, unit) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "확인 어려움";
  }

  return `${Number(value).toLocaleString("ko-KR")}${unit}`;
}

function formatMetricRatio(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "확인 어려움";
  }

  return `${Number(value).toFixed(2)}배`;
}

function hasBatchim(text) {
  const value = cleanSearchText(text).trim();
  if (!value) return false;
  const lastChar = value.charCodeAt(value.length - 1);
  if (lastChar < 0xac00 || lastChar > 0xd7a3) return false;
  return (lastChar - 0xac00) % 28 !== 0;
}

function withTopicParticle(text) {
  return `${text}${hasBatchim(text) ? "은" : "는"}`;
}

function withSubjectParticle(text) {
  return `${text}${hasBatchim(text) ? "이" : "가"}`;
}

function withObjectParticle(text) {
  return `${text}${hasBatchim(text) ? "을" : "를"}`;
}

function buildCompetitionIndicator(documentCount, totalSearch) {
  if (documentCount === null || !totalSearch) {
    return {
      ratio: null,
      competitionLabel: "확인 어려움",
      chanceLabel: "확인 어려움",
      note: "문서수나 검색량이 부족해서 경쟁도를 판단하기 어렵습니다."
    };
  }

  const ratio = Number((documentCount / totalSearch).toFixed(2));

  if (ratio <= 1) {
    return {
      ratio,
      competitionLabel: "낮음",
      chanceLabel: "좋음",
      note: "문서수가 검색량보다 적은 편이라 신규 또는 저경쟁 키워드로 보기 쉽습니다."
    };
  }

  if (ratio <= 5) {
    return {
      ratio,
      competitionLabel: "보통",
      chanceLabel: "보통",
      note: "완전 신규는 아니지만, 문서수 대비 검색량이 있어 진입 여지는 남아 있습니다."
    };
  }

  if (ratio <= 20) {
    return {
      ratio,
      competitionLabel: "높음",
      chanceLabel: "어려움",
      note: "문서수가 많은 편이라 경쟁이 느껴지는 키워드입니다."
    };
  }

  return {
    ratio,
    competitionLabel: "매우 높음",
    chanceLabel: "매우 어려움",
    note: "문서수가 매우 많아 상위 노출 경쟁이 강한 편입니다."
  };
}

function buildNaverSourceUrl(source, query, display, sort, start) {
  const endpoint = source === "blog" ? "blog.json" : "cafearticle.json";
  const url = new URL(`${NAVER_SEARCH_BASE_URL}/${endpoint}`);
  url.searchParams.set("query", query);
  url.searchParams.set("display", display.toString());
  url.searchParams.set("start", start.toString());
  url.searchParams.set("sort", sort);
  return url;
}

function createSearchadSignature(timestamp, method, uri) {
  return crypto
    .createHmac("sha256", NAVER_SEARCHAD_SECRET_KEY)
    .update(`${timestamp}.${method}.${uri}`)
    .digest("base64");
}

function buildSearchadSeeds(queries) {
  const seeds = [
    ...queries.map(normalizeSeedKeyword),
    ...queries.flatMap((query) => extractKeywordTokens(query).map(normalizeSeedKeyword))
  ];

  const seen = new Set();
  return seeds.filter((seed) => {
    if (!seed || seed.length < 2) return false;
    if (/^\d+$/.test(seed)) return false;
    if (seen.has(seed)) return false;
    seen.add(seed);
    return true;
  }).slice(0, 8);
}

function buildQueryContextTokens(queries, topKeywords = []) {
  return [...new Set(
    [
      ...queries.flatMap((query) => extractKeywordTokens(query)),
      ...topKeywords.slice(0, 8).flatMap((item) => extractKeywordTokens(item.term))
    ]
  )];
}

function countOverlapTokens(keyword, tokens) {
  return tokens.filter((token) => keyword.includes(normalizeSeedKeyword(token))).length;
}

function scoreSearchadKeyword(item, seedKeywords, contextTokens) {
  const keyword = normalizeSeedKeyword(item.relKeyword);
  const totalSearch = parseSearchCount(item.monthlyPcQcCnt) + parseSearchCount(item.monthlyMobileQcCnt);
  const baseScore = Math.log10(totalSearch + 10) * 10;
  const exactBonus = seedKeywords.some((seed) => keyword === seed) ? 36 : 0;
  const overlapBonus = seedKeywords.some((seed) => keyword.includes(seed)) ? 22 : 0;
  const tokenOverlap = countOverlapTokens(keyword, contextTokens);
  const tokenBonus = tokenOverlap * 12;
  const longTailBonus = keyword.length >= 5 ? 6 : 0;
  const phraseBonus = /\s/.test(item.relKeyword || "") ? 6 : 0;
  const competitionBonus = item.compIdx === "낮음" ? 8 : item.compIdx === "중간" ? 4 : 0;
  const genericPenalty = keyword.length <= 3 ? 26 : 0;

  return baseScore + exactBonus + overlapBonus + tokenBonus + longTailBonus + phraseBonus + competitionBonus - genericPenalty;
}

function buildRelatedKeywordInsights(keywordList, seedKeywords, queries, topKeywords) {
  const querySet = new Set(queries.map((query) => normalizeSeedKeyword(query)));
  const contextTokens = buildQueryContextTokens(queries, topKeywords);
  const rows = (keywordList || [])
    .map((item) => {
      const keyword = normalizeSeedKeyword(item.relKeyword);
      const totalSearch = parseSearchCount(item.monthlyPcQcCnt) + parseSearchCount(item.monthlyMobileQcCnt);
      const tokenOverlap = countOverlapTokens(keyword, contextTokens);
      const includesSeed = seedKeywords.some((seed) => keyword.includes(seed));
      return {
        keyword: item.relKeyword,
        normalizedKeyword: keyword,
        totalSearch,
        mobileSearch: parseSearchCount(item.monthlyMobileQcCnt),
        pcSearch: parseSearchCount(item.monthlyPcQcCnt),
        competition: item.compIdx || "",
        tokenOverlap,
        includesSeed,
        score: scoreSearchadKeyword(item, seedKeywords, contextTokens)
      };
    })
    .filter((item) => {
      if (!item.keyword || item.totalSearch <= 0) return false;
      if (SEARCHAD_KEYWORD_BLACKLIST.some((bad) => item.keyword.includes(bad))) return false;
      if (!item.includesSeed && item.tokenOverlap < 1) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || b.totalSearch - a.totalSearch);

  const relatedKeywords = [];
  const longTailKeywords = [];
  const seen = new Set();

  for (const item of rows) {
    if (seen.has(item.normalizedKeyword)) continue;
    seen.add(item.normalizedKeyword);

    const note = item.totalSearch >= 20000
      ? "많이 찾는 큰 키워드"
      : item.totalSearch >= 5000
        ? "꾸준히 찾는 키워드"
        : "세부 글감으로 쓰기 좋은 키워드";

    const row = {
      keyword: formatKeywordForDisplay(item.keyword),
      totalSearch: item.totalSearch,
      competition: item.competition,
      note
    };

    if (relatedKeywords.length < 12 && !querySet.has(item.normalizedKeyword)) {
      relatedKeywords.push(row);
    }

    const isLongTail = item.normalizedKeyword.length >= 5 && item.totalSearch <= 30000 && item.tokenOverlap >= 2;
    if (isLongTail && longTailKeywords.length < 10 && !querySet.has(item.normalizedKeyword)) {
      longTailKeywords.push(row);
    }
  }

  return {
    relatedKeywords,
    longTailKeywords,
    keywordPool: rows.map((item) => ({
      keyword: formatKeywordForDisplay(item.keyword),
      normalizedKeyword: item.normalizedKeyword,
      totalSearch: item.totalSearch,
      mobileSearch: item.mobileSearch,
      pcSearch: item.pcSearch,
      competition: item.competition
    }))
  };
}

async function fetchSearchadRelatedKeywords(queries, topKeywords) {
  if (!NAVER_SEARCHAD_CUSTOMER_ID || !NAVER_SEARCHAD_ACCESS_LICENSE || !NAVER_SEARCHAD_SECRET_KEY) {
    return {
      available: false,
      relatedKeywords: [],
      longTailKeywords: [],
      keywordPool: [],
      warning: "검색광고 키가 없어 연관검색어는 건너뛰었습니다."
    };
  }

  const seedKeywords = buildSearchadSeeds(queries);
  if (!seedKeywords.length) {
    return {
      available: false,
      relatedKeywords: [],
      longTailKeywords: [],
      keywordPool: [],
      warning: ""
    };
  }

  const uri = "/keywordstool";
  const timestamp = Date.now().toString();
  const signature = createSearchadSignature(timestamp, "GET", uri);
  const url = new URL(`${NAVER_SEARCHAD_BASE_URL}${uri}`);
  url.searchParams.set("hintKeywords", seedKeywords.join(","));
  url.searchParams.set("showDetail", "1");

  const response = await fetch(url, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": NAVER_SEARCHAD_ACCESS_LICENSE,
      "X-Customer": NAVER_SEARCHAD_CUSTOMER_ID,
      "X-Signature": signature
    }
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.message || json?.errorMessage || "검색광고 연관검색어 요청 실패";
    return {
      available: false,
      relatedKeywords: [],
      longTailKeywords: [],
      keywordPool: [],
      warning: message
    };
  }

  const parsed = buildRelatedKeywordInsights(json.keywordList || [], seedKeywords, queries, topKeywords);
  return {
    available: true,
    seeds: seedKeywords,
    warning: "",
    ...parsed
  };
}

function buildTopPhrases(items) {
  const counts = new Map();

  for (const item of items) {
    const tokens = extractKeywordTokens(item.title).filter((token) => token.length >= 2 && !/^\d+$/.test(token));
    for (const size of [2, 3]) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const phrase = tokens.slice(index, index + size).join(" ");
        if (phrase.length < 5) continue;
        counts.set(phrase, (counts.get(phrase) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 12)
    .map(([phrase, count]) => ({ phrase, count }));
}

function containsMarker(text, markers) {
  const value = (text || "").toLowerCase();
  return markers.some((marker) => value.includes(marker.toLowerCase()));
}

function isQuestionLikeTitle(title) {
  return containsMarker(title, QUESTION_MARKERS);
}

function listToCountMap(values) {
  const counts = new Map();
  for (const value of values) {
    const key = (value || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([label, count]) => ({ label, count }));
}

function buildTopKeywords(items) {
  const counts = new Map();

  for (const item of items) {
    for (const token of extractKeywordTokens(item.title)) {
      counts.set(token, (counts.get(token) || 0) + 2);
    }
    for (const token of extractKeywordTokens(item.description)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 12)
    .map(([term, score]) => ({ term, score }));
}

function buildQuerySnapshots(items, queries, recentDays) {
  return queries.map((query) => {
    const matchedItems = items.filter((item) => item.matchedQueries.includes(query));
    const recentItems = matchedItems.filter((item) => isFreshItem(item, recentDays));
    const blogCount = matchedItems.filter((item) => item.source === "blog").length;
    const cafeCount = matchedItems.filter((item) => item.source === "cafe").length;
    const questionCount = matchedItems.filter((item) => item.source === "cafe" && isQuestionLikeTitle(item.title)).length;
    const freshnessRate = matchedItems.length ? recentItems.length / matchedItems.length : 0;
    const questionRate = matchedItems.length ? questionCount / matchedItems.length : 0;
    const topTerms = buildTopKeywords(matchedItems).slice(0, 4).map((item) => item.term);

    let verdict = "보조 키워드로 묶기 좋음";
    let reason = "메인 글에서 보조 소제목이나 FAQ로 붙이기 좋은 상태예요.";

    if (matchedItems.length >= 8 && freshnessRate >= 0.35) {
      verdict = "지금 쓰기 좋은 핫토픽";
      reason = "최근 글 비중이 높아서 최신형 정리 글로 풀기 좋습니다.";
    } else if (cafeCount > blogCount && questionRate >= 0.2) {
      verdict = "카페 질문 해결형 공략";
      reason = "커뮤니티 질문이 계속 보여서 기준표/비교형 포스트가 잘 맞습니다.";
    } else if (matchedItems.length >= 6 && freshnessRate < 0.2) {
      verdict = "에버그린 정리형";
      reason = "계속 언급되지만 최신성 압박은 낮아서 SEO형 글감으로 좋습니다.";
    }

    return {
      query,
      totalCount: matchedItems.length,
      recentCount: recentItems.length,
      blogCount,
      cafeCount,
      questionCount,
      freshnessRate,
      topTerms,
      verdict,
      reason
    };
  });
}

function buildAngleSuggestions(items) {
  const corpus = items
    .map((item) => `${item.title} ${item.description}`.toLowerCase())
    .join(" ");

  const suggestions = BAG_ANGLE_LIBRARY
    .map((angle) => {
      const matchedTerms = angle.terms.filter((term) => corpus.includes(term.toLowerCase()));
      return {
        title: angle.title,
        summary: angle.summary,
        matchedTerms: matchedTerms.slice(0, 4),
        score: matchedTerms.length
      };
    })
    .filter((angle) => angle.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((angle) => ({
      title: angle.title,
      summary: angle.summary,
      reason: angle.matchedTerms.length
        ? `검색 결과에서 ${angle.matchedTerms.join(", ")} 같은 표현이 반복됐어요.`
        : "검색 결과에서 반복적으로 드러난 관심사예요."
    }));

  if (suggestions.length > 0) {
    return suggestions;
  }

  return [
    {
      title: "실사용 후기 중심 정리",
      summary: "브랜드 소개보다 사용 장면과 장단점을 중심으로 정리하면 읽는 이유가 더 선명해집니다.",
      reason: "검색 결과가 적을 때도 가장 안정적으로 확장할 수 있는 포맷이에요."
    }
  ];
}

function shortenQuestion(title) {
  return cleanSearchText(title)
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .replace(/추천해주세요|골라주세요|괜찮을까요|할수 있을까요|할수있을까요|뭐가 더|어떤게 더|어떤|추천부탁드려요|선물|나를 위한/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

function buildHeadlineMarkerPool(texts, markers) {
  const counts = new Map();

  for (const text of texts) {
    const value = cleanSearchText(text).toLowerCase();
    if (!value) continue;

    for (const marker of markers) {
      if (value.includes(marker.toLowerCase())) {
        counts.set(marker, (counts.get(marker) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([marker]) => marker);
}

function buildHeadlineSupportLabel(focusKeyword, candidateKeyword) {
  const formattedFocus = cleanSearchText(focusKeyword) || formatKeywordForDisplay(focusKeyword);
  const formattedCandidate = cleanSearchText(candidateKeyword) || formatKeywordForDisplay(candidateKeyword);
  const focusKey = normalizeSeedKeyword(focusKeyword);
  const candidateKey = normalizeSeedKeyword(candidateKeyword);

  if (candidateKey.startsWith(focusKey) && candidateKey.length > focusKey.length) {
    const tail = candidateKey.slice(focusKey.length);
    const formattedTail = formatKeywordForDisplay(tail) || tail;
    if (formattedTail) return formattedTail;
  }

  if (candidateKey.endsWith(focusKey) && candidateKey.length > focusKey.length) {
    const head = candidateKey.slice(0, candidateKey.length - focusKey.length);
    const formattedHead = formatKeywordForDisplay(head) || head;
    if (formattedHead) return formattedHead;
  }

  const focusTokens = new Set([
    ...extractKeywordTokens(formattedFocus),
    ...extractKeywordTokens(formatKeywordForDisplay(focusKeyword))
  ]);
  const candidateTokens = extractKeywordTokens(formattedCandidate);
  const remaining = candidateTokens.filter((token) => !focusTokens.has(token));

  if (!remaining.length) {
    return formattedCandidate;
  }

  if (remaining.length === 1) {
    if (["여자", "여성", "남자", "남성"].includes(remaining[0])) {
      return `${remaining[0]}용`;
    }
    return remaining[0];
  }

  return remaining.join(" ");
}

function buildHeadlineSupportContext(label) {
  if (!label) return "고를 때";
  if (label.endsWith("용")) return `${label} 볼 때`;
  if (label.length <= 4) return `${label} 관련해`;
  return `${label} 기준으로`;
}

function isWeakHeadlineSupportLabel(label) {
  const safeShortLabels = new Set(["봄", "여름", "가을", "겨울", "수제", "출근", "선물", "후기", "비교", "가격", "답례품", "하객", "입학", "졸업"]);
  return !label
    || ["추천", "후기", "리뷰", "비교", "정리"].includes(label)
    || (label.length <= 2 && !safeShortLabels.has(label));
}

function buildHeadlineKeywordPool(relatedKeywordReport, focusKeyword) {
  return [...relatedKeywordReport.relatedKeywords, ...relatedKeywordReport.longTailKeywords]
    .filter((item) => normalizeSeedKeyword(item.keyword) !== normalizeSeedKeyword(focusKeyword))
    .filter((item, index, array) =>
      array.findIndex((candidate) => normalizeSeedKeyword(candidate.keyword) === normalizeSeedKeyword(item.keyword)) === index
    )
    .slice(0, 12)
    .map((item) => ({
      ...item,
      supportLabel: buildHeadlineSupportLabel(focusKeyword, item.keyword)
    }));
}

function countCollectedKeywordMatches(keyword, texts) {
  const normalizedKeyword = normalizeSeedKeyword(keyword);
  if (!normalizedKeyword) return 0;

  const tokenKeys = extractKeywordTokens(formatKeywordForDisplay(keyword) || keyword)
    .map((token) => normalizeSeedKeyword(token))
    .filter(Boolean);

  return texts.reduce((sum, text) => {
    const normalizedText = normalizeSeedKeyword(text);
    if (!normalizedText) return sum;
    if (normalizedText.includes(normalizedKeyword)) return sum + 1;
    if (tokenKeys.length >= 2 && tokenKeys.every((token) => normalizedText.includes(token))) return sum + 1;
    return sum;
  }, 0);
}

function buildCollectedHeadlineKeywordPool(focusKeyword, items, communityQuestions, topKeywords, relatedKeywordReport) {
  const evidenceTexts = [
    ...items.map((item) => cleanSearchText(item.title)),
    ...items.map((item) => cleanSearchText(item.description)),
    ...communityQuestions.map((item) => cleanSearchText(item.title))
  ].filter(Boolean);
  const counts = new Map();
  const focusKey = normalizeSeedKeyword(focusKeyword);

  function upsertCandidate(keyword, evidenceCount = 0, totalSearch = 0, source = "collected") {
    const normalizedKeyword = normalizeSeedKeyword(keyword);
    if (!normalizedKeyword || normalizedKeyword === focusKey) return;

    const supportLabel = buildHeadlineSupportLabel(focusKeyword, keyword);
    const normalizedSupport = normalizeSeedKeyword(supportLabel);
    if (!normalizedSupport || normalizedSupport === focusKey) return;
    if (focusKey.includes(normalizedSupport)) return;
    if (isWeakHeadlineSupportLabel(supportLabel)) return;

    const current = counts.get(normalizedSupport) || {
      keyword: formatKeywordForDisplay(keyword) || cleanSearchText(keyword),
      supportLabel,
      totalSearch: 0,
      evidenceCount: 0,
      source
    };

    current.totalSearch = Math.max(current.totalSearch || 0, totalSearch || 0);
    current.evidenceCount = Math.max(current.evidenceCount || 0, evidenceCount || 0);
    if (!current.keyword) {
      current.keyword = formatKeywordForDisplay(keyword) || cleanSearchText(keyword);
    }

    counts.set(normalizedSupport, current);
  }

  for (const item of buildHeadlineKeywordPool(relatedKeywordReport, focusKeyword)) {
    const evidenceCount = Math.max(
      countCollectedKeywordMatches(item.keyword, evidenceTexts),
      countCollectedKeywordMatches(item.supportLabel, evidenceTexts)
    );
    if (evidenceCount > 0) {
      upsertCandidate(item.keyword, evidenceCount, item.totalSearch, "related");
    }
  }

  for (const item of topKeywords || []) {
    const term = formatKeywordForDisplay(item.term);
    if (!term) continue;
    upsertCandidate(`${focusKeyword} ${term}`, item.score || 0, 0, "topKeyword");
  }

  const collectedMarkers = buildHeadlineMarkerPool(
    evidenceTexts,
    [...HEADLINE_AUDIENCE_MARKERS, ...HEADLINE_SITUATION_MARKERS, ...HEADLINE_SEASON_MARKERS]
  );
  for (const marker of collectedMarkers) {
    upsertCandidate(
      `${focusKeyword} ${marker}`,
      countCollectedKeywordMatches(marker, evidenceTexts),
      0,
      "marker"
    );
  }

  return [...counts.values()]
    .sort((a, b) => {
      if ((b.evidenceCount || 0) !== (a.evidenceCount || 0)) {
        return (b.evidenceCount || 0) - (a.evidenceCount || 0);
      }
      if ((b.totalSearch || 0) !== (a.totalSearch || 0)) {
        return (b.totalSearch || 0) - (a.totalSearch || 0);
      }
      return a.supportLabel.localeCompare(b.supportLabel, "ko");
    })
    .slice(0, 12);
}

function buildHeadlineTopicTerms(topKeywords, focusKeyword) {
  const focusTokens = new Set(extractKeywordTokens(formatKeywordForDisplay(focusKeyword)));

  return (topKeywords || [])
    .map((item) => formatKeywordForDisplay(item.term))
    .filter((term) => {
      const normalized = normalizeSeedKeyword(term);
      if (!normalized || normalizeSeedKeyword(focusKeyword).includes(normalized)) return false;
      if (HEADLINE_TOPIC_STOPWORDS.has(term)) return false;
      if (focusTokens.has(term.toLowerCase())) return false;
      return true;
    })
    .filter((term, index, array) => array.indexOf(term) === index)
    .slice(0, 6);
}

function buildHeadlineBasis(parts) {
  const lines = parts.filter(Boolean).slice(0, 2);
  return lines.length ? lines.join(" / ") : "";
}

function buildHeadlineKeywordEvidence(item) {
  if (!item?.keyword) return "";
  return `연관검색어 ${item.keyword}(${formatMetricCount(item.totalSearch)}회)`;
}

function buildHeadlineQuestionEvidence(question) {
  return question ? `카페 질문 ${shortenDisplayText(question, 34)}` : "";
}

function buildHeadlineResultEvidence(title) {
  return title ? `수집 제목 ${shortenDisplayText(title, 34)}` : "";
}

function buildHeadlineDescriptionEvidence(text) {
  return text ? `수집 설명 ${shortenDisplayText(text, 34)}` : "";
}

function countHeadlineRepeats(title) {
  const counts = new Map();
  let repeats = 0;

  for (const token of extractKeywordTokens(title)) {
    const nextCount = (counts.get(token) || 0) + 1;
    counts.set(token, nextCount);
    if (nextCount > 1) {
      repeats += 1;
    }
  }

  return repeats;
}

function scoreHeadlineCandidate(title, evidenceVolume = 0, section = "") {
  const cleanTitle = cleanSearchText(title);
  const length = cleanTitle.length;
  const repeats = countHeadlineRepeats(cleanTitle);
  const clarityBonus = /(추천|후기|정리|기준|선택|포인트|활용|상황)/.test(cleanTitle) ? 12 : 0;
  const clickBonus = /(추천|후기|먼저 보는|많이 찾는|고민|실사용)/.test(cleanTitle) ? 14 : 8;
  const brandBonus = /(이야기|기록|무드|취향|분위기|메모|담아|준비하며)/.test(cleanTitle) ? 14 : 6;
  const sectionBrandBonus = section === "브랜딩형" ? 12 : section === "기록형" ? 8 : 0;
  const volumeBonus = evidenceVolume > 0 ? Math.min(14, Math.round(Math.log10(evidenceVolume + 10) * 4)) : 4;
  const lengthPenalty = length > 34 ? (length - 34) * 2 : length < 16 ? (16 - length) * 2 : 0;
  const repeatPenalty = repeats * 7;

  return {
    seoScore: Math.max(1, 66 + clarityBonus + volumeBonus - lengthPenalty - repeatPenalty),
    clickScore: Math.max(1, 58 + clickBonus + Math.round(volumeBonus / 2) - Math.round(lengthPenalty / 2) - repeatPenalty),
    naturalScore: Math.max(1, 72 + (length >= 18 && length <= 30 ? 10 : 4) - repeatPenalty - lengthPenalty),
    brandScore: Math.max(1, 60 + brandBonus + sectionBrandBonus + Math.round(volumeBonus / 2) - Math.round(lengthPenalty / 2) - repeatPenalty)
  };
}

function buildHeadlineCandidate(section, title, basis, evidenceVolume = 0) {
  return {
    section,
    title: cleanSearchText(title).replace(/\s+/g, " ").trim(),
    basis,
    ...scoreHeadlineCandidate(title, evidenceVolume, section)
  };
}

function scoreHeadlineMemoryPreference(item, headlineMemory) {
  const preferredKeywords = headlineMemory?.preferredKeywords || [];
  if (!preferredKeywords.length || !item) return 0;

  const keywordKey = normalizeSeedKeyword(item.keyword || "");
  const supportKey = normalizeSeedKeyword(item.supportLabel || "");

  return preferredKeywords.reduce((sum, preferred, index) => {
    const preferredKey = normalizeSeedKeyword(preferred.keyword || "");
    if (!preferredKey) return sum;
    if (
      keywordKey.includes(preferredKey)
      || preferredKey.includes(keywordKey)
      || (supportKey && (supportKey.includes(preferredKey) || preferredKey.includes(supportKey)))
    ) {
      return sum + Math.max(2, 10 - index) + Math.min(8, preferred.count || 0);
    }
    return sum;
  }, 0);
}

function buildHeadlineIdeas(queries, relatedKeywordReport, communityQuestions, metrics, items, topKeywords, headlineMemory) {
  const focusKeyword = metrics?.focusKeyword || queries[0] || relatedKeywordReport.relatedKeywords[0]?.keyword || "가방";
  const focusMetric = relatedKeywordReport.keywordPool.find(
    (item) => item.normalizedKeyword === normalizeSeedKeyword(focusKeyword)
  ) || null;
  const focusVolume = focusMetric?.totalSearch ?? metrics?.totalSearch ?? 0;
  const keywordPool = buildHeadlineKeywordPool(relatedKeywordReport, focusKeyword);
  const collectedKeywordPool = buildCollectedHeadlineKeywordPool(
    focusKeyword,
    items,
    communityQuestions,
    topKeywords,
    relatedKeywordReport
  );
  const usableKeywordPool = collectedKeywordPool.length
    ? collectedKeywordPool
    : keywordPool.filter((item) => !isWeakHeadlineSupportLabel(item.supportLabel));
  const focusHasGender = containsMarker(focusKeyword, ["남자", "남성", "여자", "여성"]);
  const genderFilteredPool = (usableKeywordPool.length ? usableKeywordPool : keywordPool)
    .filter((item) => focusHasGender || !containsMarker(item.keyword, ["남자", "남성", "여자", "여성"]));
  const headlineKeywordPool = (genderFilteredPool.length ? genderFilteredPool : (usableKeywordPool.length ? usableKeywordPool : keywordPool))
    .slice()
    .sort((a, b) => {
      const evidenceDiff = (b.evidenceCount || 0) - (a.evidenceCount || 0);
      if (evidenceDiff !== 0) return evidenceDiff;
      const memoryScoreDiff = scoreHeadlineMemoryPreference(b, headlineMemory) - scoreHeadlineMemoryPreference(a, headlineMemory);
      if (memoryScoreDiff !== 0) return memoryScoreDiff;
      return (b.totalSearch || 0) - (a.totalSearch || 0);
    });
  const blogTitles = items
    .filter((item) => item.source === "blog")
    .map((item) => cleanSearchText(item.title))
    .filter(Boolean)
    .slice(0, 10);
  const questionTitles = communityQuestions
    .map((item) => cleanSearchText(item.title))
    .filter(Boolean)
    .slice(0, 5);
  const descriptionHighlights = items
    .map((item) => cleanSearchText(item.description))
    .filter(Boolean)
    .slice(0, 5);
  const combinedTexts = [
    ...headlineKeywordPool.map((item) => item.keyword),
    ...blogTitles,
    ...questionTitles,
    ...descriptionHighlights
  ];
  const topicTerms = buildHeadlineTopicTerms(topKeywords, focusKeyword)
    .filter((term) => focusHasGender || !containsMarker(term, ["남자", "남성", "여자", "여성"]));
  const focusKey = normalizeSeedKeyword(focusKeyword);
  const audienceTerms = buildHeadlineMarkerPool(combinedTexts, HEADLINE_AUDIENCE_MARKERS)
    .filter((term) => !focusKey.includes(normalizeSeedKeyword(term)));
  const situationTerms = buildHeadlineMarkerPool(combinedTexts, HEADLINE_SITUATION_MARKERS)
    .filter((term) => !focusKey.includes(normalizeSeedKeyword(term)));
  const seasonTerms = buildHeadlineMarkerPool(combinedTexts, HEADLINE_SEASON_MARKERS)
    .filter((term) => !focusKey.includes(normalizeSeedKeyword(term)));

  const generalA = headlineKeywordPool[0] || null;
  const generalB = headlineKeywordPool[1] || generalA;
  const generalC = headlineKeywordPool[2] || generalB || generalA;
  const recommendA = headlineKeywordPool.find((item) => containsMarker(item.keyword, ["추천", "비교", "가성비", "가격"])) || generalA;
  const recommendB = headlineKeywordPool.find((item) => containsMarker(item.keyword, ["직장인", "여성", "여자", "남성", "남자"])) || generalB;
  const reviewA = headlineKeywordPool.find((item) => containsMarker(item.keyword, ["후기", "리뷰", "실사용"])) || generalA;
  const giftA = headlineKeywordPool.find((item) => containsMarker(item.keyword, HEADLINE_SITUATION_MARKERS)) || generalA;
  const giftB = headlineKeywordPool.find((item, index) => index > 0 && containsMarker(item.keyword, HEADLINE_SITUATION_MARKERS)) || generalB;
  const seasonA = headlineKeywordPool.find((item) => containsMarker(item.keyword, HEADLINE_SEASON_MARKERS)) || giftA || generalA;
  const seasonB = headlineKeywordPool.find((item, index) => index > 0 && containsMarker(item.keyword, HEADLINE_SEASON_MARKERS)) || giftB || generalB;

  const audienceA = audienceTerms[0] || "";
  const situationA = situationTerms[0] || buildHeadlineSupportLabel(focusKeyword, giftA?.keyword || "");
  const situationB = situationTerms[1] || buildHeadlineSupportLabel(focusKeyword, giftB?.keyword || "");
  const seasonAWord = seasonTerms[0] || buildHeadlineSupportLabel(focusKeyword, seasonA?.keyword || "");
  const seasonBWord = seasonTerms[1] || buildHeadlineSupportLabel(focusKeyword, seasonB?.keyword || "");
  const topicA = topicTerms[0] || buildHeadlineSupportLabel(focusKeyword, generalA?.keyword || "");
  const topicB = topicTerms[1] || buildHeadlineSupportLabel(focusKeyword, generalB?.keyword || "");
  const questionA = questionTitles[0] ? cleanSearchText(shortenQuestion(questionTitles[0])) : "";
  const questionB = questionTitles[1] ? cleanSearchText(shortenQuestion(questionTitles[1])) : questionA;
  const resultA = blogTitles[0] || "";
  const resultB = blogTitles[1] || resultA;
  const descriptionA = descriptionHighlights[0] || "";
  const descriptionB = descriptionHighlights[1] || descriptionA;
  const evidenceVolume = (...entries) => {
    const totalEvidence = entries.reduce((sum, item) => sum + (item?.evidenceCount || 0), 0);
    if (totalEvidence > 0) return totalEvidence;
    const totalSearch = entries.reduce((sum, item) => sum + (item?.totalSearch || 0), 0);
    return totalSearch || focusVolume;
  };

  const sections = {
    정보형: [
      buildHeadlineCandidate(
        "정보형",
        `${situationA ? `${situationA} 준비할 때 많이 찾는 ${focusKeyword}` : `${focusKeyword} 관련 검색에서 자주 보인 포인트`}, 이번에 정리해봤어요`,
        buildHeadlineBasis([
          buildHeadlineResultEvidence(resultA),
          buildHeadlineDescriptionEvidence(descriptionA)
        ]),
        evidenceVolume(generalA)
      ),
      buildHeadlineCandidate(
        "정보형",
        `${audienceA ? `${audienceA}이 많이 찾는 ${focusKeyword}` : `${focusKeyword}`}, 어떤 기준으로 보면 좋을지 정리했어요`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineResultEvidence(resultB)
        ]),
        evidenceVolume(generalB, generalA)
      ),
      buildHeadlineCandidate(
        "정보형",
        `${topicA ? `${topicA}까지 함께 본 ${focusKeyword}` : `${focusKeyword}`}, 검색 흐름 기준으로 살펴봤어요`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionA),
          buildHeadlineQuestionEvidence(questionTitles[0] || "")
        ]),
        evidenceVolume(generalC, generalB, generalA)
      ),
      buildHeadlineCandidate(
        "정보형",
        questionA
          ? `${questionA} 고민이 보여서 ${focusKeyword} 흐름을 모아봤어요`
          : `${focusKeyword}가 궁금해서 수집 결과를 모아봤어요`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineDescriptionEvidence(descriptionB)
        ]),
        evidenceVolume(generalA, generalB)
      )
    ],
    후기형: [
      buildHeadlineCandidate(
        "후기형",
        `${focusKeyword} 고르기 전에 많이 읽게 되는 후기 포인트`,
        buildHeadlineBasis([
          buildHeadlineResultEvidence(resultA),
          buildHeadlineDescriptionEvidence(descriptionA)
        ]),
        evidenceVolume(reviewA, generalA)
      ),
      buildHeadlineCandidate(
        "후기형",
        `${questionA ? `${questionA} 고민이 많을 때` : `${focusKeyword}를 찾다 보면`} 결국 보게 되는 후기들`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineResultEvidence(resultB)
        ]),
        evidenceVolume(reviewA, generalA)
      ),
      buildHeadlineCandidate(
        "후기형",
        `실제로 찾아본 ${focusKeyword}, 다들 어떤 점을 많이 말할까`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionA),
          buildHeadlineResultEvidence(resultA)
        ]),
        evidenceVolume(reviewA, generalB)
      ),
      buildHeadlineCandidate(
        "후기형",
        `${situationA ? `${situationA}용 ${focusKeyword}` : `${focusKeyword}`}, 후기 기준으로 보면 달라지는 포인트`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[1] || questionTitles[0] || ""),
          buildHeadlineDescriptionEvidence(descriptionB)
        ]),
        evidenceVolume(reviewA, giftA, generalA)
      )
    ],
    추천형: [
      buildHeadlineCandidate(
        "추천형",
        `${audienceA ? `${audienceA}에게 잘 맞는 ${focusKeyword}` : `${focusKeyword}`}, 추천 기준만 담아봤어요`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineResultEvidence(resultA)
        ]),
        evidenceVolume(recommendA, generalA)
      ),
      buildHeadlineCandidate(
        "추천형",
        `${focusKeyword} 추천 글이 많아서, 실제로 많이 보인 기준만 추렸어요`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionA),
          buildHeadlineResultEvidence(resultB)
        ]),
        evidenceVolume(recommendA, recommendB, generalA)
      ),
      buildHeadlineCandidate(
        "추천형",
        `${situationA ? `${situationA}에 어울리는 ${focusKeyword}` : `${focusKeyword}`}, 이렇게 고르면 덜 고민돼요`,
        buildHeadlineBasis([
          buildHeadlineResultEvidence(resultA),
          buildHeadlineQuestionEvidence(questionTitles[0] || "")
        ]),
        evidenceVolume(recommendB, giftA, generalA)
      )
    ],
    기록형: [
      buildHeadlineCandidate(
        "기록형",
        `${focusKeyword}를 찾다 보니 자꾸 눈에 들어온 기준들`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionA),
          buildHeadlineResultEvidence(resultA)
        ]),
        evidenceVolume(generalA, generalB)
      ),
      buildHeadlineCandidate(
        "기록형",
        questionA
          ? `${questionA} 고민에서 시작한 ${focusKeyword} 기록`
          : `${focusKeyword}를 알아본 기록`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineResultEvidence(resultB)
        ]),
        evidenceVolume(generalA, generalC)
      ),
      buildHeadlineCandidate(
        "기록형",
        `${situationA ? `${situationA} 준비하며` : "요즘"} ${focusKeyword} 검색을 모아 정리한 메모`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionB),
          buildHeadlineQuestionEvidence(questionTitles[1] || questionTitles[0] || "")
        ]),
        evidenceVolume(giftA, generalA)
      )
    ],
    공감형: [
      buildHeadlineCandidate(
        "공감형",
        `${focusKeyword} 뭐가 좋을지 고민될 때 먼저 보게 되는 것들`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineDescriptionEvidence(descriptionA)
        ]),
        evidenceVolume(generalA, generalB)
      ),
      buildHeadlineCandidate(
        "공감형",
        `${questionA ? `${questionA} 고민이 있다면` : `${focusKeyword}가 막막하다면`} 이 포인트부터 보면 편해요`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineResultEvidence(resultA)
        ]),
        evidenceVolume(generalB, generalA)
      ),
      buildHeadlineCandidate(
        "공감형",
        `${focusKeyword}, 다 비슷해 보여도 많이 비교하는 지점은 따로 있더라고요`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionB),
          buildHeadlineQuestionEvidence(questionTitles[1] || questionTitles[0] || "")
        ]),
        evidenceVolume(generalC, generalB)
      )
    ],
    브랜딩형: [
      buildHeadlineCandidate(
        "브랜딩형",
        `${focusKeyword} 하나에도 취향이 보이는 이유`,
        buildHeadlineBasis([
          buildHeadlineResultEvidence(resultA),
          buildHeadlineDescriptionEvidence(descriptionA)
        ]),
        evidenceVolume(generalA, seasonA)
      ),
      buildHeadlineCandidate(
        "브랜딩형",
        `${situationA ? `${situationA}를 준비하는 마음으로 본 ${focusKeyword}` : `${focusKeyword}를 고를 때 드러나는 취향과 무드`}`,
        buildHeadlineBasis([
          buildHeadlineQuestionEvidence(questionTitles[0] || ""),
          buildHeadlineDescriptionEvidence(descriptionB)
        ]),
        evidenceVolume(giftA, seasonA, generalA)
      ),
      buildHeadlineCandidate(
        "브랜딩형",
        `${focusKeyword}를 둘러보며 느낀 요즘 검색의 분위기`,
        buildHeadlineBasis([
          buildHeadlineDescriptionEvidence(descriptionA),
          buildHeadlineResultEvidence(resultB)
        ]),
        evidenceVolume(seasonB, generalB, generalA)
      )
    ]
  };

  const fallbackTitles = [
    buildHeadlineCandidate(
      "정보형",
      `${focusKeyword}, 수집 결과 기준으로 먼저 볼 포인트를 정리했어요`,
      buildHeadlineBasis([
        buildHeadlineResultEvidence(resultA),
        buildHeadlineDescriptionEvidence(descriptionA)
      ]),
      evidenceVolume(generalA)
    ),
    buildHeadlineCandidate(
      "추천형",
      `${focusKeyword} 추천이 많을수록 먼저 보게 되는 기준이 있더라고요`,
      buildHeadlineBasis([
        buildHeadlineQuestionEvidence(questionTitles[0] || ""),
        buildHeadlineResultEvidence(resultB)
      ]),
      evidenceVolume(recommendA, generalA)
    ),
    buildHeadlineCandidate(
      "기록형",
      `${focusKeyword}를 계속 찾게 돼서 남겨본 검색 메모`,
      buildHeadlineBasis([
        buildHeadlineDescriptionEvidence(descriptionB),
        buildHeadlineQuestionEvidence(questionTitles[0] || "")
      ]),
      evidenceVolume(generalB, generalA)
    ),
    buildHeadlineCandidate(
      "브랜딩형",
      `${focusKeyword}를 보다 보니 자연스럽게 보이던 분위기와 기준`,
      buildHeadlineBasis([
        buildHeadlineResultEvidence(resultA),
        buildHeadlineDescriptionEvidence(descriptionA)
      ]),
      evidenceVolume(generalC, seasonA, generalA)
    )
  ];

  const deduped = Object.values(sections)
    .flat()
    .filter((item, index, array) =>
      array.findIndex((candidate) => normalizeSeedKeyword(candidate.title) === normalizeSeedKeyword(item.title)) === index
    );

  for (const fallback of fallbackTitles) {
    if (deduped.length >= 20) break;
    if (deduped.some((item) => normalizeSeedKeyword(item.title) === normalizeSeedKeyword(fallback.title))) continue;
    deduped.push(fallback);
  }

  return deduped.slice(0, 20);
}

function buildRecommendedQueries(queries, relatedKeywordReport) {
  const currentQueries = new Set(queries.map((query) => normalizeSeedKeyword(query)));
  const seen = new Set();

  return [...relatedKeywordReport.longTailKeywords, ...relatedKeywordReport.relatedKeywords]
    .filter((item) => {
      const key = normalizeSeedKeyword(item.keyword);
      if (!key || currentQueries.has(key)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.totalSearch - a.totalSearch)
    .slice(0, 8)
    .map((item) => ({
      query: item.keyword,
      totalSearch: item.totalSearch,
      competition: item.competition || "확인 어려움",
      note: item.note
    }));
}

function buildResearchPrompt(queries, insights) {
  const focusKeyword = insights.metrics?.focusKeyword || queries[0] || "가방";
  const keywordLine = insights.topKeywords.map((item) => item.term).slice(0, 8).join(", ") || focusKeyword;
  const enrichedResearchData = insights.enrichedSummary?.trim() || "";
  const supportKeywords = insights.relatedKeywords
    .slice(0, 8)
    .map((item) => `${item.keyword}(${formatMetricCount(item.totalSearch)}회)`)
    .join(", ");
  const questionLine = insights.communityQuestions
    .slice(0, 4)
    .map((item) => cleanSearchText(item.title))
    .join(" / ");
  const collectedTitleLine = (insights.topPostComparison?.posts || [])
    .slice(0, 5)
    .map((item) => cleanSearchText(item.title))
    .join(" / ");
  const headlineEvidenceLine = insights.headlineIdeas
    .slice(0, 6)
    .map((item) => `${item.title}${item.basis ? ` <- ${item.basis}` : ""}`)
    .join("\n");
  const mustWords = [
    focusKeyword,
    ...insights.relatedKeywords.slice(0, 3).map((item) => item.keyword)
  ].filter((value, index, array) => value && array.indexOf(value) === index);
  const targetHints = [...new Set(
    [
      ...insights.relatedKeywords.slice(0, 8).map((item) => item.keyword),
      ...insights.communityQuestions.slice(0, 4).map((item) => item.title)
    ].flatMap((text) => HEADLINE_AUDIENCE_MARKERS.filter((marker) => containsMarker(text, [marker])))
  )];
  const headlineLine = insights.headlineIdeas.map((item, index) => `${index + 1}. ${item.title}`).join("\n");
  const outlineLine = insights.blogOutline?.cards?.map((item) => `- ${item.title}: ${item.body}`).join("\n") || "";
  const memoryLine = insights.headlineMemory?.similarSearchCount
    ? `- 누적 검색 메모: ${insights.headlineMemory.note}\n- 반복 보조 키워드: ${(insights.headlineMemory.preferredKeywords || []).slice(0, 6).map((item) => `${item.keyword}(${item.count})`).join(", ") || "-"}\n- 자주 쓰인 제목 프레임: ${(insights.headlineMemory.preferredFrames || []).slice(0, 4).map((item) => `[${item.section}] ${item.frame}`).join(" / ") || "-"}`
    : "";

  return [
    "너는 네이버 블로그 SEO 제목 전문 에디터이자,",
    "자연스러운 한국어 문장형 제목을 잘 만드는 콘텐츠 기획자다.",
    "",
    "내가 입력하는 주제, 키워드, 글의 성격을 바탕으로",
    "네이버 블로그에 어울리는 제목을 추천해라.",
    "",
    "목표:",
    "- 검색 유입을 고려하되",
    "- 키워드를 억지로 나열하지 않고",
    "- 사람이 실제로 클릭하고 싶어지는",
    "- 자연스럽고 읽기 좋은 문장형 제목을 만드는 것",
    "",
    "중요 원칙:",
    "1. 핵심 키워드를 무조건 제목 맨 앞에 넣지 말 것",
    "2. 제목 전체가 자연스러운 문장처럼 읽혀야 할 것",
    "3. 검색에 필요한 핵심 키워드는 제목 안에 자연스럽게 포함할 것",
    "4. 키워드를 반복하거나 나열하지 말 것",
    "5. 광고 티가 강한 과장 표현은 피할 것",
    "6. 제목만 봐도 글의 주제와 결이 느껴지게 만들 것",
    "7. 네이버 블로그에 어울리는 친근하고 현실적인 제목으로 만들 것",
    "8. 모바일에서도 읽기 좋게 너무 길지 않게 작성할 것",
    "9. 같은 구조만 반복하지 말고 다양한 각도로 제안할 것",
    "10. SEO보다 어색하지 않은 자연스러움을 우선할 것",
    "",
    "제목 톤 방향:",
    "- 검색용 키워드 덩어리처럼 보이지 않게",
    "- 실제 블로그 글 제목처럼 자연스럽게",
    "- 정보형, 후기형, 추천형, 기록형, 공감형, 브랜딩형을 고르게 섞을 것",
    "- 제품 소개 글뿐 아니라 브랜드 이야기, 작업 과정, 일상 기록, 공간 소개, 제작 비하인드에도 어울리게 만들 것",
    "",
    "피해야 할 표현:",
    "- 최저가, 역대급, 무조건, 충격, 대박, 안 보면 손해",
    "- 키워드 반복",
    "- 어색한 나열형 제목",
    "- 지나치게 판매 티 나는 문장",
    "- 의미 없는 느낌표 남발",
    "- 너무 자극적인 후킹 표현",
    "",
    "반영하면 좋은 요소:",
    "- 검색 의도",
    "- 글의 상황",
    "- 추천 이유",
    "- 경험이나 후기 느낌",
    "- 브랜드 무드",
    "- 감정선",
    "- 정보성",
    "- 요즘 네이버 블로그에서 잘 읽히는 자연스러운 말투",
    "",
    "[수집 결과 우선 규칙]",
    "- 제목의 핵심 표현은 수집 제목, 수집 설명, 카페 질문에서 먼저 찾는다.",
    "- 수집 결과에 없는 상황, 대상, 효능, 가격대, 브랜드 비교를 새로 만들지 않는다.",
    "- 연관검색어는 수집 결과와 겹칠 때만 보조 키워드로 사용한다.",
    "- 제목은 사람이 읽었을 때 자연스러워야 하며, 억지로 키워드를 끼워 넣지 않는다.",
    "",
    "입력값:",
    `- 핵심 키워드: ${focusKeyword}`,
    `- 연관 키워드: ${supportKeywords || "-"}`,
    `- 글 주제: ${keywordLine || "-"}`,
    "- 글의 성격: 정보형 / 후기형 / 추천형 / 브랜드스토리형 / 작업기록형 / 일상형 / 공간소개형 / 선물제안형",
    `- 타겟 독자: ${targetHints.join(", ") || "실제 검색 사용자"}`,
    `- 꼭 넣고 싶은 뉘앙스: ${questionLine || keywordLine || focusKeyword}`,
    "- 피하고 싶은 뉘앙스: 수집 결과에 없는 브랜드 추측, 판매 티, 과장 광고 문구",
    "- 원하는 분위기: 친근하고 현실적인 네이버 블로그 톤",
    "- 제목 개수: 20개",
    "",
    "[수집 기반 참고 자료]",
    `- 수집 제목 예시: ${collectedTitleLine || "-"}`,
    `- 카페 질문: ${questionLine || "-"}`,
    `- 연관검색어: ${supportKeywords || "-"}`,
    `- 자주 보인 키워드: ${keywordLine || "-"}`,
    `- 꼭 들어갈 단어 참고: ${mustWords.join(", ") || focusKeyword}`,
    `- 현재 제목 후보와 근거:\n${headlineEvidenceLine || "-"}`,
    ...(enrichedResearchData
      ? [
        "",
        "[본문 딥다이브 포함 리서치 데이터]",
        enrichedResearchData
      ]
      : []),
    ...(memoryLine ? ["", "[누적 검색 메모]", memoryLine] : []),
    "",
    "출력 규칙:",
    "1. 제목을 총 20개 제안할 것",
    "2. 제목은 번호로만 깔끔하게 정리할 것",
    "3. 비슷한 제목을 반복하지 말고 각도 다르게 만들 것",
    "4. 제목은 모두 자연스러운 문장형으로 작성할 것",
    "5. 그 다음 아래 항목을 추가할 것",
    "   - 가장 자연스러운 제목 TOP 3",
    "   - 검색 유입에 유리한 제목 TOP 3",
    "   - 클릭률이 좋아 보이는 제목 TOP 3",
    "   - 브랜드 느낌이 잘 살아 있는 제목 TOP 3",
    "6. 각 TOP 제목마다 한 줄 설명을 붙일 것",
    "7. 마지막에 아래 4가지를 꼭 정리할 것",
    "   - 가장 무난한 제목 1개",
    "   - 가장 자연스러운 제목 1개",
    "   - 가장 검색 친화적인 제목 1개",
    "   - 가장 클릭하고 싶은 제목 1개",
    "",
    "추가 최적화 규칙:",
    "- 제목은 SEO만 의식한 어색한 키워드형 문장이 아니라, 실제 네이버 블로그에서 사람이 자연스럽게 쓴 것처럼 만들어라.",
    "- 핵심 키워드는 자연스럽게 녹여 넣되, 제목이 어색하면 표현을 다시 다듬어라.",
    "- 제품 판매 글뿐 아니라 브랜드 이야기, 작업 과정, 일상 기록, 공간 소개, 제작 비하인드에도 어울리는 제목으로 제안해라.",
    "- 제목은 정보성 글처럼 보이되, 읽고 나면 자연스럽게 내용이 궁금해지도록 설계해라.",
    "",
    "[현재 검색 기반 제목 후보]",
    headlineLine,
    ...(outlineLine
      ? [
        "",
        "[블로그 초안 작성 시 참고 개요]",
        outlineLine
      ]
      : []),
    "",
    "[작성 요청]",
    "- 위 규칙 그대로 제목 20개와 TOP 묶음을 먼저 제안하라.",
    "- 모든 제목은 수집 결과와 연관검색어에 근거해 자연스럽게 다시 다듬어라.",
    "- 가장 무난한 제목 1개, 가장 자연스러운 제목 1개, 가장 검색 친화적인 제목 1개, 가장 클릭하고 싶은 제목 1개를 마지막에 정리하라.",
    "- 그 다음 가장 무난한 제목 1개를 골라라.",
    "- 선택한 제목으로 네이버 블로그 초안을 작성하라.",
    "- 도입부에서 왜 이 키워드를 찾는지 설명하고, 본문엔 연관검색어와 카페 질문을 자연스럽게 녹여라.",
    "- 근거 없는 브랜드 비교, 가격 추측, 사용 경험 추측은 금지한다.",
    "- 마지막엔 독자 반응을 유도하는 질문 한 줄로 마무리한다."
  ].join("\n");
}

function formatStrategyGoalLines(raw) {
  const lines = (raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [
      "- 블로그 글감 발굴",
      "- 네이버 유입형 제목 찾기",
      "- 실제 발행 가능한 글 3개 초안 만들기"
    ].join("\n");
  }

  return lines
    .map((line) => (line.startsWith("-") ? line : `- ${line}`))
    .join("\n");
}

/*
function buildResearchStrategyPrompt(payload) {
  return [
    "당신은 네이버 SEO 기반의 브랜드 블로그 콘텐츠 전략가이자, 실제 발행까지 고려하는 전문 에디터다.",
    "아래에 제공되는 리서치 수집 결과를 분석해서, 검색 유입 가능성과 실제 클릭 가능성을 함께 고려한 블로그 콘텐츠 기획안을 만들어라.",
    "",
    "이 작업의 목적은 단순 요약이 아니라,",
    "실제로 발행 가능한 블로그 글 주제와 제목, 목차, 본문 초안까지 도출하는 것이다.",
    "",
    "---",
    "",
    "## 0. 기본 정보",
    "",
    "### 블로그/브랜드 정보",
    `- 브랜드명: ${payload.brandName || "[미입력]"}`,
    `- 블로그 성격: ${payload.blogType || "[미입력]"}`,
    `- 주력 카테고리: ${payload.primaryCategory || "[미입력]"}`,
    `- 타겟 독자: ${payload.targetAudience || "[미입력]"}`,
    `- 원하는 톤앤매너: ${payload.toneAndManner || "[미입력]"}`,
    `- 피하고 싶은 방향: ${payload.avoidDirection || "[미입력]"}`,
    "",
    "### 이번 작업 목적",
    formatStrategyGoalLines(payload.workGoals),
    "",
    ...(payload.userNote && payload.userNote.trim() ? [
      "### 작성자 아이디어 / 경험 (중요 — 글의 핵심 방향으로 반드시 반영할 것)",
      payload.userNote.trim(),
      "",
    ] : []),
    "---",
    "",
    "## 1. 본문 딥다이브 포함 리서치 수집 결과",
    "",
    payload.researchData.trim(),
    "",
    "---",
    "",
    "## 2. 분석 원칙",
    "",
    "아래 원칙을 반드시 지켜라.",
    "",
    "[정보 출처 언급 절대 금지 - 가장 중요 ★★★]",
    "- 기획안, 목차, 특히 '도입문 초안'을 작성할 때 '다른 블로그를 찾아보니', '카페 글을 읽어보니', '검색 결과에 따르면' 같은 출처 언급 표현은 절대 쓰지 마라.",
    "- 수집된 리서치 데이터(블로그 본문, 카페 질문 등)는 철저히 작가(나)의 머릿속 배경지식이자, 브랜드 운영 경험으로 자연스럽게 치환하라.",
    "- 외부의 질문과 데이터는 '단골 손님들이 자주 묻는 질문'이나 '내가 샘플을 만들며 했던 고민'으로 완벽하게 둔갑시켜서 기획안을 작성하라.",
    "",
    "1. 수집결과 안에서 반복 등장하는 키워드, 질문, 비교 포인트, 고민 포인트, 후기 포인트를 우선적으로 찾아라.",
    "2. 단순히 많이 보인 단어보다, 사람이 실제로 클릭하고 싶어할 질문형·고민형 주제를 더 높게 평가하라.",
    "3. 제목은 네이버 블로그에서 어색하지 않도록 자연스러운 문장형으로 만들 것.",
    "4. [중요] 수집결과의 양이 빈약하더라도 절대 억지로 말을 늘리거나 없는 객관적 수치/정보를 지어내지 마라.",
    "5. [중요] 외부 데이터가 부족할 경우, 무의미한 정보성 글로 분량을 채우지 마라. 대신 타겟 고객이 반응할 만한 브랜드의 시각적 무드(예: 미니멀한 디자인, 유치원생이 크레파스로 그린 듯한 귀여운 감성 등)와 작업 과정(예: 비행기 창문 형태의 패키지 기획, 캐릭터 굿즈 스케치 등)을 깊이 있게 다루는 방향으로 기획을 전환하라.",
    "6. 광고 티가 너무 강한 주제보다는 정보형 / 비교형 / 추천형 / 팁형 / 브랜드 스토리형을 우선할 것.",
    "7. 비슷한 주제는 중복 제안하지 말고, 서로 다른 각도로 구성할 것.",
    "",
    "---",
    "",
    "## 3. 해야 할 일",
    "",
    "아래 순서대로 작업하라.",
    "",
    "---",
    "",
    "# STEP 1. 리서치 핵심 인사이트 정리",
    "",
    "먼저 수집결과를 분석해서 아래를 정리하라. 데이터가 적다면 무리해서 개수를 채우지 말고 핵심만 밀도 있게 적어라.",
    "",
    "### 1-1. 반복적으로 보이는 핵심 키워드",
    "- 최대 10개 내외로 정리 (부족하면 있는 만큼만)",
    "- 왜 중요하게 보였는지 명확한 이유 한 줄",
    "",
    "### 1-2. 사람들이 많이 궁금해하는 질문/고민 포인트",
    "- 문장형으로 정리",
    "- 뻔한 날씨 인사나 일반론적인 고민은 배제할 것",
    "",
    "### 1-3. 콘텐츠로 발전시키기 좋은 관점",
    "- 수집된 데이터가 적을 경우 '브랜드 스토리형(제작 비하인드, 영감, 디테일)' 관점을 적극적으로 제안할 것.",
    "",
    "---",
    "",
    "# STEP 2. 추천 블로그 글감 TOP 20",
    "",
    "수집결과를 바탕으로, 실제로 블로그 발행에 적합한 글감 20개를 추천하라.",
    "단, 억지로 비슷한 글감을 복붙하듯 늘리지 말고, 서로 각도가 다른 20개를 제안하라.",
    "",
    "각 항목은 반드시 아래 형식으로 작성하라.",
    "",
    "## [번호]. 글감 주제",
    "- 추천 제목",
    "- 보조 제목 후보 2개",
    "- 핵심 키워드",
    "- 검색 의도",
    "- 이 글을 읽을 사람",
    "- 도입문 방향 (날씨 인사 절대 금지, 공감 가는 구체적 상황으로 시작)",
    "- 추천 목차 (내용을 부풀리지 말고 핵심만 3~4개로 짤 것)",
    "  1.",
    "  2.",
    "  3.",
    "- 이 글에서 꼭 다뤄야 할 포인트",
    "- 브랜드형 블로그와의 연결 포인트 (제작자의 시선, 취향, 디자인 디테일 등)",
    "",
    "---",
    "",
    "# STEP 3. 지금 가장 먼저 써야 할 글 3개 선정",
    "",
    "TOP 10 중에서 우선 발행 가치가 가장 높은 3개를 골라라.",
    "",
    "각 항목은 아래 형식으로 작성하라.",
    "",
    "## 우선 발행 추천 [번호]",
    "- 주제",
    "- 추천 제목",
    "- 왜 지금 이 글을 먼저 써야 하는지",
    "- 예상 장점",
    "- 발행 우선순위 점수: /100",
    "",
    "---",
    "",
    "# STEP 4. 제목 후보 추가 제안",
    "",
    "수집결과를 바탕으로, 네이버 블로그용 제목 후보를 20개 추가로 제안하라.",
    "",
    "### 제목 작성 규칙",
    "- 기계적인 나열 금지",
    "- 사람이 직접 쓴 것처럼 자연스럽게",
    "- 클릭하고 싶게 만들되 과장(최고, 무조건 등) 금지",
    "",
    "---",
    "",
    "# STEP 5. 베스트 3개 글의 상세 목차 설계",
    "",
    "STEP 3에서 선정한 우선 글 3개에 대해, 각 글마다 더 구체적인 상세 목차를 설계하라.",
    "없는 정보를 지어내어 목차를 늘리지 마라. 핵심이 짧다면 짧은 대로 밀도 있게 구성하고, 디자인 영감이나 제작 비하인드(예: 틴케이스 퍼즐 쿠키 배열, 가방 부자재 선택 이유 등)를 소제목으로 활용해 내용을 단단하게 만들어라.",
    "",
    "각 글마다 아래 형식으로 작성하라.",
    "",
    "## [추천 글 1 제목]",
    "### 글의 기획 의도",
    "### 예상 독자 반응",
    "### 상세 목차",
    "- 서론 (독자 공감 및 문제 제기)",
    "- 본론 1",
    "- 본론 2",
    "- 결론 (자연스러운 여운 및 소통 유도)",
    "### 이 글에서 자연스럽게 녹여야 할 키워드",
    "### 피해야 할 표현 (예: 기계적인 말투, 무의미한 서론)",
    "",
    "---",
    "",
    "# STEP 6. 베스트 3개 글의 도입문 초안 작성",
    "",
    "각 글마다 블로그 도입부를 2가지 버전으로 작성하라.",
    "",
    "조건:",
    "- 날씨 이야기, 무의미한 근황 등 뻔한 소리로 글을 늘여 쓰지 마라.",
    "- 첫 문장부터 독자의 시선을 끄는 핵심 고민이나, 디자이너로서 작업하며 느낀 담백한 감정으로 바로 시작하라.",
    "- 친근하지만 과하게 들뜨지 않은 차분하고 부드러운 톤을 유지하라.",
    "",
    "출력 형식:",
    "",
    "## [글 제목]",
    "### 도입문 A (독자 고민 공감형)",
    "(2~3문단으로 압축해서 밀도 있게)",
    "",
    "### 도입문 B (작업 비하인드/스토리텔링형)",
    "(2~3문단으로 압축해서 밀도 있게)",
    "",
    "---",
    "",
    "# STEP 7. 베스트 1개 글의 본문 초안 작성",
    "",
    "STEP 3에서 선정한 글 중 가장 우선순위가 높은 1개를 골라, 실제 발행 가능한 수준의 블로그 본문 초안을 작성하라.",
    "",
    "STEP 7은 아래 두 개의 최우선 지침을 동시에 따른다. 첫째는 사람 손으로 쓴 것처럼 자연스러운 문체, 둘째는 네이버 SEO와 실제 클릭/체류/전환까지 고려한 실전형 구조다.",
    "아래 `패션·잡화·IT 정보성 블로그 작성 최종 지침서`와 `네이버 SEO 실전 작성 규칙`은 STEP 7의 다른 모든 조건보다 우선한다.",
    "이 지침들과 다른 조건이 충돌하면 반드시 이 두 지침을 먼저 따른다.",
    "문장이 로봇처럼 딱딱하거나, 설명서·리포트·AI 답변처럼 느껴지면 실패로 간주하고 다시 자연스럽게 고쳐 쓴다.",

    "",
    "[최우선 문체 원칙]",
    "- 후기, 체험, 감상, 추천글처럼 쓰지 말고 정보성 설명, 비교, 구조, 소재, 특징 중심으로 풀어쓸 것.",
    "- 단, 정보만 건조하게 던지지 말고 사람이 옆에서 정리해서 들려주는 듯한 자연스러운 채팅체와 부드러운 말투를 사용할 것.",
    "- `공식적으로`, `자료에 따르면`, `명시되어 있다`, `스펙상`, `요약하면` 같은 보고서식 표현은 금지할 것.",
    "- 표, 리포트, 설명서, AI 답변처럼 반듯하게 끊긴 문장 대신 짧은 문장과 조금 긴 문장을 섞어서 인간적인 리듬으로 쓸 것.",
    "- 정보는 모두 수집결과 안에서 확인 가능한 내용만 활용하고, 없는 사실은 절대 지어내지 말 것.",
    "- 서론에는 이 글이 누구에게 필요한지, 어떤 고민에 맞는 글인지 공감 멘트를 반드시 넣을 것.",
    "- 메인 키워드는 제목, 첫 문장, H2, 결론에 자연스럽게 포함할 것.",
    "- 연관 키워드는 H3와 중간 문단에 자연스럽게 반복하되, 키워드가 제목처럼 나열되거나 도배되지 않게 할 것.",
    "- 본문은 공백 포함 최소 2300자 이상으로, 읽을 거리와 정보가 충분한 풍성한 글로 작성할 것.",
    "",
    "[네이버 SEO 실전 작성 규칙]",
    "- 당신은 네이버 SEO에 강한 전문 블로그 에디터이자 실제 발행까지 고려하는 콘텐츠 전략가다.",
    "- 단순히 글을 예쁘게 쓰는 것이 아니라 네이버 검색 유입, 클릭률, 체류시간, 자연스러운 전환까지 함께 고려해야 한다.",
    "- STEP 7 결과물은 실제 발행 가능한 글 패키지여야 하며, 제목 후보, 메타 정보, 내부링크 문구, 이미지 가이드, HTML 본문까지 포함해야 한다.",
    "- 메인 키워드는 제목 앞부분에 최대한 자연스럽게 배치하되, 기계적으로 붙인 느낌이 나면 다시 다듬을 것.",
    "- 제목은 검색 유입형이면서도 사람이 실제로 클릭하고 싶게 만들어야 하며, 낚시성 표현은 금지할 것.",
    "- 브랜드/제품/서비스 언급은 광고처럼 밀어붙이지 말고 정보 흐름 속에 부드럽게 삽입할 것.",
    "- 문단 흐름은 체류시간을 높일 수 있게 매끄럽게 이어가고, 독자가 다음 문단 읽고 싶어지게 설계할 것.",
    "- 부족한 정보는 절대 추측하지 말고 [미입력], [공식 정보 필요], [추후 업데이트 예정]처럼 분명하게 표시할 것.",
    "",
    "[SEO 제목 / 메타 규칙]",
    "- 제목 후보는 총 5개를 만들고, 첫 번째는 메인 SEO 제목으로 가장 추천하는 제목으로 둘 것.",
    "- 메타 정보에는 SEO 제목, 추천 슬러그, 메타 설명(120~155자), 메인 키워드, 서브 키워드, 검색 의도 유형, 예상 독자 고민을 반드시 포함할 것.",
    "- 메타 설명은 메인 키워드를 포함하되 광고 문구처럼 과하지 않고, 네이버 블로그 요약문처럼 자연스럽게 쓸 것.",
    "",
    "[본문 구조 규칙]",
    "- 서론은 독자의 고민이나 상황으로 시작하고, 첫 문단 안에 메인 키워드를 자연스럽게 포함할 것.",
    "- 본문 전 컨텍스트에서는 필요할 때만 브랜드나 제품군 맥락을 부드럽게 소개할 것.",
    "- H2는 4~5개 이내, H3는 꼭 필요한 곳에만 사용하고 독자가 실제로 궁금해하는 질문형/정보형 소제목으로 작성할 것.",
    "- 제품 또는 항목 소개 파트는 H2 또는 H3 -> 요약 박스 -> 베러의 한마디😎 -> 본문 설명 순서를 기본으로 할 것.",
    "- 요약 박스는 글의 흐름에 따라 유연하게 구성할 것. 제품/항목 소개 섹션이면 스펙형, 비교/가이드/체크리스트 섹션이면 판단 기준형으로 바꿀 것.",
    "- 모든 섹션에 브랜드/제품명/가격/사이즈를 억지로 채우지 말 것. 필요한 섹션에서만 제품 정보를 쓰고, 그렇지 않으면 `title`, `intro`, `items`, `takeaway`, `caution` 중심으로 구성할 것.",
    "    \"워드와 LSI 키워드는 본문 전체에 분산하되 같은 표현을 기계적으로 반복하지 말 것.\",",
    "    \"- 가능하면 본문 중간에 관련 글로 연결할 수 있는 내부링크 앵커 문구 2~3개를 제안할 것.\",",
    "    \"- 신뢰도 보완용 외부 참고자료가 필요하면 어떤 종류의 자료를 링크하면 좋은지 제안할 것.\",",
    "    \"- 이미지 삽입이 어울리는 구간과 alt 텍스트 예시 3개를 함께 제안할 것.\",",
    "    \"- CTA는 도입부 1회 가능, 본문 중간 1회 가능, 결론 1회 필수로 넣되 판매 압박 없이 자연스럽게 행동을 유도할 것.\",",
    "    \"\",",
    "    \"[패션·잡화·IT 정보성 블로그 작성 최종 지침서]\",",
    "    \"- 후기, 체험, 감상형 글 금지. 정보성 설명, 비교, 구조, 소재, 특징 중심으로 작성할 것.\",",
    "    \"- 패션, 잡화, IT 정보성 블로그 톤을 기본으로 하되, 딱딱한 리포트나 설명서처럼 쓰지 말 것.\",",
    "    \"- 수집결과 안에 있는 브랜드 정보, 공식 정보, 스펙, 매장 정보, 확인 가능한 포인트만 활용할 것.\",",
    "    \"- `공식적으로`, `자료에 따르면`, `명시되어 있다` 같은 딱딱한 표현은 금지하고, 사람이 정리해서 들려주는 말투로 풀 것.\",",
    "    \"- 자연스럽고 친근한 채팅체, 부드러운 구어체를 사용하되 유행어, 과한 리액션, 과장 광고 문구는 금지할 것.\",",
    "    \"- 서론에는 이 정보가 누구를 위한 글인지, 어떤 고민에 맞는 글인지 공감 멘트를 반드시 넣을 것.\",",
    "    \"- 메인 키워드는 제목, 첫 문장, H2, 결론에 반드시 포함할 것.\\\",\",",
    "    \"- 연관 키워드는 H3와 중간 문단에 자연스럽게 녹일 것.\\\",\",",
    "    \"- 키워드 도배는 금지하고, 전체 밀도는 과하지 않게 약 10% 이내 느낌으로 유지할 것.\\\",\",",
    "    \"- 공백 포함 최소 2300자 이상으로 풍성하게 작성할 것.\\\",\",",
    "    \"\",",
    "    \"[STEP 1: 제목 / 부제목 / 인삿말 / 서론]\",",
    "    \"- 제목은 후킹되게, 부제목은 궁금증을 유발하게 작성할 것.\",",
    "    \"- 인삿말과 서론에서는 오늘 다룰 제품, 정보 포인트, 어떤 사람이 보면 좋은지 자연스럽게 연결할 것.\",",
    "    \"- `디자인도 챙기고 실용성도 챙기고 싶은 사람`, `이 제품이 궁금했던 사람` 같은 공감형 톤을 사용할 것.\",",
    "    \"- 오프라인 매장 방문을 강하게 유도하는 문장은 금지하되, 실물 확인이 필요하다는 한 줄 정도는 자연스럽게 허용할 것.\",",
    "    \"- 단락 길이와 문장 길이는 일부러 고르게 맞추지 말고, 실제 블로그 글처럼 조금 불규칙하게 흘러가게 만들 것.\",",
    "    \"- 제목은 후킹되더라도 광고 문구처럼 과장하지 말고, 부제목은 읽다 보면 다음 문장이 궁금해지는 방향으로 쓸 것.\",",
    "    \"- 메인 SEO 제목 1개와 대안 제목 4개, 총 5개의 제목 후보를 함께 제안할 것.\",",
    "    \"\",",
    "    \"[STEP 2: 본문 파트 작성]\",",
    "    \"- 각 제품 또는 파트 시작에는 `제품이름 / 가격 / 사이즈 / 한줄평` 4줄 정보를 먼저 넣을 것.\",",
    "    \"- 한줄평은 특징 요약만 쓰고, 느낌, 감탄, 체험, 후기 톤은 금지할 것.\",",
    "    \"- 표, 리스트, 리포트식으로 딱딱하게 쓰지 말고 사람이 말로 설명하듯 자연스럽게 풀어쓸 것.\",",
    "    \"- 소재, 구조, 컬러, 수납, 마감, 사이즈, 특징, 관리 포인트를 중심으로 설명할 것.\",",
    "    \"- `실제 컬러감이나 질감은 공식 이미지나 매장에서 확인하는 게 좋다` 정도의 문장은 필요할 때만 자연스럽게 사용할 것.\",",
    "    \"- `이 제품은 이런 특징이 있다`처럼 기계적으로 끊지 말고, `램스킨이라 부드러운 편이고 스트랩 연출도 꽤 자유로운 쪽`처럼 말로 설명하듯 이어갈 것.\",",
    "    \"- 문단마다 정보 포인트는 분명해야 하지만, bullet 나열처럼 보이지 않게 문맥 안에 자연스럽게 녹일 것.\",",
    "    \"- 최종 본문은 HTML 형식으로도 함께 제공해야 하며, `H2`, `H3`, `p` 태그를 사용해 네이버 블로그 / 워드프레스 / 티스토리에 복붙 가능한 수준으로 정리할 것.\",",
    "    \"\",",
    "    \"[STEP 3: 마무리 / 태그 / 메타]\",",
    "    \"- 후기, 감탄, 추천, 비추천, 체험담 없이 정보성 정리로 마무리할 것.\",",
    "    \"- 마무리에서는 비교 포인트나 확인해볼 포인트를 짧게 정리할 것.\",",
    "    \"- 태그는 `#` 없이 정보성 키워드만 정리할 것.\",",
    "    \"- 슬러그와 meta description도 함께 제안할 것.\",",
    "    \"\",",
    "    \"[문체 가이드]\",",
    "    \"- 문장 길이와 단락 길이는 불규칙하게 섞을 것.\",",
    "    \"- 짧은 문장과 약간 긴 문장을 자연스럽게 교차해서 사람 말투처럼 만들 것.\",",
    "    \"- AI 문체, 공식문서 문체, 스펙표 문체는 금지할 것.\",",
    "    \"- 설명과 정보는 충분히 주되, 건조하지 않게 대화하듯 풀어쓸 것.\",",
    "    \"- `정리하면`, `살펴보면`, `이상으로`, `요약하면`처럼 기계적인 연결어를 남발하지 말 것.\",",
    "    \"- `~합니다`만 반복하지 말고 `~해요`, `~하죠`, `~한 편입니다` 등을 자연스럽게 섞어서 사람 말투를 만들 것.\",",
    "    \"- 과장된 감탄, 후기성 리액션, 판매 유도 문장은 금지하되, 읽는 사람이 편하게 따라올 수 있는 리듬은 유지할 것.\",",
    "    \"\",",
    "    \"[최종 자기검수]\",",
    "    \"- 완성 후 스스로 다시 읽고, 로봇 답변처럼 들리는 문장, 보고서식 연결어, 지나치게 반듯한 문단이 보이면 반드시 자연스럽게 고쳐라.\",",
    "    \"- 첫 문단만 읽어도 `사람이 쓴 블로그 글`처럼 느껴져야 하며, `AI가 정리한 설명문`처럼 느껴지면 다시 수정하라.\",",
    "    \"- 키워드가 억지로 박힌 문장, 제목 같은 문장, 반복 표현이 보이면 매끄러운 한국어 문장으로 다시 다듬어라.\",",
    "    \"- 메인 키워드가 제목, 첫 문단, H2, 결론에 자연스럽게 들어갔는지 확인하라.\",",
    "    \"- 제목이 검색형이면서도 클릭하고 싶게 작성됐는지, 서론이 공감 + 문제 제기 + 기대감 구조인지 확인하라.\",",
    "    \"- 요약 박스가 해당 섹션의 역할에 맞게 보이는지 확인하라. 제품 섹션은 스펙형, 비교/가이드 섹션은 판단 기준형으로 자연스럽게 보여야 한다.\",",
    "    \"- `summaryBox.title`은 `요약 박스`, `비교 기준`, `체크리스트`처럼 딱딱한 라벨보다 실제 블로그 박스 제목처럼 부드럽게 쓸 것. 예: `먼저 보면 좋은 포인트`, `비교 전에 볼 것`, `이런 상황이면 더 잘 맞아요`.\",",
    "    \"- `베러의 한마디😎`가 과하지 않고 포인트 있게 들어갔는지 확인하라.\",",
    "    \"- 결론이 자연스럽게 마무리되는지, 마지막 해시태그가 한 줄로 정리되는지, HTML 본문이 복붙 가능한지 확인하라.\",",
    "    \"\",",
    "    \"[JSON 작성 규칙]\",",
    "    \"- STEP 7 결과는 기존 `featuredDraft` 객체 안에 모두 담을 것.\",",
    "    \"- `featuredDraft` 안에는 `titleOptions`, `seoMeta`, `internalLinks`, `imageGuide`, `externalReferenceSuggestions`, `title`, `subtitle`, `slug`, `metaDescription`, `tags`, `intro`, `bodySections`, `closing`, `cta`, `htmlBody`, `hashtagsLine`를 반드시 넣을 것.\",",
    "    \"- `seoMeta` 안에는 `seoTitle`, `slug`, `metaDescription`, `mainKeyword`, `subKeywords`, `searchIntentType`, `readerConcern`를 넣을 것.\",",
    "    \"- `bodySections` 각 항목에는 `heading`, `subHeading`, `subKeyword`, `summaryBox`, `betterComment`, `productName`, `price`, `size`, `oneLineSummary`, `paragraphs`, `cta`를 넣을 것.\",",
    "    \"- `summaryBox` 안에는 `boxType`, `title`, `intro`, `items`, `brand`, `productName`, `price`, `size`, `material`, `color`, `features`, `recommendPoints`, `takeaway`, `caution`를 넣을 것.\",",
    "    \"- `summaryBox.items`는 `{ label, value }` 객체 배열로 쓰고, 비교/가이드/체크리스트 섹션에서는 이 배열을 중심으로 채울 것.\",",
    "    \"- 제품 소개 섹션이 아니면 브랜드/가격/사이즈를 억지로 넣지 말고 빈 값으로 두어도 된다.\",",
    "    \"- `imageGuide` 안에는 `recommendedSection`, `altExamples`를 넣을 것.\",",
    "    \"- `htmlBody`는 위에서 이미 작성한 `title`, `subtitle`, `intro`, `bodySections`, `closing`, `cta`, `hashtagsLine`만 같은 순서로 HTML 태그로 재조합한 값이어야 한다.\",",
    "    \"- `htmlBody`에 새로운 문장이나 새로운 정보, 위에 없는 문단을 임의로 추가하면 안 된다.\",",
    "    \"- 즉 `htmlBody`는 별도 초안이 아니라, 위 필드들을 합친 최종 HTML 버전이다.\",",
    "    \"- 본문은 실제 발행 가능한 수준으로, introduction과 closing도 충분한 길이로 넣을 것.\",",
    "    \"\",",
    "    \"---\",",
    "    \"\",",
    "    \"# STEP 8. 연재 방향 제안\",",
    "    \"\",",
    "    \"이번 수집결과를 바탕으로 블로그 전체를 어떤 흐름으로 운영하면 좋을지 제안하라.\",",
    "    \"\",",
    "    \"아래 형식으로 작성하라.\",",
    "    \"\",",
    "    \"## 블로그 운영 방향 요약\",",
    "    \"- 지금 독자들이 많이 궁금해하는 흐름\",",
    "    \"- 앞으로 쌓아가기 좋은 주제 축 3가지\",",
    "    \"- 연재형으로 발전시키기 좋은 시리즈 아이디어 5개\",",
    "    \"- 브랜드형 블로그로서 자연스럽게 신뢰를 쌓는 방법\",",
    "    \"- 전체 방향 한 줄 요약\",",
    "    \"\",",
    "    \"---\",",
    "    \"\",",
    "    \"## 출력 스타일 규칙\",",
    "    \"- 반드시 한국어로 작성\",",
    "    \"- 실무적으로 정리\",",
    "    \"- 불필요한 장식 없이 명확하게\",",
    "    \"- 너무 딱딱하지 않게\",",
    "    \"- 기획자처럼 구조적으로 작성\",",
    "    \"- 바로 복사해서 사용할 수 있게 정리\",",
    "    \"- 표가 더 적합한 곳은 표 형태로 정리해도 됨\",",
    "    \"\",",
    "    \"---\",",
    "    \"\",",
    "    \"## 가장 중요한 금지사항\",",
    "    \"- 수집결과에 없는 사실을 지어내지 말 것\",",
    "    \"- 브랜드 홍보 문구만 늘어놓지 말 것\",",
    "    \"- 제목을 억지 키워드 나열형으로 만들지 말 것\",",
    "    \"- 비슷한 주제를 반복하지 말 것\",",
    "    \"- 너무 뻔한 아이디어만 주지 말 것\",",
    "    \"\",",
    "    \"---\",",
    "    \"\",",
    "    \"## 최종 출력 형식\",",
    "    \"- 반드시 유효한 JSON 객체 하나만 반환할 것\",",
    "    \"- JSON 앞뒤에 설명 문장, 마크다운, 코드블록을 붙이지 말 것\",",
    "    \"- 키 이름은 아래 예시와 동일하게 유지할 것\",",
    "    \"- 값이 없으면 빈 문자열(`\"\"`) 또는 빈 배열(`[]`)을 넣을 것\",",
    "    \"- 모든 문장은 한국어로 작성할 것\",",
    "    \"\",",
    "    \"{",
    "      \"step1\": {",
    "        \"coreKeywords\": [",
    "          { \"keyword\": \"\", \"reason\": \"\" }",
    "        ],",
    "        \"questions\": [",
    "          { \"question\": \"\", \"intent\": \"\" }",
    "        ],",
    "        \"perspectives\": [",
    "          { \"type\": \"\", \"direction\": \"\" }",
    "        ]",
    "      },",
    "      \"step2\": {",
    "        \"topics\": [",
    "          {",
    "            \"rank\": 1,",
    "            \"topic\": \"\",",
    "            \"title\": \"\",",
    "            \"altTitles\": [\"\", \"\"],",
    "            \"keywords\": [\"\"],",
    "            \"intent\": \"\",",
    "            \"reason\": \"\",",
    "            \"reader\": \"\",",
    "            \"introDirection\": \"\",",
    "            \"outline\": [\"\", \"\", \"\", \"\"],",
    "            \"mustCover\": [\"\"],",
    "            \"cautions\": [\"\"],",
    "            \"brandConnection\": \"\"",
    "          }",
    "        ]",
    "      },",
    "      \"step3\": {",
    "        \"priorities\": [",
    "          {",
    "            \"rank\": 1,",
    "            \"topic\": \"\",",
    "            \"title\": \"\",",
    "            \"whyNow\": \"\",",
    "            \"advantages\": [\"\"],",
    "            \"score\": 0",
    "          }",
    "        ]",
    "      },",
    "      \"step4\": {",
    "        \"titles\": [\"\"]",
    "      },",
    "      \"step5\": {",
    "        \"detailedOutlines\": [",
    "          {",
    "            \"title\": \"\",",
    "            \"planningIntent\": \"\",",
    "            \"expectedReaction\": \"\",",
    "            \"outline\": {",
    "              \"intro\": \"\",",
    "              \"body1\": \"\",",
    "              \"body2\": \"\",",
    "              \"body3\": \"\",",
    "              \"body4\": \"\",",
    "              \"conclusion\": \"\"",
    "            },",
    "            \"keywords\": [\"\"],",
    "            \"avoidExpressions\": [\"\"]",
    "          }",
    "        ]",
    "      },",
    "      \"step6\": {",
    "        \"introDrafts\": [",
    "          {",
    "            \"title\": \"\",",
    "            \"introA\": [\"\", \"\", \"\"],",
    "            \"introB\": [\"\", \"\", \"\"]",
    "          }",
    "        ]",
    "      },",
    "      \"step7\": {",
    "        \"featuredDraft\": {",
    "          \"titleOptions\": [\"\", \"\", \"\", \"\", \"\"],",
    "          \"seoMeta\": {",
    "            \"seoTitle\": \"\",",
    "            \"slug\": \"\",",
    "            \"metaDescription\": \"\",",
    "            \"mainKeyword\": \"\",",
    "            \"subKeywords\": [\"\"],",
    "            \"searchIntentType\": \"\",",
    "            \"readerConcern\": \"\"",
    "          },",
    "          \"internalLinks\": [\"\", \"\", \"\"],",
    "          \"imageGuide\": {",
    "            \"recommendedSection\": \"\",",
    "            \"altExamples\": [\"\", \"\", \"\"]",
    "          },",
    "          \"externalReferenceSuggestions\": [\"\"],",
    "          \"title\": \"\",",
    "          \"subtitle\": \"\",",
    "          \"slug\": \"\",",
    "          \"metaDescription\": \"\",",
    "          \"tags\": [\"\"],",
    "          \"intro\": [\"\", \"\"],",
    "          \"bodySections\": [",
    "            {",
    "              \"heading\": \"\",",
    "              \"subHeading\": \"\",",
    "              \"subKeyword\": \"\",",
    "              \"summaryBox\": {",
    "                \"brand\": \"\",",
    "                \"productName\": \"\",",
    "                \"price\": \"\",",
    "                \"size\": \"\",",
    "                \"material\": \"\",",
    "                \"color\": \"\",",
    "                \"features\": [\"\"],",
    "                \"recommendPoints\": [\"\"]",
    "              },",
    "              \"betterComment\": \"\",",
    "              \"productName\": \"\",",
    "              \"price\": \"\",",
    "              \"size\": \"\",",
    "              \"oneLineSummary\": \"\",",
    "              \"paragraphs\": [\"\", \"\"],",
    "              \"cta\": \"\"",
    "            }",
    "          ],",
    "          \"closing\": [\"\", \"\"],",
    "          \"cta\": \"\",",
    "          \"htmlBody\": \"\",",
    "          \"hashtagsLine\": \"\"",
    "        }",
    "      },",
    "      \"step8\": {",
    "        \"seriesDirection\": {",
    "          \"readerFlow\": [\"\"],",
    "          \"topicAxes\": [\"\"],",
    "          \"seriesIdeas\": [\"\"],",
    "          \"trustBuilding\": [\"\"],",
    "          \"summary\": \"\"",
    "        }",
    "      }",
    "    ",
    "    ",
    "  ].join(\"\\n\");",
    "}",


*/

function buildResearchStrategyPrompt(payload) {
  const outputSchema = {
    step1: {
      coreKeywords: [{ keyword: "", reason: "" }],
      questions: [{ question: "", intent: "" }],
      perspectives: [{ type: "", direction: "" }]
    },
    step2: {
      topics: [{
        rank: 1,
        topic: "",
        title: "",
        altTitles: ["", ""],
        keywords: [""],
        intent: "",
        reason: "",
        reader: "",
        introDirection: "",
        outline: ["", "", "", ""],
        mustCover: [""],
        cautions: [""],
        brandConnection: ""
      }]
    },
    step3: {
      priorities: [{
        rank: 1,
        topic: "",
        title: "",
        whyNow: "",
        advantages: [""],
        score: 0
      }]
    },
    step4: {
      titles: [""]
    },
    step5: {
      detailedOutlines: [{
        title: "",
        planningIntent: "",
        expectedReaction: "",
        outline: {
          intro: "",
          body1: "",
          body2: "",
          body3: "",
          body4: "",
          conclusion: ""
        },
        keywords: [""],
        avoidExpressions: [""]
      }]
    },
    step6: {
      introDrafts: [{
        title: "",
        introA: ["", "", ""],
        introB: ["", "", ""]
      }]
    },
    step7: {
      featuredDraft: {
        titleOptions: ["", "", "", "", ""],
        seoMeta: {
          seoTitle: "",
          slug: "",
          metaDescription: "",
          mainKeyword: "",
          subKeywords: [""],
          searchIntentType: "",
          readerConcern: ""
        },
        internalLinks: ["", "", ""],
        imageGuide: {
          recommendedSection: "",
          altExamples: ["", "", ""]
        },
        externalReferenceSuggestions: [""],
        title: "",
        subtitle: "",
        slug: "",
        metaDescription: "",
        tags: [""],
        intro: ["", ""],
        bodySections: [{
          heading: "",
          subHeading: "",
          subKeyword: "",
          summaryBox: {
            boxType: "",
            title: "",
            intro: "",
            items: [{ label: "", value: "" }],
            brand: "",
            productName: "",
            price: "",
            size: "",
            material: "",
            color: "",
            features: [""],
            recommendPoints: [""],
            takeaway: "",
            caution: ""
          },
          betterComment: "",
          productName: "",
          price: "",
          size: "",
          oneLineSummary: "",
          paragraphs: ["", ""],
          cta: ""
        }],
        closing: ["", ""],
        cta: "",
        htmlBody: "",
        hashtagsLine: ""
      }
    },
    step8: {
      seriesDirection: {
        readerFlow: [""],
        topicAxes: [""],
        seriesIdeas: [""],
        trustBuilding: [""],
        summary: ""
      }
    }
  };

  return [
    "당신은 네이버 SEO 기반의 브랜드 블로그 콘텐츠 전략가이자 실제 발행까지 고려하는 전문 에디터다.",
    "아래 리서치 데이터를 바탕으로 STEP 1~8 전략안을 만들어라.",
    "",
    "## 0. 기본 정보",
    `- 브랜드명: ${payload.brandName || "[미입력]"}`,
    `- 블로그 성격: ${payload.blogType || "[미입력]"}`,
    `- 주력 카테고리: ${payload.primaryCategory || "[미입력]"}`,
    `- 타겟 독자: ${payload.targetAudience || "[미입력]"}`,
    `- 원하는 톤앤매너: ${payload.toneAndManner || "[미입력]"}`,
    `- 피하고 싶은 방향: ${payload.avoidDirection || "[미입력]"}`,
    "",
    "### 이번 작업 목적",
    formatStrategyGoalLines(payload.workGoals),
    "",
    ...(payload.userNote && payload.userNote.trim()
      ? [
        "### 작성자 아이디어 / 경험",
        payload.userNote.trim(),
        ""
      ]
      : []),
    "## 1. 본문 딥다이브 포함 리서치 수집 결과",
    payload.researchData.trim(),
    "",
    "## 2. 절대 원칙",
    "- 리서치 데이터의 블로그 본문, 카페 질문, 키워드, 제목에서 근거를 먼저 찾을 것.",
    "- 수집결과에 없는 사실, 수치, 후기, 비교 포인트를 지어내지 말 것.",
    "- '다른 블로그를 보니', '카페에서 보니', '검색 결과에 따르면' 같은 출처 언급을 절대 쓰지 말 것.",
    "- 외부 질문과 데이터는 작가의 배경지식, 현장 경험, 고객과 나눈 대화처럼 자연스럽게 치환할 것.",
    "- 제목은 네이버 블로그에 맞는 자연스러운 문장형으로 만들 것.",
    "- 광고 냄새가 강한 표현보다 정보형, 비교형, 추천형, 팁형, 브랜드 스토리형을 우선할 것.",
    "",
    "## 3. STEP별 작업 지시",
    "### STEP 1. 리서치 핵심 인사이트",
    "- `coreKeywords`: 반복적으로 보이는 핵심 키워드와 중요 이유",
    "- `questions`: 사람들이 많이 궁금해하는 질문/고민 포인트",
    "- `perspectives`: 콘텐츠로 발전시키기 좋은 관점",
    "",
    "### STEP 2. 추천 블로그 글감 TOP 20",
    "- `topics` 배열에 20개 제안",
    "- 각 항목은 rank, topic, title, altTitles, keywords, intent, reason, reader, introDirection, outline, mustCover, cautions, brandConnection을 채울 것",
    "",
    "### STEP 3. 지금 가장 먼저 써야 할 글 3개",
    "- `priorities` 배열에 3개 제안",
    "- whyNow, advantages, score를 구체적으로 적을 것",
    "",
    "### STEP 4. 제목 후보 추가 제안",
    "- `titles` 배열에 자연스러운 네이버 블로그형 제목 20개 제안",
    "",
    "### STEP 5. 베스트 3개 글의 상세 목차",
    "- `detailedOutlines` 배열에 3개 제안",
    "- outline은 intro, body1, body2, body3, body4, conclusion을 채울 것",
    "",
    "### STEP 6. 베스트 3개 글의 도입문 초안",
    "- `introDrafts` 배열에 3개 제안",
    "- 각 항목은 introA, introB 두 가지 버전으로 작성",
    "",
    "### STEP 7. 베스트 1개 글의 본문 초안",
    "- `featuredDraft`는 실제 발행 가능한 수준으로 상세하게 작성",
    "- titleOptions 5개, seoMeta, internalLinks, imageGuide, externalReferenceSuggestions, title, subtitle, slug, metaDescription, tags, intro, bodySections, closing, cta, htmlBody, hashtagsLine을 모두 채울 것",
    "- bodySections 각 항목은 heading, subHeading, subKeyword, summaryBox, betterComment, productName, price, size, oneLineSummary, paragraphs, cta를 넣을 것",
    "- htmlBody는 위 필드 내용을 H2/H3/p 구조로 재조합한 최종 HTML 본문이어야 하며, 새로운 정보를 추가하지 말 것",
    "",
    "### STEP 8. 연재 방향 제안",
    "- `seriesDirection`에 readerFlow, topicAxes, seriesIdeas, trustBuilding, summary를 채울 것",
    "",
    "## 4. 출력 규칙",
    "- 반드시 유효한 JSON 객체 하나만 반환할 것",
    "- JSON 앞뒤에 설명 문장, 코드블록, 마크다운을 붙이지 말 것",
    "- 키 이름은 아래 예시와 동일하게 유지할 것",
    "- 값이 없으면 빈 문자열 또는 빈 배열을 넣을 것",
    "- 모든 문장은 한국어로 작성할 것",
    "- 문자열 안에 markdown escape를 넣지 말 것. `\\~`, `\\!`, `\\#`, `\\&`, `\\<`, `\\>` 같은 표기는 쓰지 말고 원래 문자 그대로 `~`, `!`, `#`, `&`, `<`, `>`를 쓸 것",
    "- `htmlBody`는 실제 HTML 문자열이어야 한다. `\\<p\\>`처럼 백슬래시를 붙이지 말고 `<p>` 그대로 작성할 것",
    "- 문자열 내부에 큰따옴표가 필요하면 반드시 `\\\"`로 이스케이프할 것",
    "",
    JSON.stringify(outputSchema, null, 2)
  ].join("\n");
}

function buildStep7WriterPrompt(payload) {
  const writingMode = payload.writingMode === "daily" ? "daily" : "brand";
  const focusedResearchBrief = (
    payload.focusedResearchBrief
    || buildFocusedResearchBrief(payload.researchData, payload.selectedPlan)
  ).trim();

  const personaTrack =
    writingMode === "brand"
      ? [
        "당신은 제품의 기획 의도와 디자인 철학을 깊이 있게 전달하는 '디자이너 브랜드 대표(Founder)'이자 전문 에디터다.",
        "브랜드 'Garçon Timide'나 'Ben & Jerry's'처럼 유쾌하고 따뜻한 감성을 지향하며, 제품 하나하나에 담긴 디자이너의 고민과 일상적인 공감대를 녹여내는 것이 당신의 역할이다.",
      ]
      : [
        "당신은 소소한 일상을 자연스럽게 공유하며 독자와 소통하는 친근한 블로그 에디터다.",
        "너무 무겁거나 상업적이지 않게, 하지만 전문성은 잃지 않는 부드러운 말투로 '오늘의 기록'을 남기는 것이 목표다.",
      ];

  return [
    ...personaTrack,
    "지금부터는 여러 후보를 섞는 전략안이 아니라, 사용자가 최종 선택한 블로그 글감 1개를 깊고 정확하게 확장한 STEP 7 전용 블로그 글을 작성한다.",
    "",
    "핵심 미션:",
    "1. selectedPlan에 적힌 '선택한 글감' 1개만 글의 중심축으로 삼을 것.",
    "2. researchData는 방향을 넓히는 용도가 아니라, 선택한 글감을 더 정확하고 풍부하게 뒷받침하는 배경지식으로만 사용할 것.",
    "3. 비슷한 포인트를 다른 말로 반복하지 말고, 각 문단이 새로운 정보나 판단 기준을 추가하게 만들 것.",
    "4. 정보가 많더라도 글은 흐려지지 않아야 한다. 하나의 질문에 대한 하나의 명확한 대답으로 압축할 것.",
    "",
    "---",
    "",
    "## 0. 기본 정보",
    `- 브랜드명: ${payload.brandName || "[미입력]"}`,
    `- 블로그 성격: ${payload.blogType || "[미입력]"}`,
    `- 주력 카테고리: ${payload.primaryCategory || "[미입력]"}`,
    `- 타겟 독자: ${payload.targetAudience || "[미입력]"}`,
    `- 원하는 톤앤매너: ${payload.toneAndManner || "[미입력]"}`,
    `- 피하고 싶은 방향: ${payload.avoidDirection || "[미입력]"}`,
    `- 작성 모드: ${writingMode === "brand" ? "브랜드 기획/철학 중심" : "일반 일상/기록 중심"}`,
    "",
    "### 이번 작업 목적",
    formatStrategyGoalLines(payload.workGoals),
    "",
    "---",
    "",
    "## 1. STEP 7 초점 리서치 브리프 (선택 글감 전용 압축 근거)",
    "",
    focusedResearchBrief || "[초점 리서치 없음]",
    "",
    "---",
    "",
    "## 1-1. 원본 리서치 수집 결과 (교차 확인용 배경지식)",
    "",
    payload.researchData?.trim() || "[미입력]",
    "",
    "---",
    "",
    "## 2. 사용자가 선택한 최종 글감 브리프",
    "",
    payload.selectedPlan.trim(),
    "",
    "---",
    "",
    "## 3. 내부 작업 순서 (반드시 지킬 것)",
    "",
    "글을 쓰기 전에 내부적으로 먼저 아래 4가지를 확정하라.",
    "1. 독자가 지금 해결하려는 핵심 질문 1개",
    "2. 이 글이 주는 최종 결론 1개",
    "3. 본문에서 반드시 설명할 판단 기준 3~4개",
    "4. focusedResearchBrief, researchData, selectedPlan에서 겹쳐 확인되는 근거 3~6개",
    "",
    "이 4가지가 정리되기 전에는 문장을 쓰지 마라.",
    "정리 후에는 그 핵심 질문과 최종 결론에서 벗어나는 문단을 모두 버려라.",
    "",
    "---",
    "",
    "## 4. 정확도 규칙",
    "",
    "- researchData와 selectedPlan에 없는 수치, 후기, 제품 사양, 비교 우위를 새로 만들지 말 것.",
    "- 구조와 결론은 selectedPlan + focusedResearchBrief 기준으로 먼저 세우고, 원본 researchData는 세부 근거 교차 확인용으로만 사용할 것.",
    "- focusedResearchBrief에 없는 다른 인기 주제를 researchData 원문에서 끌어와 글의 중심축으로 확대하지 말 것.",
    "- 가격, 사이즈, 소재, 구성 정보가 불명확하면 비워두거나 일반론으로 돌리지 말고 해당 필드를 빈 문자열로 둘 것.",
    "- 비교 글이라면 비교 기준을 먼저 세우고, 그 기준 안에서만 장단점을 설명할 것.",
    "- 불확실한 내용을 단정적으로 쓰지 말고, '이럴 때 더 적합하다'처럼 조건부로 정리할 것.",
    "- 억지 정보 확장보다 정확한 범위 축소가 낫다. 확실하지 않으면 덜 말해라.",
    "",
    "## 5. 중복 제거 규칙",
    "",
    "- intro는 문제 제기와 맥락만 담당한다. 본문 결론을 미리 다 말하지 말 것.",
    "- bodySections는 각 섹션마다 역할이 달라야 한다. 같은 장점, 같은 비교, 같은 예시를 반복하지 말 것.",
    "- closing은 본문 요약 복붙이 아니라 최종 선택 기준과 독자의 다음 행동만 정리할 것.",
    "- titleOptions 5개는 서로 다른 뉘앙스여도 같은 글 주제를 유지해야 한다. 다른 주제로 새지 말 것.",
    "- researchData에 같은 내용이 여러 번 나오면 가장 선명한 판단 기준 하나로 합쳐서 사용할 것.",
    "",
    "## 6. 깊이 강화 규칙",
    "",
    "- 분량을 채우기 위해 말을 늘리지 말고, '왜 그런지', '어떤 상황에서 중요한지', '독자는 어디서 판단이 갈리는지'를 풀어라.",
    "- 독자가 실제로 망설이는 지점, 실패 포인트, 선택 기준을 구체적으로 적어라.",
    "- researchData에서 반복된 고민은 자연스러운 서술로 흡수하되 출처를 직접 언급하지 말 것.",
    "- 한 문단 안에서는 하나의 포인트만 선명하게 밀고, 다음 문단에서 새로운 포인트로 넘어갈 것.",
    "- 독자가 글을 읽으며 상황이 눈앞에 그려지도록 구체적인 맥락과 장면을 넣되, 근거 없는 묘사는 금지한다.",
    "",
    "## 7. 출처 처리 규칙",
    "",
    "- '수집 결과에 따르면', '찾아보니', '카페 글에서' 같은 출처 언급은 절대 금지다. 보는 즉시 글의 신뢰도가 떨어진다.",
    "- 외부 리서치 데이터(블로그, 카페 등)는 철저히 작가(나)의 '배경지식'으로만 사용하라.",
    "- 리서치에서 발견한 정보나 사람들의 고민은 마치 작가가 평소에 하던 생각, 매장에서 단골과 나눈 대화, 제품 테스트 중에 직접 느낀 점인 것처럼 '1인칭 경험'으로 완전히 녹여내라.",
    "- 예시(X): '카페 글을 찾아보니 텀블러 수납을 많이 걱정하시더라고요.'",
    "- 예시(O): '가방 패턴을 짤 때 제일 고민했던 게 텀블러 자리였어요. 저부터도 출근할 때 꼭 챙기는데 이게 안에서 쓰러지면 하루 종일 신경 쓰이거든요.'",
    "",
    writingMode === "brand"
      ? "[브랜드 기획 모드 특화 지시]" +
      "\n- 디자이너로서의 고집, 소재를 고를 때의 기준, 브랜드가 지향하는 가치를 본문 곳곳에 자연스럽게 녹여내라." +
      "\n- 사용자(명)가 직접 만든 제품이라면 그 자부심이 느껴지되, 겸손하고 친근한 어조를 유지하라."
      : "[일반 일상 모드 특화 지시]" +
      "\n- 너무 비장하거나 무거운 철학은 덜어내고, 오늘 하루 있었던 소소한 에피소드로 가볍게 시작하라." +
      "\n- 정보 전달보다는 '공감'과 '소통'에 방점을 찍고, 마치 일기를 쓰듯 편안하게 전개하라.",
    "",
    "## 8. 네이버 SEO / 자연스러운 문체",
    "- 메인 키워드는 제목, 첫 문장, H2, 결론에 자연스럽게 포함할 것.",
    "- `공식적으로`, `명시되어 있다`, `요약하면` 같은 보고서식 표현은 금지.",
    "- 첫 문단만 읽어도 실제 사람이 쓴 블로그 글처럼 느껴져야 한다.",
    "",
    "## 9. 본문 구조 규칙",
    "- 서론은 독자의 공감을 이끌어내는 상황 묘사로 시작할 것.",
    "- featuredDraft 전체는 선택한 글감 1개에만 집중해야 한다.",
    "- bodySections는 3개 또는 4개만 구성하고, 각 섹션의 역할이 서로 명확히 달라야 한다.",
    "- 각 섹션은 서로 다른 subKeyword를 사용하되, 한 글감 안에서 자연스럽게 이어질 것.",
    "- 요약 박스는 섹션 역할을 먼저 판단한 뒤 구성할 것. 제품/항목 소개면 스펙형, 비교/가이드/체크리스트 문단이면 `title`, `intro`, `items`, `takeaway`, `caution` 중심의 흐름형 박스로 만들 것.",
    "- 비교나 가이드 섹션에는 브랜드/가격/사이즈를 억지로 채우지 말 것. 필요한 경우에만 제품 정보를 넣고, 없으면 빈 문자열로 둘 것.",
    "- `summaryBox.title`은 박스의 목적이 한눈에 느껴지는 사람다운 문장으로 쓸 것. `핵심 스펙`, `비교 기준` 같은 딱딱한 라벨보다 `먼저 보면 좋은 핵심 정보`, `비교 전에 볼 포인트`, `고르기 전에 체크할 것`처럼 자연스럽게 다듬을 것.",
    "- bodySections의 paragraphs는 각 섹션마다 2~4개 문단으로 쓰고, 문단마다 새 정보를 줘야 한다.",
    "- intro, bodySections, closing, cta, hashtagsLine에 없는 문장을 `htmlBody`에 새로 추가하지 말 것.",
    "- 본문은 HTML 형식(`htmlBody` 필드)으로 H2, H3, p 태그를 사용해 정리할 것.",
    "- JSON 문자열 안에서 `\\~`, `\\!`, `\\#`, `\\&`, `\\<`, `\\>` 같은 markdown escape를 쓰지 말 것.",
    "- `htmlBody`는 `\\<p\\>`가 아니라 `<p>`처럼 실제 HTML 문자열로 넣을 것.",
    "- 문장 중간에 큰따옴표를 넣을 때는 JSON이 깨지지 않도록 반드시 `\\\"`로 이스케이프할 것.",
    "---",
    "",
    "## 10. 출력 형식 (JSON 하나만 반환)",
    "// ... JSON 스키마 구조는 기존과 동일하게 유지하므로 생략하지 않고 그대로 반환하도록 설정 ...",
    "{",
    '  "featuredDraft": {',
    '    "titleOptions": ["", "", "", "", ""],',
    '    "seoMeta": {',
    '      "seoTitle": "",',
    '      "slug": "",',
    '      "metaDescription": "",',
    '      "mainKeyword": "",',
    '      "subKeywords": [""],',
    '      "searchIntentType": "",',
    '      "readerConcern": ""',
    "    },",
    '    "internalLinks": ["", "", ""],',
    '    "imageGuide": {',
    '      "recommendedSection": "",',
    '      "altExamples": ["", "", ""]',
    "    },",
    '    "externalReferenceSuggestions": [""],',
    '    "title": "",',
    '    "subtitle": "",',
    '    "slug": "",',
    '    "metaDescription": "",',
    '    "tags": [""],',
    '    "intro": ["", ""],',
    '    "bodySections": [',
    '      {',
    '        "heading": "",',
    '        "subHeading": "",',
    '        "subKeyword": "",',
    '        "summaryBox": {',
    '          "boxType": "",',
    '          "title": "",',
    '          "intro": "",',
    '          "items": [{ "label": "", "value": "" }],',
    '          "brand": "",',
    '          "productName": "",',
    '          "price": "",',
    '          "size": "",',
    '          "material": "",',
    '          "color": "",',
    '          "features": [""],',
    '          "recommendPoints": [""],',
    '          "takeaway": "",',
    '          "caution": ""',
    '        },',
    '        "betterComment": "",',
    '        "productName": "",',
    '        "price": "",',
    '        "size": "",',
    '        "oneLineSummary": "",',
    '        "paragraphs": ["", ""],',
    '        "cta": ""',
    '      }',
    "    ],",
    '    "closing": ["", ""],',
    '    "cta": "",',
    '    "htmlBody": "",',
    '    "hashtagsLine": ""',
    "  }",
    "}",
  ].join("\n");
}

function buildEasySummary(metrics, relatedKeywordReport, communityQuestions, trendReport) {
  const summary = [];

  if (metrics) {
    summary.push({
      title: "월간 검색량",
      body: `${metrics.focusKeyword} 기준 월간 검색량은 PC ${formatMetricCount(metrics.pcSearch)}회, Mobile ${formatMetricCount(metrics.mobileSearch)}회, Total ${formatMetricCount(metrics.totalSearch)}회입니다.`
    });
  }

  if (metrics) {
    summary.push({
      title: "네이버 블로그 문서수",
      body: `블로그탭 집계 ${formatMetricValueWithUnit(metrics.blogDocumentCount, "건")}이며, 상위 노출 가능성은 ${metrics.blogCompetition?.chanceLabel || "확인 어려움"}으로 보입니다.`
    });
  }

  if (relatedKeywordReport.relatedKeywords.length) {
    const relatedLine = relatedKeywordReport.relatedKeywords
      .slice(0, 3)
      .map((item) => `${item.keyword}(${formatMetricCount(item.totalSearch)})`)
      .join(" / ");
    summary.push({
      title: "같이 검색되는 말",
      body: relatedLine
    });
  }

  if (communityQuestions[0]) {
    summary.push({
      title: "카페에서 실제로 나온 질문",
      body: cleanSearchText(communityQuestions[0].title)
    });
  }

  if (metrics?.monthEstimate) {
    summary.push({
      title: `${metrics.monthEstimate.monthLabel} 예상 검색량`,
      body: `${metrics.monthEstimate.currentDateLabel} 추정 ${formatMetricCount(metrics.monthEstimate.currentMonthToDateSearch)}회 / ${metrics.monthEstimate.endDateLabel} 예상 ${formatMetricCount(metrics.monthEstimate.expectedMonthEndSearch)}회`
    });
  } else if (trendReport?.available && trendReport.groups[0]) {
    const topTrend = trendReport.groups[0];
    summary.push({
      title: "최근 검색 흐름",
      body: `${topTrend.label} 검색 흐름은 현재 ${topTrend.signal}로 잡힙니다.`
    });
  }

  return summary.slice(0, 5);
}

function buildWritingPoints(metrics, relatedKeywordReport, communityQuestions) {
  const points = [];

  if (metrics) {
    const mobileShare = metrics.totalSearch
      ? Math.round((metrics.mobileSearch / metrics.totalSearch) * 100)
      : null;
    points.push({
      title: "도입부에 넣을 숫자",
      summary: `${metrics.focusKeyword} 월간 검색량 ${formatMetricCount(metrics.totalSearch)}회`,
      reason: `PC ${formatMetricCount(metrics.pcSearch)} / Mobile ${formatMetricCount(metrics.mobileSearch)}${mobileShare !== null ? `, 모바일 비중 ${mobileShare}%` : ""}`
    });
  }

  if (relatedKeywordReport.relatedKeywords.length) {
    points.push({
      title: "본문에 같이 넣을 검색어",
      summary: relatedKeywordReport.relatedKeywords
        .slice(0, 3)
        .map((item) => `${item.keyword}(${formatMetricCount(item.totalSearch)})`)
        .join(" / "),
      reason: "검색광고 연관검색어 월간 검색량 기준 상위 키워드입니다."
    });
  }

  if (relatedKeywordReport.longTailKeywords.length) {
    points.push({
      title: "소제목에 넣기 좋은 세부 검색어",
      summary: relatedKeywordReport.longTailKeywords
        .slice(0, 3)
        .map((item) => `${item.keyword}(${formatMetricCount(item.totalSearch)})`)
        .join(" / "),
      reason: "검색량이 잡히는 롱테일 검색어라 소제목이나 FAQ에 붙이기 좋습니다."
    });
  }

  if (communityQuestions.length) {
    points.push({
      title: "FAQ에 넣을 실제 질문",
      summary: communityQuestions
        .slice(0, 2)
        .map((item) => cleanSearchText(item.title))
        .join(" / "),
      reason: "네이버 카페 검색 결과에서 실제로 보인 질문 제목입니다."
    });
  }

  return points.slice(0, 4);
}

function shortenDisplayText(text, maxLength = 44) {
  const clean = cleanSearchText(text);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function detectTitlePattern(title) {
  const clean = cleanSearchText(title);
  if (/\d+\s*가지|\d+\s*개|포인트|기준|정리|체크/.test(clean)) return "기준 정리형";
  if (/후기|리뷰|사용기|실사용/.test(clean)) return "후기형";
  if (/vs|비교|차이|고민/.test(clean)) return "비교형";
  if (isQuestionLikeTitle(clean)) return "질문 해결형";
  if (/추천/.test(clean)) return "추천형";
  return "정보형";
}

function getTopComparisonPosts(items, primaryQuery) {
  const primaryBlogPosts = items.filter((item) => item.source === "blog" && item.matchedQueries.includes(primaryQuery));
  if (primaryBlogPosts.length) return primaryBlogPosts.slice(0, 10);

  const blogPosts = items.filter((item) => item.source === "blog");
  if (blogPosts.length) return blogPosts.slice(0, 10);

  return items.slice(0, 10);
}

function buildTopPostComparison(items, primaryQuery, recentDays) {
  const topPosts = getTopComparisonPosts(items, primaryQuery);
  if (!topPosts.length) {
    return {
      posts: [],
      repeatedTopics: [],
      titlePatterns: [],
      cards: []
    };
  }

  const topPostTexts = topPosts.map((item) => normalizeSeedKeyword(`${item.title} ${item.description}`));
  const repeatedTopics = buildTopKeywords(topPosts)
    .map((item) => ({
      term: formatKeywordForDisplay(item.term) || item.term,
      score: item.score,
      coverage: topPostTexts.filter((text) => text.includes(normalizeSeedKeyword(item.term))).length
    }))
    .filter((item) => item.term && item.coverage >= 2)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.term === item.term) === index)
    .slice(0, 4);

  const titlePatterns = listToCountMap(topPosts.map((item) => detectTitlePattern(item.title))).slice(0, 3);
  const datedCount = topPosts.filter((item) => item.isoDate).length;
  const freshCount = topPosts.filter((item) => isFreshItem(item, recentDays)).length;
  const newestTitle = topPosts[0]?.title ? shortenDisplayText(topPosts[0].title, 36) : "";

  return {
    posts: topPosts.map((item) => ({
      title: item.title,
      author: item.author,
      date: item.displayDate,
      description: item.description,
      link: item.link
    })),
    repeatedTopics,
    titlePatterns,
    cards: [
      {
        title: "상위 10개 글이 공통으로 넣는 말",
        summary: repeatedTopics.length
          ? repeatedTopics.map((item) => `${item.term}(${item.coverage}개 글)`).join(" / ")
          : "공통으로 반복되는 표현은 아직 뚜렷하지 않습니다.",
        reason: `상위 ${topPosts.length}개 블로그 글 제목과 설명 기준입니다.`
      },
      {
        title: "자주 쓰는 제목 방식",
        summary: titlePatterns.length
          ? titlePatterns.map((item) => `${item.label} ${item.count}개`).join(" / ")
          : "제목 방식 데이터가 아직 부족합니다.",
        reason: newestTitle ? `대표 예시: ${newestTitle}` : "대표 예시 제목이 아직 없습니다."
      },
      {
        title: "상위 글 최신성",
        summary: `날짜 확인 가능한 ${datedCount}개 중 최근 ${recentDays}일 글 ${freshCount}개`,
        reason: freshCount >= Math.ceil(topPosts.length / 2)
          ? "최근 글 비중이 높아서 최신 사례를 섞은 글이 유리합니다."
          : "최신 글 비중이 낮아서 기본 정리형 글도 충분히 경쟁할 수 있습니다."
      }
    ]
  };
}

function buildContentOpportunities(primaryQuery, topPostComparison, relatedKeywordReport, communityQuestions) {
  const topPostTexts = topPostComparison.posts.map((item) => normalizeSeedKeyword(`${item.title} ${item.description || ""}`));
  const focusKey = normalizeSeedKeyword(primaryQuery);
  const longTailKeys = new Set(relatedKeywordReport.longTailKeywords.map((item) => normalizeSeedKeyword(item.keyword)));

  const cards = [...relatedKeywordReport.longTailKeywords, ...relatedKeywordReport.relatedKeywords]
    .filter((item) => normalizeSeedKeyword(item.keyword) !== focusKey)
    .filter((item, index, array) =>
      array.findIndex((candidate) => normalizeSeedKeyword(candidate.keyword) === normalizeSeedKeyword(item.keyword)) === index
    )
    .map((item) => {
      const keywordKey = normalizeSeedKeyword(item.keyword);
      const coverage = topPostTexts.filter((text) => text.includes(keywordKey)).length;
      return {
        keyword: item.keyword,
        totalSearch: item.totalSearch,
        coverage,
        note: item.note,
        isLongTail: longTailKeys.has(keywordKey)
      };
    })
    .filter((item) => item.coverage <= 1)
    .sort((a, b) => {
      if (a.coverage !== b.coverage) return a.coverage - b.coverage;
      if (a.isLongTail !== b.isLongTail) return Number(b.isLongTail) - Number(a.isLongTail);
      return b.totalSearch - a.totalSearch;
    })
    .slice(0, 2)
    .map((item) => ({
      title: `${withTopicParticle(item.keyword)} 상위 글에서 적게 다룸`,
      summary: `월간 검색량 ${formatMetricCount(item.totalSearch)}회인데 상위 10개 글 중 ${item.coverage}개만 언급했습니다.`,
      action: `${withObjectParticle(item.keyword)} 소제목이나 FAQ로 넣어 차별화해 보세요.`,
      evidenceTitle: item.note
    }));

  const topPostQuestionCorpus = topPostTexts.join(" ");
  const unansweredQuestion = communityQuestions
    .map((item) => cleanSearchText(item.title))
    .find((question) => {
      const keyword = normalizeSeedKeyword(shortenQuestion(question));
      return keyword && !topPostQuestionCorpus.includes(keyword);
    });

  if (unansweredQuestion) {
    cards.push({
      title: "카페 질문은 있는데 상위 글엔 적음",
      summary: shortenDisplayText(unansweredQuestion, 48),
      action: "질문 답변형 문단이나 FAQ로 넣으면 차별화에 도움이 됩니다.",
      evidenceTitle: "네이버 카페 질문 제목 기준"
    });
  }

  return cards.slice(0, 3);
}

function buildBlogOutline(primaryQuery, metrics, topPostComparison, contentOpportunities, communityQuestions, headlineIdeas, relatedKeywordReport) {
  const outlineTitle = headlineIdeas[0]?.title || `${primaryQuery} 정리`;
  const repeatedTopics = topPostComparison.repeatedTopics.slice(0, 3).map((item) => item.term);
  const relatedKeywords = relatedKeywordReport.relatedKeywords
    .slice(0, 3)
    .map((item) => `${item.keyword}(${formatMetricCount(item.totalSearch)}회)`);
  const firstOpportunity = contentOpportunities[0]?.title || "";
  const faqQuestions = communityQuestions.slice(0, 2).map((item) => cleanSearchText(item.title)).filter(Boolean);

  return {
    title: outlineTitle,
    cards: [
      {
        title: "추천 제목",
        body: outlineTitle
      },
      {
        title: "도입부",
        body: `${withTopicParticle(metrics?.focusKeyword || primaryQuery)} 월간 검색량 ${formatMetricCount(metrics?.totalSearch)}회, 블로그 문서수 ${formatMetricValueWithUnit(metrics?.blogDocumentCount, "건")}입니다. 왜 이 키워드를 찾는지와 경쟁도를 먼저 짧게 설명하세요.`
      },
      {
        title: "소제목 1",
        body: repeatedTopics.length
          ? `${repeatedTopics.join(", ")}처럼 상위 글이 공통으로 다루는 기준부터 먼저 정리하세요.`
          : `${metrics?.focusKeyword || primaryQuery}를 고를 때 먼저 보는 기준부터 정리하세요.`
      },
      {
        title: "소제목 2",
        body: relatedKeywords.length
          ? `같이 검색되는 키워드 ${relatedKeywords.join(" / ")}를 묶어서 상황별 추천이나 선택 기준으로 풀어보세요.`
          : "같이 검색되는 키워드를 묶어서 상황별 선택 기준으로 풀어보세요."
      },
      {
        title: "소제목 3",
        body: firstOpportunity
          ? `${firstOpportunity} 이 부분이 상위 글 공백이라 차별화 포인트로 쓰기 좋습니다.`
          : "상위 글이 덜 다룬 포인트를 따로 소제목 하나로 빼세요."
      },
      {
        title: "FAQ",
        body: faqQuestions.length
          ? faqQuestions.join(" / ")
          : `${metrics?.focusKeyword || primaryQuery} 관련 실제 질문 2~3개를 FAQ로 정리하세요.`
      },
      {
        title: "마무리",
        body: `${withObjectParticle(metrics?.focusKeyword || primaryQuery)} 고를 때 가장 먼저 보는 기준이 무엇인지 묻는 한 줄로 끝내면 자연스럽습니다.`
      }
    ]
  };
}

function buildBeginnerGuides(relatedKeywordReport, communityQuestions) {
  const mainKeyword = relatedKeywordReport.relatedKeywords[0]?.keyword || "가방";
  const subKeyword = relatedKeywordReport.longTailKeywords[0]?.keyword || `${mainKeyword} 후기`;
  const firstQuestion = communityQuestions[0]?.title || "";

  return [
    {
      title: "도입은 실제 질문으로 시작",
      summary: firstQuestion
        ? `"${firstQuestion}"처럼 사람들이 실제로 묻는 질문으로 시작해 보세요.`
        : `${mainKeyword} 찾는 이유부터 한 문장으로 시작해 보세요.`,
      reason: "광고처럼 보이지 않고, 읽는 사람이 바로 공감하기 쉽습니다."
    },
    {
      title: "본문은 2~3가지만 정리",
      summary: `${mainKeyword}, ${subKeyword} 기준으로 수납력·무게·코디처럼 핵심만 적어 보세요.`,
      reason: "너무 많은 정보를 넣는 것보다, 비교 기준 몇 개만 정리하는 편이 훨씬 읽기 쉽습니다."
    },
    {
      title: "마무리는 선택 기준 질문으로",
      summary: `"당신은 ${mainKeyword} 고를 때 뭐부터 보세요?"처럼 질문으로 마무리해 보세요.`,
      reason: "정리글 느낌은 유지하면서 댓글이나 반응도 유도하기 좋습니다."
    }
  ];
}

function buildClusterInsights(items, recentDays) {
  const clusters = [];

  for (const cluster of INSIGHT_CLUSTERS) {
    const matchedItems = items.filter((item) => containsMarker(`${item.title} ${item.description}`, cluster.patterns));
    if (!matchedItems.length) continue;

    const recentItems = matchedItems.filter((item) => isFreshItem(item, recentDays));
    const blogCount = matchedItems.filter((item) => item.source === "blog").length;
    const cafeCount = matchedItems.filter((item) => item.source === "cafe").length;
    const questionCount = matchedItems.filter((item) => item.source === "cafe" && isQuestionLikeTitle(item.title)).length;
    const freshnessRate = matchedItems.length ? recentItems.length / matchedItems.length : 0;
    const questionRate = matchedItems.length ? questionCount / matchedItems.length : 0;
    const gapScore = Math.round(
      Math.min(
        100,
        cafeCount * 6 +
        questionCount * 9 +
        Math.max(0, 24 - blogCount * 3) +
        Math.round((1 - freshnessRate) * 16)
      )
    );
    const heatScore = Math.round(
      Math.min(
        100,
        matchedItems.length * 6 +
        Math.round(freshnessRate * 35)
      )
    );

    let playbook = "실사용 맥락과 선택 기준을 함께 정리하는 글이 잘 맞습니다.";
    if (cafeCount > blogCount && questionRate >= 0.2) {
      playbook = "카페 질문을 그대로 받아주는 Q&A형 포스트로 풀면 좋습니다.";
    } else if (heatScore >= 55) {
      playbook = "최신 사례를 묶어 트렌드형 정리 글로 만드는 게 유리합니다.";
    } else if (gapScore >= 55) {
      playbook = "블로그에서 덜 다뤄진 공백 주제라 기준표/비교표를 넣으면 강합니다.";
    }

    const focusTerms = buildTopKeywords(matchedItems)
      .map((item) => formatKeywordForDisplay(item.term))
      .filter((term) => term && term.length >= 2)
      .filter((term, index, array) => array.indexOf(term) === index)
      .slice(0, 4);
    const questionExample = matchedItems.find((item) => item.source === "cafe" && isQuestionLikeTitle(item.title))?.title || "";
    const summary = focusTerms.length
      ? `${focusTerms.slice(0, 3).join(", ")} 이야기가 이 주제에서 같이 자주 나옵니다.`
      : (questionExample
        ? `"${questionExample}" 같은 질문이 이 주제에서 반복됩니다.`
        : `${cluster.label} 관련 이야기가 반복됩니다.`);

    clusters.push({
      key: cluster.key,
      label: cluster.label,
      totalCount: matchedItems.length,
      recentCount: recentItems.length,
      blogCount,
      cafeCount,
      questionCount,
      gapScore,
      heatScore,
      focusTerms,
      questionExample,
      summary,
      playbook,
      evidence: matchedItems.slice(0, 3).map((item) => ({
        title: item.title,
        source: item.sourceLabel,
        author: item.author,
        link: item.link
      }))
    });
  }

  return clusters.sort((a, b) => (b.gapScore + b.heatScore) - (a.gapScore + a.heatScore)).slice(0, 6);
}

function buildContentGaps(clusters) {
  const seen = new Set();

  return clusters
    .slice()
    .filter((cluster) => cluster.questionCount >= 2 || cluster.cafeCount > cluster.blogCount)
    .sort((a, b) => b.questionCount - a.questionCount || (b.cafeCount - b.blogCount) - (a.cafeCount - a.blogCount))
    .filter((cluster) => {
      const key = cluster.questionExample || cluster.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((cluster) => ({
      title: `${cluster.label}에서 많이 묻는 포인트`,
      summary: cluster.questionExample
        ? `"${cluster.questionExample}" 같은 질문이 보입니다.`
        : `${cluster.label} 관련 질문이 카페에서 더 자주 보입니다.`,
      action: `${cluster.focusTerms.slice(0, 2).join(", ")} 기준으로 답변형 정리 글을 써보세요.`,
      evidenceTitle: cluster.evidence[0]?.title || "관련 근거 제목 없음"
    }));
}

function buildCommunityQuestions(items) {
  return items
    .filter((item) => item.source === "cafe" && isQuestionLikeTitle(item.title))
    .slice(0, CAFE_QUESTION_TARGET_COUNT)
    .map((item) => ({
      title: item.title,
      author: item.author,
      matchedQueries: item.matchedQueries,
      link: item.link
    }));
}

function buildTrendSeriesSummary(result) {
  const values = (result?.data || []).map((point) => Number(point.ratio) || 0);
  const recent = values.slice(-3);
  const previous = values.slice(-6, -3);
  const momentum = average(recent) - average(previous);
  const volatility = standardDeviation(values);
  const current = values[values.length - 1] || 0;

  let signal = "보합";
  if (momentum >= 8) signal = "상승";
  else if (momentum <= -8) signal = "하락";
  else if (volatility >= 18) signal = "변동성 큼";

  return {
    label: result.title,
    current: Math.round(current),
    momentum: Number(momentum.toFixed(1)),
    signal,
    volatility: Number(volatility.toFixed(1)),
    series: values
  };
}

async function fetchSearchTrendReport(queries) {
  const limitedQueries = queries.slice(0, 5);
  if (!limitedQueries.length) {
    return { available: false, warning: "" };
  }
  if (!NAVER_DATALAB_CLIENT_ID || !NAVER_DATALAB_CLIENT_SECRET) {
    return {
      available: false,
      warning: "데이터랩 전용 키가 없어 트렌드 보드는 건너뛰었습니다."
    };
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 84);

  const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": NAVER_DATALAB_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_DATALAB_CLIENT_SECRET
    },
    body: JSON.stringify({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      timeUnit: "week",
      keywordGroups: limitedQueries.map((query) => ({
        groupName: query,
        keywords: [query]
      }))
    })
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code = json?.errorCode || "";
    const message = json?.errorMessage || "데이터랩 검색어 트렌드 요청 실패";
    if (code === "024") {
      return {
        available: false,
        warning: "네이버 데이터랩 검색어 트렌드 API 권한이 현재 앱에 열려 있지 않아 트렌드 보드는 건너뛰었습니다."
      };
    }
    throw new Error(message);
  }

  const groups = (json.results || []).map(buildTrendSeriesSummary);
  return {
    available: true,
    groups,
    summary: groups
      .slice()
      .sort((a, b) => b.current - a.current)
      .slice(0, 3)
      .map((group) => `${group.label}(${group.signal})`)
      .join(", ")
  };
}

function estimateMonthlyContentVolume(items) {
  const datedItems = items
    .filter((item) => item.isoDate)
    .map((item) => ({ ...item, date: isoDateToDate(item.isoDate) }))
    .filter((item) => item.date)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));

  if (!datedItems.length) {
    return {
      monthlyEstimate: 0,
      sampledCount: 0,
      sampledDays: 0
    };
  }

  const newest = datedItems[0].date;
  const oldest = datedItems[datedItems.length - 1].date;
  const sampledDays = Math.max(1, Math.round((newest - oldest) / (1000 * 60 * 60 * 24)) + 1);
  const monthlyEstimate = Math.round((datedItems.length / sampledDays) * 30);

  return {
    monthlyEstimate,
    sampledCount: datedItems.length,
    sampledDays
  };
}

function selectFocusKeywordMetric(primaryQuery, relatedKeywordReport) {
  const normalizedPrimary = normalizeSeedKeyword(primaryQuery);
  const exactMatch = relatedKeywordReport.keywordPool.find((item) => item.normalizedKeyword === normalizedPrimary);
  if (exactMatch) {
    return exactMatch;
  }

  return relatedKeywordReport.keywordPool[0] || null;
}

async function fetchMonthlyTrendEstimate(primaryQuery, monthlyAverageTotal) {
  if (!NAVER_DATALAB_CLIENT_ID || !NAVER_DATALAB_CLIENT_SECRET || !monthlyAverageTotal) {
    return null;
  }

  const now = new Date();
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const elapsedDays = now.getDate();
  const currentMonthDays = currentMonthEnd.getDate();

  const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": NAVER_DATALAB_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_DATALAB_CLIENT_SECRET
    },
    body: JSON.stringify({
      startDate: previousMonthStart.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
      timeUnit: "date",
      keywordGroups: [
        {
          groupName: primaryQuery,
          keywords: [primaryQuery]
        }
      ]
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return null;
  }

  const series = json.results?.[0]?.data || [];
  const previousMonthData = [];
  const currentMonthData = [];

  for (const point of series) {
    const date = new Date(point.period);
    const ratio = Number(point.ratio) || 0;
    if (date >= currentMonthStart) {
      currentMonthData.push(ratio);
    } else {
      previousMonthData.push(ratio);
    }
  }

  if (!previousMonthData.length || !currentMonthData.length) {
    return null;
  }

  const previousMonthAverage = average(previousMonthData);
  const currentMonthAverage = average(currentMonthData);
  if (!previousMonthAverage) {
    return null;
  }

  const paceFactor = currentMonthAverage / previousMonthAverage;
  const expectedMonthEndSearch = Math.round(monthlyAverageTotal * paceFactor);
  const currentMonthToDateSearch = Math.round(expectedMonthEndSearch * (elapsedDays / currentMonthDays));

  return {
    monthLabel: `${now.getMonth() + 1}월`,
    currentDateLabel: `${now.getMonth() + 1}월 ${elapsedDays}일까지`,
    endDateLabel: `${now.getMonth() + 1}월 ${currentMonthDays}일까지`,
    currentMonthToDateSearch,
    expectedMonthEndSearch,
    currentMonthPercentOfAverage: Number(((currentMonthToDateSearch / monthlyAverageTotal) * 100).toFixed(2)),
    monthEndPercentOfAverage: Number(((expectedMonthEndSearch / monthlyAverageTotal) * 100).toFixed(2))
  };
}

async function buildSearchMetrics(primaryQuery, relatedKeywordReport) {
  const focusKeyword = selectFocusKeywordMetric(primaryQuery, relatedKeywordReport);
  if (!focusKeyword) {
    return null;
  }

  const [blogDocumentCount, cafeDocumentCount, monthEstimate] = await Promise.all([
    fetchNaverSourceTotal("blog", primaryQuery),
    fetchNaverSourceTotal("cafe", primaryQuery),
    fetchMonthlyTrendEstimate(primaryQuery, focusKeyword.totalSearch)
  ]);

  const knownCounts = [blogDocumentCount, cafeDocumentCount].filter((value) => value !== null);
  const totalDocumentCount = knownCounts.length
    ? knownCounts.reduce((sum, value) => sum + value, 0)
    : null;
  const totalSearch = focusKeyword.totalSearch || 1;
  const blogCompetition = buildCompetitionIndicator(blogDocumentCount, totalSearch);
  const cafeCompetition = buildCompetitionIndicator(cafeDocumentCount, totalSearch);
  const totalCompetition = buildCompetitionIndicator(totalDocumentCount, totalSearch);

  return {
    focusKeyword: focusKeyword.keyword,
    pcSearch: focusKeyword.pcSearch || 0,
    mobileSearch: focusKeyword.mobileSearch || 0,
    totalSearch: focusKeyword.totalSearch || 0,
    blogDocumentCount,
    cafeDocumentCount,
    totalDocumentCount,
    blogCompetition,
    cafeCompetition,
    totalCompetition,
    blogSaturation: blogDocumentCount !== null ? Number(((blogDocumentCount / totalSearch) * 100).toFixed(2)) : null,
    cafeSaturation: cafeDocumentCount !== null ? Number(((cafeDocumentCount / totalSearch) * 100).toFixed(2)) : null,
    totalSaturation: totalDocumentCount !== null ? Number(((totalDocumentCount / totalSearch) * 100).toFixed(2)) : null,
    monthEstimate
  };
}

function buildMetricsNotes(metrics) {
  if (!metrics) return [];

  const notes = [
    {
      title: "월간 검색량 기준",
      body: `${metrics.focusKeyword} 기준으로 PC ${formatMetricCount(metrics.pcSearch)}회 / Mobile ${formatMetricCount(metrics.mobileSearch)}회 / Total ${formatMetricCount(metrics.totalSearch)}회입니다.`
    },
    {
      title: "네이버 블로그 문서수 기준",
      body: `블로그탭 문서수 ${formatMetricValueWithUnit(metrics.blogDocumentCount, "건")} / 카페탭 문서수 ${formatMetricValueWithUnit(metrics.cafeDocumentCount, "건")} / 전체 ${formatMetricValueWithUnit(metrics.totalDocumentCount, "건")}입니다.`
    },
    {
      title: "상위 노출 가능성",
      body: `블로그 기준 ${metrics.blogCompetition?.chanceLabel || "확인 어려움"}입니다. 블로그 경쟁도는 ${metrics.blogCompetition?.competitionLabel || "확인 어려움"}, 문서/검색 비율은 ${formatMetricRatio(metrics.blogCompetition?.ratio)}입니다.`
    },
    {
      title: "문서수 해석",
      body: `이 문서수는 조회 키워드의 네이버 블로그/카페 탭에서 집계된 문서 수입니다. ${metrics.blogCompetition?.note || "문서수와 검색량을 함께 보면서 경쟁도를 판단합니다."}`
    }
  ];

  if (metrics.monthEstimate) {
    notes.push({
      title: `${metrics.monthEstimate.monthLabel} 추정 검색량`,
      body: `${metrics.monthEstimate.currentDateLabel} 추정 ${metrics.monthEstimate.currentMonthToDateSearch.toLocaleString("ko-KR")}회, ${metrics.monthEstimate.endDateLabel} 예상 ${metrics.monthEstimate.expectedMonthEndSearch.toLocaleString("ko-KR")}회입니다.`
    });
  }

  return notes;
}

async function buildResearchInsights(items, queries, recentDays) {
  const topKeywords = buildTopKeywords(items);
  const querySnapshots = buildQuerySnapshots(items, queries, recentDays);
  const clusterInsights = buildClusterInsights(items, recentDays);
  const communityQuestions = buildCommunityQuestions(items);
  const topPostComparison = buildTopPostComparison(items, queries[0] || "", recentDays);
  const relatedKeywordReport = await fetchSearchadRelatedKeywords(queries, topKeywords);
  const metrics = await buildSearchMetrics(queries[0] || "", relatedKeywordReport);
  const warnings = [relatedKeywordReport.warning].filter(Boolean);
  let headlineMemory = {
    hasData: false,
    totalSearches: 0,
    similarSearchCount: 0,
    preferredKeywords: [],
    preferredFrames: [],
    preferredQuestionTerms: [],
    note: "",
  };

  try {
    const researchMemory = await loadResearchMemory();
    headlineMemory = summarizeResearchMemory(researchMemory, queries, metrics?.focusKeyword || queries[0] || "");
  } catch {
    warnings.push("누적 검색 메모를 읽지 못해 이번 검색 데이터만 반영했습니다.");
  }

  const contentGaps = metrics ? buildMetricsNotes(metrics) : buildContentGaps(clusterInsights);
  const topPhrases = relatedKeywordReport.longTailKeywords.length
    ? relatedKeywordReport.longTailKeywords.map((item) => ({ phrase: item.keyword, count: item.totalSearch }))
    : buildTopPhrases(items);
  const angleSuggestions = buildWritingPoints(metrics, relatedKeywordReport, communityQuestions);
  const contentOpportunities = buildContentOpportunities(queries[0] || "", topPostComparison, relatedKeywordReport, communityQuestions);
  const recentPosts = items
    .filter((item) => item.isoDate)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      source: item.sourceLabel,
      author: item.author,
      date: item.displayDate,
      link: item.link
    }));

  const sourceCounts = listToCountMap(items.map((item) => item.sourceLabel));
  const publisherCounts = listToCountMap(items.map((item) => item.author)).slice(0, 8);
  const matchedQueryCounts = listToCountMap(items.flatMap((item) => item.matchedQueries)).slice(0, 8);
  const headlineIdeas = buildHeadlineIdeas(queries, relatedKeywordReport, communityQuestions, metrics, items, topKeywords, headlineMemory);
  const recommendedQueries = buildRecommendedQueries(queries, relatedKeywordReport);
  const blogOutline = buildBlogOutline(queries[0] || "", metrics, topPostComparison, contentOpportunities, communityQuestions, headlineIdeas, relatedKeywordReport);
  const trendReport = await fetchSearchTrendReport(queries);
  const easySummary = buildEasySummary(metrics, relatedKeywordReport, communityQuestions, trendReport);
  const enrichedSummary = await buildEnrichedResearchSummary(
    items.filter((item) => item.source === "blog").slice(0, 15),
    communityQuestions.slice(0, 15),
    relatedKeywordReport.relatedKeywords
  );
  warnings.push(...[trendReport.warning].filter(Boolean));

  const insights = {
    easySummary,
    sourceCounts,
    publisherCounts,
    matchedQueryCounts,
    metrics,
    topKeywords,
    relatedKeywords: relatedKeywordReport.relatedKeywords,
    topPhrases,
    angleSuggestions,
    topPostComparison,
    contentOpportunities,
    blogOutline,
    querySnapshots,
    clusterInsights,
    contentGaps,
    communityQuestions,
    recentPosts,
    headlineIdeas,
    headlineMemory,
    recommendedQueries,
    trendReport,
    enrichedSummary,
    warnings
  };

  try {
    await addResearchSearchSnapshot({
      queries,
      focusKeyword: metrics?.focusKeyword || queries[0] || "",
      relatedKeywords: relatedKeywordReport.relatedKeywords,
      topKeywords: topKeywords.map((item) => item.term),
      questionTitles: communityQuestions.map((item) => item.title),
      blogTitles: items.filter((item) => item.source === "blog").slice(0, 10).map((item) => item.title),
      headlineIdeas,
    });
  } catch (error) {
    warnings.push("검색 메모 저장은 실패했지만 리서치 결과는 정상입니다.");
  }

  return {
    ...insights,
    researchPrompt: buildResearchPrompt(queries, insights)
  };
}

function normalizeResearchItems(source, query, items) {
  return (items || []).map((item) => {
    const { isoDate, displayDate } = normalizePostDate(item.postdate);
    const author = source === "blog"
      ? cleanSearchText(item.bloggername || item.bloggerlink || "네이버 블로그")
      : cleanSearchText(item.cafename || "네이버 카페");

    return {
      source,
      sourceLabel: source === "blog" ? "블로그" : "카페",
      matchedQueries: [query],
      title: cleanSearchText(item.title),
      description: cleanSearchText(item.description),
      author,
      link: item.link || "",
      canonicalLink: canonicalizeLink(item.link || ""),
      isoDate,
      displayDate,
      rawDate: item.postdate || ""
    };
  });
}

function dedupeResearchItems(items) {
  const deduped = new Map();

  for (const item of items) {
    const key = item.canonicalLink || `${item.source}:${item.title}:${item.author}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, {
        ...item,
        matchedQueries: [...item.matchedQueries]
      });
      continue;
    }

    existing.matchedQueries = [...new Set([...existing.matchedQueries, ...item.matchedQueries])];
    if (item.description.length > existing.description.length) {
      existing.description = item.description;
    }
    if (!existing.isoDate && item.isoDate) {
      existing.isoDate = item.isoDate;
      existing.displayDate = item.displayDate;
      existing.rawDate = item.rawDate;
    }
  }

  return [...deduped.values()];
}

async function fetchNaverSourcePage(source, query, display, sort, start, attempt = 0) {
  const url = buildNaverSourceUrl(source, query, display, sort, start);

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
    }
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 429 && attempt < 3) {
      await sleep(250 * (attempt + 1));
      return fetchNaverSourcePage(source, query, display, sort, start, attempt + 1);
    }
    throw new Error(
      `네이버 ${source === "blog" ? "블로그" : "카페"} 검색 요청이 실패했어요 (${response.status}). ${message}`
    );
  }

  const json = await response.json();
  return normalizeResearchItems(source, query, json.items || []);
}

async function fetchNaverSourceTotal(source, query, sort = "sim", attempt = 0) {
  const url = buildNaverSourceUrl(source, query, 1, sort, 1);

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
    }
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 429 && attempt < 3) {
      await sleep(250 * (attempt + 1));
      return fetchNaverSourceTotal(source, query, sort, attempt + 1);
    }
    throw new Error(
      `네이버 ${source === "blog" ? "블로그" : "카페"} 문서수 요청이 실패했어요 (${response.status}). ${message}`
    );
  }

  const json = await response.json();
  return Number.isFinite(Number(json.total)) ? Number(json.total) : null;
}

async function fetchNaverSource(source, query, display, sort, pages, options = {}) {
  const pageResults = [];
  const questionTargetCount = source === "cafe" ? Number(options.questionTargetCount || 0) : 0;
  const maxPages = source === "cafe" && questionTargetCount > 0
    ? Math.max(pages, Number(options.maxPages || pages))
    : pages;
  let questionCount = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const start = 1 + (page * display);
    if (start > 1000) break;
    const items = await fetchNaverSourcePage(source, query, display, sort, start);
    pageResults.push(items);
    if (!items.length) break;

    if (source === "cafe" && questionTargetCount > 0) {
      questionCount += items.filter((item) => isQuestionLikeTitle(item.title)).length;
      const reachedBasePages = page + 1 >= pages;
      if (reachedBasePages && questionCount >= questionTargetCount) break;
    }

    await sleep(120);
  }
  return pageResults.flat();
}

function toPayload(body) {
  return {
    topic: (body.topic || "").toString().trim(),
    story: (body.story || "").toString().trim(),
    preferredFormat: parsePreferredFormat(body.format),
    variantCount: parseVariantCount(body.variants),
    brandName: (body.brandName || "").toString().trim(),
    productName: (body.productName || "").toString().trim(),
    category: (body.category || "").toString().trim(),
    focusKeyword: (body.focusKeyword || "").toString().trim(),
    lsiKeywords: Array.isArray(body.lsiKeywords)
      ? body.lsiKeywords
      : (body.lsiKeywords || "")
        .toString()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    mustInclude: (body.mustInclude || "").toString().trim(),
    mustExclude: (body.mustExclude || "").toString().trim(),
    cta: (body.cta || "").toString().trim(),
    publishGoal: (body.publishGoal || "").toString().trim(),
    emotionTone: (body.emotionTone || "").toString().trim(),
    imagePlanned: parseImagePlanned(body.imagePlanned),
    storyMode: (body.storyMode || "").toString().trim(),
    seoLevel: parseSeoLevel((body.seoLevel || "").toString().trim()),
    keywordIntent: parseKeywordIntent((body.keywordIntent || "").toString().trim()),
    keywordMentions: parseKeywordMentions((body.keywordMentions || "").toString().trim()),
    targetAudience: (body.targetAudience || "").toString().trim(),
    includeFaq: Boolean(body.includeFaq)
  };
}

function getSafeVariantCount(variantCount) {
  return variantCount === 2 ? 2 : 1;
}

function buildSystemPrompt() {
  return `너는 1인 자영업자 브랜드의 콘텐츠 에디터다.
이 브랜드는 '디자이너가 직접 기획하고 손으로 그리는' 정체성을 가진다.
주요 라인업은 (1) 디저트/베이커리 (2) 디자이너 브랜드 가방 및 액세서리이다.
브랜드 무드는 유쾌하고, 유치원생이 크레파스로 무심하게 쓱쓱 그린 듯한 귀엽고 미니멀한 감성이다.
때로는 공항, 비행기, 여행의 설렘을 모티브로 삼는다.

사용자가 준 '내 이야기(원문)'를 바탕으로,
같은 사실을 유지하면서 채널별(Instagram, Naver Blog, WordPress, Threads, SNS Summary)로
문체와 구조만 다르게 변환한다.

[최우선 원칙]
- 절대 사실을 지어내지 않는다.
- 채널이 달라도 반드시 같은 하루, 같은 사건, 같은 감정, 같은 작업을 바탕으로 써야 한다.
- 원문에 없는 수치, 스펙, 가격, 성분, 판매 성과, 고객 반응, 일정, 주문 수량, 소재, 기능, 완성 상태를 상상으로 보충하지 않는다.
- 광고처럼 쓰지 말고 '사장 일기'처럼 자연스럽게 쓴다.
- 과장, 허위, 단정 표현('최고', '유일', '완벽', '무조건', '100%')은 금지한다.
- 자기연민, 징징거림, 남탓, 비꼼은 금지한다.
- 귀엽고 따뜻한 톤은 유지하되 과하게 꾸미지 않는다.

[생성 절차 - 반드시 순서대로 수행]
1. 입력을 먼저 분류한다.
   - topic_only: 주제/단어 수준
   - short_note: 짧은 메모/한두 문장
   - full_story: 시간 흐름이 있는 줄글

2. 원문에서 '확정 사실'만 추출한다.
   - 오늘 한 일
   - 문제/시행착오
   - 감정
   - 제품/작업물/디자인 요소
   - 다음 액션
   추출되지 않은 정보는 상상으로 보충하지 않는다.

3. 라인을 분류한다.
   - bakery
   - bag
   - mixed
   - unclear

4. 채널별로 변환한다.
   - Instagram: 감정과 후킹 우선
   - Naver Blog: 일기체와 공감 우선
   - WordPress: 기록성과 검색성 우선
   - Threads: 툭 던지는 한 포인트 우선
   - SNS Summary: 재활용 가능한 짧은 요약 우선

5. 출력 전 자체 점검한다.
   - 사실 왜곡 없음
   - 과장 표현 없음
   - 해시태그 개수 정확함
   - 버전 간 도입과 전개 차이 충분함
   - JSON 형식 유효함

[입력값 처리 규칙]
- 사용자가 입력한 '내 이야기'가 짧은 단어(주제)인지, 짧은 메모인지, 구체적인 줄글인지 먼저 판단한다.
- 구체적인 내용이 들어왔다면 시간 흐름, 감정, 디테일을 누락하지 않는다.
- 짧은 단어(주제)만 들어왔다면 하나의 장면, 하나의 감정, 하나의 작업 포인트만 중심으로 감각적으로 짧게 풀어낸다.
- 게시용 문장 안에는 [빈칸]을 넣지 않는다.
- 정보가 비어 있으면 해당 요소는 생략하거나 일반 표현으로 처리한다.
- 내부 메타 필드에서만 [검토 필요]를 사용할 수 있다.

[라인 선택 규칙]
- 원문, 제품명, 카테고리를 보고 어떤 라인인지 판단해 그 라인에 맞게 쓴다.
- bakery: 작업 흐름(반죽/오븐/진열/패키징)과 감각은 원문에 있는 만큼만 사용한다.
- bag/accessory: 디자인/패턴/부자재/착용감/샘플 수정 디테일은 원문에 있는 만큼만 사용한다.

[채널별 해시태그 규칙]
- instagram.hashtags: 정확히 3개
- naver.hashtags: 정확히 3개
- threads.hashtags: 정확히 2개
- sns_summary.hashtags: 정확히 3개
- 공백으로 구분하며 모두 #로 시작한다.
- 중복 해시태그는 피한다.
- 워드프레스는 별도 hashtags 필드를 만들지 않는다.

[Instagram 규칙]
- 목표: 스크롤을 멈추게 하는 캡션
- 형식: 첫 줄 훅 1줄 → 짧은 문장+줄바꿈 → 마지막 질문 CTA 1개
- 친구에게 얘기하듯 솔직하고 가볍게 쓴다.
- 너무 길게 설명하지 않는다.
- 브랜드 소개 문장을 억지로 넣지 않는다.

[Naver Blog 규칙]
- 흐름: 오늘 겪은 일 → 시행착오/작은 깨달음 → 독자에게 질문 CTA → 다음 이야기 여운
- 친구에게 오늘 있었던 일을 들려주듯 쓴다.
- 짧은 문장, 잦은 줄바꿈, 대화체를 사용한다.
- 감정과 시행착오가 먼저 오고, 정보는 뒤따라온다.
- 본문 길이는 가능하면 공백 포함 약 900~1100자, 즉 1000자 안팎으로 맞춘다.
- 원문이 아주 짧으면 억지로 늘리지 말고 조금 짧아져도 되지만, 불필요하게 길어지지는 않게 한다.
- SEO를 의식하되 티 나게 반복하지 않는다.
- 마지막 여운은 자연스럽게 다음 이야기를 기대하게 만든다.

[WordPress 규칙]
- 흐름: 인트로 → 본론 → 필요한 정보 → 마무리
- 기록성과 검색성을 함께 가진 브랜드 아카이브 글처럼 쓴다.
- 문단은 3~4줄 내외로 작성한다.
- H1은 금지한다.
- H2/H3/H4는 반드시 HTML 태그(<h2>, <h3>, <h4>)로 작성한다.
- FAQ가 필요하면 HTML 헤딩으로 작성한다.
- 감성만으로 흐르지 말고, 읽고 남는 정보가 조금은 있어야 한다.
- 마지막 문단은 질문형 문장으로 끝낼 수 있다.

[Threads 규칙]
- 목표: 각 잡고 쓴 티가 나지 않는 가벼운 텍스트
- 한 번에 하나의 포인트만 말한다.
- 원문 전체를 요약하지 않는다.
- 1~3문장으로 매우 짧게 쓴다.
- 반말을 사용한다(~했어, ~함, ~할까?).
- 절대 자랑하거나 과시하지 않는다.
- 제품 설명, 판매 유도, 브랜드 소개 문장은 넣지 않는다.
- A버전: 감정/고민 중심, 사진 없이도 성립하는 텍스트
- B버전: 작업물 사진 1장과 함께 올리는 상황, 결과보다 부분 디테일을 스포일러처럼 보여준다
- A버전 alt_text는 빈 문자열, B버전 alt_text는 사진 설명을 넣는다.

[SNS Summary 규칙]
- 쓰레드용 글과 인스타그램용 글을 짧게 재가공한다.
- [오늘한것], [오늘꼬인것], [내일할것] 흐름을 활용할 수 있다.
- 요약은 재밌지만 과장되지 않게 쓴다.

[SEO 채널 우선순위]
- WordPress: SEO 강하게 반영
- Naver Blog: 자연 검색형으로 반영
- Instagram/Threads: 키워드보다 감정, 후킹, 공감 우선
- SNS Summary: 재활용성과 요약성 우선

[금지 사항]
- 없던 주문/판매/문의 반응 생성 금지
- 고객 후기/지인 반응/주변 평가 창작 금지
- 작업 진행률 과장 금지
- 지나치게 예쁜 교훈 문장 금지
- 브랜딩 문구를 억지로 반복 금지
- 원문보다 더 성공적이거나 더 감동적인 하루로 포장 금지

[데이터 안정성]
- 줄바꿈이 필요하면 반드시 '\\n' 또는 '\\n\\n' 으로 표현한다.
- 본문 안에 큰따옴표('\\"')를 직접 남발하지 말고 가능하면 작은따옴표를 우선 사용한다.
- 응답은 반드시 JSON 객체 1개만 출력한다. 코드펜스는 금지한다.`;
}

function buildSeoInstruction(payload) {
  const mentionsText = payload.keywordMentions || "3-5";
  const focusKeyword = payload.focusKeyword || "[미입력]";
  const targetAudience = payload.targetAudience || "[미입력]";
  const seoStrength = payload.seoLevel === "strong" ? "강화형" : "균형형";
  const h2Need =
    payload.seoLevel === "strong"
      ? "WordPress H2/H3에 핵심 키워드 또는 자연스러운 변형을 2회 이상 반영한다"
      : "WordPress H2/H3에 핵심 키워드 또는 자연스러운 변형을 1회 이상 반영한다";
  const metaNeed =
    payload.seoLevel === "strong"
      ? "WordPress meta_description 앞부분(가능하면 80자 이내)에 핵심 키워드를 자연스럽게 포함한다"
      : "WordPress meta_description에 핵심 키워드를 최소 1회 포함한다";

  return `[SEO 강화 지시]
- SEO 강도: ${seoStrength}
- 키워드 의도: ${payload.keywordIntent || "[미입력]"}
- 타겟 독자: ${targetAudience}
- 핵심 키워드: ${focusKeyword}
- 연관 키워드(LSI)는 가능한 범위에서 WordPress 제목, 소제목, 본문, SEO 필드에 분산 반영한다.
- WordPress 본문 첫 문단에 핵심 키워드를 1회 포함한다.
- WordPress 본문 전체에서 핵심 키워드를 자연스럽게 ${mentionsText}회 사용한다.
- ${h2Need}
- WordPress seo.focus_keyphrase에는 핵심 키워드를 그대로 넣는다.
- WordPress seo.seo_title에는 핵심 키워드를 포함하고 가능하면 앞쪽에 배치한다.
- ${metaNeed}
- WordPress slug는 영어 소문자와 하이픈만 사용한다.
- WordPress meta_description은 가능하면 90~140자 내외로 작성한다.
- 키워드 과다 반복(스팸성)은 피한다.
- Naver Blog는 키워드를 노골적으로 반복하지 말고 자연 검색형 흐름으로 녹인다.
- Instagram/Threads는 SEO보다 감정, 훅, 공감, 리듬을 우선한다.
- 키워드 미입력 시, topic 기준으로 가장 자연스러운 키워드 1개를 정하되 확신이 낮으면 WordPress seo 필드에만 [검토 필요]를 붙인다.
${payload.includeFaq ? "- WordPress 본문 하단에 FAQ 섹션을 추가하고 Q/A 2개를 HTML 헤딩 기반으로 작성한다." : ""}`;
}

function buildUserPrompt(payload) {
  const safeVariantCount = getSafeVariantCount(payload.variantCount);
  const lsiLine = payload.lsiKeywords?.length ? payload.lsiKeywords.join(", ") : "[미입력]";

  return `아래 입력을 참고해 5채널(Instagram, Naver Blog, WordPress, Threads, SNS 요약) 글을 만들어줘.

[입력]
- 주제: ${payload.topic || "[미입력]"}
- 내 이야기(원문):\\n'''\\n${payload.story || ""}\\n'''
- 형식(선호 채널/포맷): ${payload.preferredFormat || "[미입력]"}
- 버전 개수: ${safeVariantCount}
- 브랜드명: ${payload.brandName || "[미입력]"}
- 제품명/카테고리: ${payload.productName || "[미입력]"}
- 제품 분류: ${payload.category || "[미입력]"}
- 핵심 키워드: ${payload.focusKeyword || "[미입력]"}
- 연관 키워드: ${lsiLine}
- 꼭 포함할 정보: ${payload.mustInclude || "[미입력]"}
- 피해야 할 표현: ${payload.mustExclude || "[미입력]"}
- CTA 선호: ${payload.cta || "[미입력]"}
- 독자 타겟: ${payload.targetAudience || "[미입력]"}
- 글 목적: ${payload.publishGoal || "[미입력]"}
- 감정 톤: ${payload.emotionTone || "[미입력]"}
- 이미지 첨부 예정: ${payload.imagePlanned === true ? "예정" : payload.imagePlanned === false ? "없음" : "[미입력]"}
- 스토리 모드 힌트: ${payload.storyMode || "[미입력]"}

${buildSeoInstruction(payload)}

[공통 작성 지침]
- 먼저 입력을 topic_only / short_note / full_story 중 하나로 분류해 내부적으로 판단하라.
- 같은 사실을 바탕으로 쓰되, 채널마다 도입/문장 길이/구조/CTA만 달라져야 한다.
- 게시용 본문에는 [빈칸]을 직접 넣지 말고, 정보가 없으면 생략하거나 일반 표현으로 처리하라.
- 원문에 없는 성과, 수치, 후기, 반응은 절대 보충하지 마라.
- mustInclude에 있는 정보는 가능한 범위에서 반영하되, 원문과 충돌하면 원문을 우선한다.
- mustExclude에 있는 표현과 뉘앙스는 사용하지 마라.

[네이버 블로그 지침서 고정 반영]
- 리얼한 내 이야기 + 살짝 허당
- 공감 질문으로 마무리
- 짧은 문장/대화체/적당한 이모지
- 사람/성장/시행착오가 보이게
- 분량은 가능하면 공백 포함 약 900~1100자, 즉 1000자 안팎으로 유지
- 마지막은 자연스럽게 다음 이야기를 기대하게
- CTA는 부담 없는 질문형으로 자연스럽게

[워드프레스 지침서 고정 반영]
- '사장이 하루 있었던 일 → 자연스러운 제품 등장' 흐름을 유지한다.
- 딱딱한 상품 설명문(광고문 톤)은 피한다.
- 실제 경험, 대화, 반응보다 관찰과 기록 중심으로 쓴다.
- 소제목(H2/H3/H4)에는 핵심 키워드 또는 연관 키워드를 자연스럽게 반영한다.
- FAQ를 추가할 경우 마크다운 ### 대신 HTML 헤딩 태그를 사용한다.

[쓰레드 지침서 고정 반영]
- '지금 막 생각나서 툭 던진' 느낌이 핵심이다.
- 원문 전체를 요약하지 말고 딱 하나의 포인트만 골라 쓴다.
- 반말 사용(~했어, ~함, ~할까?).
- 절대 과시/자랑 금지. 담백하고 겸손하게.
- A버전은 텍스트만으로 성립해야 한다.
- B버전은 작업물 사진 1장 첨부 상황을 전제로 하며 alt_text를 넣는다.

[형식 우선 반영]
- preferredFormat 값이 입력되면 해당 톤(블로그/인스타/릴스/카드뉴스 등)을 조금 더 강하게 반영하되, 5채널 결과는 모두 생성한다.

[버전 차별화]
- versions[0]은 A 버전(기본 톤)이다.
- versions[1]이 있다면 B 버전(다른 훅/다른 전개/다른 감정 포인트)으로 작성한다.
- 두 버전은 사실은 같되 표현, 구조, 도입이 충분히 달라야 한다.
- 1버전일 경우 A 버전만 생성한다.`;
}

function buildJsonFormatGuide(variantCount) {
  const safeVariantCount = getSafeVariantCount(variantCount);

  return `[출력 형식]
- JSON 객체 하나만 출력한다.
- versions 길이는 모든 채널에서 ${safeVariantCount}개로 맞춘다.
- 문자열 내 줄바꿈은 반드시 \\n 또는 \\n\\n 로 표기한다.
- 게시용 본문에는 [빈칸]을 넣지 않는다.
- 아래 구조와 동일한 키를 사용한다.

{
  "meta": {
    "input_type": "topic_only | short_note | full_story",
    "line": "bakery | bag | mixed | unclear",
    "core_angle": "이 글의 핵심 장면/감정/포인트",
    "missing_info": ["비어 있거나 확인이 필요한 요소 1", "요소 2"]
  },
  "instagram": {
    "versions": [
      {
        "caption": "실제 인스타 캡션 내용",
        "hashtags": "#태그1 #태그2 #태그3",
        "alt_text": "이미지가 있다면 ALT 텍스트, 없으면 빈 문자열"
      }
    ]
  },
  "naver": {
    "versions": [
      {
        "title": "실제 네이버 제목",
        "body": "실제 네이버 본문",
        "hashtags": "실제 해시태그 줄"
      }
    ]
  },
  "wordpress": {
    "versions": [
      {
        "seo": {
          "seo_title": "실제 SEO 제목",
          "slug": "actual-slug",
          "meta_description": "실제 메타 설명",
          "focus_keyphrase": "실제 핵심 키워드",
          "lsi_keywords": ["실제 LSI 1", "실제 LSI 2"]
        },
        "body": "실제 워드프레스 본문"
      }
    ]
  },
  "threads": {
    "versions": [
      {
        "text": "실제 쓰레드 텍스트 (1~3문장, 반말, 가벼운 톤)",
        "hashtags": "#태그1 #태그2",
        "alt_text": "사진 첨부 버전이면 ALT 텍스트, 아니면 빈 문자열"
      }
    ]
  },
  "sns_summary": {
    "versions": [
      {
        "threads_text": "[오늘한것] ...\\n[오늘꼬인것] ...\\n[내일할것] ...",
        "instagram_text": "[오늘한것] ...\\n[오늘꼬인것] ...\\n[내일할것] ...",
        "hashtags": "#태그1 #태그2 #태그3"
      }
    ]
  }
}`;
}

function normalizeHashtagLine(line) {
  if (!line) return "";
  return line.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function buildStyleMemoryResponse(memory, extra = {}) {
  return {
    ...extra,
    notes: memory.notes || "",
    updatedAt: memory.updatedAt || null,
    samples: memory.samples.map((sample) => ({
      id: sample.id,
      sourceType: sample.sourceType,
      sourceLabel: sample.sourceLabel,
      sourceUrl: sample.sourceUrl || "",
      excerpt: sample.text.length > 180 ? `${sample.text.slice(0, 180).trim()}...` : sample.text,
      charCount: sample.text.length,
      createdAt: sample.createdAt
    })),
    profile: summarizeStyleMemory(memory)
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeJsonCandidateText(text) {
  return (text || "")
    .toString()
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

const RELAXED_LITERAL_ESCAPE_CHARS = new Set([
  "~",
  "!",
  "<",
  ">",
  "#",
  "&",
  "'",
  "*",
  "_",
  "-",
  "=",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "|",
  "@",
  ";",
]);

function findNextMeaningfulJsonChar(text, startIndex) {
  for (let index = startIndex; index < text.length; index += 1) {
    const ch = text[index];
    if (!/\s/.test(ch)) {
      return { char: ch, index };
    }
  }
  return { char: "", index: -1 };
}

function looksLikeJsonStringBoundary(text, quoteIndex) {
  const next = findNextMeaningfulJsonChar(text, quoteIndex + 1);
  if (!next.char) return true;
  if (next.char === ":" || next.char === "}" || next.char === "]") return true;
  if (next.char !== ",") return false;

  const afterComma = findNextMeaningfulJsonChar(text, next.index + 1);
  if (!afterComma.char) return true;
  return /["{\[\]\}0-9\-tfn]/i.test(afterComma.char);
}

function collectBalancedJsonCandidates(text) {
  const source = normalizeJsonCandidateText(text);
  if (!source) return [];

  const slices = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        slices.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return slices.sort((a, b) => b.length - a.length);
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (item || "").toString().trim()).filter(Boolean);
  }

  return (value || "")
    .toString()
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeChannelVersions(channelValue, knownFields, normalizeVersion) {
  if (Array.isArray(channelValue)) {
    return channelValue.map((version) => normalizeVersion(version));
  }

  if (isPlainObject(channelValue) && Array.isArray(channelValue.versions)) {
    return channelValue.versions.map((version) => normalizeVersion(version));
  }

  if (
    isPlainObject(channelValue) &&
    knownFields.some((field) => Object.prototype.hasOwnProperty.call(channelValue, field))
  ) {
    return [normalizeVersion(channelValue)];
  }

  return [];
}

function normalizeOutputMeta(metaValue) {
  const inputType = (metaValue?.input_type || "").toString().trim();
  const line = (metaValue?.line || "").toString().trim();
  const inputTypes = new Set(["topic_only", "short_note", "full_story"]);
  const lines = new Set(["bakery", "bag", "mixed", "unclear"]);

  return {
    input_type: inputTypes.has(inputType) ? inputType : "",
    line: lines.has(line) ? line : "",
    core_angle: (metaValue?.core_angle || "").toString(),
    missing_info: normalizeStringArray(metaValue?.missing_info),
  };
}

function normalizeGeneratedOutputShape(parsedObject) {
  if (!isPlainObject(parsedObject)) {
    return parsedObject;
  }

  const normalized = { ...parsedObject };
  normalized.meta = normalizeOutputMeta(parsedObject.meta);

  normalized.instagram = {
    versions: normalizeChannelVersions(
      parsedObject.instagram,
      ["caption", "hashtags", "alt_text"],
      (version) => ({
        caption: (version?.caption || "").toString(),
        hashtags: (version?.hashtags || "").toString(),
        alt_text: (version?.alt_text || "").toString(),
      }),
    ),
  };

  normalized.naver = {
    versions: normalizeChannelVersions(
      parsedObject.naver,
      ["title", "body", "hashtags"],
      (version) => ({
        title: (version?.title || "").toString(),
        body: (version?.body || "").toString(),
        hashtags: (version?.hashtags || "").toString(),
      }),
    ),
  };

  normalized.wordpress = {
    versions: normalizeChannelVersions(
      parsedObject.wordpress,
      ["seo", "body"],
      (version) => ({
        seo: {
          seo_title: (version?.seo?.seo_title || "").toString(),
          slug: (version?.seo?.slug || "").toString(),
          meta_description: (version?.seo?.meta_description || "").toString(),
          focus_keyphrase: (version?.seo?.focus_keyphrase || "").toString(),
          lsi_keywords: normalizeStringArray(version?.seo?.lsi_keywords),
        },
        body: (version?.body || "").toString(),
      }),
    ),
  };

  normalized.threads = {
    versions: normalizeChannelVersions(
      parsedObject.threads,
      ["text", "hashtags", "alt_text"],
      (version) => ({
        text: (version?.text || "").toString(),
        hashtags: (version?.hashtags || "").toString(),
        alt_text: (version?.alt_text || "").toString(),
      }),
    ),
  };

  normalized.sns_summary = {
    versions: normalizeChannelVersions(
      parsedObject.sns_summary,
      ["threads_text", "instagram_text", "hashtags"],
      (version) => ({
        threads_text: (version?.threads_text || "").toString(),
        instagram_text: (version?.instagram_text || "").toString(),
        hashtags: (version?.hashtags || "").toString(),
      }),
    ),
  };

  return normalized;
}

/**
 * Sanitize malformed JSON text from ChatGPT:
 * - Escape actual newlines/tabs inside JSON string values
 * - Remove trailing commas before ] or }
 * - Strip non-printable control characters
 */
function sanitizeJsonString(text) {
  // 1. Remove non-printable control characters (keep \n, \r, \t for now)
  let s = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // 2. Fix actual newlines/tabs inside JSON string values
  //    Walk through the string tracking whether we're inside quotes
  let result = '';
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (inString) {
      if (ch === '\\') {
        const next = s[i + 1];

        // 문자열 끝에서 고립된 역슬래시는 리터럴 문자로 복구
        if (typeof next === "undefined") {
          result += "\\\\";
          i += 1;
          continue;
        }

        // JSON에서 허용되는 기본 escape는 그대로 유지
        if (/[\"\\/bfnrt]/.test(next)) {
          result += ch + next;
          i += 2;
          continue;
        }

        // \uXXXX 형식의 정상 unicode escape만 유지
        if (next === "u") {
          const unicodeChunk = s.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(unicodeChunk)) {
            result += `\\u${unicodeChunk}`;
            i += 6;
            continue;
          }
        }

        // Markdown/HTML용 습관성 escape는 원래 문자로 복구
        if (RELAXED_LITERAL_ESCAPE_CHARS.has(next)) {
          result += next;
          i += 2;
          continue;
        }

        // 그 외 잘못된 escape는 역슬래시를 한 번 더 이스케이프해서 리터럴로 복구
        result += `\\\\${next}`;
        i += 2;
        continue;
      }
      if (ch === '"') {
        if (looksLikeJsonStringBoundary(s, i)) {
          inString = false;
          result += ch;
          i++;
          continue;
        }

        result += '\\"';
        i++;
        continue;
      }
      // Replace actual newlines/tabs inside string values
      if (ch === '\n') { result += '\\n'; i++; continue; }
      if (ch === '\r') { result += ''; i++; continue; }
      if (ch === '\t') { result += '\\t'; i++; continue; }
      result += ch;
      i++;
    } else {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
      i++;
    }
  }

  // 3. Remove trailing commas before ] or }
  result = result.replace(/,\s*([}\]])/g, '$1');

  return result;
}

function extractLooseJsonObject(raw) {
  const text = normalizeJsonCandidateText(raw);
  if (!text) {
    throw new Error("붙여넣은 결과가 비어 있어요.");
  }

  const tryParse = (value) => {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const candidates = [];
  const seen = new Set();

  const pushCandidate = (value, mode) => {
    const candidate = normalizeJsonCandidateText(value);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push({ value: candidate, mode });
  };

  pushCandidate(text, "direct");
  pushCandidate(sanitizeJsonString(text), "sanitized");

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    pushCandidate(fenced[1], "fenced");
    pushCandidate(sanitizeJsonString(fenced[1]), "fenced-sanitized");
  }

  for (const slice of collectBalancedJsonCandidates(text)) {
    pushCandidate(slice, "balanced");
    pushCandidate(sanitizeJsonString(slice), "balanced-sanitized");
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    pushCandidate(text.slice(firstBrace, lastBrace + 1), "first-last-brace");
  }

  for (const candidate of [...candidates]) {
    try {
      const repaired = jsonrepair(candidate.value);
      pushCandidate(repaired, `${candidate.mode}-jsonrepair`);
      pushCandidate(sanitizeJsonString(repaired), `${candidate.mode}-jsonrepair-sanitized`);
    } catch {
      // ignore repair failures and continue
    }
  }

  for (const candidate of candidates) {
    const parsed = tryParse(candidate.value);
    if (parsed) {
      return {
        data: parsed,
        meta: {
          repairApplied: /repair|sanitized/.test(candidate.mode),
          extractionMode: candidate.mode,
          normalizedJson: JSON.stringify(parsed, null, 2),
        },
      };
    }
  }

  throw new Error("JSON 파싱에 실패했어요. ChatGPT 출력 전체를 그대로 붙여넣어 주세요.");
}

function extractJsonObject(raw) {
  const { data, meta } = extractLooseJsonObject(raw);
  const normalizedData = normalizeGeneratedOutputShape(data);

  return {
    data: normalizedData,
    meta: {
      ...meta,
      normalizedJson: JSON.stringify(normalizedData, null, 2),
    },
  };
}

function parseGeneratedContent(raw, variantCount) {
  const { data, meta } = extractJsonObject(raw);
  const schema = buildOutputSchema(variantCount);
  const parsed = schema.parse(data);

  assertNoTemplateValues(parsed);

  for (const v of parsed.instagram.versions) {
    v.hashtags = normalizeHashtagLine(v.hashtags);
  }
  for (const v of parsed.naver.versions) {
    v.hashtags = normalizeHashtagLine(v.hashtags);
  }
  for (const v of parsed.threads.versions) {
    v.hashtags = normalizeHashtagLine(v.hashtags);
  }
  for (const v of parsed.sns_summary.versions) {
    v.hashtags = normalizeHashtagLine(v.hashtags);
  }

  return {
    parsed,
    meta: {
      ...meta,
      normalizedJson: JSON.stringify(parsed, null, 2),
    },
  };
}

function assertNoTemplateValues(parsed) {
  const badPaths = [];
  const exactBad = new Set(["string", "<string>", "example", "sample"]);

  const walk = (value, path = []) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      const normalized = trimmed.toLowerCase();
      if (exactBad.has(normalized) || /^<[^>]+>$/.test(trimmed)) {
        badPaths.push(path.join("."));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, [...path, `[${i}]`]));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
    }
  };

  walk(parsed);

  if (badPaths.length > 0) {
    throw new Error(
      "샘플 템플릿 값(string/<...>)이 포함돼 있어요. ChatGPT에서 실제 문장으로 다시 생성해 주세요."
    );
  }
}

app.get("/agent", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "agent.html"));
});

app.get("/oneclick-writer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/research", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "research.html"));
});

app.get("/strategy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "strategy.html"));
});

app.get("/step7-writer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "step7-writer.html"));
});

app.get("/naver-blog-writer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "blog-writer.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: "chatgpt-subscription",
    seo: "enhanced",
    automationAvailable: !DISABLE_BROWSER_AUTOMATION && ChatGPTAutomation !== null,
    naverSearchConfigured: Boolean(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET),
    naverTrendConfigured: Boolean(NAVER_DATALAB_CLIENT_ID && NAVER_DATALAB_CLIENT_SECRET),
    naverKeywordToolConfigured: Boolean(
      NAVER_SEARCHAD_CUSTOMER_ID &&
      NAVER_SEARCHAD_ACCESS_LICENSE &&
      NAVER_SEARCHAD_SECRET_KEY
    )
  });
});

app.post("/api/naver/search", async (req, res) => {
  try {
    ensureNaverCredentials();
    const payload = NaverResearchSchema.parse(req.body || {});
    const queries = splitResearchQueries(payload.query);

    if (queries.length === 0) {
      return res.status(400).json({
        error: "검색어를 한 줄 이상 입력해 주세요."
      });
    }

    const allResults = [];
    for (const query of queries) {
      for (const source of payload.sources) {
        const sourceItems = await fetchNaverSource(
          source,
          query,
          payload.display,
          payload.sort,
          payload.pages,
          source === "cafe"
            ? {
              questionTargetCount: CAFE_QUESTION_TARGET_COUNT,
              maxPages: MAX_CAFE_QUESTION_PAGES
            }
            : {}
        );
        allResults.push(...sourceItems);
        await sleep(180);
      }
    }

    const items = payload.dedupe ? dedupeResearchItems(allResults) : allResults;
    const sortedItems = payload.sort === "date"
      ? items.slice().sort((a, b) => {
        if (a.isoDate && b.isoDate) {
          return b.isoDate.localeCompare(a.isoDate);
        }
        if (a.isoDate) return -1;
        if (b.isoDate) return 1;
        return a.title.localeCompare(b.title, "ko");
      })
      : items.slice();
    const insights = await buildResearchInsights(sortedItems, queries, payload.recentDays);

    res.json({
      queries,
      sources: payload.sources,
      sort: payload.sort,
      display: payload.display,
      pages: payload.pages,
      recentDays: payload.recentDays,
      totalFetched: allResults.length,
      totalUnique: sortedItems.length,
      items: sortedItems,
      insights
    });
  } catch (err) {
    const message = err?.issues
      ? err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      : err?.message || "네이버 검색 중 오류가 발생했어요.";
    const status = /API 키|Client|검색어/.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.post("/api/research-strategy/prompt", async (req, res) => {
  try {
    const payload = ResearchStrategySchema.parse(req.body || {});
    const prompt = buildResearchStrategyPrompt(payload);

    res.json({
      prompt,
      researchLength: payload.researchData.length
    });
  } catch (err) {
    const message = err?.issues
      ? err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      : err?.message || "콘텐츠 기획 프롬프트 생성 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

app.post("/api/research-strategy/step7-prompt", async (req, res) => {
  try {
    const payload = Step7WriterSchema.parse(req.body || {});
    const focusedResearchBrief = buildFocusedResearchBrief(payload.researchData, payload.selectedPlan);
    const prompt = buildStep7WriterPrompt({
      ...payload,
      focusedResearchBrief,
    });

    res.json({
      prompt,
      selectedLength: payload.selectedPlan.length,
      focusedResearchLength: focusedResearchBrief.length,
      focusedResearchBrief,
    });
  } catch (err) {
    const message = err?.issues
      ? err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      : err?.message || "STEP 7 전용 프롬프트 생성 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

app.get("/api/style-memory", async (req, res) => {
  try {
    const memory = await loadStyleMemory();
    res.json(buildStyleMemoryResponse(memory));
  } catch (err) {
    res.status(500).json({ error: err?.message || "스타일 메모리를 불러오지 못했어요." });
  }
});

app.post("/api/style-memory/notes", async (req, res) => {
  try {
    const payload = StyleNotesSchema.parse(req.body || {});
    const memory = await updateStyleNotes(payload.notes);
    res.json(buildStyleMemoryResponse(memory));
  } catch (err) {
    const message = err?.issues
      ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
      : err?.message || "스타일 메모 저장 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

app.post("/api/style-memory/sample", async (req, res) => {
  try {
    const payload = StyleSampleSchema.parse(req.body || {});
    const memory = await addStyleSample(payload);
    res.json(buildStyleMemoryResponse(memory));
  } catch (err) {
    const message = err?.issues
      ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
      : err?.message || "스타일 샘플 저장 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

app.post("/api/style-memory/import-url", async (req, res) => {
  try {
    const payload = StyleUrlSchema.parse(req.body || {});
    const result = await importStyleFromUrl(payload.url);
    res.json(buildStyleMemoryResponse(result.memory, { imported: result.imported }));
  } catch (err) {
    const message = err?.issues
      ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
      : err?.message || "URL 학습 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

app.delete("/api/style-memory", async (req, res) => {
  try {
    const memory = await clearStyleMemory();
    res.json(buildStyleMemoryResponse(memory));
  } catch (err) {
    res.status(500).json({ error: err?.message || "스타일 메모리를 초기화하지 못했어요." });
  }
});

app.post("/api/prompt", async (req, res) => {
  try {
    const payload = toPayload(req.body || {});

    if (!payload.story) {
      return res.status(400).json({ error: "‘내 이야기’가 비어 있어요. 한 줄 이상 적어주세요." });
    }

    const styleMemory = await loadStyleMemory();
    const stylePrompt = buildStyleMemoryPrompt(styleMemory);
    const prompt = [
      buildSystemPrompt(),
      stylePrompt,
      buildUserPrompt(payload),
      buildJsonFormatGuide(payload.variantCount)
    ].filter(Boolean).join("\n\n");

    res.json({
      prompt,
      variantCount: payload.variantCount,
      styleApplied: Boolean(stylePrompt),
      styleSampleCount: styleMemory.samples.length
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "프롬프트 생성 중 오류가 발생했어요." });
  }
});

app.post("/api/parse", (req, res) => {
  try {
    const body = req.body || {};
    const variantCount = parseVariantCount(body.variants);
    const raw = (body.raw || "").toString();

    const { parsed, meta } = parseGeneratedContent(raw, variantCount);
    res.json({
      ...parsed,
      __meta: meta,
    });
  } catch (err) {
    const message = err?.issues
      ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      : err?.message || "결과 검증 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

app.post("/api/json/repair", (req, res) => {
  try {
    const raw = (req.body?.raw || "").toString();
    const { data, meta } = extractLooseJsonObject(raw);
    res.json({
      data,
      repairedText: meta.normalizedJson || JSON.stringify(data, null, 2),
      repairApplied: Boolean(meta.repairApplied),
      extractionMode: meta.extractionMode || "direct",
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "JSON 자동 보정에 실패했어요." });
  }
});

app.post("/api/research-strategy/auto-generate", async (req, res) => {
  if (!ChatGPTAutomation) {
    return res.status(503).json({
      error: "자동 생성은 로컬 환경에서만 사용 가능합니다. 프롬프트 복사 후 ChatGPT에 붙여넣는 방식으로 이용해주세요."
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    let prompt = (req.body?.prompt || "").toString().trim();

    if (!prompt) {
      const payload = ResearchStrategySchema.parse(req.body || {});
      prompt = buildResearchStrategyPrompt(payload);
    }

    if (!prompt) {
      send({ type: "error", message: "프롬프트가 비어 있어요." });
      res.end();
      return;
    }

    const automation = new ChatGPTAutomation();

    automation.on("log", (msg) => {
      send({ type: "log", message: msg });
    });

    automation.on("progress", (percent) => {
      send({ type: "progress", percent });
    });

    send({ type: "log", message: "ChatGPT 자동화 시작…" });

    const responseText = await automation.run(prompt);

    send({ type: "progress", percent: 100 });
    send({ type: "result", text: responseText });
  } catch (err) {
    send({
      type: "error",
      message: err?.message || "콘텐츠 기획안 자동 생성 중 오류가 발생했어요."
    });
  } finally {
    res.end();
  }
});

// ===== Auto-Generate via Puppeteer (SSE streaming) =====
app.post("/api/auto-generate", async (req, res) => {
  // Check if automation is available (Puppeteer required)
  if (!ChatGPTAutomation) {
    return res.status(503).json({
      error: "자동 생성은 로컬 환경에서만 사용 가능합니다. 수동 모드(프롬프트 복사 → ChatGPT 붙여넣기)를 이용해주세요."
    });
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const { prompt, variants } = req.body || {};

    if (!prompt) {
      send({ type: "error", message: "프롬프트가 비어 있어요." });
      res.end();
      return;
    }

    const automation = new ChatGPTAutomation();

    automation.on("log", (msg) => {
      send({ type: "log", message: msg });
    });

    automation.on("progress", (percent) => {
      send({ type: "progress", percent });
    });

    send({ type: "log", message: "ChatGPT 자동화 시작…" });

    const responseText = await automation.run(prompt);

    send({ type: "log", message: "응답 텍스트 파싱 중…" });
    send({ type: "progress", percent: 95 });

    const variantCount = parseVariantCount(variants);
    const { parsed, meta } = parseGeneratedContent(responseText, variantCount);

    if (meta.repairApplied) {
      send({ type: "log", message: `JSON 작은 오류 자동 보정 ✓ (${meta.extractionMode})` });
    }

    send({
      type: "result",
      data: {
        ...parsed,
        __meta: meta,
      },
    });
    send({ type: "progress", percent: 100 });
  } catch (err) {
    const message = err?.issues
      ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      : err?.message || "자동 생성 중 오류가 발생했어요.";
    send({ type: "error", message });
  } finally {
    res.end();
  }
});
// ─────────────────────────────────────────────────────────────
//  AI 콘텐츠 에이전트 API
// ─────────────────────────────────────────────────────────────

/** 자연어 태스크 텍스트에서 구조화된 콘텐츠 파라미터 추출 */
function parseAgentTask(taskText) {
  const text = taskText || "";

  // 채널 감지
  const channels = [];
  if (/인스타|instagram|ig\b/i.test(text)) channels.push("instagram");
  if (/네이버|naver|블로그/i.test(text)) channels.push("naver");
  if (/워드프레스|wordpress/i.test(text)) channels.push("wordpress");
  if (/쓰레드|threads/i.test(text)) channels.push("threads");
  const targetChannels = channels.length > 0 ? channels.join(", ") : "전체 채널";

  // 타겟 오디언스 감지
  const audiencePatterns = [
    /(\d0대[^\s,]*)/g,
    /(직장인[^\s,]*)/g,
    /(여성[^\s,]*)/g,
    /(남성[^\s,]*)/g,
    /(주부[^\s,]*)/g,
    /(엄마[^\s,]*)/g,
    /(대학생[^\s,]*)/g,
    /(MZ[^\s,]*)/gi,
  ];
  let targetAudience = "";
  for (const pattern of audiencePatterns) {
    const match = text.match(pattern);
    if (match) {
      targetAudience = match[0].trim();
      break;
    }
  }

  // SEO 의도 감지
  let keywordIntent = "정보형";
  if (/구매|쇼핑|가격|추천|어디서|구입|사는/i.test(text)) keywordIntent = "구매형";
  else if (/브랜드|브랜딩|브랜드명/i.test(text)) keywordIntent = "브랜드형";

  // SEO 강도
  const seoLevel = /seo|상위노출|노출|검색/i.test(text) ? "strong" : "balanced";

  // 주제(Topic) 추출: 긴 줄글일 경우 자르지 않고 전체 뉘앙스 유지
  let topic = "";
  const quotedMatch = text.match(/['"「『]([^'"」』]+)['"」』]/);
  if (quotedMatch) {
    topic = quotedMatch[1].trim();
  } else {
    const topicMatch = text.match(/^(.+?)(?:에 대한|관련|추천|글|콘텐츠|블로그|작성|만들|써줘|생성)/);
    if (topicMatch && topicMatch[1].length < 30) {
      topic = topicMatch[1].trim();
    } else {
      // 문장이 길면 첫 40자 정도를 말줄임표로 처리하여 맥락 유지
      topic = text.length > 40 ? text.slice(0, 40).trim() + "..." : text.trim();
    }
  }

  // 키워드 추출 (주요 명사들)
  const stopWords = new Set(["에", "의", "을", "를", "이", "가", "은", "는", "로", "으로", "써줘", "만들어줘", "해줘", "작성해줘", "생성해줘", "글", "콘텐츠", "블로그", "인스타", "에서"]);
  const tokens = text
    .replace(/[!?.,;:~…]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 2 && !stopWords.has(t))
    .slice(0, 6);

  return {
    topic,
    tokens,
    targetAudience,
    targetChannels,
    keywordIntent,
    seoLevel,
    rawText: text,
  };
}

/** 리서치 데이터로 콘텐츠 전략 생성 */
function buildAgentStrategy(parsed, researchData) {
  const { topic, targetAudience, keywordIntent } = parsed;
  const hasResearch = researchData && researchData.length > 0;

  const strategy = [];

  // 각도 1: 메인 콘텐츠
  strategy.push({
    title: `🎯 메인 주제: ${topic || "입력된 주제"}`,
    body: `핵심 키워드를 중심으로 독자의 관심을 끄는 콘텐츠. ${targetAudience ? `타겟: ${targetAudience}` : ""} ${keywordIntent === "구매형" ? "구매 결정을 돕는 정보 제공" : keywordIntent === "브랜드형" ? "브랜드 인지도 강화" : "유용한 정보 전달 + 공감 유도"}`
  });

  // 각도 2: SEO 전략
  strategy.push({
    title: `📈 SEO 전략`,
    body: `네이버/구글 상위노출을 위해 핵심 키워드를 제목, 첫 문단, 소제목에 자연스럽게 배치. LSI 키워드로 주제 커버리지 확장.`
  });

  // 각도 3: 리서치 인사이트
  if (hasResearch) {
    const topTitles = researchData.slice(0, 3).map(item => `"${item.title}"`).join(", ");
    strategy.push({
      title: `🔍 경쟁 콘텐츠 인사이트`,
      body: `상위 글 분석: ${topTitles}. 이 글들과 차별화하는 개인 스토리 + 독자 Q&A 형식 활용 권장.`
    });
  }

  // 각도 4: 채널별 톤
  strategy.push({
    title: `📣 채널별 전략`,
    body: `네이버 블로그: 사장 일기 톤, 9-14문단, 질문형 CTA. 인스타그램: 후킹 첫 줄 + 이모지 1-3개 + 해시태그 3개. WordPress: SEO 패키지 (제목/메타/슬러그/FAQ).`
  });

  return strategy;
}

/** 에이전트 실행 API - SSE 스트리밍 */
app.post("/api/agent/run", withSSE(async (req, res, send) => {
  const { task, settings = {} } = req.body || {};

  if (!task || task.trim().length < 2) {
    throw new Error("요청 내용을 입력해 주세요.");
  }

  const includeResearch = settings.includeResearch !== false;
  const seoStrength = settings.seoStrength || "balanced";
  const variantCount = settings.variants === 2 ? 2 : 1;

  // ── Step 1: 요청 분석 ──────────────────────────────────────
  send({ type: "step_start", step: "intent", label: "요청 분석 중…" });
  const parsed = parseAgentTask(task);
  await sleep(200);
  send({ type: "step_done", step: "intent" });

  // ── Step 2: 키워드 리서치 ─────────────────────────────────
  send({ type: "step_start", step: "research", label: "키워드 리서치 중…" });
  let researchItems = [];
  let keywords = [];

  if (includeResearch && NAVER_CLIENT_ID && NAVER_CLIENT_SECRET && parsed.topic) {
    try {
      // Naver 블로그 검색
      const searchQuery = parsed.topic;
      const searchItems = await fetchNaverSource("blog", searchQuery, 10, "sim", 1, {});
      researchItems = searchItems.slice(0, 5);

      // 키워드 추출 from titles
      const titleTexts = searchItems.map(i => cleanSearchText(i.title || "")).join(" ");
      const kwTokens = extractKeywordTokens(titleTexts + " " + parsed.tokens.join(" "));
      keywords = kwTokens
        .slice(0, 12)
        .map(kw => ({
          keyword: kw,
          volume: null,
          level: Math.random() > 0.6 ? "mid" : Math.random() > 0.5 ? "high" : "low"
        }));

      // Searchad API로 검색량 조회 시도
      if (NAVER_SEARCHAD_CUSTOMER_ID && NAVER_SEARCHAD_ACCESS_LICENSE && NAVER_SEARCHAD_SECRET_KEY) {
        try {
          const seeds = buildSearchadSeeds(parsed.tokens.slice(0, 3));
          if (seeds.length > 0) {
            const uri = "/keywordstool";
            const timestamp = Date.now().toString();
            const signature = createSearchadSignature(timestamp, "GET", uri);
            const seedParam = seeds.map(s => `hintKeywords=${encodeURIComponent(s)}`).join("&");
            const adRes = await fetch(
              `${NAVER_SEARCHAD_BASE_URL}${uri}?showDetail=1&${seedParam}`,
              {
                headers: {
                  "Content-Type": "application/json",
                  "X-Timestamp": timestamp,
                  "X-API-KEY": NAVER_SEARCHAD_ACCESS_LICENSE,
                  "X-CUSTOMER": NAVER_SEARCHAD_CUSTOMER_ID,
                  "X-Signature": signature,
                }
              }
            );
            if (adRes.ok) {
              const adData = await adRes.json();
              const keywordList = adData.keywordList || [];
              keywords = keywordList.slice(0, 12).map(item => {
                const vol = parseSearchCount(item.monthlyMobileQcCnt) + parseSearchCount(item.monthlyPcQcCnt);
                return {
                  keyword: item.relKeyword,
                  volume: vol,
                  level: vol > 10000 ? "high" : vol > 2000 ? "mid" : "low"
                };
              });
            }
          }
        } catch {
          // Searchad 실패는 무시하고 기본 키워드 사용
        }
      }

      send({ type: "keywords", data: keywords });
    } catch {
      // 네이버 API 실패 시 토큰 기반 키워드만
      keywords = parsed.tokens.map(t => ({ keyword: t, volume: null, level: "low" }));
      send({ type: "keywords", data: keywords });
    }
  } else {
    // API 없음 - 입력 텍스트 토큰만 사용
    keywords = parsed.tokens.map(t => ({ keyword: t, volume: null, level: "low" }));
    send({ type: "keywords", data: keywords });
  }

  await sleep(300);
  send({ type: "step_done", step: "research" });

  // ── Step 3: 콘텐츠 전략 ──────────────────────────────────
  send({ type: "step_start", step: "strategy", label: "콘텐츠 전략 수립 중…" });
  const strategy = buildAgentStrategy(parsed, researchItems);
  await sleep(300);
  send({ type: "strategy", data: strategy });
  send({ type: "step_done", step: "strategy" });

  // ── Step 4: 프롬프트 생성 ─────────────────────────────────
  send({ type: "step_start", step: "prompt", label: "프롬프트 생성 중…" });

  // 키워드 데이터를 활용해 payload 구성
  const topKeywords = keywords.filter(k => k.level !== "low").map(k => k.keyword);
  const lsiKeywords = keywords.slice(2, 8).map(k => k.keyword);

  const agentPayload = {
    topic: parsed.topic,
    story: `[에이전트 자동 생성] ${task.slice(0, 300)}`,
    preferredFormat: parsed.targetChannels,
    variantCount,
    brandName: "",
    productName: parsed.topic,
    category: "",
    focusKeyword: topKeywords[0] || parsed.tokens[0] || parsed.topic,
    lsiKeywords,
    mustInclude: "",
    cta: "",
    seoLevel: seoStrength,
    keywordIntent: parsed.keywordIntent,
    keywordMentions: "3-5",
    targetAudience: parsed.targetAudience,
    includeFaq: true,
  };

  const styleMemory = await loadStyleMemory();
  const stylePrompt = buildStyleMemoryPrompt(styleMemory);

  const agentSystemPrompt = `[AI 에이전트 자동 생성 모드]
에이전트가 분석한 태스크: "${task.slice(0, 200)}"
감지된 주제: ${parsed.topic}
감지된 타겟: ${parsed.targetAudience || "일반"}
감지된 채널: ${parsed.targetChannels}
키워드: ${keywords.slice(0, 5).map(k => k.keyword).join(", ")}
콘텐츠 전략 각도:
${strategy.map(s => `- ${s.title}: ${s.body}`).join("\n")}

---

` + buildSystemPrompt();

  const fullPrompt = [
    agentSystemPrompt,
    stylePrompt,
    buildUserPrompt(agentPayload),
    buildJsonFormatGuide(variantCount)
  ].filter(Boolean).join("\n\n");

  await sleep(300);
  send({ type: "step_done", step: "prompt" });

  // 최종 결과
  const summary = `"${parsed.topic}" 콘텐츠 프롬프트 생성 완료. 키워드 ${keywords.length}개 분석, 전략 ${strategy.length}개 수립.`;
  send({
    type: "result",
    data: {
      prompt: fullPrompt,
      keywords,
      strategy,
      summary,
      meta: {
        topic: parsed.topic,
        targetAudience: parsed.targetAudience,
        channels: parsed.targetChannels,
        keywordCount: keywords.length,
        researchItemCount: researchItems.length,
      }
    }
  });

}));

// ─────────────────────────────────────────────────────────────
//  공통: SearchAD 키워드 볼륨 조회 헬퍼
// ─────────────────────────────────────────────────────────────
async function fetchSearchAdKeywords(seeds) {
  if (!NAVER_SEARCHAD_CUSTOMER_ID || !NAVER_SEARCHAD_ACCESS_LICENSE || !NAVER_SEARCHAD_SECRET_KEY) return [];
  try {
    const uri = "/keywordstool";
    const timestamp = Date.now().toString();
    const signature = createSearchadSignature(timestamp, "GET", uri);
    const seedParam = seeds.slice(0, 5).map(s => `hintKeywords=${encodeURIComponent(s)}`).join("&");
    const adRes = await fetch(`${NAVER_SEARCHAD_BASE_URL}${uri}?showDetail=1&${seedParam}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": timestamp,
        "X-API-KEY": NAVER_SEARCHAD_ACCESS_LICENSE,
        "X-CUSTOMER": NAVER_SEARCHAD_CUSTOMER_ID,
        "X-Signature": signature,
      }
    });
    if (!adRes.ok) return [];
    const adData = await adRes.json();
    return (adData.keywordList || []).slice(0, 20).map(item => {
      const pcVol = parseSearchCount(item.monthlyPcQcCnt);
      const mobileVol = parseSearchCount(item.monthlyMobileQcCnt);
      const volume = pcVol + mobileVol;
      return {
        keyword: item.relKeyword,
        volume,
        pcVol,
        mobileVol,
        level: volume > 10000 ? "high" : volume > 2000 ? "mid" : "low"
      };
    });
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────
//  1. 리서치 에이전트  (상위블로그20 · 최신블로그20 · 카페질문30 · 카페글30)
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/research", withSSE(async (req, res, send) => {
  const { task, settings = {} } = req.body || {};
  if (!task?.trim()) { throw new Error("검색할 주제를 입력해 주세요."); }

  const parsed = parseAgentTask(task);
  const query = parsed.topic || task.trim().slice(0, 50);

  // Step 1: 쿼리 분석
  send({ type: "step_start", step: "parse", label: `검색어 분석 중: "${query}"` });
  await sleep(150);
  send({ type: "step_done", step: "parse" });

  // Step 2: 블로그 수집 (상위 20개 + 최신 20개 병렬)
  send({ type: "step_start", step: "blog", label: "블로그 수집 중 — 상위 20개 + 최신 20개…" });
  let topBlogItems = [], recentBlogItems = [];
  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    [topBlogItems, recentBlogItems] = await Promise.all([
      fetchNaverSource("blog", query, 10, "sim", 2, {}).catch(() => []),
      fetchNaverSource("blog", query, 10, "date", 2, {}).catch(() => []),
    ]);
  }
  send({ type: "blog_items", data: topBlogItems.slice(0, 20) });
  send({ type: "step_done", step: "blog" });

  // Step 3: 카페 수집 (최신 60개 → 질문글 · 일반글 분리)
  send({ type: "step_start", step: "cafe", label: "카페 수집 중 — 질문글 + 일반글 최신순…" });
  let cafeRawAll = [];
  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    try { cafeRawAll = await fetchNaverSource("cafe", query, 10, "sim", 6, {}); } catch { /* ignore */ }
  }
  const cafeQuestions = cafeRawAll.filter(i => isQuestionLikeTitle(i.title || "")).slice(0, 30);
  const cafeGeneral = cafeRawAll.filter(i => !isQuestionLikeTitle(i.title || "")).slice(0, 30);
  send({ type: "cafe_items", data: cafeGeneral.slice(0, 30) });
  send({ type: "step_done", step: "cafe" });

  // Step 4: 키워드 볼륨 (주요 + 연관)
  send({ type: "step_start", step: "keywords", label: "주요/연관 키워드 검색량 분석 중…" });
  const allTitles = [...topBlogItems, ...recentBlogItems, ...cafeRawAll].map(i => cleanSearchText(i.title || "")).join(" ");
  const kwTokens = extractKeywordTokens(allTitles + " " + query);
  let keywords = kwTokens.slice(0, 10).map(kw => ({ keyword: kw, volume: null, pcVol: null, mobileVol: null, level: "low" }));
  // SearchAD: 메인 키워드 + 토큰 2개로 연관 키워드 최대 20개
  const adKeywords = await fetchSearchAdKeywords(buildSearchadSeeds([query, ...parsed.tokens.slice(0, 2)]));
  if (adKeywords.length > 0) keywords = adKeywords;
  send({ type: "keywords", data: keywords });
  send({ type: "step_done", step: "keywords" });

  // Step 5: 인사이트
  send({ type: "step_start", step: "insights", label: "콘텐츠 인사이트 분석 중…" });
  const topTitles = topBlogItems.map(i => i.title || "");
  const recentTitles = recentBlogItems.map(i => i.title || "");
  const allBlogTitles = [...topTitles, ...recentTitles];
  const contentGaps = [
    !allBlogTitles.some(t => /비교|vs/i.test(t)) ? "비교글 콘텐츠 부족" : "",
    !allBlogTitles.some(t => /직접|내돈내산|실제사용/.test(t)) ? "직접 후기 부족" : "",
    !allBlogTitles.some(t => /초보|처음|입문/.test(t)) ? "입문자 가이드 부족" : "",
    !allBlogTitles.some(t => /꿀팁|팁|노하우/.test(t)) ? "팁/노하우 부족" : "",
    !allBlogTitles.some(t => /후기|리뷰/.test(t)) ? "후기/리뷰 부족" : "",
  ].filter(Boolean);
  const highVol = keywords.filter(k => k.level === "high").length;
  const competition = highVol > 4 ? "높음 — 차별화 전략 필요" : highVol > 2 ? "보통 — 진입 여지 있음" : "낮음 — 블루오션 가능성";
  const insights = {
    competition, contentGaps: contentGaps.slice(0, 4), cafeQCount: cafeQuestions.length,
    topKeywords: keywords.slice(0, 5),
    topBlogCount: topBlogItems.length, recentBlogCount: recentBlogItems.length,
    cafeGeneralCount: cafeGeneral.length,
  };
  send({ type: "insights", data: insights });
  send({ type: "step_done", step: "insights" });

  // 리서치 요약 (다른 에이전트용)
  const researchSummary = await buildEnrichedResearchSummary(
    topBlogItems.slice(0, 15),
    cafeQuestions.slice(0, 15),
    keywords
  );
  insights.enrichedSummary = researchSummary;

  send({
    type: "result",
    data: {
      query, keywords,
      topBlogItems: topBlogItems.slice(0, 20),
      recentBlogItems: recentBlogItems.slice(0, 20),
      cafeQuestions: cafeQuestions.slice(0, 30),
      cafeGeneral: cafeGeneral.slice(0, 30),
      // 하위 호환
      blogItems: topBlogItems.slice(0, 10),
      cafeItems: cafeGeneral.slice(0, 10),
      insights,
      researchData: researchSummary,
      researchSummary,
      enrichedSummary: researchSummary,
      summary: `"${query}" 리서치 완료. 상위블로그 ${topBlogItems.length}개 · 최신블로그 ${recentBlogItems.length}개 · 카페글 ${cafeRawAll.length}개 · 키워드 ${keywords.length}개.`,
      meta: { query, keywordCount: keywords.length, topBlogCount: topBlogItems.length, recentBlogCount: recentBlogItems.length, cafeQCount: cafeQuestions.length, cafeGeneralCount: cafeGeneral.length }
    }
  });
}));

// ─────────────────────────────────────────────────────────────
//  2. 콘텐츠기획 에이전트
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/planning", withSSE(async (req, res, send) => {
  const { task, settings = {}, researchData } = req.body || {};
  if (!task?.trim()) { throw new Error("브랜드 정보나 기획 주제를 입력해 주세요."); }

  const parsed = parseAgentTask(task);

  // Step 1: 브랜드 분석
  send({ type: "step_start", step: "brand", label: "브랜드/주제 분석 중…" });
  await sleep(250);
  send({ type: "step_done", step: "brand" });

  // Step 2: 리서치 데이터 로드
  send({ type: "step_start", step: "research", label: "리서치 데이터 로드 중…" });
  let keywords = [];
  let hasResearchData = Boolean(researchData);
  if (!hasResearchData && NAVER_CLIENT_ID) {
    try {
      const items = await fetchNaverSource("blog", parsed.topic, 8, "sim", 1, {});
      const texts = items.map(i => cleanSearchText(i.title || "")).join(" ");
      const tokens = extractKeywordTokens(texts + " " + parsed.topic);
      keywords = await fetchSearchAdKeywords(buildSearchadSeeds(tokens.slice(0, 3)));
      if (!keywords.length) keywords = tokens.slice(0, 8).map(t => ({ keyword: t, volume: null, level: "low" }));
    } catch { /* ignore */ }
  }
  send({ type: "step_done", step: "research" });

  // Step 3: 주제 클러스터링 (4주 × 2주제)
  send({ type: "step_start", step: "cluster", label: "주제 클러스터 분석 중…" });
  const topic = parsed.topic;
  const topKw = keywords.slice(0, 6).map(k => k.keyword);
  const angles = [
    { week: 1, theme: "정보/소개형", icon: "📚", desc: "처음 접하는 독자를 위한 입문 콘텐츠", topics: [`${topic} 뭐가 좋을까? 처음 고르는 법`, `${topic} 구매 전 꼭 알아야 할 것들`] },
    { week: 2, theme: "후기/경험형", icon: "✍️", desc: "실제 사용 경험 기반 공감 콘텐츠", topics: [`${topic} 직접 써봤어요 — 솔직 후기`, `${topic} 실제로 어떤지 비교해봤습니다`] },
    { week: 3, theme: "비교/추천형", icon: "🎯", desc: "구매 결정을 돕는 비교 콘텐츠", topics: [`${topic} 브랜드별 비교 — 어떤 게 맞을까`, `${topKw[0] || topic} vs ${topKw[1] || topic} 직접 비교`] },
    { week: 4, theme: "브랜딩/감성형", icon: "💫", desc: "브랜드 스토리와 감성을 담은 콘텐츠", topics: [`내가 ${topic}을 만드는 이유`, `${topic} 뒤에 있는 이야기`] },
  ];
  send({ type: "calendar", data: angles });
  send({ type: "step_done", step: "cluster" });

  // Step 4: 기획 프롬프트 생성 (JSON 출력 형식)
  send({ type: "step_start", step: "prompt", label: "기획안 프롬프트 생성 중…" });
  const planningPrompt = `너는 블로그 콘텐츠 편집장이야.

아래 브랜드 정보와 리서치 데이터를 바탕으로 1개월(4주) 블로그 콘텐츠 기획안을 작성해줘.

[브랜드/주제 정보]
- 주제/카테고리: ${topic}
- 타겟 독자: ${parsed.targetAudience || "20-40대 여성"}
- 주요 키워드: ${topKw.join(", ")}
${researchData ? `\n[리서치 데이터]\n${researchData.slice(0, 4000)}` : ""}

[기획안 작성 요구사항]
1. 4주 × 2-3편 = 총 8-12편 계획
2. 주차별 테마: 1주차(정보/소개) → 2주차(후기/경험) → 3주차(비교/추천) → 4주차(브랜딩/감성)
3. 각 편마다: 제목 3가지 후보 / 핵심 키워드 / 예상 독자 반응 / 포함할 내용 요점
4. SEO를 고려한 제목 작성 (핵심 키워드 자연스럽게 포함)
5. 네이버 블로그 특성에 맞게 (실제 경험담 + 질문형 CTA)

[⚠️ 중요: 반드시 아래 JSON 형식으로만 출력해줘. 설명 텍스트 없이 JSON만.]

\`\`\`json
{
  "planTitle": "기획안 제목",
  "brand": "${topic}",
  "period": "4주",
  "targetAudience": "${parsed.targetAudience || "20-40대 여성"}",
  "keywordStrategy": {
    "primary": ["주요 키워드 2-3개"],
    "secondary": ["부키워드 2-4개"],
    "longTail": ["롱테일 키워드 2-3개"]
  },
  "weeks": [
    {
      "week": 1,
      "theme": "정보/소개형",
      "icon": "📚",
      "posts": [
        {
          "no": 1,
          "titles": ["제목 후보1", "제목 후보2", "제목 후보3"],
          "keyword": "이 편의 메인 키워드",
          "type": "네이버 블로그",
          "angle": "접근 방식 한 줄 설명",
          "outline": ["도입", "본문 핵심 포인트1", "본문 핵심 포인트2", "마무리 & CTA"],
          "expectedReaction": "독자가 이 글을 보고 할 행동/반응"
        }
      ]
    }
  ]
}
\`\`\``;

  await sleep(300);
  send({ type: "step_done", step: "prompt" });

  send({
    type: "result",
    data: {
      topic, keywords, angles, planningPrompt,
      summary: `"${topic}" 4주 콘텐츠 기획안 완성. ${angles.length}개 테마, ${angles.reduce((s, a) => s + a.topics.length, 0)}개 주제 생성.`,
      meta: { topic, weekCount: 4, topicCount: angles.reduce((s, a) => s + a.topics.length, 0) }
    }
  });
}));

// ─────────────────────────────────────────────────────────────
//  3. 전략수립 에이전트
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/strategy", withSSE(async (req, res, send) => {
  const { task, settings = {} } = req.body || {};
  if (!task?.trim()) { throw new Error("브랜드 정보나 목표를 입력해 주세요."); }

  const parsed = parseAgentTask(task);

  // Step 1: 브랜드 분석
  send({ type: "step_start", step: "brand", label: "브랜드 포지션 분석 중…" });
  await sleep(300);
  send({ type: "step_done", step: "brand" });

  // Step 2: 키워드 전략
  send({ type: "step_start", step: "keywords", label: "SEO 키워드 전략 수립 중…" });
  let keywords = [];
  if (NAVER_CLIENT_ID) {
    try {
      const items = await fetchNaverSource("blog", parsed.topic, 8, "sim", 1, {});
      const texts = items.map(i => cleanSearchText(i.title || "")).join(" ");
      const tokens = extractKeywordTokens(texts + " " + parsed.topic);
      keywords = await fetchSearchAdKeywords(buildSearchadSeeds(tokens.slice(0, 3)));
      if (!keywords.length) keywords = tokens.slice(0, 8).map(t => ({ keyword: t, volume: null, level: "low" }));
    } catch { /* ignore */ }
  }
  const primaryKw = keywords.find(k => k.level === "high")?.keyword || parsed.topic;
  const secondaryKws = keywords.filter(k => k.level !== "low").slice(0, 4).map(k => k.keyword);
  const longTailKws = keywords.filter(k => k.level === "low").slice(0, 4).map(k => k.keyword);
  send({ type: "keywords", data: keywords });
  send({ type: "step_done", step: "keywords" });

  // Step 3: 채널 전략
  send({ type: "step_start", step: "channel", label: "채널별 전략 수립 중…" });
  const channelStrategy = {
    naver: { freq: "주 3-4회", tone: "사장 일기형 대화체", length: "900-1500자", hashtags: "3개 강력 태그", seo: `핵심: ${primaryKw}` },
    instagram: { freq: "주 4-5회", tone: "후킹 첫 줄 + 짧은 문장", length: "150-300자", hashtags: "3개", format: "Reel > 카드뉴스 > 단일 이미지" },
    wordpress: { freq: "주 1-2회", tone: "에피소드형 에세이", length: "1500-3000자", seo: "Yoast 기준 최적화", schema: "FAQ 필수 포함" },
  };
  send({ type: "channel_strategy", data: channelStrategy });
  send({ type: "step_done", step: "channel" });

  // Step 4: 포스팅 스케줄
  send({ type: "step_start", step: "schedule", label: "포스팅 스케줄 최적화 중…" });
  const schedule = [
    { day: "월", platforms: ["네이버 블로그"], type: "정보형/후기형", note: "주말 결정 유입 겨냥" },
    { day: "수", platforms: ["인스타그램", "쓰레드"], type: "감성/브랜딩", note: "mid-week 참여율 최고" },
    { day: "금", platforms: ["네이버 블로그", "WordPress"], type: "비교/추천형", note: "주말 구매 전 검색 유입" },
    { day: "일", platforms: ["인스타그램"], type: "일상/SNS요약", note: "주간 하이라이트" },
  ];
  send({ type: "schedule", data: schedule });
  send({ type: "step_done", step: "schedule" });

  // Step 5: 전략 프롬프트
  send({ type: "step_start", step: "prompt", label: "전략 문서 프롬프트 생성 중…" });
  const strategyPrompt = `너는 디지털 마케팅 전략가이자 콘텐츠 디렉터야.

아래 브랜드 정보를 바탕으로 6개월 콘텐츠 마케팅 전략서를 작성해줘.

[브랜드 정보]
- 주제/카테고리: ${parsed.topic}
- 타겟: ${parsed.targetAudience || "20-40대"}
- 주요 채널: 네이버 블로그, 인스타그램, WordPress
- 핵심 키워드: ${primaryKw}
- 2차 키워드: ${secondaryKws.join(", ")}
- 롱테일 키워드: ${longTailKws.join(", ")}

[전략서 포함 항목]
1. 브랜드 포지셔닝 (차별점 3가지)
2. SEO 전략 (키워드 계층구조 — 메인/서브/롱테일)
3. 채널별 전략 (네이버/인스타/워드프레스 각각)
4. 월별 콘텐츠 주제 방향 (6개월)
5. KPI 제안 (측정 가능한 수치 목표)
6. 빠른 실행 TO-DO 리스트 (1주 내 바로 할 수 있는 것들)

솔직하고 구체적으로, 실제 실행 가능한 수준으로 작성해줘.`;

  await sleep(300);
  send({ type: "step_done", step: "prompt" });

  send({
    type: "result",
    data: {
      topic: parsed.topic, primaryKw, secondaryKws, longTailKws,
      channelStrategy, schedule, strategyPrompt, keywords,
      summary: `"${parsed.topic}" 6개월 콘텐츠 전략 수립 완료. SEO + 3채널 전략 포함.`,
      meta: { topic: parsed.topic, primaryKw, channelCount: 3 }
    }
  });
}));

// ─────────────────────────────────────────────────────────────
//  4. 프롬프트 에이전트
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/promptgen", withSSE(async (req, res, send) => {
  const { task, settings = {} } = req.body || {};
  if (!task?.trim()) { throw new Error("프롬프트로 만들 내용을 입력해 주세요."); }

  const parsed = parseAgentTask(task);
  const channel = settings.channel || "all";
  const intent = settings.intent || "정보형";

  // Step 1: 의도 분석
  send({ type: "step_start", step: "intent", label: "요청 의도 분석 중…" });
  let detectedChannel = "5채널 전체";
  if (/네이버|naver|블로그/.test(task)) detectedChannel = "네이버 블로그";
  else if (/인스타|instagram/.test(task)) detectedChannel = "인스타그램";
  else if (/워드프레스|wordpress/.test(task)) detectedChannel = "WordPress";
  else if (/쓰레드|threads/.test(task)) detectedChannel = "쓰레드";
  await sleep(250);
  send({ type: "step_done", step: "intent" });

  // Step 2: 키워드 리서치
  send({ type: "step_start", step: "keywords", label: "핵심 키워드 분석 중…" });
  let keywords = [];
  if (NAVER_CLIENT_ID) {
    try {
      const items = await fetchNaverSource("blog", parsed.topic, 5, "sim", 1, {});
      const texts = items.map(i => cleanSearchText(i.title || "")).join(" ");
      const tokens = extractKeywordTokens(texts + " " + parsed.topic);
      keywords = await fetchSearchAdKeywords(buildSearchadSeeds(tokens.slice(0, 3)));
      if (!keywords.length) keywords = tokens.slice(0, 8).map(t => ({ keyword: t, volume: null, level: "low" }));
    } catch { /* ignore */ }
  }
  const focusKw = keywords.find(k => k.level !== "low")?.keyword || parsed.topic;
  const lsiKws = keywords.slice(1, 6).map(k => k.keyword);
  send({ type: "keywords", data: keywords });
  send({ type: "step_done", step: "keywords" });

  // Step 3: 스타일 메모리 로드
  send({ type: "step_start", step: "style", label: "스타일 메모리 적용 중…" });
  const styleMemory = await loadStyleMemory();
  const stylePrompt = buildStyleMemoryPrompt(styleMemory);
  await sleep(200);
  send({ type: "step_done", step: "style" });

  // Step 4: 최적화 프롬프트 생성
  send({ type: "step_start", step: "generate", label: "최적화 프롬프트 생성 중…" });
  const agentPayload = {
    topic: parsed.topic, story: task.slice(0, 500),
    preferredFormat: detectedChannel, variantCount: settings.variants === 2 ? 2 : 1,
    brandName: settings.brandName || "", productName: parsed.topic, category: "",
    focusKeyword: focusKw, lsiKeywords: lsiKws,
    mustInclude: settings.mustInclude || "", cta: settings.cta || "",
    seoLevel: settings.seoStrength || "strong",
    keywordIntent: parsed.keywordIntent, keywordMentions: "3-5",
    targetAudience: parsed.targetAudience, includeFaq: true,
  };
  const systemPart = buildSystemPrompt();
  const userPart = buildUserPrompt(agentPayload);
  const formatPart = buildJsonFormatGuide(agentPayload.variantCount);
  const optimizedPrompt = [
    `[프롬프트 에이전트 최적화 — ${detectedChannel}]`,
    `주제: ${parsed.topic} | 의도: ${parsed.keywordIntent} | 타겟: ${parsed.targetAudience || "일반"}`,
    `핵심 키워드: ${focusKw} | LSI: ${lsiKws.join(", ")}`,
    "",
    "---",
    "",
    systemPart,
    stylePrompt,
    userPart,
    formatPart,
  ].filter(Boolean).join("\n\n");

  const tips = [
    `핵심 키워드 "${focusKw}"를 제목과 첫 문단에 꼭 포함시켜 주세요.`,
    `LSI 키워드(${lsiKws.slice(0, 3).join(", ")})를 본문에 자연스럽게 배치하세요.`,
    "JSON 결과를 받으면 [글 생성기]에 붙여넣으면 바로 적용됩니다.",
  ];

  await sleep(300);
  send({ type: "step_done", step: "generate" });

  send({
    type: "result",
    data: {
      prompt: optimizedPrompt, keywords, tips, detectedChannel, focusKw,
      summary: `"${parsed.topic}" 최적화 프롬프트 완성. ${detectedChannel} 타겟, SEO 키워드 ${keywords.length}개 반영.`,
      meta: { topic: parsed.topic, channel: detectedChannel, focusKw, lsiCount: lsiKws.length }
    }
  });
}));

// ─────────────────────────────────────────────────────────────
// 에이전트 공통: 네이버 블로그/카페 + 키워드 수집 헬퍼
// ─────────────────────────────────────────────────────────────
async function conductAgentResearch(topic, tokens = []) {
  let topBlog = [], recentBlog = [], cafeAll = [];

  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    [topBlog, recentBlog, cafeAll] = await Promise.all([
      fetchNaverSource("blog", topic, 10, "sim", 2, {}).catch(() => []),
      fetchNaverSource("blog", topic, 10, "date", 2, {}).catch(() => []),
      fetchNaverSource("cafe", topic, 10, "sim", 3, {}).catch(() => []),
    ]);
  }

  const cafeQ = cafeAll.filter(i => isQuestionLikeTitle(i.title || "")).slice(0, 15);
  const cafeG = cafeAll.filter(i => !isQuestionLikeTitle(i.title || "")).slice(0, 15);

  const allTitles = [...topBlog, ...recentBlog, ...cafeAll].map(i => cleanSearchText(i.title || "")).join(" ");
  const kwTokens = extractKeywordTokens(allTitles + " " + topic);
  let keywords = kwTokens.slice(0, 10).map(kw => ({ keyword: kw, volume: null, level: "low" }));

  const adKws = await fetchSearchAdKeywords(buildSearchadSeeds([topic, ...tokens.slice(0, 2)]));
  if (adKws.length) keywords = adKws;

  return { topBlog, recentBlog, cafeQ, cafeG, keywords };
}

// ─────────────────────────────────────────────────────────────
// 5~8. 통합 블로그 에이전트 (blog, naver-blog, real-blog 병합)
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/blog", withSSE(async (req, res, send) => {
  const { task, settings = {} } = req.body || {};
  if (!task?.trim()) throw new Error("블로그 주제를 입력해 주세요.");

  const parsed = parseAgentTask(task);
  const topic = parsed.topic || task.trim().slice(0, 50);
  const audience = parsed.targetAudience || "일반 독자";
  const brand = parsed.brand || "";

  // Step 1 & 2: 통합 리서치 및 키워드 분석
  send({ type: "step_start", step: "research", label: `"${topic}" 네이버 데이터 및 키워드 분석 중…` });
  const { topBlog, cafeQ, cafeG, keywords } = await conductAgentResearch(topic, parsed.tokens);

  send({ type: "keywords", data: keywords });
  send({ type: "step_done", step: "research" });

  // Step 3: 콘텐츠 기획 프롬프트 생성
  send({ type: "step_start", step: "prompt", label: "블로그 프롬프트 생성 중…" });

  const researchSummary = await buildEnrichedResearchSummary(
    topBlog.slice(0, 15),
    cafeQ.slice(0, 15),
    keywords
  );

  const brandInfo = {
    brandName: brand || topic,
    blogType: "정보형 네이버 블로그",
    primaryCategory: topic,
    targetAudience: audience,
    toneAndManner: "자연스럽고 정보성 있는 네이버 블로그 문체. 사람이 정리해 들려주는 느낌.",
    avoidDirection: "광고처럼 느껴지는 표현, 기계적인 SEO 나열, 보고서식 딱딱한 문장",
    workGoals: `${topic} 관련 네이버 블로그 글 1편 완성 (실제 발행 수준, 2500자 이상)`,
    researchData: researchSummary || `[주제] ${topic}`,
    userNote: parsed.rawText && parsed.rawText.length > topic.length + 5 ? parsed.rawText : "",
  };

  const planningPrompt = buildResearchStrategyPrompt(brandInfo);
  await sleep(200);
  send({ type: "step_done", step: "prompt" });

  send({
    type: "result",
    data: {
      topic, audience, brand, keywords,
      topBlog: topBlog.slice(0, 10),
      cafeQ: cafeQ.slice(0, 8),
      cafeG: cafeG.slice(0, 8),
      researchData: researchSummary,
      researchSummary,
      enrichedSummary: researchSummary,
      planningPrompt, brandInfo,
      summary: `"${topic}" 리서치 완료. 기획 프롬프트를 복사하여 사용하세요.`,
    }
  });
}));

// ─────────────────────────────────────────────────────────────
//  8. 진짜블로그에이전트 — Phase 2: STEP7 프롬프트 + 블로그 자동생성
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/real-blog-write", withSSE(async (req, res, send) => {
  const {
    topic,
    audience,
    brand,
    selectionSummary,
    researchSummary,
    researchData,
  } = req.body || {};
  if (!topic?.trim()) { throw new Error("topic 필수"); }
  if (!selectionSummary?.trim()) { throw new Error("선택 요약이 비어있어요."); }

  // STEP 7 프롬프트 빌드
  send({ type: "step_start", step: "step7", label: "STEP 7 블로그 프롬프트 빌드 중…" });
  const step7Payload = {
    brandName: brand || "",
    blogType: "정보형 네이버 블로그",
    primaryCategory: topic,
    targetAudience: audience || "일반 독자",
    toneAndManner: "자연스럽고 정보성 있는 네이버 블로그 문체. 사람이 정리해 들려주는 느낌.",
    avoidDirection: "광고처럼 느껴지는 표현, 기계적인 SEO 나열, 보고서식 딱딱한 문장",
    workGoals: `${topic} 관련 네이버 블로그 글 1편 완성 (실제 발행 수준, 2500자 이상)`,
    researchData: researchData || researchSummary || "",
    selectedPlan: selectionSummary,
  };
  const step7Prompt = buildStep7WriterPrompt(step7Payload);
  send({ type: "step_done", step: "step7" });

  send({
    type: "result",
    data: {
      topic, step7Prompt,
      autoGenerated: false,
      brandInfo: step7Payload,
      summary: `STEP 7 프롬프트 완성. 복사 후 ChatGPT에 붙여넣어 주세요.`,
    }
  });
}));

// ─────────────────────────────────────────────────────────────
//  글생성 에이전트 — 원클릭 글생성기 기반
// ─────────────────────────────────────────────────────────────
app.post("/api/agent/content", withSSE(async (req, res, send) => {
  const { task } = req.body || {};
  if (!task?.trim()) { throw new Error("내용을 입력해 주세요."); }

  // Step 1: 키워드 분석
  send({ type: "step_start", step: "research", label: "네이버 키워드 리서치 중…" });
  const parsed = parseAgentTask(task);
  const topic = parsed.topic || task.trim();

  let keywords = [];
  let researchItems = [];

  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET && topic) {
    try {
      const items = await fetchNaverSource("blog", topic, 10, "sim", 1, {});
      researchItems = items.slice(0, 5);
    } catch { }
  }

  if (NAVER_SEARCHAD_CUSTOMER_ID && NAVER_SEARCHAD_ACCESS_LICENSE && NAVER_SEARCHAD_SECRET_KEY) {
    keywords = await fetchSearchAdKeywords([topic, ...(parsed.tokens || []).slice(0, 3)]);
  } else {
    keywords = parsed.tokens.slice(0, 8).map(t => ({ keyword: t, volume: null, level: "mid" }));
  }

  send({ type: "keywords", data: keywords });
  send({ type: "step_done", step: "research" });

  // Step 2: 프롬프트 생성 — 원클릭 글생성기와 동일한 함수 사용
  send({ type: "step_start", step: "prompt", label: "원클릭 글생성기 프롬프트 생성 중…" });

  const topKeywords = keywords.filter(k => k.level !== "low").map(k => k.keyword);
  const lsiKeywords = keywords.slice(2, 8).map(k => k.keyword);

  const payload = toPayload({
    topic,
    story: task,
    format: parsed.targetChannels || "all",
    variants: 1,
    focusKeyword: topKeywords[0] || topic,
    lsiKeywords: lsiKeywords.join(","),
    targetAudience: parsed.targetAudience || "",
    seoLevel: "balanced",
    keywordIntent: parsed.keywordIntent || "informational",
    keywordMentions: "3-5",
    includeFaq: true,
  });

  const styleMemory = await loadStyleMemory();
  const stylePrompt = buildStyleMemoryPrompt(styleMemory);

  const fullPrompt = [
    buildSystemPrompt(),
    stylePrompt,
    buildUserPrompt(payload),
    buildJsonFormatGuide(payload.variantCount)
  ].filter(Boolean).join("\n\n");

  send({ type: "step_done", step: "prompt" });

  const summary = `"${topic}" 원클릭 프롬프트 생성 완료. 키워드 ${keywords.length}개 분석.`;
  send({
    type: "result",
    data: {
      prompt: fullPrompt,
      keywords,
      summary,
      meta: { topic, targetAudience: payload.targetAudience, channels: payload.preferredFormat },
      researchItems,
    }
  });
}));

const HOST = process.env.HOST || "0.0.0.0";

function getLocalAccessUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  const seen = new Set();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== "IPv4") continue;
      const url = `http://${entry.address}:${port}`;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

app.get("/api/access-info", (req, res) => {
  const lanUrls = getLocalAccessUrls(PORT);
  res.json({
    port: PORT,
    host: HOST,
    localUrl: `http://localhost:${PORT}`,
    oneclickPath: "/oneclick-writer",
    lanUrls,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`\n✅ OneClick Writer (subscription mode) running on http://${HOST}:${PORT}`);
  const lanUrls = getLocalAccessUrls(PORT);
  if (lanUrls.length) {
    console.log("📱 Phone access:");
    lanUrls.forEach((url) => {
      console.log(`   - ${url}/oneclick-writer`);
    });
  } else {
    console.log("📱 LAN address not detected automatically. Open from phone using this Mac's local IP + /oneclick-writer");
  }
});
