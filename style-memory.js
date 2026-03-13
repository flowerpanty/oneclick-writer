import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.STYLE_MEMORY_DIR
  ? path.resolve(process.env.STYLE_MEMORY_DIR)
  : path.join(ROOT_DIR, "data");
const MEMORY_FILE = process.env.STYLE_MEMORY_FILE
  ? path.resolve(process.env.STYLE_MEMORY_FILE)
  : path.join(DATA_DIR, "style-memory.json");
const MAX_SAMPLE_COUNT = 12;
const MAX_SAMPLE_CHARS = 5000;
const MAX_EXAMPLES = 3;

const STOP_WORDS = new Set([
  "그리고",
  "하지만",
  "그래서",
  "정말",
  "진짜",
  "그냥",
  "이번",
  "오늘",
  "내일",
  "이제",
  "저는",
  "제가",
  "너무",
  "조금",
  "같은",
  "있는",
  "하는",
  "해서",
  "하는데",
  "이야기",
  "느낌",
  "생각",
  "정도",
  "이렇게",
  "그렇게",
  "이건",
  "저는요",
  "정도는",
  "because",
  "with",
  "that",
  "this",
  "from",
  "have",
  "just",
  "really",
]);

const DEFAULT_MEMORY = {
  notes: "",
  samples: [],
  updatedAt: null,
};

function cloneDefaultMemory() {
  return {
    notes: DEFAULT_MEMORY.notes,
    samples: [],
    updatedAt: DEFAULT_MEMORY.updatedAt,
  };
}

export async function loadStyleMemory() {
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizeMemory(parsed);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return cloneDefaultMemory();
    }
    throw err;
  }
}

export async function saveStyleMemory(memory) {
  const sanitized = sanitizeMemory(memory);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MEMORY_FILE, JSON.stringify(sanitized, null, 2), "utf8");
  return sanitized;
}

export async function updateStyleNotes(notes) {
  const memory = await loadStyleMemory();
  memory.notes = normalizeNotes(notes);
  memory.updatedAt = new Date().toISOString();
  return saveStyleMemory(memory);
}

export async function clearStyleMemory() {
  return saveStyleMemory(cloneDefaultMemory());
}

export async function addStyleSample(input) {
  const memory = await loadStyleMemory();
  const sample = createStyleSample(input);
  memory.samples = [...memory.samples, sample].slice(-MAX_SAMPLE_COUNT);
  memory.updatedAt = new Date().toISOString();
  return saveStyleMemory(memory);
}

export function summarizeStyleMemory(memory) {
  const notes = normalizeNotes(memory?.notes || "");
  const samples = Array.isArray(memory?.samples) ? memory.samples : [];
  const texts = samples.map((sample) => sample.text).filter(Boolean);
  const combined = texts.join("\n\n");
  const paragraphs = combined
    .split(/\n{2,}|\n/g)
    .map((value) => value.trim())
    .filter(Boolean);
  const sentences = splitSentences(combined);

  if (!notes && texts.length === 0) {
    return {
      hasData: false,
      sampleCount: 0,
      noteCount: 0,
      toneLabel: "저장된 스타일 데이터 없음",
      sentenceRhythm: "",
      paragraphStyle: "",
      closingStyle: "",
      emojiStyle: "",
      frequentTerms: [],
      examples: [],
    };
  }

  if (texts.length === 0) {
    return {
      hasData: true,
      sampleCount: 0,
      noteCount: notes ? 1 : 0,
      toneLabel: "직접 입력한 메모 중심",
      sentenceRhythm: "샘플 글이 아직 없어 메모를 우선 반영",
      paragraphStyle: "",
      closingStyle: "",
      emojiStyle: "",
      frequentTerms: [],
      examples: [],
    };
  }

  const avgSentenceChars = average(sentences.map((value) => value.length));
  const avgParagraphChars = average(paragraphs.map((value) => value.length));
  const questionCount = countMatches(combined, /[?？]/g);
  const exclamationCount = countMatches(combined, /[!！]/g);
  const emojiMatches = Array.from(new Set(combined.match(/\p{Extended_Pictographic}/gu) || []));
  const politeCount = countMatches(
    combined,
    /(?:요|니다|세요|까요|에요|예요)(?=[.!?…\n]|$)/g
  );
  const casualCount = countMatches(
    combined,
    /(?:했어|있어|같아|이더라|하려고|할까|해도|했지|했네|임|함)(?=[.!?…\n]|$)/g
  );

  let toneLabel = "존댓말/반말이 섞인 편";
  if (politeCount > casualCount * 1.4) {
    toneLabel = "부드러운 존댓말 중심";
  } else if (casualCount > politeCount * 1.4) {
    toneLabel = "가벼운 반말 중심";
  }

  const sentenceRhythm =
    avgSentenceChars < 28
      ? "짧은 문장을 자주 끊어 씀"
      : avgSentenceChars < 55
        ? "짧고 중간 길이 문장을 섞어 씀"
        : "설명형 문장을 비교적 길게 쓰는 편";

  const paragraphStyle =
    avgParagraphChars < 70
      ? "줄바꿈이 잦고 호흡이 빠름"
      : avgParagraphChars < 140
        ? "중간 길이 문단 위주"
        : "긴 문단으로 흐름을 이어가는 편";

  const closingStyle =
    questionCount >= Math.max(2, Math.ceil(sentences.length * 0.18))
      ? "질문형 마무리를 자주 사용"
      : exclamationCount >= Math.max(2, Math.ceil(sentences.length * 0.14))
        ? "강조형 마무리가 자주 보임"
        : "담백하게 끝맺는 편";

  const emojiStyle =
    emojiMatches.length === 0
      ? "이모지 사용이 거의 없음"
      : emojiMatches.length <= 3
        ? `이모지를 가볍게 사용 (${emojiMatches.slice(0, 3).join(" ")})`
        : `이모지를 종종 사용 (${emojiMatches.slice(0, 4).join(" ")})`;

  return {
    hasData: true,
    sampleCount: samples.length,
    noteCount: notes ? 1 : 0,
    toneLabel,
    sentenceRhythm,
    paragraphStyle,
    closingStyle,
    emojiStyle,
    frequentTerms: extractFrequentTerms(combined, 6),
    examples: samples.slice(-MAX_EXAMPLES).reverse().map((sample) => ({
      sourceLabel: sample.sourceLabel,
      sourceType: sample.sourceType,
      excerpt: buildExcerpt(sample.text, 220),
    })),
  };
}

export function buildStyleMemoryPrompt(memory) {
  const sanitized = sanitizeMemory(memory);
  const profile = summarizeStyleMemory(sanitized);

  if (!profile.hasData) {
    return "";
  }

  const lines = [
    "[개인 스타일 메모리]",
    "- 아래 정보는 사용자가 직접 쓴 글/캡션/블로그 문장에서 정리한 문체 참고 자료다.",
    "- 사실 정보와 제품 정보는 현재 입력값을 우선하고, 여기서는 말투/호흡/마무리 방식만 참고한다.",
    "- 저장된 샘플 수: " + profile.sampleCount,
  ];

  [
    ["말투 성향", profile.toneLabel],
    ["문장 호흡", profile.sentenceRhythm],
    ["문단 리듬", profile.paragraphStyle],
    ["마무리 습관", profile.closingStyle],
    ["이모지 습관", profile.emojiStyle],
  ].forEach(([label, value]) => {
    if (value) {
      lines.push(`- ${label}: ${value}`);
    }
  });

  if (profile.frequentTerms.length > 0) {
    lines.push("- 자주 보이는 단어/표현: " + profile.frequentTerms.join(", "));
  }

  if (sanitized.notes) {
    lines.push("- 사용자가 직접 적은 스타일 메모: " + sanitized.notes);
  }

  if (profile.examples.length > 0) {
    lines.push("");
    lines.push("[대표 문체 예시]");
    profile.examples.forEach((example, index) => {
      lines.push(`${index + 1}. (${example.sourceLabel}) "${example.excerpt}"`);
    });
    lines.push("- 위 예시는 그대로 복사하지 말고, 말투의 리듬과 표현 강도만 참고한다.");
  }

  return lines.join("\n");
}

export async function importStyleFromUrl(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl);
  const hostname = new URL(normalizedUrl).hostname.toLowerCase();

  if (hostname.includes("instagram.com")) {
    throw new Error("인스타그램 URL 자동 추출은 1차 버전에서 지원하지 않습니다. 캡션 텍스트를 직접 붙여넣어 주세요.");
  }

  const response = await fetch(normalizedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`URL을 가져오지 못했습니다. (${response.status})`);
  }

  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const imported =
    contentType.includes("text/html") || /<html[\s>]/i.test(raw)
      ? extractReadableHtml(raw)
      : {
          title: hostname,
          text: normalizeSampleText(raw),
        };

  if (imported.text.length < 120) {
    throw new Error("본문이 너무 짧아서 스타일 학습용으로 쓰기 어렵습니다. 직접 글을 붙여넣어 주세요.");
  }

  const memory = await addStyleSample({
    sourceType: "url",
    sourceLabel: imported.title || hostname,
    sourceUrl: normalizedUrl,
    text: imported.text,
  });

  return {
    memory,
    imported: {
      title: imported.title || hostname,
      sourceUrl: normalizedUrl,
      excerpt: buildExcerpt(imported.text, 240),
      charCount: imported.text.length,
    },
  };
}

function sanitizeMemory(memory) {
  const safe = cloneDefaultMemory();
  safe.notes = normalizeNotes(memory?.notes || "");
  safe.samples = Array.isArray(memory?.samples)
    ? memory.samples
      .map((sample) => sanitizeSample(sample))
      .filter(Boolean)
      .slice(-MAX_SAMPLE_COUNT)
    : [];
  safe.updatedAt = memory?.updatedAt || null;
  return safe;
}

function sanitizeSample(sample) {
  try {
    return createStyleSample(sample);
  } catch {
    return null;
  }
}

function createStyleSample(input) {
  const text = normalizeSampleText(input?.text || "");
  if (text.length < 30) {
    throw new Error("스타일 샘플은 최소 30자 이상 필요합니다.");
  }

  return {
    id: (input?.id || randomUUID()).toString(),
    sourceType: normalizeSourceType(input?.sourceType),
    sourceLabel: normalizeLabel(input?.sourceLabel),
    sourceUrl: normalizeOptionalUrl(input?.sourceUrl),
    text,
    createdAt: input?.createdAt || new Date().toISOString(),
  };
}

function normalizeSourceType(sourceType) {
  const value = (sourceType || "").toString().trim().toLowerCase();
  if (["blog", "instagram", "url", "manual"].includes(value)) {
    return value;
  }
  return "manual";
}

function normalizeLabel(label) {
  const value = (label || "").toString().trim();
  if (value) {
    return value.slice(0, 80);
  }
  return "직접 입력 샘플";
}

function normalizeNotes(notes) {
  return (notes || "")
    .toString()
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1600);
}

function normalizeOptionalUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    return normalizeUrl(rawUrl);
  } catch {
    return "";
  }
}

function normalizeUrl(rawUrl) {
  let value = (rawUrl || "").toString().trim();
  if (!value) {
    throw new Error("URL이 비어 있습니다.");
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("http 또는 https 주소만 사용할 수 있습니다.");
  }
  return parsed.toString();
}

function normalizeSampleText(text) {
  const cleaned = (text || "")
    .toString()
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return cleaned.slice(0, MAX_SAMPLE_CHARS);
}

function splitSentences(text) {
  const marked = (text || "").replace(/([다요죠네까])\s+(?=[가-힣A-Za-z0-9])/g, "$1\n");
  return marked
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
}

function average(values) {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function extractFrequentTerms(text, limit) {
  const tokens = (text || "")
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣#]+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .filter((value) => !STOP_WORDS.has(value))
    .filter((value) => !/^\d+$/.test(value));

  const counts = new Map();
  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function buildExcerpt(text, maxLength) {
  const normalized = normalizeSampleText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxLength);
  const lastBoundary = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?"),
    clipped.lastIndexOf("\n"),
    clipped.lastIndexOf(" ")
  );

  const result = lastBoundary >= 100 ? clipped.slice(0, lastBoundary) : clipped;
  return `${result.trim()}...`;
}

function extractReadableHtml(html) {
  const title = decodeHtmlEntities(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""
  )
    .replace(/\s+/g, " ")
    .trim();

  let body =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ||
    html;

  body = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(header|footer|nav|aside|form|button|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|main|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  body = decodeHtmlEntities(body)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const paragraphs = body
    .split(/\n+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 30);

  return {
    title: title || "가져온 글",
    text: normalizeSampleText(paragraphs.join("\n\n")),
  };
}

function decodeHtmlEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
    middot: "·",
  };

  return (text || "")
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match)
    .replace(/&#(\d+);/g, (_, code) => safeFromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeFromCodePoint(parseInt(code, 16)));
}

function safeFromCodePoint(code) {
  if (!Number.isFinite(code) || code <= 0) {
    return "";
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
