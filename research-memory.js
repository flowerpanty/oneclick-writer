import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.RESEARCH_MEMORY_DIR
  ? path.resolve(process.env.RESEARCH_MEMORY_DIR)
  : path.join(ROOT_DIR, "data");
const MEMORY_FILE = process.env.RESEARCH_MEMORY_FILE
  ? path.resolve(process.env.RESEARCH_MEMORY_FILE)
  : path.join(DATA_DIR, "research-memory.json");
const MAX_SEARCH_COUNT = 80;
const MAX_KEYWORDS = 12;
const MAX_TITLES = 12;

const STOP_WORDS = new Set([
  "추천",
  "후기",
  "리뷰",
  "정리",
  "비교",
  "선택",
  "기준",
  "정보",
  "검색",
  "블로그",
  "카페",
  "실사용",
  "사용",
  "관련",
  "중심",
  "보기",
  "좋은",
  "많이",
  "실제",
  "가이드",
  "포인트",
  "상황",
  "시즌",
  "키워드",
  "제목",
  "글",
]);

const DEFAULT_MEMORY = {
  searches: [],
  updatedAt: null,
};

function cloneDefaultMemory() {
  return {
    searches: [],
    updatedAt: null,
  };
}

export async function loadResearchMemory() {
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf8");
    return sanitizeMemory(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return cloneDefaultMemory();
    }
    throw error;
  }
}

export async function saveResearchMemory(memory) {
  const sanitized = sanitizeMemory(memory);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MEMORY_FILE, JSON.stringify(sanitized, null, 2), "utf8");
  return sanitized;
}

export async function addResearchSearchSnapshot(input) {
  const memory = await loadResearchMemory();
  const snapshot = createSnapshot(input);
  memory.searches = [...memory.searches, snapshot].slice(-MAX_SEARCH_COUNT);
  memory.updatedAt = new Date().toISOString();
  return saveResearchMemory(memory);
}

export function summarizeResearchMemory(memory, queries = [], focusKeyword = "") {
  const searches = Array.isArray(memory?.searches) ? memory.searches : [];
  const currentTokens = buildTokenSet([focusKeyword, ...queries]);
  const focusKey = normalizeKey(focusKeyword || queries[0] || "");

  if (!searches.length) {
    return {
      hasData: false,
      totalSearches: 0,
      similarSearchCount: 0,
      preferredKeywords: [],
      preferredFrames: [],
      preferredQuestionTerms: [],
      note: "",
    };
  }

  const similarSearches = searches
    .map((snapshot) => ({
      snapshot,
      score: scoreSimilarity(snapshot, currentTokens, focusKey),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.snapshot.createdAt.localeCompare(a.snapshot.createdAt))
    .slice(0, 12);

  const keywordCounts = new Map();
  const frameCounts = new Map();
  const questionCounts = new Map();

  for (const entry of similarSearches) {
    const weight = Math.max(1, Math.min(8, entry.score));

    entry.snapshot.relatedKeywords.forEach((item, index) => {
      addCount(keywordCounts, item.keyword, weight + Math.max(0, 3 - index));
    });

    entry.snapshot.topKeywords.forEach((term) => {
      addCount(keywordCounts, term, Math.max(1, weight - 1));
    });

    entry.snapshot.questionTitles.forEach((title) => {
      tokenize(title).forEach((token) => addCount(questionCounts, token, 1));
    });

    entry.snapshot.headlineIdeas.forEach((item) => {
      const frame = extractHeadlineFrame(entry.snapshot.focusKeyword, item.title);
      if (!frame || frame.length < 4) return;
      addCount(frameCounts, `${item.section}|||${frame}`, weight);
    });
  }

  const preferredKeywords = toSortedList(keywordCounts, 8).map(([keyword, count]) => ({ keyword, count }));
  const preferredFrames = toSortedList(frameCounts, 6).map(([value, count]) => {
    const [section, frame] = value.split("|||");
    return { section, frame, count };
  });
  const preferredQuestionTerms = toSortedList(questionCounts, 6).map(([term, count]) => ({ term, count }));

  return {
    hasData: true,
    totalSearches: searches.length,
    similarSearchCount: similarSearches.length,
    preferredKeywords,
    preferredFrames,
    preferredQuestionTerms,
    note: similarSearches.length
      ? `누적 검색 ${searches.length}건 중 유사 검색 ${similarSearches.length}건을 반영했습니다.`
      : `누적 검색 ${searches.length}건이 저장돼 있습니다.`,
  };
}

function sanitizeMemory(memory) {
  return {
    searches: Array.isArray(memory?.searches)
      ? memory.searches.map((snapshot) => sanitizeSnapshot(snapshot)).filter(Boolean).slice(-MAX_SEARCH_COUNT)
      : [],
    updatedAt: memory?.updatedAt || null,
  };
}

function sanitizeSnapshot(snapshot) {
  try {
    return createSnapshot(snapshot);
  } catch {
    return null;
  }
}

function createSnapshot(input) {
  return {
    id: (input?.id || randomUUID()).toString(),
    createdAt: input?.createdAt || new Date().toISOString(),
    queries: normalizeStringList(input?.queries, MAX_KEYWORDS),
    focusKeyword: normalizeText(input?.focusKeyword || ""),
    relatedKeywords: normalizeKeywordList(input?.relatedKeywords, MAX_KEYWORDS),
    topKeywords: normalizeStringList(input?.topKeywords, MAX_KEYWORDS),
    questionTitles: normalizeStringList(input?.questionTitles, 8),
    blogTitles: normalizeStringList(input?.blogTitles, MAX_TITLES),
    headlineIdeas: normalizeHeadlineList(input?.headlineIdeas, 18),
  };
}

function normalizeKeywordList(list, maxLength) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      keyword: normalizeText(item?.keyword || ""),
      totalSearch: Number(item?.totalSearch) || 0,
    }))
    .filter((item) => item.keyword)
    .slice(0, maxLength);
}

function normalizeHeadlineList(list, maxLength) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      section: normalizeText(item?.section || ""),
      title: normalizeText(item?.title || ""),
    }))
    .filter((item) => item.section && item.title)
    .slice(0, maxLength);
}

function normalizeStringList(list, maxLength) {
  return [...new Set(
    (Array.isArray(list) ? list : [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
  )].slice(0, maxLength);
}

function normalizeText(value) {
  return (value || "")
    .toString()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/gi, "");
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function buildTokenSet(values) {
  return new Set(values.flatMap((value) => tokenize(value)));
}

function scoreSimilarity(snapshot, currentTokens, focusKey) {
  const snapshotFocus = normalizeKey(snapshot.focusKeyword || snapshot.queries[0] || "");
  let score = 0;

  if (focusKey && snapshotFocus) {
    if (focusKey === snapshotFocus) {
      score += 8;
    } else if (focusKey.includes(snapshotFocus) || snapshotFocus.includes(focusKey)) {
      score += 5;
    }
  }

  const snapshotTokens = buildTokenSet([
    snapshot.focusKeyword,
    ...snapshot.queries,
    ...snapshot.relatedKeywords.map((item) => item.keyword),
    ...snapshot.topKeywords,
    ...snapshot.questionTitles,
  ]);

  let overlap = 0;
  currentTokens.forEach((token) => {
    if (snapshotTokens.has(token)) {
      overlap += 1;
    }
  });

  score += overlap * 2;
  return score;
}

function addCount(map, key, amount) {
  const value = normalizeText(key);
  if (!value) return;
  map.set(value, (map.get(value) || 0) + amount);
}

function toSortedList(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit);
}

function extractHeadlineFrame(focusKeyword, title) {
  const focus = normalizeText(focusKeyword);
  const cleanTitle = normalizeText(title);
  if (!focus || !cleanTitle) return cleanTitle;
  if (cleanTitle.startsWith(focus)) {
    return cleanTitle.slice(focus.length).trim();
  }
  return cleanTitle;
}
