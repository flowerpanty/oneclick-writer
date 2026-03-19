export const STORAGE_KEY = "naver-blog-generator-state-v1";

// 브랜드 프리셋 정의
export const BRAND_PRESETS = {
  nothingmatters: {
    key: "nothingmatters",
    label: "낫띵메터스",
    category: "쿠키",
    defaultName: "낫띵메터스",
    defaultProducts: "",
    defaultDescription: ""
  },
  nothingnormalnow: {
    key: "nothingnormalnow",
    label: "낫띵노말나우",
    category: "가방",
    defaultName: "낫띵노말나우",
    defaultProducts: "",
    defaultDescription: ""
  }
};

export const defaultState = {
  // 브랜드 프로필
  activeBrand: "nothingmatters",
  brandProfiles: {
    nothingmatters: { name: "낫띵메터스", products: "", description: "" },
    nothingnormalnow: { name: "낫띵노말나우", products: "", description: "" }
  },
  // 기존 필드
  topic: "",
  intent: "정보형",
  brandType: "비브랜드형",
  tone: "전문적이지만 사람이 정리해주는 듯한 부드러운 톤",
  brandContext: "비브랜드형",
  writingGoal: "검색유입",
  direction: "자동",
  targetIntent: "자동",
  brandName: "",
  ctaMode: "없음",
  preferredTone: "",
  naverEditorLabel: "✍️ 에디터 노트",
  researchDataText: "",
  researchAnalysisPrompt: "",
  researchAnalysisText: "",
  step1Prompt: "",
  step1ResultText: "",
  selectedTitle: "",
  step2Prompt: "",
  step2ResultText: "",
  step3Prompt: "",
  step3ResultText: ""
};

export const STEP1_EXPECTED_PACKAGE_COUNT = 8;

const STEP1_INTENT_FAMILY_RULES = {
  정보형: {
    allowedTitleTypes: ["정보형"],
    blocked: [/후기|리뷰|먹어본|받아본|써본|사용기|추천|추천형|구매|전환/i],
    preferred: [/기준|체크|체크리스트|확인|정리|가이드|방법|포인트|실수|보관|포장|예산|주문 전/i]
  },
  비교형: {
    allowedTitleTypes: ["비교형"],
    blocked: [/후기|리뷰|먹어본|받아본|써본|사용기|추천|추천형/i],
    preferred: [/vs|비교|차이|장단점|무엇이 더|선택 기준/i]
  },
  후기형: {
    allowedTitleTypes: ["후기형"],
    blocked: [/체크리스트|주문 전 확인|가이드 정리|추천형/i],
    preferred: [/후기|리뷰|먹어본|받아본|써본|사용기|체감|반응/i]
  },
  추천형: {
    allowedTitleTypes: ["추천형"],
    blocked: [/후기|리뷰|먹어본|받아본|써본|사용기/i],
    preferred: [/추천|상황별|선택지|어울리는|제안|고르는 법/i]
  }
};


export function loadState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return { ...defaultState };
  }

  try {
    return {
      ...defaultState,
      ...JSON.parse(saved)
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  const current = loadState();
  const preserved = {
    activeBrand: current.activeBrand || "nothingmatters",
    brandProfiles: current.brandProfiles || defaultState.brandProfiles
  };
  const fresh = { ...defaultState, ...preserved };
  saveState(fresh);
  return fresh;
}

export function updateField(state, key, value) {
  state[key] = value;
  saveState(state);
}

export function bindStateInput(element, state, key, options = {}) {
  const {
    eventName = "input",
    fallback = "",
    transform = (value) => value,
    afterChange = null
  } = options;

  if (!element) {
    return;
  }

  element.value = state[key] ?? fallback;
  element.addEventListener(eventName, (event) => {
    updateField(state, key, transform(event.target.value));

    if (afterChange) {
      afterChange(event.target.value);
    }
  });
}

export function safeParseJson(value) {
  const result = parseJsonWithRepair(value);
  return result ? result.data : null;
}

export function readJsonTextarea(value) {
  const parsed = parseJsonWithRepair(value);
  return parsed?.data ?? value;
}

export function getStep1Result(state) {
  return safeParseJson(state.step1ResultText);
}

export function getResearchAnalysisResult(state) {
  return safeParseJson(state.researchAnalysisText);
}

export function getStep2Result(state) {
  return safeParseJson(state.step2ResultText);
}

export function getStep3Result(state) {
  return parseStep3Deliverable(state.step3ResultText);
}

function resolveStep1Payload(source) {
  if (!source) {
    return null;
  }

  if (typeof source === "object" && "step1ResultText" in source) {
    return getStep1Result(source);
  }

  return source;
}

function normalizeOutlineItem(item) {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  return String(
    item.heading ||
      item.section_title ||
      item.title ||
      item.label ||
      item.section_purpose ||
      item.description ||
      ""
  ).trim();
}

function normalizeLegacyStep1Package(item, index) {
  return {
    package_id: item?.package_id ?? index + 1,
    title: item?.title || "",
    title_type: item?.title_type || "",
    main_keyword: item?.main_keyword || "",
    sub_keywords: Array.isArray(item?.sub_keywords) ? item.sub_keywords : [],
    search_intent: item?.search_intent || "",
    reader_problem: item?.reader_problem || "",
    article_angle: item?.article_angle || "",
    why_this_title_works: item?.why_this_title_works || "",
    outline: Array.isArray(item?.outline) ? item.outline.map(normalizeOutlineItem).filter(Boolean) : [],
    brand_connection_hint: item?.brand_connection_hint || item?.brand_integration_point || "",
    cta_direction: item?.cta_direction || ""
  };
}

export function getStep1Packages(source) {
  const parsed = resolveStep1Payload(source);

  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed.packages)) {
    return parsed.packages.map((item, index) => normalizeLegacyStep1Package(item, index));
  }

  if (Array.isArray(parsed.titles)) {
    return parsed.titles.map((item, index) => normalizeLegacyStep1Package(item, index));
  }

  return [];
}

export function getPackageOutline(packageItem) {
  return Array.isArray(packageItem?.outline)
    ? packageItem.outline.map(normalizeOutlineItem).filter(Boolean).slice(0, 3)
    : [];
}

export function getSelectedStep1Package(state) {
  const packages = getStep1Packages(state);

  if (packages.length === 0) {
    return null;
  }

  return (
    packages.find((item) => item.title === state.selectedTitle) ||
    packages.find((item) => item.package_id === state.selectedPackageId) ||
    packages[0]
  );
}

function normalizeComparableText(value) {
  return String(value || "").trim();
}

export function getStep1ResultMismatchMessages(state) {
  const parsed = getStep1Result(state);

  if (!parsed) {
    return [];
  }

  const messages = [];
  const currentTopic = normalizeComparableText(state.topic);
  const currentIntent = normalizeComparableText(state.intent);
  const resultTopic = normalizeComparableText(parsed.topic);
  const resultIntent = normalizeComparableText(parsed.intent);

  if (currentTopic && resultTopic && currentTopic !== resultTopic) {
    messages.push(`현재 주제는 "${currentTopic}"인데 붙여넣은 STEP 1 결과는 "${resultTopic}" 기준입니다.`);
  }

  if (currentIntent && resultIntent && currentIntent !== resultIntent) {
    messages.push(`현재 검색의도는 "${currentIntent}"인데 붙여넣은 STEP 1 결과는 "${resultIntent}" 기준입니다.`);
  }

  return messages;
}

export function getResearchAnalysisMismatchMessages(state) {
  const parsed = getResearchAnalysisResult(state);

  if (!parsed) {
    return [];
  }

  const messages = [];
  const currentTopic = normalizeComparableText(state.topic);
  const currentIntent = normalizeComparableText(state.intent);
  const resultTopic = normalizeComparableText(parsed.topic);
  const resultIntent = normalizeComparableText(parsed.intent);

  if (currentTopic && resultTopic && currentTopic !== resultTopic) {
    messages.push(`현재 주제는 "${currentTopic}"인데 붙여넣은 분석 결과는 "${resultTopic}" 기준입니다.`);
  }

  if (currentIntent && resultIntent && currentIntent !== resultIntent) {
    messages.push(`현재 검색의도는 "${currentIntent}"인데 붙여넣은 분석 결과는 "${resultIntent}" 기준입니다.`);
  }

  return messages;
}

export function getResearchAnalysisValidationMessages(state) {
  const parsed = getResearchAnalysisResult(state);

  if (!parsed) {
    return [];
  }

  const messages = [];

  if (normalizeComparableText(parsed.error)) {
    messages.push(`수집 데이터 분석 결과가 실패 JSON으로 반환되었습니다: ${normalizeComparableText(parsed.reason || parsed.error)}`);
  }

  const priorityAngles = Array.isArray(parsed.step1_direction?.priority_angles)
    ? parsed.step1_direction.priority_angles.filter(Boolean)
    : [];

  if (priorityAngles.length === 0) {
    messages.push("분석 결과에 STEP 1 우선 생성 각도(priority_angles)가 없습니다.");
  }

  return messages;
}

export function isStep1PackageIntentAligned(item, intent) {
  const normalizedIntent = normalizeComparableText(intent);

  if (!normalizedIntent || !STEP1_INTENT_FAMILY_RULES[normalizedIntent]) {
    return true;
  }

  const config = STEP1_INTENT_FAMILY_RULES[normalizedIntent];
  const titleType = normalizeComparableText(item?.title_type);
  const combinedText = [
    item?.title,
    item?.search_intent,
    item?.article_angle,
    item?.reader_problem,
    item?.why_this_title_works
  ]
    .filter(Boolean)
    .join(" ");

  if (titleType !== normalizedIntent) {
    return false;
  }

  if (config.blocked.some((pattern) => pattern.test(combinedText))) {
    return false;
  }

  if (!config.allowedTitleTypes.includes(titleType)) {
    return false;
  }

  return true;
}

export function getStep1ResultValidationMessages(state) {
  const parsed = getStep1Result(state);

  if (!parsed) {
    return [];
  }

  const packages = getStep1Packages(parsed);
  const messages = [];
  const targetIntent = normalizeComparableText(parsed.intent || state.intent);

  if (normalizeComparableText(parsed.error)) {
    messages.push(`STEP 1 생성 결과가 실패 JSON으로 반환되었습니다: ${normalizeComparableText(parsed.reason || parsed.error)}`);
    return messages;
  }

  if (packages.length !== STEP1_EXPECTED_PACKAGE_COUNT) {
    messages.push(`STEP 1 결과 패키지는 ${STEP1_EXPECTED_PACKAGE_COUNT}개여야 하는데 현재 ${packages.length}개입니다.`);
  }

  if (targetIntent) {
    const offIntentCount = packages.filter((item) => !isStep1PackageIntentAligned(item, targetIntent)).length;

    if (offIntentCount > 0) {
      messages.push(`"${targetIntent}" 기준에서 벗어난 패키지 ${offIntentCount}개가 섞여 있습니다.`);
    }
  }

  return messages;
}

export function ensureSelectedTitle(state) {
  const packages = getStep1Packages(state);

  if (packages.length === 0) {
    if (state.selectedTitle) {
      state.selectedTitle = "";
      saveState(state);
    }
    return "";
  }

  const selectedExists = packages.some((item) => item.title === state.selectedTitle);

  if (!selectedExists) {
    state.selectedTitle = packages[0].title || "";
    saveState(state);
  }

  return state.selectedTitle;
}

export async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "요청에 실패했습니다.");
  }

  return data;
}

export function setButtonBusy(button, isBusy, busyLabel) {
  if (!button) {
    return;
  }

  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent;
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : button.dataset.originalLabel;
  button.style.opacity = isBusy ? "0.7" : "1";
}

let toastTimer = null;

export function showToast(toastElement, message) {
  if (!toastElement) {
    return;
  }

  toastElement.textContent = message;
  toastElement.classList.add("visible");

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastElement.classList.remove("visible");
  }, 2200);
}

export async function copyTextarea(targetId, toastElement) {
  const textarea = document.getElementById(targetId);
  const value = textarea?.value || "";

  if (!value.trim()) {
    showToast(toastElement, "복사할 내용이 없습니다.");
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      showToast(toastElement, "클립보드에 복사했습니다.");
      return true;
    }
  } catch {
    // clipboard API가 막히면 아래 fallback으로 재시도한다.
  }

  if (fallbackCopyWithEvent(value)) {
    showToast(toastElement, "클립보드에 복사했습니다.");
    return true;
  }

  const fallbackSucceeded = fallbackCopyText(value);

  if (fallbackSucceeded) {
    showToast(toastElement, "클립보드에 복사했습니다.");
    return true;
  }

  revealAndSelectTextarea(textarea);
  showToast(toastElement, "자동 복사는 실패했습니다. 텍스트를 선택해 두었으니 Ctrl+C(또는 Cmd+C)를 눌러 주세요.");
  return false;
}

function fallbackCopyWithEvent(value) {
  const handleCopy = (event) => {
    event.preventDefault();
    event.clipboardData?.setData("text/plain", value);
  };

  document.addEventListener("copy", handleCopy);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", handleCopy);
  }
}

function fallbackCopyText(value) {
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.top = "-1000px";
  helper.style.left = "-1000px";
  helper.style.opacity = "0";

  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(helper);
  }
}

function revealAndSelectTextarea(textarea) {
  if (!textarea) {
    return;
  }

  const details = textarea.closest("details");

  if (details) {
    details.open = true;
  }

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
}

export function clearTextareaField({
  textarea,
  state,
  key,
  toastElement = null,
  message = "내용을 비웠습니다.",
  afterClear = null
}) {
  if (!textarea) {
    return;
  }

  textarea.value = "";
  updateField(state, key, "");

  if (afterClear) {
    afterClear();
  }

  if (toastElement) {
    showToast(toastElement, message);
  }
}

export async function refreshServiceStatus(container, toastElement = null) {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    renderServiceStatus(container, data.apiAvailability || {});
  } catch (error) {
    renderServiceStatus(container, {});

    if (toastElement) {
      showToast(toastElement, `상태 확인 실패: ${error.message}`);
    }
  }
}

export function renderServiceStatus(container, availability) {
  if (!container) {
    return;
  }

  const services = [
    { key: "searchApi", label: "검색 API" },
    { key: "dataLabApi", label: "데이터랩" },
    { key: "searchAdApi", label: "검색광고" }
  ];

  container.innerHTML = services
    .map(({ key, label }) => {
      const active = availability[key];
      return `<span class="status-pill ${active ? "active" : "inactive"}">${label} ${
        active ? "연결됨" : "미설정"
      }</span>`;
    })
    .join("");
}

export function renderResearchMetrics(container, research) {
  if (!container) {
    return;
  }

  const metrics = [
    { label: "블로그 제목/요약", count: research?.scope?.blog_titles_count || 0 },
    { label: "블로그 본문", count: research?.scope?.blog_bodies_count || 0 },
    { label: "카페 글", count: research?.scope?.cafe_count || 0 },
    { label: "연관 키워드", count: research?.scope?.ad_keywords_count || 0 }
  ];

  container.innerHTML = metrics
    .map(
      (metric) => `
        <div class="metric-card">
          <span>${metric.label}</span>
          <strong>${metric.count}건</strong>
        </div>
      `
    )
    .join("");
}

export function renderResearchWarning(container, research) {
  if (!container) {
    return;
  }

  if (!research) {
    container.textContent = "데이터를 아직 불러오지 않았거나 JSON 형식이 아닙니다.";
    return;
  }

  const warnings = Array.isArray(research.warnings) ? research.warnings : [];
  container.textContent =
    warnings.length > 0
      ? warnings.join(" / ")
      : `${research.generated_at || ""} 기준으로 수집된 데이터입니다.`;
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value = "") {
  return escapeHtml(value);
}

export function sanitizePreviewHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "");
}

function stripCodeFence(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function findNextNonWhitespace(text, startIndex) {
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (!/\s/.test(char)) {
      return char;
    }
  }

  return "";
}

export function repairJsonText(value) {
  let text = stripCodeFence(value)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");

  // Curly quotes and markdown escapes are common in copied AI outputs.
  text = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\([_!~<>])/g, "$1");

  let output = "";
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      if (char === '"') {
        inString = true;
      }

      output += char;
      continue;
    }

    if (char === "\\") {
      const next = text[index + 1];

      if (!next) {
        continue;
      }

      if (/[\\/"bfnrt]/.test(next)) {
        output += char + next;
        index += 1;
        continue;
      }

      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) {
        output += text.slice(index, index + 6);
        index += 5;
        continue;
      }

      output += next;
      index += 1;
      continue;
    }

    if (char === '"') {
      const nextToken = findNextNonWhitespace(text, index + 1);

      if ([":", ",", "}", "]", ""].includes(nextToken)) {
        inString = false;
        output += char;
      } else {
        output += '\\"';
      }

      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }

    output += char;
  }

  return output;
}

export function parseJsonWithRepair(value) {
  if (!value || !String(value).trim()) {
    return null;
  }

  const raw = String(value);

  try {
    return {
      data: JSON.parse(raw),
      repaired: false,
      repairedText: raw
    };
  } catch {
    const repairedText = repairJsonText(raw);

    try {
      return {
        data: JSON.parse(repairedText),
        repaired: repairedText !== raw,
        repairedText
      };
    } catch {
      return null;
    }
  }
}

function stripMarkdownDecorations(value = "") {
  return String(value)
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\*\*(.*?)\*\*\s*$/, "$1")
    .trim();
}

function extractSectionBlock(text, label) {
  const pattern = new RegExp(`(^|\\n)\\s*(?:#{1,6}\\s*)?${label}\\s*(?:\\n|$)`, "i");
  const match = pattern.exec(text);

  if (!match) {
    return null;
  }

  return {
    headerStart: match.index + match[1].length,
    contentStart: match.index + match[0].length
  };
}

function extractHtmlCodeBlock(block = "") {
  const fenced = String(block).match(/```(?:html)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : String(block).trim();
}

function stripHtmlToText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildDerivedExcerpt(value = "", maxLength = 140) {
  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function parseSectionedStep3Result(rawValue) {
  const text = String(rawValue || "").replace(/\r\n?/g, "\n").trim();

  if (!text) {
    return null;
  }

  const naverMarker = extractSectionBlock(text, "NAVER_VERSION");
  const wordpressMarker = extractSectionBlock(text, "WORDPRESS_VERSION");

  if (!naverMarker || !wordpressMarker || wordpressMarker.headerStart <= naverMarker.headerStart) {
    return null;
  }

  const naverBlock = text.slice(naverMarker.contentStart, wordpressMarker.headerStart).trim();
  const wordpressBlock = text.slice(wordpressMarker.contentStart).trim();

  if (!naverBlock || !wordpressBlock) {
    return null;
  }

  const naverLines = naverBlock.split("\n");
  const firstLineIndex = naverLines.findIndex((line) => stripMarkdownDecorations(line));
  const titleLine = firstLineIndex >= 0 ? naverLines[firstLineIndex] : "";
  const naverTitle = stripMarkdownDecorations(titleLine);
  const naverBody =
    firstLineIndex >= 0
      ? naverLines
          .filter((_, index) => index !== firstLineIndex)
          .join("\n")
          .trim()
      : naverBlock;

  const wordpressHtml = extractHtmlCodeBlock(wordpressBlock);
  const h1Match = wordpressHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const wordpressTitle = stripHtmlToText(h1Match?.[1] || "") || naverTitle;
  const htmlText = stripHtmlToText(wordpressHtml);
  const excerptSource = htmlText || naverBody || naverBlock;

  return {
    format: "sectioned",
    naver: {
      title: naverTitle,
      body: naverBody || naverBlock,
      fullText: naverBlock
    },
    wordpress: {
      title: wordpressTitle,
      html: wordpressHtml,
      excerpt: buildDerivedExcerpt(excerptSource)
    }
  };
}

function parseLegacyStep3Json(rawValue) {
  const parsed = parseJsonWithRepair(rawValue)?.data;

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const naverTitle = parsed.title_package?.seo_title || parsed.wordpress_version?.html_title || "";
  const naverBody = parsed.naver_blog_version?.full_text || "";
  const wordpressTitle = parsed.wordpress_version?.html_title || naverTitle;
  const wordpressHtml = parsed.wordpress_version?.html_body || "";
  const wordpressExcerpt = parsed.wordpress_version?.excerpt || parsed.meta_package?.meta_description || "";

  if (!naverTitle && !naverBody && !wordpressHtml) {
    return null;
  }

  return {
    format: "legacy_json",
    naver: {
      title: naverTitle,
      body: naverBody,
      fullText: naverBody
    },
    wordpress: {
      title: wordpressTitle,
      html: wordpressHtml,
      excerpt: wordpressExcerpt || buildDerivedExcerpt(stripHtmlToText(wordpressHtml || naverBody))
    }
  };
}

export function parseStep3Deliverable(value) {
  if (!value || !String(value).trim()) {
    return null;
  }

  return parseSectionedStep3Result(value) || parseLegacyStep3Json(value);
}

export function normalizeJsonTextareaInput({
  textarea,
  state,
  key,
  toastElement = null,
  successMessage = "JSON을 자동 보정했습니다."
}) {
  if (!textarea) {
    return null;
  }

  const parsed = parseJsonWithRepair(textarea.value);

  if (!parsed) {
    updateField(state, key, textarea.value);
    return null;
  }

  const normalizedText = JSON.stringify(parsed.data, null, 2);

  if (parsed.repaired || textarea.value !== normalizedText) {
    textarea.value = normalizedText;

    if (toastElement && parsed.repaired) {
      showToast(toastElement, successMessage);
    }
  }

  updateField(state, key, normalizedText);
  return parsed.data;
}

export function getStepStatusSummary(state) {
  const analysis = getResearchAnalysisResult(state);
  const step1 = getStep1Result(state);
  const step2 = getStep2Result(state);
  const step3 = getStep3Result(state);
  const research = safeParseJson(state.researchDataText);

  return {
    step1Ready: Boolean(state.topic.trim() && research && analysis),
    step1Done: Boolean(step1),
    step2Ready: Boolean(step1 && ensureSelectedTitle(state)),
    step2Done: Boolean(step2),
    step3Ready: Boolean(step1 && step2),
    step3Done: Boolean(step3),
    researchDone: Boolean(research),
    analysisDone: Boolean(analysis)
  };
}

export function renderProjectSnapshot(container, state) {
  if (!container) {
    return;
  }

  const step1 = getStep1Result(state);
  const step2 = getStep2Result(state);
  const step3 = getStep3Result(state);
  const research = safeParseJson(state.researchDataText);
  const analysis = getResearchAnalysisResult(state);

  container.innerHTML = `
    <div class="summary-grid">
      <div class="meta-block">
        <strong>주제</strong>
        <p>${escapeHtml(state.topic || "[미입력]")}</p>
      </div>
      <div class="meta-block">
        <strong>검색의도</strong>
        <p>${escapeHtml(state.intent || "[미입력]")}</p>
      </div>
      <div class="meta-block">
        <strong>선택 제목</strong>
        <p>${escapeHtml(state.selectedTitle || "[미선택]")}</p>
      </div>
      <div class="meta-block">
        <strong>진행 상태</strong>
        <p>수집 ${research ? "완료" : "대기"} / 분석 ${analysis ? "완료" : "대기"} / STEP1 ${
          step1 ? "완료" : "대기"
        } / STEP2 ${step2 ? "완료" : "대기"} / STEP3 ${step3 ? "완료" : "대기"}</p>
      </div>
    </div>
  `;
}
