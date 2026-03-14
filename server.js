import express from "express";
import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
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

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

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

function extractKeywordTokens(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !RESEARCH_STOPWORDS.has(token));
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
    "---",
    "",
    "## 1. 리서치 수집 결과",
    "",
    payload.researchData.trim(),
    "",
    "---",
    "",
    "## 2. 분석 원칙",
    "",
    "아래 원칙을 반드시 지켜라.",
    "",
    "1. 수집결과 안에서 반복 등장하는 키워드, 질문, 비교 포인트, 고민 포인트, 후기 포인트를 우선적으로 찾아라.",
    "2. 단순히 많이 보인 단어보다, 사람이 실제로 클릭하고 싶어할 질문형·고민형 주제를 더 높게 평가하라.",
    "3. 제목은 네이버 블로그에서 어색하지 않도록 자연스러운 문장형으로 만들 것.",
    "4. 핵심 키워드를 억지로 제목 맨 앞에 배치하지 말 것.",
    "5. 검색 유입 가능성과 실제 글의 확장 가능성을 함께 고려할 것.",
    "6. 광고 티가 너무 강한 주제보다는 정보형 / 비교형 / 추천형 / 팁형 / 후기형 / 문제해결형 주제를 우선할 것.",
    "7. 수집결과에 없는 정보는 절대 지어내지 말 것.",
    "8. 비슷한 주제는 중복 제안하지 말고, 서로 다른 각도로 구성할 것.",
    "9. 브랜드 블로그라 하더라도 지나치게 판매글처럼 보이지 않게, 독자의 관심사 중심으로 설계할 것.",
    "10. 결과물은 바로 실무에 쓸 수 있게 구체적으로 작성할 것.",
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
    "먼저 수집결과를 분석해서 아래를 정리하라.",
    "",
    "### 1-1. 반복적으로 보이는 핵심 키워드",
    "- 10개 내외로 정리",
    "- 왜 중요하게 보였는지 한 줄 설명 포함",
    "",
    "### 1-2. 사람들이 많이 궁금해하는 질문/고민 포인트",
    "- 5~10개 정리",
    "- 가능한 한 사용자의 검색 의도가 느껴지게 문장형으로 정리",
    "",
    "### 1-3. 콘텐츠로 발전시키기 좋은 관점",
    "- 정보형",
    "- 비교형",
    "- 추천형",
    "- 후기형",
    "- 문제해결형",
    "- 트렌드형",
    "",
    "각 관점별로 어떤 식으로 풀면 좋을지 간단히 설명하라.",
    "",
    "---",
    "",
    "# STEP 2. 추천 블로그 글감 TOP 10",
    "",
    "수집결과를 바탕으로, 실제로 블로그 발행에 적합한 글감 10개를 추천하라.",
    "",
    "각 항목은 반드시 아래 형식으로 작성하라.",
    "",
    "## [번호]. 글감 주제",
    "- 추천 제목",
    "- 보조 제목 후보 2개",
    "- 핵심 키워드",
    "- 검색 의도",
    "- 추천 이유",
    "- 이 글을 읽을 사람",
    "- 도입문 방향",
    "- 추천 목차",
    "  1.",
    "  2.",
    "  3.",
    "  4.",
    "- 이 글에서 꼭 다뤄야 할 포인트",
    "- 주의할 점",
    "- 브랜드형 블로그와의 연결 포인트",
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
    "- 너무 기계적이면 안 됨",
    "- 사람이 직접 쓴 것처럼 자연스러워야 함",
    "- 클릭하고 싶게 만들어야 함",
    "- 너무 길지 않게",
    "- 핵심 키워드를 문장 속에 자연스럽게 녹일 것",
    "- 제목끼리 지나치게 비슷하지 않게 만들 것",
    "",
    "출력 형식:",
    "1.",
    "2.",
    "3.",
    "...",
    "",
    "---",
    "",
    "# STEP 5. 베스트 3개 글의 상세 목차 설계",
    "",
    "STEP 3에서 선정한 우선 글 3개에 대해, 각 글마다 더 구체적인 상세 목차를 설계하라.",
    "",
    "각 글마다 아래 형식으로 작성하라.",
    "",
    "## [추천 글 1 제목]",
    "### 글의 기획 의도",
    "### 예상 독자 반응",
    "### 상세 목차",
    "- 서론",
    "- 본론 1",
    "- 본론 2",
    "- 본론 3",
    "- 본론 4",
    "- 결론",
    "### 이 글에서 자연스럽게 녹여야 할 키워드",
    "### 피해야 할 표현",
    "",
    "---",
    "",
    "# STEP 6. 베스트 3개 글의 도입문 초안 작성",
    "",
    "각 글마다 블로그 도입부를 2가지 버전으로 작성하라.",
    "",
    "조건:",
    "- 광고문처럼 시작하지 말 것",
    "- 독자의 공감을 끌어내는 방식으로 시작할 것",
    "- 네이버 블로그에서 어색하지 않은 톤으로 쓸 것",
    "- 자연스럽고 읽기 편하게 쓸 것",
    "",
    "출력 형식:",
    "",
    "## [글 제목]",
    "### 도입문 A",
    "(3~5문단)",
    "",
    "### 도입문 B",
    "(3~5문단)",
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
    "- 서론에는 이 글이 누구에게 필요한지, 어떤 고민에 맞는지 공감 멘트를 반드시 넣을 것.",
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
    "- 문단 흐름은 체류시간을 높일 수 있게 매끄럽게 이어가고, 독자가 다음 문단을 읽고 싶어지게 설계할 것.",
    "- 부족한 정보는 절대 추측하지 말고 `[미입력]`, `[공식 정보 필요]`, `[추후 업데이트 예정]`처럼 분명하게 표시할 것.",
    "",
    "[SEO 제목 / 메타 규칙]",
    "- 제목 후보는 총 5개를 만들고, 첫 번째는 메인 SEO 제목으로 가장 추천하는 제목으로 둘 것.",
    "- 메타 정보에는 `SEO 제목`, `추천 슬러그`, `메타 설명(120~155자)`, `메인 키워드`, `서브 키워드`, `검색 의도 유형`, `예상 독자 고민`을 반드시 포함할 것.",
    "- 메타 설명은 메인 키워드를 포함하되 광고 문구처럼 과하지 않고, 네이버 블로그 요약문처럼 자연스럽게 쓸 것.",
    "",
    "[본문 구조 규칙]",
    "- 서론은 독자의 고민이나 상황으로 시작하고, 첫 문단 안에 메인 키워드를 자연스럽게 포함할 것.",
    "- 본문 전 컨텍스트에서는 필요할 때만 브랜드나 제품군 맥락을 부드럽게 소개할 것.",
    "- H2는 4~5개 이내, H3는 꼭 필요한 곳에만 사용하고 독자가 실제로 궁금해하는 질문형/정보형 소제목으로 작성할 것.",
    "- 제품 또는 항목 소개 파트는 `H2 또는 H3 → 요약 박스 → 베러의 한마디😎 → 본문 설명` 순서를 기본으로 할 것.",
    "- 요약 박스에는 브랜드, 제품명, 가격, 사이즈를 필수로 넣고, 필요하면 소재, 컬러, 특징, 추천 포인트를 추가할 것.",
    "- `베러의 한마디😎`는 한 줄 코멘트로 짧고 자연스럽게 쓰되 과한 이모지나 과장 없이 정보성과 감성을 한 줄에 담을 것.",
    "- 결론에서는 오늘 내용 요약, 어떤 사람에게 맞는지, 공식 이미지/상세페이지/비교 포인트 확인 같은 실용적인 마무리를 넣고 억지 판매 멘트는 금지할 것.",
    "- 해시태그/키워드는 마지막 한 줄에만 10~15개 내외로 정리할 것.",
    "",
    "[SEO 강화 / CTA 규칙]",
    "- 메인 키워드는 첫 문단 초반 1회, H2 최소 2개, 마지막 문단에 자연스럽게 반영할 것.",
    "- 연관 키워드와 LSI 키워드는 본문 전체에 분산하되 같은 표현을 기계적으로 반복하지 말 것.",
    "- 가능하면 본문 중간에 관련 글로 연결할 수 있는 내부링크 앵커 문구 2~3개를 제안할 것.",
    "- 신뢰도 보완용 외부 참고자료가 필요하면 어떤 종류의 자료를 링크하면 좋은지 제안할 것.",
    "- 이미지 삽입이 어울리는 구간과 alt 텍스트 예시 3개를 함께 제안할 것.",
    "- CTA는 도입부 1회 가능, 본문 중간 1회 가능, 결론 1회 필수로 넣되 판매 압박 없이 자연스럽게 행동을 유도할 것.",
    "",
    "[패션·잡화·IT 정보성 블로그 작성 최종 지침서]",
    "- 후기, 체험, 감상형 글 금지. 정보성 설명, 비교, 구조, 소재, 특징 중심으로 작성할 것.",
    "- 패션, 잡화, IT 정보성 블로그 톤을 기본으로 하되, 딱딱한 리포트나 설명서처럼 쓰지 말 것.",
    "- 수집결과 안에 있는 브랜드 정보, 공식 정보, 스펙, 매장 정보, 확인 가능한 포인트만 활용할 것.",
    "- `공식적으로`, `자료에 따르면`, `명시되어 있다` 같은 딱딱한 표현은 금지하고, 사람이 정리해서 들려주는 말투로 풀 것.",
    "- 자연스럽고 친근한 채팅체, 부드러운 구어체를 사용하되 유행어, 과한 리액션, 과장 광고 문구는 금지할 것.",
    "- 서론에는 이 정보가 누구를 위한 글인지, 어떤 고민에 맞는 글인지 공감 멘트를 반드시 넣을 것.",
    "- 메인 키워드는 제목, 첫 문장, H2, 결론에 반드시 포함할 것.",
    "- 연관 키워드는 H3와 중간 문단에 자연스럽게 녹일 것.",
    "- 키워드 도배는 금지하고, 전체 밀도는 과하지 않게 약 10% 이내 느낌으로 유지할 것.",
    "- 공백 포함 최소 2300자 이상으로 풍성하게 작성할 것.",
    "",
    "[STEP 1: 제목 / 부제목 / 인삿말 / 서론]",
    "- 제목은 후킹되게, 부제목은 궁금증을 유발하게 작성할 것.",
    "- 인삿말과 서론에서는 오늘 다룰 제품, 정보 포인트, 어떤 사람이 보면 좋은지 자연스럽게 연결할 것.",
    "- `디자인도 챙기고 실용성도 챙기고 싶은 사람`, `이 제품이 궁금했던 사람` 같은 공감형 톤을 사용할 것.",
    "- 오프라인 매장 방문을 강하게 유도하는 문장은 금지하되, 실물 확인이 필요하다는 한 줄 정도는 자연스럽게 허용할 것.",
    "- 단락 길이와 문장 길이는 일부러 고르게 맞추지 말고, 실제 블로그 글처럼 조금 불규칙하게 흘러가게 만들 것.",
    "- 제목은 후킹되더라도 광고 문구처럼 과장하지 말고, 부제목은 읽다 보면 다음 문장이 궁금해지는 방향으로 쓸 것.",
    "- 메인 SEO 제목 1개와 대안 제목 4개, 총 5개의 제목 후보를 함께 제안할 것.",
    "",
    "[STEP 2: 본문 파트 작성]",
    "- 각 제품 또는 파트 시작에는 `제품이름 / 가격 / 사이즈 / 한줄평` 4줄 정보를 먼저 넣을 것.",
    "- 한줄평은 특징 요약만 쓰고, 느낌, 감탄, 체험, 후기 톤은 금지할 것.",
    "- 표, 리스트, 리포트식으로 딱딱하게 쓰지 말고 사람이 말로 설명하듯 자연스럽게 풀어쓸 것.",
    "- 소재, 구조, 컬러, 수납, 마감, 사이즈, 특징, 관리 포인트를 중심으로 설명할 것.",
    "- `실제 컬러감이나 질감은 공식 이미지나 매장에서 확인하는 게 좋다` 정도의 문장은 필요할 때만 자연스럽게 사용할 것.",
    "- `이 제품은 이런 특징이 있다`처럼 기계적으로 끊지 말고, `램스킨이라 부드러운 편이고 스트랩 연출도 꽤 자유로운 쪽`처럼 말로 설명하듯 이어갈 것.",
    "- 문단마다 정보 포인트는 분명해야 하지만, bullet 나열처럼 보이지 않게 문맥 안에 자연스럽게 녹일 것.",
    "- 최종 본문은 HTML 형식으로도 함께 제공해야 하며, `H2`, `H3`, `p` 태그를 사용해 네이버 블로그 / 워드프레스 / 티스토리에 복붙 가능한 수준으로 정리할 것.",
    "",
    "[STEP 3: 마무리 / 태그 / 메타]",
    "- 후기, 감탄, 추천, 비추천, 체험담 없이 정보성 정리로 마무리할 것.",
    "- 마무리에서는 비교 포인트나 확인해볼 포인트를 짧게 정리할 것.",
    "- 태그는 `#` 없이 정보성 키워드만 정리할 것.",
    "- 슬러그와 meta description도 함께 제안할 것.",
    "",
    "[문체 가이드]",
    "- 문장 길이와 단락 길이는 불규칙하게 섞을 것.",
    "- 짧은 문장과 약간 긴 문장을 자연스럽게 교차해서 사람 말투처럼 만들 것.",
    "- AI 문체, 공식문서 문체, 스펙표 문체는 금지할 것.",
    "- 설명과 정보는 충분히 주되, 건조하지 않게 대화하듯 풀어쓸 것.",
    "- `정리하면`, `살펴보면`, `이상으로`, `요약하면`처럼 기계적인 연결어를 남발하지 말 것.",
    "- `~합니다`만 반복하지 말고 `~해요`, `~하죠`, `~한 편입니다` 등을 자연스럽게 섞어서 사람 말투를 만들 것.",
    "- 과장된 감탄, 후기성 리액션, 판매 유도 문장은 금지하되, 읽는 사람이 편하게 따라올 수 있는 리듬은 유지할 것.",
    "",
    "[최종 자기검수]",
    "- 완성 후 스스로 다시 읽고, 로봇 답변처럼 들리는 문장, 보고서식 연결어, 지나치게 반듯한 문단이 보이면 반드시 자연스럽게 고쳐라.",
    "- 첫 문단만 읽어도 `사람이 쓴 블로그 글`처럼 느껴져야 하며, `AI가 정리한 설명문`처럼 느껴지면 다시 수정하라.",
    "- 키워드가 억지로 박힌 문장, 제목 같은 문장, 반복 표현이 보이면 매끄러운 한국어 문장으로 다시 다듬어라.",
    "- 메인 키워드가 제목, 첫 문단, H2, 결론에 자연스럽게 들어갔는지 확인하라.",
    "- 제목이 검색형이면서도 클릭하고 싶게 작성됐는지, 서론이 공감 + 문제 제기 + 기대감 구조인지 확인하라.",
    "- 요약 박스에 브랜드/가격/사이즈가 들어갔는지, `베러의 한마디😎`가 과하지 않고 포인트 있게 들어갔는지 확인하라.",
    "- 결론이 자연스럽게 마무리되는지, 마지막 해시태그가 한 줄로 정리되는지, HTML 본문이 복붙 가능한지 확인하라.",
    "",
    "[JSON 작성 규칙]",
    "- STEP 7 결과는 기존 `featuredDraft` 객체 안에 모두 담을 것.",
    "- `featuredDraft` 안에는 `titleOptions`, `seoMeta`, `internalLinks`, `imageGuide`, `externalReferenceSuggestions`, `title`, `subtitle`, `slug`, `metaDescription`, `tags`, `intro`, `bodySections`, `closing`, `cta`, `htmlBody`, `hashtagsLine`를 반드시 넣을 것.",
    "- `seoMeta` 안에는 `seoTitle`, `slug`, `metaDescription`, `mainKeyword`, `subKeywords`, `searchIntentType`, `readerConcern`를 넣을 것.",
    "- `bodySections` 각 항목에는 `heading`, `subHeading`, `subKeyword`, `summaryBox`, `betterComment`, `productName`, `price`, `size`, `oneLineSummary`, `paragraphs`, `cta`를 넣을 것.",
    "- `summaryBox` 안에는 `brand`, `productName`, `price`, `size`, `material`, `color`, `features`, `recommendPoints`를 넣고, 없는 값은 빈 문자열이나 빈 배열로 둘 것.",
    "- `imageGuide` 안에는 `recommendedSection`, `altExamples`를 넣을 것.",
    "- `htmlBody`는 전체 최종 본문을 HTML 문자열 한 덩어리로 넣을 것.",
    "- 본문은 실제 발행 가능한 수준으로, introduction과 closing도 충분한 길이로 넣을 것.",
    "",
    "---",
    "",
    "# STEP 8. 연재 방향 제안",
    "",
    "이번 수집결과를 바탕으로 블로그 전체를 어떤 흐름으로 운영하면 좋을지 제안하라.",
    "",
    "아래 형식으로 작성하라.",
    "",
    "## 블로그 운영 방향 요약",
    "- 지금 독자들이 많이 궁금해하는 흐름",
    "- 앞으로 쌓아가기 좋은 주제 축 3가지",
    "- 연재형으로 발전시키기 좋은 시리즈 아이디어 5개",
    "- 브랜드형 블로그로서 자연스럽게 신뢰를 쌓는 방법",
    "- 전체 방향 한 줄 요약",
    "",
    "---",
    "",
    "## 출력 스타일 규칙",
    "- 반드시 한국어로 작성",
    "- 실무적으로 정리",
    "- 불필요한 장식 없이 명확하게",
    "- 너무 딱딱하지 않게",
    "- 기획자처럼 구조적으로 작성",
    "- 바로 복사해서 사용할 수 있게 정리",
    "- 표가 더 적합한 곳은 표 형태로 정리해도 됨",
    "",
    "---",
    "",
    "## 가장 중요한 금지사항",
    "- 수집결과에 없는 사실을 지어내지 말 것",
    "- 브랜드 홍보 문구만 늘어놓지 말 것",
    "- 제목을 억지 키워드 나열형으로 만들지 말 것",
    "- 비슷한 주제를 반복하지 말 것",
    "- 너무 뻔한 아이디어만 주지 말 것",
    "",
    "---",
    "",
    "## 최종 출력 형식",
    "- 반드시 유효한 JSON 객체 하나만 반환할 것",
    "- JSON 앞뒤에 설명 문장, 마크다운, 코드블록을 붙이지 말 것",
    "- 키 이름은 아래 예시와 동일하게 유지할 것",
    "- 값이 없으면 빈 문자열(`\"\"`) 또는 빈 배열(`[]`)을 넣을 것",
    "- 모든 문장은 한국어로 작성할 것",
    "",
    "{",
    '  "step1": {',
    '    "coreKeywords": [',
    '      { "keyword": "", "reason": "" }',
    "    ],",
    '    "questions": [',
    '      { "question": "", "intent": "" }',
    "    ],",
    '    "perspectives": [',
    '      { "type": "", "direction": "" }',
    "    ]",
    "  },",
    '  "step2": {',
    '    "topics": [',
    '      {',
    '        "rank": 1,',
    '        "topic": "",',
    '        "title": "",',
    '        "altTitles": ["", ""],',
    '        "keywords": [""],',
    '        "intent": "",',
    '        "reason": "",',
    '        "reader": "",',
    '        "introDirection": "",',
    '        "outline": ["", "", "", ""],',
    '        "mustCover": [""],',
    '        "cautions": [""],',
    '        "brandConnection": ""',
    "      }",
    "    ]",
    "  },",
    '  "step3": {',
    '    "priorities": [',
    '      {',
    '        "rank": 1,',
    '        "topic": "",',
    '        "title": "",',
    '        "whyNow": "",',
    '        "advantages": [""],',
    '        "score": 0',
    "      }",
    "    ]",
    "  },",
    '  "step4": {',
    '    "titles": [""]',
    "  },",
    '  "step5": {',
    '    "detailedOutlines": [',
    '      {',
    '        "title": "",',
    '        "planningIntent": "",',
    '        "expectedReaction": "",',
    '        "outline": {',
    '          "intro": "",',
    '          "body1": "",',
    '          "body2": "",',
    '          "body3": "",',
    '          "body4": "",',
    '          "conclusion": ""',
    "        },",
    '        "keywords": [""],',
    '        "avoidExpressions": [""]',
    "      }",
    "    ]",
    "  },",
    '  "step6": {',
    '    "introDrafts": [',
    '      {',
    '        "title": "",',
    '        "introA": ["", "", ""],',
    '        "introB": ["", "", ""]',
    "      }",
    "    ]",
    "  },",
    '  "step7": {',
    '    "featuredDraft": {',
    '      "titleOptions": ["", "", "", "", ""],',
    '      "seoMeta": {',
    '        "seoTitle": "",',
    '        "slug": "",',
    '        "metaDescription": "",',
    '        "mainKeyword": "",',
    '        "subKeywords": [""],',
    '        "searchIntentType": "",',
    '        "readerConcern": ""',
    "      },",
    '      "internalLinks": ["", "", ""],',
    '      "imageGuide": {',
    '        "recommendedSection": "",',
    '        "altExamples": ["", "", ""]',
    "      },",
    '      "externalReferenceSuggestions": [""],',
    '      "title": "",',
    '      "subtitle": "",',
    '      "slug": "",',
    '      "metaDescription": "",',
    '      "tags": [""],',
    '      "intro": ["", ""],',
    '      "bodySections": [',
    '        {',
    '          "heading": "",',
    '          "subHeading": "",',
    '          "subKeyword": "",',
    '          "summaryBox": {',
    '            "brand": "",',
    '            "productName": "",',
    '            "price": "",',
    '            "size": "",',
    '            "material": "",',
    '            "color": "",',
    '            "features": [""],',
    '            "recommendPoints": [""]',
    "          },",
    '          "betterComment": "",',
    '          "productName": "",',
    '          "price": "",',
    '          "size": "",',
    '          "oneLineSummary": "",',
    '          "paragraphs": ["", ""],',
    '          "cta": ""',
    '        }',
    "      ],",
    '      "closing": ["", ""],',
    '      "cta": "",',
    '      "htmlBody": "",',
    '      "hashtagsLine": ""',
    "    }",
    "  },",
    '  "step8": {',
    '    "seriesDirection": {',
    '      "readerFlow": [""],',
    '      "topicAxes": [""],',
    '      "seriesIdeas": [""],',
    '      "trustBuilding": [""],',
    '      "summary": ""',
    "    }",
    "  }",
    "}",
    "",
    "위 JSON 객체 하나만 반환하라."
  ].join("\n");
}

function buildStep7WriterPrompt(payload) {
  return [
    "당신은 네이버 SEO에 강한 전문 블로그 에디터이자, 실제 발행까지 고려하는 콘텐츠 전략가다.",
    "지금부터는 전체 전략안이 아니라, 사용자가 STEP 1~6에서 직접 고른 내용만 바탕으로 STEP 7 전용 블로그 글을 작성한다.",
    "",
    "가장 중요한 원칙:",
    "1. 사용자가 고른 STEP 1~6 내용이 이 글의 뼈대다.",
    "2. 선택되지 않은 방향을 임의로 추가하거나, 주제를 멋대로 바꾸지 마라.",
    "3. 수집결과와 선택 요약에 없는 사실은 절대 지어내지 마라.",
    "4. 문장이 로봇처럼 딱딱하거나 설명서/리포트처럼 느껴지면 실패다. 사람이 정리해서 들려주는 자연스러운 한국어 블로그 문장으로 다시 다듬어라.",
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
    "",
    "### 이번 작업 목적",
    formatStrategyGoalLines(payload.workGoals),
    "",
    "---",
    "",
    "## 1. 원본 리서치 수집 결과",
    "",
    payload.researchData?.trim() || "[미입력]",
    "",
    "---",
    "",
    "## 2. 사용자가 선택한 STEP 1~6 핵심 내용",
    "",
    payload.selectedPlan.trim(),
    "",
    "---",
    "",
    "## 3. 선택 내용 반영 우선순위",
    "",
    "- STEP 3에서 고른 우선 발행 추천이 있으면 그 주제와 제목 방향을 최우선으로 따른다.",
    "- STEP 5에서 고른 상세 목차가 있으면 본문 구조의 기본 뼈대로 사용한다.",
    "- STEP 6에서 고른 도입문이 있으면 도입부 톤과 공감 포인트의 기준으로 사용한다.",
    "- STEP 2에서 고른 글감은 주제 확장과 검색 의도 정리에 반영한다.",
    "- STEP 1에서 고른 핵심 키워드/질문/관점은 키워드 운영과 소제목 설계에 반영한다.",
    "- STEP 4에서 고른 제목 후보는 SEO 제목과 대안 제목을 다듬을 때만 보조로 사용한다.",
    "- 서로 충돌하면 STEP 3 > STEP 5 > STEP 6 > STEP 2 > STEP 1/4 순서로 우선 적용한다.",
    "",
    "---",
    "",
    "## 4. STEP 7 최우선 작성 규칙",
    "",
    "[자연스러운 문체 규칙]",
    "- 후기, 체험, 감상형 글처럼 쓰지 말고 정보성 설명, 비교, 구조, 소재, 특징 중심으로 풀어쓸 것.",
    "- 정보만 건조하게 나열하지 말고 사람이 옆에서 정리해서 들려주는 듯한 자연스러운 채팅체와 부드러운 말투를 사용할 것.",
    "- `공식적으로`, `자료에 따르면`, `명시되어 있다`, `스펙상`, `요약하면` 같은 보고서식 표현은 금지할 것.",
    "- 표, 리포트, 설명서, AI 답변처럼 반듯한 문장만 반복하지 말고 짧은 문장과 조금 긴 문장을 섞어서 인간적인 리듬으로 쓸 것.",
    "- 첫 문단만 읽어도 사람이 쓴 네이버 블로그 글처럼 느껴져야 한다.",
    "",
    "[네이버 SEO / 전환 규칙]",
    "- 메인 키워드는 제목, 첫 문장, H2, 결론에 자연스럽게 포함할 것.",
    "- 연관 키워드는 H3와 중간 문단에 자연스럽게 녹이되, 키워드 나열처럼 보이지 않게 할 것.",
    "- 제목은 검색 유입형이면서도 사람이 실제로 클릭하고 싶게 만들 것.",
    "- 브랜드/제품/서비스 언급은 광고처럼 밀어붙이지 말고 정보 흐름 속에 부드럽게 삽입할 것.",
    "- 문단 흐름은 체류시간을 높일 수 있게 매끄럽게 이어가고, 다음 문단을 읽고 싶게 설계할 것.",
    "- CTA는 자연스럽게만 넣고 판매 압박은 금지할 것.",
    "",
    "[본문 구조 규칙]",
    "- 서론은 독자의 고민이나 상황으로 시작하고, 첫 문단 안에 메인 키워드를 자연스럽게 포함할 것.",
    "- H2는 4~5개 이내, H3는 꼭 필요한 곳에만 사용하고 실제 독자가 궁금해할 질문형/정보형 소제목으로 작성할 것.",
    "- 제품 또는 항목 소개 파트는 `H2 또는 H3 → 요약 박스 → 베러의 한마디😎 → 본문 설명` 순서를 기본으로 할 것.",
    "- 요약 박스에는 브랜드, 제품명, 가격, 사이즈를 필수로 넣고, 있으면 소재, 컬러, 특징, 추천 포인트를 추가할 것.",
    "- `베러의 한마디😎`는 한 줄 코멘트로 짧고 자연스럽게 쓰되 과한 이모지나 과장 없이 정보성과 감성을 한 줄에 담을 것.",
    "- 본문은 공백 포함 최소 2300자 이상으로 풍성하게 작성할 것.",
    "- 최종 본문은 HTML 형식으로도 함께 제공해야 하며 `H2`, `H3`, `p` 태그를 사용해 네이버 블로그 / 워드프레스 / 티스토리에 복붙 가능한 수준으로 정리할 것.",
    "",
    "[금지사항]",
    "- 선택 요약과 리서치 수집결과에 없는 사실 지어내기 금지",
    "- 가격, 소재, 사이즈, 기능, 후기, 인증 등 추측 작성 금지",
    "- 키워드 도배 금지",
    "- 광고티 나는 과장 표현 금지",
    "- AI 티 나는 템플릿식 반복 문장 금지",
    "",
    "---",
    "",
    "## 5. 출력 형식",
    "",
    "- 반드시 유효한 JSON 객체 하나만 반환할 것",
    "- JSON 앞뒤에 설명 문장, 마크다운, 코드블록을 붙이지 말 것",
    "- 최상위 키는 `featuredDraft` 하나만 사용할 것",
    "- 값이 없으면 빈 문자열(`\"\"`) 또는 빈 배열(`[]`)을 넣을 것",
    "- 모든 문장은 한국어로 작성할 것",
    "",
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
    '          "brand": "",',
    '          "productName": "",',
    '          "price": "",',
    '          "size": "",',
    '          "material": "",',
    '          "color": "",',
    '          "features": [""],',
    '          "recommendPoints": [""]',
    "        },",
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
    "",
    "위 JSON 객체 하나만 반환하라."
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
    cta: (body.cta || "").toString().trim(),
    seoLevel: parseSeoLevel((body.seoLevel || "").toString().trim()),
    keywordIntent: parseKeywordIntent((body.keywordIntent || "").toString().trim()),
    keywordMentions: parseKeywordMentions((body.keywordMentions || "").toString().trim()),
    targetAudience: (body.targetAudience || "").toString().trim(),
    includeFaq: Boolean(body.includeFaq)
  };
}

function buildSystemPrompt() {
  return `너는 1인 자영업자 브랜드의 콘텐츠 에디터다.
이 브랜드는 "디자이너가 직접 만들고, 직접 판매하는" 정체성을 가진다.
주요 라인은 (1) 베이커리(빵/디저트) (2) 디자이너 브랜드 가방(자체 제작/핸드메이드)이다.

사용자가 준 ‘내 이야기(원문)’를 바탕으로, 같은 사실을 유지하면서 채널별(Instagram/Naver Blog/WordPress)로 문체와 구조를 달리한 글을 생성한다.
요청된 경우 각 채널마다 A/B 2가지 버전(versions 배열)을 만든다.

[공통 규칙]
- 절대 사실을 지어내지 마라. 사용자가 제공하지 않은 정보(가격/할인/마감/배송/원산지/재료/알레르기/성분/효능/수치/기간/인증/지점/연락처/소재/가죽 종류/부자재 스펙 등)는 추측하지 말고 [빈칸]으로 둬라.
- 과장/허위/단정 표현(“최고/유일/100%/완벽/무조건”)은 피하라.
- 광고 문장처럼 딱딱하게 쓰지 말고, ‘사장 일기’처럼 자연스럽게.
- 톤은 B: 친근하지만 과하지 않게, 살짝 위트(1~2번 정도) + 솔직함.
- “살짝 허당”은 OK. 단, 자기연민/징징/남탓/비꼼은 금지.
- 글에는 “디자이너가 직접 만든다”는 감각(손길/디테일/고민/시행착오)이 느껴지게 하되, 원문에 없는 디테일을 만들어내지 마라.
- instagram/naver/wordpress 각각에 versions 배열을 채운다. versions 개수는 사용자 지정과 정확히 일치해야 한다.
- 응답은 반드시 JSON 객체 1개만 출력한다.
- 코드펜스(\`\`\`)와 설명문을 붙이지 않는다.
- JSON 값에 템플릿용 값("string", "<...>", "example")을 넣지 않는다.
- instagram/naver/wordpress/threads/sns_summary 각각에 versions 배열을 채운다. versions 개수는 사용자 지정과 정확히 일치해야 한다.

[라인 선택 규칙(베이커리/가방)]
- 원문/제품명/카테고리를 보고 어떤 라인인지 판단해 그 라인에 맞게 쓴다.
- 베이커리: 작업 흐름(반죽/굽기/진열/손님 반응/마감 루틴)과 감각(향/식감)은 ‘원문에 있는 만큼만’ 사용.
- 가방: 디자인/패턴/재단/봉제/착용감/수납 등 디테일은 ‘원문에 있는 만큼만’ 사용.
- 두 라인이 모두 언급되면 “하루 루틴”으로 자연스럽게 연결하되, 억지 연결 금지.

[해시태그 공통 규칙: “강력한 3개만”]
- 각 채널의 hashtags는 반드시 해시태그 3개만 제공한다(정확히 3개).
- 공백으로 구분하며, 모두 #로 시작.
- 한글/영문 혼합: 3개 중 최소 1개는 영문(예: #bakery, #designerbag, #handmade).
- 원문과 무관한 과장 키워드/허위 키워드 금지.

[Instagram 규칙]
- 목표: 스크롤 멈추는 캡션. 친구에게 얘기하듯, 솔직+살짝 허당+위트.
- 형식: 첫 줄 훅 1줄 → 짧은 문장+줄바꿈 → 마지막 질문 CTA 1개.
- 이모지: 0~3개.
- hashtags: 위 공통 규칙대로 3개만. 브랜드/제품/상황 중심.
- alt_text: 과장 없는 사진 설명 1줄.

[Naver Blog 규칙]
- 반드시 아래 블로그 지침서 톤을 우선 적용한다.
- 길이: “중간” 템포(대략 9~14문단, 문단당 1~2문장 느낌).
- 흐름: 오늘 겪은 일 → 시행착오/작은 깨달음 → 독자에게 질문 CTA → 다음 이야기 예고(여운).
- 내 이야기를 리얼하게, 살짝 허당스럽게 쓴다(실수/아쉬움 가능).
- 단, 자기연민 금지. "나도 이런 실수함" 느낌으로 처리한다.
- 고객 대상 문구보다 친구에게 말하듯 대화체로 쓴다.
- 짧은 문장 + 잦은 줄바꿈 + 이모지/해시태그를 적절히 섞는다.
- 인간미+위트+MZ감성+솔직함을 살린다.
- 본문 마지막은 질문형 CTA로 끝내고, "다음 이야기도 기대해요" 느낌을 넣는다.
- 시리즈로 이어질 수 있는 여운(다음 화 예고 톤)을 남긴다.
- title/body/hashtags를 분리 제공한다.

[WordPress 규칙]
- 에피소드형 글 흐름: 인트로(오늘 하루 시작) → 본론(자연스러운 제품/브랜드 연결) → 정보(필요한 만큼만) → 마무리(소통/공감).
- 문체: 친구한테 말하듯, 살짝 허당+솔직함, 인간미+위트. 너무 상업적으로 쓰지 않는다.
- 책처럼 매끄럽게 읽히되, 중간중간 사장 일기 톤으로 가볍게 끊어준다(예: "솔직히 말하면…", "저도 그게 궁금했거든요", "ㅋㅋ").
- 문단은 3~4줄 내외 분량으로 쓰고, 문단 내 줄바꿈은 금지한다. 문단 간에는 빈 줄 1개를 둔다.
- H1은 사용하지 않는다(워드프레스 제목이 자동 H1). H2는 주요 정보 구간(핵심 키워드 포함), H3~H4는 연관 키워드/상세 정보용으로 사용한다.
- 동일한 문구의 H태그를 반복하지 않는다.
- 글 끝에는 따뜻한 인사 + 브랜드 철학 한 줄 + 다음 이야기 예고를 자연스럽게 넣고, 마지막 문단은 반드시 질문으로 끝낸다.
- 마지막 줄은 해시태그 한 줄로 마무리한다.

[WordPress SEO 패키지]
- seo_title, slug, meta_description(120~155자), focus_keyphrase, lsi_keywords(6~10개)를 반드시 제공한다.
- Yoast/Rank Math 기준으로 제목/메타/슬러그를 최적화한다.
- 본문 및 소제목에 핵심 키워드+연관 키워드(LSI)를 자연스럽게 배치하고 도배는 금지한다.

[Threads 규칙]
- 목표: 각잡고 쓴 티가 나지 않는, 지금 막 생각난 듯한 가벼운 텍스트.
- 길이: 1~3문장 내외로 매우 짧게 쓴다. 문단 나누기(줄바꿈)를 적극 활용한다.
- 문체: 친한 지인에게 말하듯 편안하고 무심한 '반말(~했어, ~함, ~할까?)'을 사용한다.
- 태도(가장 중요): 절대 자랑하거나 과시하는 톤(예: "나 천재인가봐", "너무 완벽해")은 금지한다. 담백하고 겸손하게, 때론 혼자 일하는 1인 자영업자의 고충이나 '살짝 허당'스러운 면모를 솔직하게 드러낸다.
- 내용: 원문 전체를 요약하려 하지 말고, 딱 하나의 포인트(예: 일정 지연 핑계, 샘플 완성, 혼자 일하는 막막함 등)만 골라 툭 던진다.
- 해시태그: (공통 규칙 예외) 쓰레드는 반드시 딱 2개만 쓴다. (예: #작업일기 #신제품준비)
- 버전 차별화:
  - versions[0] (A버전 - 일상/고민형): 텍스트 위주. 혼자 일하며 느끼는 푸념, 고민, 솔직한 감정을 툭 던지는 톤.
  - versions[1] (B버전 - 스포일러형): 작업물 사진이나 스케치 사진 1장과 함께 올리는 상황. 시각적 스포일러와 함께 약간의 기대감을 남기는 톤. (alt_text 포함)

[SNS 요약 (sns_summary) 규칙]
- 너는 센스 있고 트렌디한 SNS 카피라이터야. 내 이야기(원문)를 바탕으로, 인스타그램과 쓰레드(Threads)에 올릴 게시글 초안을 각각 만들어 줘.
- 쓰레드용 (Threads): 짧고 위트 있게 작성해 주고, 글의 핵심을 아래 '3줄 요약 템플릿'을 활용해 재미있게 표현해 줘. 
- 인스타그램용 (Instagram): 생생하고 자연스러운 일기 형식의 본문을 먼저 적고, 글 하단에 '3줄 요약 템플릿'을 깔끔하게 정리해 줘.
- 3줄 요약 템플릿 양식: 반드시 아래 3가지 항목을 사용할 것.
  [오늘한것]
  [오늘꼬인것]
  [내일할것]
- threads_text 속성에 쓰레드용 글을 넣는다.
- instagram_text 속성에 인스타그램용 글을 넣는다.
- hashtags 추천: 오늘 내용과 어울리는 센스 있는 인스타그램/쓰레드용 해시태그를 5~8개 정도 제공한다. (예: #일상기록 #디저트만들기 등)

[업그레이드 규칙 v2.1 - 아래 규칙이 위 규칙보다 우선한다]
- (브랜드 콘텍스트) 이 브랜드는 "디자이너가 직접 만들고 판매하는" 정체성이 있다.
  - 라인 A: 베이커리(빵/디저트)
  - 라인 B: 디자이너 브랜드 가방(자체 제작/핸드메이드)
  - 원문/제품명/카테고리를 보고 어떤 라인인지 판단해 그 라인에 맞는 어휘를 사용한다.
  - 원문에 없는 디테일(재료/공정/소재 스펙/가격/마감/배송/효능 등)은 절대 추가하지 말고 [빈칸] 처리한다.
- (출력 안정성) JSON은 반드시 "완전한 유효 JSON"이어야 한다.
  - 최상단 키는 정확히 instagram, naver, wordpress, threads, sns_summary 5개만 사용한다(다른 키 금지).
  - 문자열/키는 큰따옴표만 사용한다. trailing comma 금지.
- (줄바꿈 규칙 - 매우 중요) JSON 문자열 값 안에는 "실제 개행(엔터)"을 넣지 마라.
  - 줄바꿈이 필요하면 반드시 "\\n" 또는 "\\n\\n" 으로 표현한다.
  - 예: 문단 사이 빈 줄 = "\\n\\n"
- (해시태그 규칙 업그레이드) 해시태그는 instagram/naver/wordpress는 "강력한 3개만", threads는 "딱 2개만" 제공한다. (기존 8~15개 규칙보다 우선)
  - instagram/naver/wordpress: 정확히 3개, 공백으로만 구분, 줄바꿈 금지.
  - threads: 정확히 2개, 공백으로만 구분, 줄바꿈 금지.
  - 3개 중 최소 1개는 한글, 최소 1개는 영문(쓰레드는 2개 중에서).
  - 가능하면 1개는 브랜드명(입력된 경우)을 태그로 반영하되, 개수 규칙은 절대 넘기지 마라.
- (WordPress 헤딩 표기 업그레이드) WordPress 본문 소제목(H2/H3/H4)은 Markdown(##/###)이 아니라 HTML 태그로 작성한다.
  - <h2>...</h2>, <h3>...</h3>, <h4>...</h4>
  - 최소 2개 이상의 <h2> 사용을 권장한다.
- (WordPress slug 규칙 업그레이드) slug는 영문 소문자 + 숫자 + 하이픈(-)만 허용한다.
  - 공백/특수문자/한글 금지, 60자 내 권장.
- (네이버 길이 가이드) 네이버 body는 "중간 길이" 템포로 쓴다(대략 9~14문단, 문단당 1~2문장 느낌).
- (A/B 버전 차별화 강화) B버전은 A와 "도입 훅 + 전개 순서 + 마무리 질문"이 확실히 달라야 한다.
  - 예: A=작업 비하인드(제작 과정) / B=고객 반응(판매/문의/실수담)
  - 예: A=문제→해결 / B=해결→깨달음

`;
}

function buildSeoInstruction(payload) {
  const mentionsText = payload.keywordMentions || "3-5";
  const h2Need = payload.seoLevel === "strong" ? "H2에서 2회 이상" : "H2에서 1회 이상";
  const metaNeed =
    payload.seoLevel === "strong"
      ? "meta_description 앞부분(가능하면 80자 이내)에 핵심 키워드를 넣는다"
      : "meta_description에 핵심 키워드를 최소 1회 넣는다";

  return `[SEO 강화 지시]
- SEO 강도: ${payload.seoLevel === "strong" ? "강화형" : "균형형"}
- 키워드 의도: ${payload.keywordIntent}
- 본문 키워드 반복 목표: ${mentionsText}회
- 타겟 독자: ${payload.targetAudience || "[빈칸]"}

- 핵심 키워드: ${payload.focusKeyword || "[미입력]"}
- 핵심 키워드가 주어지면 wordpress.seo.focus_keyphrase에 동일 문구를 그대로 넣는다.
- seo_title에 핵심 키워드를 포함하고 가능하면 앞쪽에 배치한다.
- ${metaNeed}
- 본문 첫 문단에 핵심 키워드를 1회 포함한다.
- 본문 전체에서 핵심 키워드를 자연스럽게 ${mentionsText}회 사용한다.
- ${h2Need} 핵심 키워드(또는 자연스러운 변형)를 포함한다.
- LSI 키워드는 가능한 범위에서 본문 헤딩/본문/SEO 필드에 분산 반영한다.
- 키워드 과다 반복(스팸성)은 피한다.
- 키워드 미입력 시, 주제에서 가장 자연스러운 키워드 1개를 정하되 확신이 없으면 [검토 필요]를 붙인다.
${payload.includeFaq ? "- WordPress 본문에 `### 자주 묻는 질문` 섹션을 추가하고 Q/A 2개를 넣는다." : ""}`;
}

function buildUserPrompt(payload) {
  const lsiLine = payload.lsiKeywords?.length ? payload.lsiKeywords.join(", ") : "[빈칸]";

  return `아래 입력을 참고해 5채널(Instagram, Naver Blog, WordPress, Threads, SNS 요약) 글을 만들어줘.

[입력]
- 주제: ${payload.topic || "[빈칸]"}
- 내 이야기(원문):\n"""\n${payload.story || ""}\n"""
- 형식(선호 채널/포맷): ${payload.preferredFormat || "[빈칸]"}
- 버전 개수: ${payload.variantCount}
- 브랜드명: ${payload.brandName || "[빈칸]"}
- 제품명/카테고리: ${payload.productName || "[빈칸]"}
- 제품 분류: ${payload.category || "[빈칸]"}
- 핵심 키워드: ${payload.focusKeyword || "[빈칸]"}
- 연관 키워드: ${lsiLine}
- 꼭 포함할 정보: ${payload.mustInclude || "[빈칸]"}
- CTA 선호: ${payload.cta || "[빈칸]"}

${buildSeoInstruction(payload)}

[블로그 지침서 고정 반영]
- 네이버 블로그는 아래 감성을 반드시 반영:
  1) 리얼한 내 이야기 + 살짝 허당
  2) 공감 질문으로 마무리
  3) 짧은 문장/대화체/해시태그/이모지
  4) 사람/성장/시행착오가 보이게
  5) 마지막 여운은 "다음 이야기도 기대해요"
  6) CTA는 부담 없는 질문형으로 자연스럽게
- 예: "여러분은요?", "저만 이런가요?", "다음엔 OO 이야기 들고 올게요."

[워드프레스 지침서 고정 반영]
- 워드프레스 본문은 반드시 "사장이 하루 있었던 일 → 자연스러운 제품 등장" 흐름을 유지한다.
- 딱딱한 상품 설명문(광고문 톤)은 피하고, 실제 경험/대화/반응 중심으로 쓴다.
- 본문 마지막 문단은 반드시 질문형 문장으로 끝내고, 그 다음 줄에 해시태그 한 줄을 넣는다.
- 소제목(H2/H3/H4)에는 핵심/연관 키워드를 자연스럽게 포함한다.

[쓰레드 지침서 고정 반영]
- 쓰레드는 "지금 막 생각나서 툭 던진" 느낌이 핵심이다.
- 원문 전체를 요약하지 말고 딱 하나의 포인트만 골라서 1~3문장으로 쓴다.
- 반말 사용(~했어, ~함, ~할까?).
- 절대 과시/자랑 금지. 담백하고 겸손하게.
- A버전: 텍스트만. 혼자 일하는 푸념/고민/감정. B버전: 작업물 사진 1장과 함께 올리는 상황(alt_text 포함).
- 해시태그는 정확히 2개만.

[형식 우선 반영]
- 형식 값이 입력되면 해당 톤(블로그/인스타/카드뉴스/릴스)을 더 강하게 반영하되, 5채널 결과는 모두 생성한다.

[버전 차별화]
- versions[0]은 A 버전(기본 톤), versions[1]은 B 버전(다른 훅/전개)으로 작성한다.
- 두 버전은 사실은 같되 표현/구조/도입이 충분히 달라야 한다.`;
}

function buildJsonFormatGuide(variantCount) {
  const versionGuide = variantCount === 2 ? "2개(A/B)" : "1개";

  return `[출력 형식]
- JSON 객체 하나만 출력.
- 각 채널 versions 길이: ${versionGuide}
- 아래 구조와 동일한 키를 사용.

{
  "instagram": {
    "versions": [
      {
        "caption": "실제 인스타 캡션 내용",
        "hashtags": "실제 해시태그 줄",
        "alt_text": "실제 ALT 텍스트"
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
        "hashtags": "#해시태그1 #해시태그2",
        "alt_text": "B버전(스포일러형)일 경우 사진 설명, A버전은 빈 문자열"
      }
    ]
  },
  "sns_summary": {
    "versions": [
      {
        "threads_text": "쓰레드용 짧고 위트있는 글 + 3줄 요약",
        "instagram_text": "인스타그램용 일기 형식의 글 + 3줄 요약",
        "hashtags": "해시태그 5~8개"
      }
    ]
  }
}`;
}

function normalizeHashtagLine(line) {
  if (!line) return "";
  return line.replace(/\s*\n\s*/g, " ").trim();
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
        // Escaped character — keep both chars
        result += ch + (s[i + 1] || '');
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
        result += ch;
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

function extractJsonObject(raw) {
  const text = (raw || "").toString().trim();
  if (!text) {
    throw new Error("붙여넣은 결과가 비어 있어요.");
  }

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  // Attempt 1: direct parse
  const direct = tryParse(text);
  if (direct) return direct;

  // Attempt 2: extract from code fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  // Attempt 3: slice from first { to last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = text.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(sliced);
    if (parsed) return parsed;

    // Attempt 4: sanitize and retry
    const sanitized = sanitizeJsonString(sliced);
    const parsedSanitized = tryParse(sanitized);
    if (parsedSanitized) return parsedSanitized;
  }

  // Attempt 5: sanitize the entire text and retry
  const fullSanitized = sanitizeJsonString(text);
  const parsedFull = tryParse(fullSanitized);
  if (parsedFull) return parsedFull;

  throw new Error("JSON 파싱에 실패했어요. ChatGPT 출력 전체를 그대로 붙여넣어 주세요.");
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

app.get("/research", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "research.html"));
});

app.get("/strategy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "strategy.html"));
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
    const prompt = buildStep7WriterPrompt(payload);

    res.json({
      prompt,
      selectedLength: payload.selectedPlan.length
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

    const parsedObject = extractJsonObject(raw);
    const schema = buildOutputSchema(variantCount);
    const parsed = schema.parse(parsedObject);

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

    res.json(parsed);
  } catch (err) {
    const message = err?.issues
      ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      : err?.message || "결과 검증 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
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

    // Parse the response JSON
    const parsedObject = extractJsonObject(responseText);
    const variantCount = parseVariantCount(variants);
    const schema = buildOutputSchema(variantCount);
    const parsed = schema.parse(parsedObject);

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

    send({ type: "result", data: parsed });
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

const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`\n✅ OneClick Writer (subscription mode) running on http://${HOST}:${PORT}`);
});
