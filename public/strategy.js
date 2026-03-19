const RESEARCH_SNAPSHOT_STORAGE_KEY = "naverResearch:lastSnapshot";
const STRATEGY_SETTINGS_STORAGE_KEY = "naverStrategy:settings";
const STRATEGY_SESSION_STORAGE_KEY = "naverStrategy:lastSession";

const $ = (id) => document.getElementById(id);

const els = {
  step1: $("step1"),
  step2: $("step2"),
  step3: $("step3"),
  step4: $("step4"),
  conn1: $("conn1"),
  conn2: $("conn2"),
  conn3: $("conn3"),
  brandNameInput: $("brandNameInput"),
  blogTypeInput: $("blogTypeInput"),
  primaryCategoryInput: $("primaryCategoryInput"),
  targetAudienceInput: $("targetAudienceInput"),
  toneInput: $("toneInput"),
  avoidInput: $("avoidInput"),
  goalsInput: $("goalsInput"),
  researchDataInput: $("researchDataInput"),
  snapshotMeta: $("snapshotMeta"),
  buildPromptBtn: $("buildPromptBtn"),
  copyPromptBtn: $("copyPromptBtn"),
  autoGenerateBtn: $("autoGenerateBtn"),
  loadResearchBtn: $("loadResearchBtn"),
  resetBtn: $("resetBtn"),
  promptOutput: $("promptOutput"),
  resultOutput: $("resultOutput"),
  resultPreview: $("resultPreview"),
  resultPreviewHint: $("resultPreviewHint"),
  expandAllStepsBtn: $("expandAllStepsBtn"),
  collapseAllStepsBtn: $("collapseAllStepsBtn"),
  copyResultBtn: $("copyResultBtn"),
  clearResultBtn: $("clearResultBtn"),
  step7SelectionMeta: $("step7SelectionMeta"),
  step7SelectionBoard: $("step7SelectionBoard"),
  step7SelectionSummary: $("step7SelectionSummary"),
  step7AutoSelectBtn: $("step7AutoSelectBtn"),
  step7ClearSelectionBtn: $("step7ClearSelectionBtn"),
  step7BuildPromptBtn: $("step7BuildPromptBtn"),
  step7AutoGenerateBtn: $("step7AutoGenerateBtn"),
  step7CopyPromptBtn: $("step7CopyPromptBtn"),
  step7ClearPromptBtn: $("step7ClearPromptBtn"),
  step7PromptOutput: $("step7PromptOutput"),
  step7CopyResultBtn: $("step7CopyResultBtn"),
  step7ClearResultBtn: $("step7ClearResultBtn"),
  step7ResultOutput: $("step7ResultOutput"),
  step7Preview: $("step7Preview"),
  step7PreviewHint: $("step7PreviewHint"),
  statusText: $("statusText"),
  errorText: $("errorText"),
  progressContainer: $("progressContainer"),
  progressBar: $("progressBar"),
  progressLog: $("progressLog"),
};

const state = {
  prompt: "",
  result: "",
  snapshot: null,
  health: null,
  strategyJson: null,
  step7SelectionGroups: [],
  step7SelectionLookup: new Map(),
  step7SelectedIds: new Set(),
  step7Prompt: "",
  step7Result: "",
  resultRepairTicket: 0,
  step7RepairTicket: 0,
};

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStep(active) {
  const steps = [els.step1, els.step2, els.step3, els.step4].filter(Boolean);
  const conns = [els.conn1, els.conn2, els.conn3].filter(Boolean);

  steps.forEach((step, index) => {
    step.classList.remove("active", "done");
    if (index + 1 < active) step.classList.add("done");
    if (index + 1 === active) step.classList.add("active");
  });

  conns.forEach((conn, index) => {
    conn.classList.toggle("done", index + 1 < active);
  });
}

function inferStep() {
  if (els.resultOutput.value.trim()) return 4;
  if (els.promptOutput.value.trim()) return 3;
  if (els.researchDataInput.value.trim()) return 2;
  return 1;
}

function syncStep() {
  setStep(inferStep());
}

function setStatus(message = "") {
  els.statusText.textContent = message;
}

function setError(message = "") {
  els.errorText.textContent = message;
}

function setProgressLines(lines = []) {
  if (!lines.length) {
    els.progressContainer.classList.remove("visible");
    els.progressLog.innerHTML = "";
    els.progressBar.style.width = "0%";
    els.progressBar.classList.remove("indeterminate");
    return;
  }

  els.progressContainer.classList.add("visible");
  els.progressLog.innerHTML = lines
    .map((line) => `<div class="log-line">${escapeHtml(line)}</div>`)
    .join("");
}

function setProgress(percent = 0) {
  els.progressContainer.classList.add("visible");
  els.progressBar.classList.remove("indeterminate");
  els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function renderInlineText(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function setStepToggleAvailability(enabled) {
  els.expandAllStepsBtn.disabled = !enabled;
  els.collapseAllStepsBtn.disabled = !enabled;
}

function setResultPreviewHint(message = "") {
  if (els.resultPreviewHint) {
    els.resultPreviewHint.textContent = message;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
}

function extractJsonObjectText(raw) {
  const input = (raw || "").trim();
  if (!input) return "";

  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return input.slice(start, end + 1).trim();
  }

  return input;
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

function sanitizeJsonStringCandidate(text) {
  const source = (text || "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  let result = "";
  let inString = false;

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];

    if (inString) {
      if (ch === "\\") {
        const next = source[index + 1];

        if (typeof next === "undefined") {
          result += "\\\\";
          continue;
        }

        if (/[\"\\/bfnrt]/.test(next)) {
          result += ch + next;
          index += 1;
          continue;
        }

        if (next === "u") {
          const unicodeChunk = source.slice(index + 2, index + 6);
          if (/^[0-9a-fA-F]{4}$/.test(unicodeChunk)) {
            result += `\\u${unicodeChunk}`;
            index += 5;
            continue;
          }
        }

        if (RELAXED_LITERAL_ESCAPE_CHARS.has(next)) {
          result += next;
          index += 1;
          continue;
        }

        result += `\\\\${next}`;
        index += 1;
        continue;
      }

      if (ch === '"') {
        if (looksLikeJsonStringBoundary(source, index)) {
          inString = false;
          result += ch;
        } else {
          result += '\\"';
        }
        continue;
      }

      if (ch === "\n") {
        result += "\\n";
        continue;
      }

      if (ch === "\r") {
        continue;
      }

      if (ch === "\t") {
        result += "\\t";
        continue;
      }

      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
    }
    result += ch;
  }

  return result.replace(/,\s*([}\]])/g, "$1");
}

function normalizeLikelyJsonMistakes(raw) {
  const normalized = (raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .trim();

  return sanitizeJsonStringCandidate(normalized);
}

function tryParseStrategyJson(raw) {
  const candidate = extractJsonObjectText(raw);
  if (!candidate) return { data: null, repaired: false };

  const attempts = [
    { text: candidate, repaired: false },
    { text: normalizeLikelyJsonMistakes(candidate), repaired: true }
  ];

  for (const attempt of attempts) {
    if (!attempt.text) continue;
    try {
      const parsed = JSON.parse(attempt.text);
      if (isPlainObject(parsed)) {
        return { data: parsed, repaired: attempt.repaired };
      }
    } catch {
      // try next normalized form
    }
  }

  return { data: null, repaired: false };
}

async function repairJsonViaServer(raw) {
  const response = await fetch("/api/json/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || "JSON 자동 보정에 실패했어요.");
  }
  return json;
}

function renderSimpleList(items, ordered = false) {
  const safeItems = toStringArray(items);
  if (!safeItems.length) {
    return '<div class="result-json-empty">내용이 없습니다.</div>';
  }

  const tag = ordered ? "ol" : "ul";
  return [
    `<${tag} class="result-preview-list${ordered ? " ordered" : ""}">`,
    safeItems.map((item) => `<li>${renderInlineText(item)}</li>`).join(""),
    `</${tag}>`
  ].join("");
}

function renderParagraphs(items) {
  const safeItems = toStringArray(items);
  if (!safeItems.length) {
    return '<div class="result-json-empty">내용이 없습니다.</div>';
  }

  return safeItems
    .map((item) => `<p class="result-preview-text">${renderInlineText(item)}</p>`)
    .join("");
}

function renderCodeBlock(value) {
  const text = toText(value);
  if (!text) {
    return '<div class="result-json-empty">내용이 없습니다.</div>';
  }

  return `<pre class="result-code-block"><code>${escapeHtml(text)}</code></pre>`;
}

function toHtmlParagraphs(items) {
  return toStringArray(items)
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("\n");
}

const SUMMARY_BOX_TITLE_MAP = {
  spec: "먼저 보면 좋은 핵심 정보",
  comparison: "비교 전에 볼 포인트",
  checklist: "고르기 전에 체크할 것",
  decision: "이럴 때 이렇게 보면 쉬워요",
  situation: "이런 상황이면 더 잘 맞아요",
  guide: "읽기 전에 핵심만 먼저",
  point: "이 부분이 핵심이에요",
};

function getSummaryBoxType(summaryBox) {
  return toText(summaryBox?.boxType).toLowerCase();
}

function getSummaryBoxTitle(summaryBox) {
  const customTitle = toText(summaryBox?.title);
  if (customTitle) return customTitle;
  return SUMMARY_BOX_TITLE_MAP[getSummaryBoxType(summaryBox)] || "한눈에 보면 이런 흐름이에요";
}

function getSummaryBoxRows(summaryBox, section) {
  const dynamicRows = Array.isArray(summaryBox?.items)
    ? summaryBox.items
      .map((item, index) => {
        if (isPlainObject(item)) {
          return {
            label: toText(item.label) || `포인트 ${index + 1}`,
            value: toText(item.value),
          };
        }
        return {
          label: `포인트 ${index + 1}`,
          value: toText(item),
        };
      })
      .filter((row) => row.value)
    : [];

  if (dynamicRows.length) return dynamicRows;

  return [
    { label: "브랜드", value: toText(summaryBox?.brand) },
    { label: "제품명", value: toText(summaryBox?.productName) || toText(section?.productName) },
    { label: "가격", value: toText(summaryBox?.price) || toText(section?.price) },
    { label: "사이즈", value: toText(summaryBox?.size) || toText(section?.size) },
    { label: "소재", value: toText(summaryBox?.material) },
    { label: "컬러", value: toText(summaryBox?.color) },
  ].filter((row) => row.value);
}

function getSummaryBoxFeatureLabel(summaryBox) {
  const type = getSummaryBoxType(summaryBox);
  if (type === "comparison") return "비교 포인트";
  if (type === "checklist") return "체크 포인트";
  if (type === "decision") return "판단 기준";
  if (type === "situation") return "추천 상황";
  if (type === "guide") return "핵심 포인트";
  return "특징";
}

function getSummaryBoxRecommendLabel(summaryBox) {
  const type = getSummaryBoxType(summaryBox);
  if (type === "comparison") return "이럴 때 더 맞아요";
  if (type === "checklist") return "실전 팁";
  if (type === "decision") return "추천 포인트";
  if (type === "situation") return "잘 맞는 상황";
  if (type === "guide") return "적용 포인트";
  return "추천 포인트";
}

function hasSummaryBoxContent(summaryBox, section) {
  return Boolean(
    toText(summaryBox?.title)
    || toText(summaryBox?.intro)
    || getSummaryBoxRows(summaryBox, section).length
    || toStringArray(summaryBox?.features).length
    || toStringArray(summaryBox?.recommendPoints).length
    || toText(summaryBox?.takeaway)
    || toText(summaryBox?.caution)
  );
}

function buildStructuredHtmlBody(featuredDraftInput) {
  const featuredDraft = isPlainObject(featuredDraftInput) ? featuredDraftInput : {};
  const chunks = [];

  if (toText(featuredDraft.title)) {
    chunks.push(`<p><strong>${escapeHtml(toText(featuredDraft.title))}</strong></p>`);
  }

  if (toText(featuredDraft.subtitle)) {
    chunks.push(`<p><strong>${escapeHtml(toText(featuredDraft.subtitle))}</strong></p>`);
  }

  const introHtml = toHtmlParagraphs(featuredDraft.intro);
  if (introHtml) chunks.push(introHtml);

  (Array.isArray(featuredDraft.bodySections) ? featuredDraft.bodySections : []).forEach((section) => {
    if (toText(section?.heading)) {
      chunks.push(`<h2>${escapeHtml(toText(section.heading))}</h2>`);
    }
    if (toText(section?.subHeading)) {
      chunks.push(`<h3>${escapeHtml(toText(section.subHeading))}</h3>`);
    }

    const summaryBox = isPlainObject(section?.summaryBox) ? section.summaryBox : {};
    const summaryRows = getSummaryBoxRows(summaryBox, section);
    const summaryIntro = toText(summaryBox.intro);
    const summaryTitle = getSummaryBoxTitle(summaryBox);
    const takeaway = toText(summaryBox.takeaway);
    const caution = toText(summaryBox.caution);
    const features = toStringArray(summaryBox.features);
    const recommendPoints = toStringArray(summaryBox.recommendPoints);

    if (hasSummaryBoxContent(summaryBox, section)) {
      chunks.push([
        "<div>",
        summaryTitle ? `<p><strong>${escapeHtml(summaryTitle)}</strong></p>` : "",
        summaryIntro ? `<p>${escapeHtml(summaryIntro)}</p>` : "",
        ...summaryRows.map((row) => `<p><strong>${escapeHtml(row.label)}</strong> ${escapeHtml(row.value)}</p>`),
        takeaway ? `<p><strong>한줄 결론</strong> ${escapeHtml(takeaway)}</p>` : "",
        caution ? `<p><strong>주의 포인트</strong> ${escapeHtml(caution)}</p>` : "",
        features.length ? `<p><strong>${escapeHtml(getSummaryBoxFeatureLabel(summaryBox))}</strong> ${escapeHtml(features.join(", "))}</p>` : "",
        recommendPoints.length ? `<p><strong>${escapeHtml(getSummaryBoxRecommendLabel(summaryBox))}</strong> ${escapeHtml(recommendPoints.join(", "))}</p>` : "",
        "</div>",
      ].filter(Boolean).join("\n"));
    }

    if (toText(section?.betterComment)) {
      chunks.push(`<p><strong>베러의 한마디😎</strong> ${escapeHtml(toText(section.betterComment))}</p>`);
    }

    const bodyHtml = toHtmlParagraphs(section?.paragraphs);
    if (bodyHtml) chunks.push(bodyHtml);

    if (toText(section?.cta)) {
      chunks.push(`<p>${escapeHtml(toText(section.cta))}</p>`);
    }
  });

  const closingHtml = toHtmlParagraphs(featuredDraft.closing);
  if (closingHtml) chunks.push(closingHtml);

  if (toText(featuredDraft.cta)) {
    chunks.push(`<p>${escapeHtml(toText(featuredDraft.cta))}</p>`);
  }

  if (toText(featuredDraft.hashtagsLine)) {
    chunks.push(`<p>${escapeHtml(toText(featuredDraft.hashtagsLine))}</p>`);
  }

  return chunks.filter(Boolean).join("\n\n").trim();
}

function renderInfoRows(rows) {
  const safeRows = rows.filter((row) => row.value);
  if (!safeRows.length) {
    return "";
  }

  return [
    '<div class="result-json-info-list">',
    safeRows.map((row) => `
      <div class="result-json-info-item">
        <span>${renderInlineText(row.label)}</span>
        <strong>${renderInlineText(row.value)}</strong>
      </div>
    `).join(""),
    "</div>"
  ].join("");
}

function renderTagRow(label, items) {
  const safeItems = toStringArray(items);
  if (!safeItems.length) return "";
  return `
    <div class="result-json-tag-block">
      <span class="result-json-tag-label">${renderInlineText(label)}</span>
      <div class="result-json-tags">
        ${safeItems.map((item) => `<span class="result-json-tag">${renderInlineText(item)}</span>`).join("")}
      </div>
    </div>
  `;
}

function shortenText(value, maxLength = 160) {
  const text = toText(value);
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function extractFeaturedDraftPayload(data) {
  if (isPlainObject(data?.featuredDraft)) return data.featuredDraft;
  if (isPlainObject(data?.step7?.featuredDraft)) return data.step7.featuredDraft;
  return null;
}

function renderFeaturedDraftCard(featuredDraftInput) {
  const featuredDraft = isPlainObject(featuredDraftInput) ? featuredDraftInput : {};
  const seoMeta = isPlainObject(featuredDraft.seoMeta) ? featuredDraft.seoMeta : {};
  const imageGuide = isPlainObject(featuredDraft.imageGuide) ? featuredDraft.imageGuide : {};
  const normalizedHtmlBody = buildStructuredHtmlBody(featuredDraft);
  const displayedHtmlBody = normalizedHtmlBody || toText(featuredDraft.htmlBody);

  return `
    <article class="result-json-topic-card">
      <div class="result-json-topic-head">
        <h4>${renderInlineText(toText(featuredDraft.title) || "-")}</h4>
      </div>
      ${toText(featuredDraft.subtitle)
        ? `<p class="result-preview-text result-json-subtitle">${renderInlineText(toText(featuredDraft.subtitle))}</p>`
        : ""}
      <div class="result-json-split-grid">
        <div class="result-preview-panel">
          <h5>제목 후보 5개</h5>
          ${renderSimpleList(featuredDraft.titleOptions, true)}
        </div>
        <div class="result-preview-panel">
          <h5>메타 정보</h5>
          ${renderInfoRows([
            { label: "SEO 제목", value: toText(seoMeta.seoTitle) || toText(featuredDraft.title) },
            { label: "추천 슬러그", value: toText(seoMeta.slug) || toText(featuredDraft.slug) },
            { label: "메타 설명", value: toText(seoMeta.metaDescription) || toText(featuredDraft.metaDescription) },
            { label: "메인 키워드", value: toText(seoMeta.mainKeyword) },
            { label: "검색 의도 유형", value: toText(seoMeta.searchIntentType) },
            { label: "예상 독자 고민", value: toText(seoMeta.readerConcern) }
          ])}
          ${renderTagRow("서브 키워드", seoMeta.subKeywords)}
          ${renderTagRow("태그", featuredDraft.tags)}
        </div>
      </div>
      <div class="result-json-split-grid">
        <div class="result-preview-panel">
          <h5>내부링크 추천 문구</h5>
          ${renderSimpleList(featuredDraft.internalLinks)}
        </div>
        <div class="result-preview-panel">
          <h5>이미지 삽입 가이드</h5>
          ${renderInfoRows([
            { label: "추천 이미지 구간", value: toText(imageGuide.recommendedSection) }
          ])}
          ${renderSimpleList(imageGuide.altExamples)}
        </div>
      </div>
      <div class="result-preview-panel">
        <h5>외부 참고자료 제안</h5>
        ${renderSimpleList(featuredDraft.externalReferenceSuggestions)}
      </div>
      <div class="result-preview-panel">
        <h5>도입</h5>
        ${renderParagraphs(featuredDraft.intro)}
      </div>
      <div class="result-preview-panel">
        <h5>본문</h5>
        ${Array.isArray(featuredDraft.bodySections) && featuredDraft.bodySections.length
          ? featuredDraft.bodySections.map((section) => `
            <div class="result-json-draft-section">
              <h6>${renderInlineText(toText(section?.heading) || "-")}</h6>
              ${toText(section?.subHeading)
                ? `<p class="result-preview-text result-json-subtitle">${renderInlineText(toText(section?.subHeading))}</p>`
                : ""}
              ${renderTagRow("연관 키워드", [toText(section?.subKeyword)].filter(Boolean))}
              ${renderInfoRows([
                { label: "제품이름", value: toText(section?.productName) },
                { label: "가격", value: toText(section?.price) },
                { label: "사이즈", value: toText(section?.size) },
                { label: "한줄평", value: toText(section?.oneLineSummary) }
              ])}
              ${isPlainObject(section?.summaryBox) && hasSummaryBoxContent(section.summaryBox, section)
                ? `
                  <div class="result-preview-panel">
                    <h5>${renderInlineText(getSummaryBoxTitle(section.summaryBox))}</h5>
                    ${toText(section.summaryBox.intro)
                      ? `<p class="result-preview-text">${renderInlineText(toText(section.summaryBox.intro))}</p>`
                      : ""}
                    ${renderInfoRows([
                      ...getSummaryBoxRows(section.summaryBox, section),
                      { label: "한줄 결론", value: toText(section.summaryBox.takeaway) },
                      { label: "주의 포인트", value: toText(section.summaryBox.caution) }
                    ])}
                    ${renderTagRow(getSummaryBoxFeatureLabel(section.summaryBox), section.summaryBox.features)}
                    ${renderTagRow(getSummaryBoxRecommendLabel(section.summaryBox), section.summaryBox.recommendPoints)}
                  </div>
                `
                : ""}
              ${toText(section?.betterComment)
                ? `
                  <div class="result-preview-panel">
                    <h5>베러의 한마디😎</h5>
                    <p class="result-preview-text">${renderInlineText(toText(section.betterComment))}</p>
                  </div>
                `
                : ""}
              ${renderParagraphs(section?.paragraphs)}
              ${toText(section?.cta)
                ? `
                  <div class="result-preview-panel">
                    <h5>섹션 CTA</h5>
                    <p class="result-preview-text">${renderInlineText(toText(section.cta))}</p>
                  </div>
                `
                : ""}
            </div>
          `).join("")
          : '<div class="result-json-empty">내용이 없습니다.</div>'}
      </div>
      <div class="result-json-split-grid">
        <div class="result-preview-panel">
          <h5>마무리</h5>
          ${renderParagraphs(featuredDraft.closing)}
        </div>
        <div class="result-preview-panel">
          <h5>CTA</h5>
          <p class="result-preview-text">${renderInlineText(toText(featuredDraft.cta) || "내용이 없습니다.")}</p>
        </div>
      </div>
      <div class="result-json-split-grid">
        <div class="result-preview-panel">
          <h5>해시태그 / 키워드 한 줄</h5>
          <p class="result-preview-text">${renderInlineText(toText(featuredDraft.hashtagsLine) || "내용이 없습니다.")}</p>
        </div>
        <div class="result-preview-panel">
          <h5>HTML 최종 본문</h5>
          ${renderCodeBlock(displayedHtmlBody)}
        </div>
      </div>
    </article>
  `;
}

function createSelectionItem(groupId, index, title, description, summaryLines) {
  const normalizedTitle = toText(title) || `항목 ${index + 1}`;
  const normalizedDescription = toText(description);
  const normalizedSummaryLines = Array.isArray(summaryLines)
    ? summaryLines.map((line) => shortenText(line, 220)).filter(Boolean)
    : [];

  return {
    id: `${groupId}-${index}`,
    title: normalizedTitle,
    description: normalizedDescription,
    summaryLines: normalizedSummaryLines,
    searchText: [normalizedTitle, normalizedDescription, ...normalizedSummaryLines].filter(Boolean).join(" "),
  };
}

const SELECTION_STOPWORDS = new Set([
  "step",
  "seo",
  "html",
  "json",
  "blog",
  "brand",
  "daily",
  "intro",
  "outline",
  "title",
  "topic",
  "draft",
  "글",
  "블로그",
  "글감",
  "주제",
  "제목",
  "추천",
  "핵심",
  "키워드",
  "질문",
  "고민",
  "검색",
  "의도",
  "이유",
  "상세",
  "목차",
  "우선",
  "발행",
  "관점",
  "활용",
  "방향",
  "기획",
  "반응",
  "도입문",
  "내용",
  "요약",
  "포인트",
  "메인",
  "보조",
  "독자",
]);

const PERSPECTIVE_HINTS = [
  {
    matchers: ["vs", "비교", "장단점", "차이", "정리"],
    preferred: ["비교형"],
  },
  {
    matchers: ["가이드", "기준", "팁", "에티켓", "범위", "정리"],
    preferred: ["정보형", "문제해결형"],
  },
  {
    matchers: ["여름", "겨울", "보관", "유통기한", "걱정", "문제"],
    preferred: ["문제해결형"],
  },
  {
    matchers: ["트렌드", "요즘", "유니크", "패키지", "포장", "감동"],
    preferred: ["트렌드형"],
  },
];

function buildSelectionSearchText(item) {
  return toText(item?.searchText) || [
    toText(item?.title),
    toText(item?.description),
    ...toStringArray(item?.summaryLines),
  ].filter(Boolean).join(" ");
}

function tokenizeSelectionText(value) {
  return Array.from(new Set(
    (toText(value).toLowerCase().match(/[가-힣a-z0-9]+/g) || [])
      .filter((token) => token.length >= 2 && !SELECTION_STOPWORDS.has(token))
  ));
}

function getSelectionTokens(item) {
  return tokenizeSelectionText(buildSelectionSearchText(item));
}

function extendTokenPool(pool, item) {
  getSelectionTokens(item).forEach((token) => pool.add(token));
}

function scoreSelectionItem(item, anchorTokens = []) {
  const searchText = buildSelectionSearchText(item).toLowerCase();
  const itemTokens = new Set(getSelectionTokens(item));

  if (!anchorTokens.length) {
    return itemTokens.size;
  }

  let score = 0;
  anchorTokens.forEach((token) => {
    if (!token) return;
    if (itemTokens.has(token)) {
      score += token.length >= 4 ? 4 : 2;
      return;
    }
    if (searchText.includes(token)) {
      score += 1;
    }
  });

  return score;
}

function getGroupSelectionLimit(group) {
  if (!group) return 1;
  if (group.mode === "single") return 1;
  return Math.max(1, group.maxSelectable || group.recommendedCount || 1);
}

function getSelectionModeLabel(group) {
  const limit = getGroupSelectionLimit(group);
  return limit === 1 ? "1개 선택" : `최대 ${limit}개`;
}

function findSelectionGroup(groups, groupId) {
  return (groups || []).find((group) => group.id === groupId) || null;
}

function rankGroupItems(group, anchorTokens = []) {
  return (group?.items || [])
    .map((item, index) => ({
      item,
      index,
      score: scoreSelectionItem(item, anchorTokens),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function pickSummaryValue(item, label) {
  const prefix = `${label}:`;
  const matchedLine = Array.isArray(item?.summaryLines)
    ? item.summaryLines.find((line) => line.startsWith(prefix))
    : "";
  return matchedLine ? matchedLine.slice(prefix.length).trim() : "";
}

function normalizeRelationText(value) {
  return toText(value)
    .toLowerCase()
    .replace(/[^가-힣a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRelationVariants(item) {
  return Array.from(new Set([
    toText(item?.title),
    toText(item?.description),
    pickSummaryValue(item, "추천 제목"),
    pickSummaryValue(item, "글감 주제"),
    pickSummaryValue(item, "우선 주제"),
    pickSummaryValue(item, "기획 의도"),
  ].map((value) => normalizeRelationText(value)).filter(Boolean)));
}

function buildAnchorContext(item) {
  const title = toText(item?.title);
  const topic = pickSummaryValue(item, "우선 주제")
    || pickSummaryValue(item, "글감 주제")
    || title;
  const keywordLine = [
    pickSummaryValue(item, "핵심 키워드"),
    pickSummaryValue(item, "녹일 키워드"),
    title,
    topic,
  ].filter(Boolean).join(", ");

  return {
    title,
    topic,
    variants: new Set([
      normalizeRelationText(title),
      normalizeRelationText(topic),
      ...buildRelationVariants(item),
    ].filter(Boolean)),
    tokens: new Set([
      ...tokenizeSelectionText(title),
      ...tokenizeSelectionText(topic),
      ...tokenizeSelectionText(keywordLine),
    ]),
  };
}

function mergeAnchorContext(context, item) {
  if (!item) return context;
  const built = buildAnchorContext(item);
  const next = {
    title: context?.title || built.title,
    topic: context?.topic || built.topic,
    variants: new Set(context?.variants || []),
    tokens: new Set(context?.tokens || []),
  };

  built.variants.forEach((variant) => next.variants.add(variant));
  built.tokens.forEach((token) => next.tokens.add(token));
  return next;
}

function inferPreferredPerspective(context) {
  const joined = `${context?.title || ""} ${context?.topic || ""}`.toLowerCase();
  return PERSPECTIVE_HINTS
    .filter((hint) => hint.matchers.some((matcher) => joined.includes(matcher)))
    .flatMap((hint) => hint.preferred);
}

function scoreItemAgainstContext(item, context, groupId = "") {
  if (!item || !context) return 0;

  const itemTitle = normalizeRelationText(item.title);
  const itemVariants = buildRelationVariants(item);
  const itemTokens = new Set(getSelectionTokens(item));
  let score = 0;

  if (context.variants.has(itemTitle)) {
    score += 140;
  }

  itemVariants.forEach((variant) => {
    if (!variant) return;
    if (context.variants.has(variant)) {
      score += 100;
      return;
    }
    context.variants.forEach((anchorVariant) => {
      if (!anchorVariant || anchorVariant === variant) return;
      if (variant.includes(anchorVariant) || anchorVariant.includes(variant)) {
        score += 35;
      }
    });
  });

  context.tokens.forEach((token) => {
    if (!token) return;
    if (itemTokens.has(token)) {
      score += token.length >= 4 ? 7 : 4;
    }
  });

  if (groupId === "step1-perspectives") {
    const preferred = inferPreferredPerspective(context);
    preferred.forEach((label) => {
      if (item.title.includes(label)) {
        score += 45;
      }
    });
  }

  if (groupId === "step1-coreKeywords") {
    const anchorText = `${context.title} ${context.topic}`.toLowerCase();
    if (anchorText.includes(toText(item.title).toLowerCase())) {
      score += 60;
    }
  }

  if (groupId === "step4-titles" && itemTitle && context.variants.has(itemTitle)) {
    score += 80;
  }

  return score;
}

function pickAlignedItems(group, context, { limit = 1, threshold = 1, allowFallback = false } = {}) {
  if (!group?.items?.length) return [];

  const ranked = group.items
    .map((item, index) => ({
      item,
      index,
      score: scoreItemAgainstContext(item, context, group.id),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selectedItems = ranked
    .filter((entry) => entry.score >= threshold)
    .slice(0, limit)
    .map((entry) => entry.item);

  if (selectedItems.length || !allowFallback) {
    return selectedItems;
  }

  return group.items.slice(0, limit);
}

function getCanonicalTitle(items = []) {
  const ranked = new Map();

  items.forEach((item) => {
    const normalized = normalizeRelationText(item?.title);
    if (!normalized) return;
    if (!ranked.has(normalized)) {
      ranked.set(normalized, { count: 0, label: item.title });
    }
    ranked.get(normalized).count += 1;
  });

  return [...ranked.values()]
    .sort((left, right) => right.count - left.count || left.label.length - right.label.length)[0]?.label || "";
}

function buildStep7SelectionGroups(data) {
  if (!isPlainObject(data)) return [];

  const groups = [];
  const step2 = isPlainObject(data.step2) ? data.step2 : {};

  const topics = Array.isArray(step2.topics) ? step2.topics : [];
  if (topics.length) {
    groups.push({
      id: "step2-topics",
      title: "STEP 2 추천 블로그 글감",
      helper: "이 화면은 글감 1개만 고르는 흐름입니다. 아래 추천 글감 중 최종 주제 1개를 선택하세요.",
      mode: "single",
      recommendedCount: 1,
      items: topics.slice(0, 20).map((item, index) => createSelectionItem(
        "step2-topics",
        index,
        item?.title || item?.topic,
        item?.reason,
        [
          `글감 주제: ${toText(item?.topic)}`,
          `추천 제목: ${toText(item?.title)}`,
          `검색 의도: ${toText(item?.intent)}`,
          `추천 이유: ${toText(item?.reason)}`,
          `읽을 사람: ${toText(item?.reader)}`,
          `도입문 방향: ${toText(item?.introDirection)}`,
          `핵심 키워드: ${toStringArray(item?.keywords).join(", ")}`,
          `추천 목차: ${toStringArray(item?.outline).join(" / ")}`,
          `꼭 다룰 내용: ${toStringArray(item?.mustCover).join(", ")}`,
          `주의할 점: ${toStringArray(item?.cautions).join(", ")}`,
          `브랜드 연결 포인트: ${toText(item?.brandConnection)}`
        ]
      ))
    });
  }

  return groups.filter((group) => Array.isArray(group.items) && group.items.length);
}

function getDefaultStep7SelectedIds(groups) {
  const selected = new Set();
  groups.forEach((group) => {
    group.items.slice(0, 1).forEach((item) => {
      selected.add(item.id);
    });
  });
  return selected;
}

function renderStep7SelectionBoard() {
  if (!els.step7SelectionBoard) return;

  const groups = state.step7SelectionGroups || [];
  if (!groups.length) {
    els.step7SelectionBoard.className = "step7-selection-board empty";
    els.step7SelectionBoard.textContent = "콘텐츠 기획 결과 JSON을 붙여넣거나 자동 생성한 뒤, STEP 2 글감 선택 보드가 열립니다.";
    return;
  }

  els.step7SelectionBoard.className = "step7-selection-board";
  els.step7SelectionBoard.innerHTML = groups.map((group) => `
    <article class="step7-selection-group">
      <div class="step7-selection-group-head">
        <div>
          <h3>${renderInlineText(group.title)}</h3>
          <p>${renderInlineText(group.helper || "")}</p>
        </div>
        <span class="step7-selection-mode">${getSelectionModeLabel(group)}</span>
      </div>
      <div class="step7-selection-items">
        ${group.items.map((item) => {
          const isActive = state.step7SelectedIds.has(item.id);
          return `
            <button
              type="button"
              class="step7-choice${isActive ? " active" : ""}"
              data-step7-choice="${escapeHtml(item.id)}"
              data-step7-group="${escapeHtml(group.id)}"
              data-step7-mode="${escapeHtml(group.mode)}"
            >
              <strong>${renderInlineText(item.title)}</strong>
              ${item.description ? `<span>${renderInlineText(item.description)}</span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    </article>
  `).join("");
}

function buildStep7SelectionSummary() {
  const groups = state.step7SelectionGroups || [];
  const selectedByGroup = new Map(
    groups.map((group) => [
      group.id,
      group.items.filter((item) => state.step7SelectedIds.has(item.id)),
    ])
  );
  const lines = ["[STEP 7 작성 브리프]"];
  const topic = selectedByGroup.get("step2-topics")?.[0] || null;

  if (topic) {
    lines.push(`선택한 글감: ${topic.title}`);
    const topicName = pickSummaryValue(topic, "글감 주제");
    if (topicName) {
      lines.push(`글감 주제: ${topicName}`);
    }
    if (topic.description) {
      lines.push(`선정 이유: ${topic.description}`);
    }

    const intent = pickSummaryValue(topic, "검색 의도");
    if (intent) {
      lines.push(`검색 의도: ${intent}`);
    }

    const keywords = pickSummaryValue(topic, "핵심 키워드");
    if (keywords) {
      lines.push(`핵심 키워드: ${keywords}`);
    }

    const reader = pickSummaryValue(topic, "읽을 사람");
    if (reader) {
      lines.push(`핵심 독자: ${reader}`);
    }

    const introDirection = pickSummaryValue(topic, "도입문 방향");
    if (introDirection) {
      lines.push(`도입 방향: ${introDirection}`);
    }

    const outline = pickSummaryValue(topic, "추천 목차");
    if (outline) {
      lines.push(`추천 흐름: ${outline}`);
    }

    const mustCover = pickSummaryValue(topic, "꼭 다룰 내용");
    if (mustCover) {
      lines.push(`반드시 다룰 내용: ${mustCover}`);
    }

    const cautions = pickSummaryValue(topic, "주의할 점");
    if (cautions) {
      lines.push(`주의할 점: ${cautions}`);
    }

    const brandConnection = pickSummaryValue(topic, "브랜드 연결 포인트");
    if (brandConnection) {
      lines.push(`브랜드 연결 포인트: ${brandConnection}`);
    }
  }

  if (topic) {
    lines.push("작성 원칙: 위에서 고른 글감 1개만 중심축으로 사용하고, 다른 STEP 후보 주제나 다른 글감을 끌어오지 말 것.");
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

function syncStep7SelectionSummary() {
  const summary = buildStep7SelectionSummary();
  if (els.step7SelectionSummary) {
    els.step7SelectionSummary.value = summary;
  }

  const totalSelected = state.step7SelectedIds.size;
  if (els.step7SelectionMeta) {
    els.step7SelectionMeta.textContent = totalSelected
      ? "글감 1개를 골라 STEP 7 전용 글 생성기로 넘길 준비가 됐습니다."
      : "선택된 항목이 아직 없습니다. STEP 2에서 글감 1개를 골라주세요.";
  }
}

function renderStepBlock(label, bodyHtml, open = false) {
  return [
    `<details class="result-step-block"${open ? " open" : ""}>`,
    '<summary class="result-step-summary">',
    `<span class="result-step-label">${renderInlineText(label)}</span>`,
    '<span class="result-step-toggle">접기 / 펼치기</span>',
    "</summary>",
    `<div class="result-step-body">${bodyHtml}</div>`,
    "</details>"
  ].join("");
}

function renderStrategyJsonPreview(data) {
  const step1 = isPlainObject(data.step1) ? data.step1 : {};
  const step2 = isPlainObject(data.step2) ? data.step2 : {};
  const step3 = isPlainObject(data.step3) ? data.step3 : {};
  const step4 = isPlainObject(data.step4) ? data.step4 : {};
  const step5 = isPlainObject(data.step5) ? data.step5 : {};
  const step6 = isPlainObject(data.step6) ? data.step6 : {};
  const step7 = isPlainObject(data.step7) ? data.step7 : {};
  const step8 = isPlainObject(data.step8) ? data.step8 : {};

  const step1Html = [
    '<div class="result-json-grid">',
    `
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">반복 키워드</h4>
        ${Array.isArray(step1.coreKeywords) && step1.coreKeywords.length
          ? step1.coreKeywords.map((item) => `
            <div class="result-json-info-card">
              <strong>${renderInlineText(toText(item?.keyword) || "-")}</strong>
              <p class="result-preview-text">${renderInlineText(toText(item?.reason) || "")}</p>
            </div>
          `).join("")
          : '<div class="result-json-empty">내용이 없습니다.</div>'}
      </article>
    `,
    `
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">질문 / 고민 포인트</h4>
        ${Array.isArray(step1.questions) && step1.questions.length
          ? step1.questions.map((item) => `
            <div class="result-json-info-card">
              <strong>${renderInlineText(toText(item?.question) || "-")}</strong>
              <p class="result-preview-text">${renderInlineText(toText(item?.intent) || "")}</p>
            </div>
          `).join("")
          : '<div class="result-json-empty">내용이 없습니다.</div>'}
      </article>
    `,
    `
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">발전시키기 좋은 관점</h4>
        ${Array.isArray(step1.perspectives) && step1.perspectives.length
          ? step1.perspectives.map((item) => `
            <div class="result-json-info-card">
              <strong>${renderInlineText(toText(item?.type) || "-")}</strong>
              <p class="result-preview-text">${renderInlineText(toText(item?.direction) || "")}</p>
            </div>
          `).join("")
          : '<div class="result-json-empty">내용이 없습니다.</div>'}
      </article>
    `,
    "</div>"
  ].join("");

  const topics = Array.isArray(step2.topics) ? step2.topics : [];
  const step2Html = topics.length
    ? topics.map((item) => `
      <article class="result-json-topic-card">
        <div class="result-json-topic-head">
          <span class="result-json-rank">TOP ${renderInlineText(toText(item?.rank) || "-")}</span>
          <h4>${renderInlineText(toText(item?.title) || toText(item?.topic) || "-")}</h4>
        </div>
        <p class="result-preview-text">${renderInlineText(toText(item?.topic) || "")}</p>
        ${renderTagRow("핵심 키워드", item?.keywords)}
        ${renderInfoRows([
          { label: "검색 의도", value: toText(item?.intent) },
          { label: "추천 이유", value: toText(item?.reason) },
          { label: "읽을 사람", value: toText(item?.reader) },
          { label: "도입문 방향", value: toText(item?.introDirection) },
          { label: "브랜드 연결", value: toText(item?.brandConnection) }
        ])}
        <div class="result-json-split-grid">
          <div class="result-preview-panel">
            <h5>보조 제목 후보</h5>
            ${renderSimpleList(item?.altTitles)}
          </div>
          <div class="result-preview-panel">
            <h5>추천 목차</h5>
            ${renderSimpleList(item?.outline, true)}
          </div>
          <div class="result-preview-panel">
            <h5>꼭 다뤄야 할 포인트</h5>
            ${renderSimpleList(item?.mustCover)}
          </div>
          <div class="result-preview-panel">
            <h5>주의할 점</h5>
            ${renderSimpleList(item?.cautions)}
          </div>
        </div>
      </article>
    `).join("")
    : '<div class="result-json-empty">내용이 없습니다.</div>';

  const priorities = Array.isArray(step3.priorities) ? step3.priorities : [];
  const step3Html = priorities.length
    ? priorities.map((item) => `
      <article class="result-json-topic-card compact">
        <div class="result-json-topic-head">
          <span class="result-json-rank">우선 ${renderInlineText(toText(item?.rank) || "-")}</span>
          <h4>${renderInlineText(toText(item?.title) || toText(item?.topic) || "-")}</h4>
        </div>
        ${renderInfoRows([
          { label: "주제", value: toText(item?.topic) },
          { label: "왜 먼저 써야 하는지", value: toText(item?.whyNow) },
          { label: "우선순위 점수", value: toText(item?.score) ? `${toText(item?.score)}점` : "" }
        ])}
        <div class="result-preview-panel">
          <h5>예상 장점</h5>
          ${renderSimpleList(item?.advantages)}
        </div>
      </article>
    `).join("")
    : '<div class="result-json-empty">내용이 없습니다.</div>';

  const step4Html = renderSimpleList(step4.titles, true);

  const outlines = Array.isArray(step5.detailedOutlines) ? step5.detailedOutlines : [];
  const step5Html = outlines.length
    ? outlines.map((item) => `
      <article class="result-json-topic-card">
        <div class="result-json-topic-head">
          <h4>${renderInlineText(toText(item?.title) || "-")}</h4>
        </div>
        ${renderInfoRows([
          { label: "기획 의도", value: toText(item?.planningIntent) },
          { label: "예상 독자 반응", value: toText(item?.expectedReaction) }
        ])}
        ${renderTagRow("녹여야 할 키워드", item?.keywords)}
        ${renderTagRow("피해야 할 표현", item?.avoidExpressions)}
        <div class="result-preview-panel">
          <h5>상세 목차</h5>
          ${renderSimpleList([
            toText(item?.outline?.intro),
            toText(item?.outline?.body1),
            toText(item?.outline?.body2),
            toText(item?.outline?.body3),
            toText(item?.outline?.body4),
            toText(item?.outline?.conclusion)
          ], true)}
        </div>
      </article>
    `).join("")
    : '<div class="result-json-empty">내용이 없습니다.</div>';

  const intros = Array.isArray(step6.introDrafts) ? step6.introDrafts : [];
  const step6Html = intros.length
    ? intros.map((item) => `
      <article class="result-json-topic-card">
        <div class="result-json-topic-head">
          <h4>${renderInlineText(toText(item?.title) || "-")}</h4>
        </div>
        <div class="result-json-split-grid">
          <div class="result-preview-panel">
            <h5>도입문 A</h5>
            ${renderParagraphs(item?.introA)}
          </div>
          <div class="result-preview-panel">
            <h5>도입문 B</h5>
            ${renderParagraphs(item?.introB)}
          </div>
        </div>
      </article>
    `).join("")
    : '<div class="result-json-empty">내용이 없습니다.</div>';

  const step7Html = renderFeaturedDraftCard(step7.featuredDraft);

  const seriesDirection = isPlainObject(step8.seriesDirection) ? step8.seriesDirection : {};
  const step8Html = `
    <div class="result-json-grid">
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">독자 흐름</h4>
        ${renderSimpleList(seriesDirection.readerFlow)}
      </article>
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">주제 축 3가지</h4>
        ${renderSimpleList(seriesDirection.topicAxes)}
      </article>
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">시리즈 아이디어</h4>
        ${renderSimpleList(seriesDirection.seriesIdeas)}
      </article>
      <article class="result-preview-panel">
        <h4 class="result-preview-subtitle">신뢰 쌓는 방법</h4>
        ${renderSimpleList(seriesDirection.trustBuilding)}
      </article>
    </div>
    <article class="result-preview-panel">
      <h4 class="result-preview-subtitle">전체 방향 한 줄 요약</h4>
      <p class="result-preview-text">${renderInlineText(toText(seriesDirection.summary) || "내용이 없습니다.")}</p>
    </article>
  `;

  els.resultPreview.className = "result-preview";
  els.resultPreview.innerHTML = [
    renderStepBlock("STEP 1. 리서치 핵심 인사이트", step1Html, true),
    renderStepBlock("STEP 2. 추천 블로그 글감 TOP 20", step2Html),
    renderStepBlock("STEP 3. 지금 가장 먼저 써야 할 글 3개", step3Html),
    renderStepBlock("STEP 4. 제목 후보 추가 제안", step4Html),
    renderStepBlock("STEP 5. 베스트 3개 글의 상세 목차", step5Html),
    renderStepBlock("STEP 6. 베스트 3개 글의 도입문 초안", step6Html),
    renderStepBlock("STEP 7. 베스트 1개 글의 본문 초안", step7Html),
    renderStepBlock("STEP 8. 연재 방향 제안", step8Html)
  ].join("");
  setStepToggleAvailability(true);
}

function splitPreviewBlocks(lines) {
  const blocks = [];
  let current = { type: "intro", title: "개요", lines: [] };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const normalized = trimmed.replace(/^#+\s*/, "");
    const stepMatch = normalized.match(/^(STEP\s*\d+(?:[.:]?\s*.*)?)$/i);

    if (stepMatch) {
      if (current.lines.length) {
        blocks.push(current);
      }
      current = { type: "step", title: stepMatch[1], lines: [] };
      continue;
    }

    current.lines.push(rawLine);
  }

  if (current.lines.length) {
    blocks.push(current);
  }

  return blocks;
}

function renderPreviewBlockContent(lines) {
  const html = [];
  let panelOpen = false;
  let listType = null;
  let paragraphLines = [];

  const openPanel = () => {
    if (panelOpen) return;
    html.push('<div class="result-preview-panel">');
    panelOpen = true;
  };

  const closeParagraph = () => {
    if (!paragraphLines.length) return;
    openPanel();
    html.push(`<p class="result-preview-text">${paragraphLines.map((line) => renderInlineText(line)).join("<br />")}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  };

  const closePanel = () => {
    closeParagraph();
    closeList();
    if (!panelOpen) return;
    html.push("</div>");
    panelOpen = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)/);
    const ordered = line.match(/^\d+[.)]\s+(.+)/);
    const bullet = line.match(/^[-*]\s+(.+)/);

    if (heading) {
      closePanel();
      openPanel();
      const level = heading[1].length;
      const title = renderInlineText(heading[2]);
      html.push(level <= 2
        ? `<h3 class="result-preview-title">${title}</h3>`
        : `<h4 class="result-preview-subtitle">${title}</h4>`);
      continue;
    }

    if (ordered) {
      closeParagraph();
      openPanel();
      if (listType && listType !== "ol") {
        closeList();
      }
      if (!listType) {
        html.push('<ol class="result-preview-list ordered">');
        listType = "ol";
      }
      html.push(`<li>${renderInlineText(ordered[1])}</li>`);
      continue;
    }

    if (bullet) {
      closeParagraph();
      openPanel();
      if (listType && listType !== "ul") {
        closeList();
      }
      if (!listType) {
        html.push('<ul class="result-preview-list">');
        listType = "ul";
      }
      html.push(`<li>${renderInlineText(bullet[1])}</li>`);
      continue;
    }

    closeList();
    paragraphLines.push(line);
  }

  closePanel();
  return html.join("");
}

function renderResultPreview(text = "") {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    els.resultPreview.className = "result-preview empty";
    els.resultPreview.textContent = "GPT 결과를 붙여넣으면 JSON이면 카드형으로, 일반 텍스트면 STEP 기준으로 정리해서 보여줍니다.";
    setResultPreviewHint("JSON 결과를 붙여넣으면 카드형으로, 일반 텍스트면 STEP 기준으로 정리해서 보여줍니다.");
    setStepToggleAvailability(false);
    return;
  }

  const parsedJson = tryParseStrategyJson(normalized);
  if (parsedJson.data) {
    renderStrategyJsonPreview(parsedJson.data);
    setResultPreviewHint(
      parsedJson.repaired
        ? "JSON 형식의 작은 오류를 자동 보정해서 카드형으로 정리했습니다."
        : "유효한 JSON 결과를 카드형으로 정리해서 보여주고 있습니다."
    );
    return;
  }

  const blocks = splitPreviewBlocks(normalized.split("\n"));
  let firstStepOpened = false;

  els.resultPreview.className = "result-preview";
  els.resultPreview.innerHTML = blocks
    .map((block) => {
      const content = renderPreviewBlockContent(block.lines);
      if (block.type === "step") {
        const shouldOpen = !firstStepOpened;
        firstStepOpened = true;
        return [
          `<details class="result-step-block" ${shouldOpen ? "open" : ""}>`,
          `<summary class="result-step-summary">`,
          `<span class="result-step-label">${renderInlineText(block.title)}</span>`,
          `<span class="result-step-toggle">접기 / 펼치기</span>`,
          `</summary>`,
          `<div class="result-step-body">${content}</div>`,
          `</details>`
        ].join("");
      }

      return `<section class="result-preview-section">${content}</section>`;
    })
    .join("");

  const hasStepBlocks = blocks.some((block) => block.type === "step");
  setStepToggleAvailability(hasStepBlocks);
  setResultPreviewHint(
    /[{\[]/.test(normalized)
      ? "JSON 형식이 조금 깨져서 텍스트 보기로 보여주고 있습니다. 마지막 쉼표, 따옴표, 코드블록 설명문을 확인해보세요."
      : "일반 텍스트 결과를 STEP 기준으로 정리해서 보여주고 있습니다."
  );
}

function renderStep7ResultPreview(text = "") {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();

  if (!els.step7Preview) return;

  if (!normalized) {
    els.step7Preview.className = "result-preview empty";
    els.step7Preview.textContent = "STEP 7 결과가 들어오면 여기서 최종 블로그 글 구조를 확인할 수 있습니다.";
    if (els.step7PreviewHint) {
      els.step7PreviewHint.textContent = "STEP 7 결과를 붙여넣으면 제목 후보, 메타 정보, HTML 본문까지 보기 좋게 정리해서 보여줍니다.";
    }
    return;
  }

  const parsed = tryParseStrategyJson(normalized);
  const featuredDraft = extractFeaturedDraftPayload(parsed.data || {});

  if (featuredDraft) {
    els.step7Preview.className = "result-preview";
    els.step7Preview.innerHTML = renderFeaturedDraftCard(featuredDraft);
    if (els.step7PreviewHint) {
      els.step7PreviewHint.textContent = parsed.repaired
        ? "STEP 7 JSON의 작은 오류를 자동 보정해서 정리했습니다."
        : "STEP 7 JSON 결과를 보기 좋게 정리해서 보여주고 있습니다.";
    }
    return;
  }

  els.step7Preview.className = "result-preview empty";
  els.step7Preview.textContent = normalized;
  if (els.step7PreviewHint) {
    els.step7PreviewHint.textContent = "JSON 형식이 아니어서 원문 그대로 보여주고 있습니다. 가능하면 JSON 결과를 붙여넣어 주세요.";
  }
}

function clearStep7Prompt() {
  state.step7Prompt = "";
  if (els.step7PromptOutput) {
    els.step7PromptOutput.value = "";
  }
  if (els.step7CopyPromptBtn) {
    els.step7CopyPromptBtn.disabled = true;
  }
}

function setStep7ResultValue(value = "", options = {}) {
  const { writeToField = true } = options;
  state.step7Result = value;
  if (writeToField && els.step7ResultOutput) {
    els.step7ResultOutput.value = value;
  }
  if (els.step7CopyResultBtn) {
    els.step7CopyResultBtn.disabled = !value.trim();
  }
  renderStep7ResultPreview(value);

  const parsed = tryParseStrategyJson(value || "");
  if (!parsed.data && /[{\[]/.test(value || "")) {
    const requestedValue = (value || "").trim();
    const ticket = ++state.step7RepairTicket;
    repairJsonViaServer(value)
      .then((json) => {
        if (ticket !== state.step7RepairTicket) return;
        if ((els.step7ResultOutput?.value || "").trim() !== requestedValue) return;
        const repairedText = (json?.repairedText || "").trim();
        if (!repairedText) return;
        state.step7RepairTicket += 1;
        setStep7ResultValue(repairedText);
        setStatus("붙여넣은 STEP 7 JSON의 작은 오류를 자동 보정했습니다.");
      })
      .catch(() => {
        // ignore repair failures and keep original preview
      });
  }
}

function clearStep7Result() {
  setStep7ResultValue("");
}

function clearStep7Builder() {
  state.step7SelectionGroups = [];
  state.step7SelectionLookup = new Map();
  state.step7SelectedIds = new Set();
  if (els.step7SelectionMeta) {
    els.step7SelectionMeta.textContent = "먼저 콘텐츠 기획 결과 JSON을 넣으면 여기서 STEP 2 글감 1개를 고를 수 있습니다.";
  }
  if (els.step7SelectionBoard) {
    els.step7SelectionBoard.className = "step7-selection-board empty";
    els.step7SelectionBoard.textContent = "콘텐츠 기획 결과 JSON을 붙여넣거나 자동 생성한 뒤, STEP 2 글감 선택 보드가 열립니다.";
  }
  if (els.step7SelectionSummary) {
    els.step7SelectionSummary.value = "";
  }
  clearStep7Prompt();
  clearStep7Result();
}

function syncStep7BuilderFromStrategyJson(data) {
  const hasSteps = isPlainObject(data)
    && [1, 2, 3, 4, 5, 6].some((stepNumber) => isPlainObject(data[`step${stepNumber}`]));

  state.strategyJson = hasSteps ? data : null;

  if (!hasSteps) {
    clearStep7Builder();
    return;
  }

  const groups = buildStep7SelectionGroups(data);
  state.step7SelectionGroups = groups;
  state.step7SelectionLookup = new Map();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      state.step7SelectionLookup.set(item.id, { ...item, groupId: group.id, mode: group.mode });
    });
  });
  state.step7SelectedIds = getDefaultStep7SelectedIds(groups);

  renderStep7SelectionBoard();
  syncStep7SelectionSummary();
  clearStep7Prompt();
  clearStep7Result();
}

function toggleStep7Selection(itemId, groupId, mode) {
  if (!itemId) return;

  const group = findSelectionGroup(state.step7SelectionGroups, groupId);
  const limit = getGroupSelectionLimit(group || { mode });
  const selectionMode = group?.mode || mode;

  if (selectionMode === "single" || limit === 1) {
    [...state.step7SelectedIds].forEach((selectedId) => {
      if (selectedId.startsWith(`${groupId}-`)) {
        state.step7SelectedIds.delete(selectedId);
      }
    });
    state.step7SelectedIds.add(itemId);
  } else if (state.step7SelectedIds.has(itemId)) {
    state.step7SelectedIds.delete(itemId);
  } else {
    const sameGroupCount = [...state.step7SelectedIds]
      .filter((selectedId) => selectedId.startsWith(`${groupId}-`))
      .length;
    if (sameGroupCount >= limit) {
      setStatus(`${group?.title || "이 그룹"}는 최대 ${limit}개까지 선택할 수 있습니다.`);
      return;
    }
    state.step7SelectedIds.add(itemId);
  }

  renderStep7SelectionBoard();
  syncStep7SelectionSummary();
  clearStep7Prompt();
}

function applyDefaultStep7Selections() {
  state.step7SelectedIds = getDefaultStep7SelectedIds(state.step7SelectionGroups);
  renderStep7SelectionBoard();
  syncStep7SelectionSummary();
  clearStep7Prompt();
  setStatus("STEP 7 추천 선택을 다시 적용했습니다. 상위 글감 1개만 남기도록 정리했어요.");
}

function clearStep7Selections() {
  state.step7SelectedIds = new Set();
  renderStep7SelectionBoard();
  syncStep7SelectionSummary();
  clearStep7Prompt();
  setStatus("STEP 7 선택 항목을 비웠습니다.");
}

function setResultValue(value = "", options = {}) {
  const { writeToField = true } = options;
  state.result = value;
  if (writeToField) {
    els.resultOutput.value = value;
  }
  els.copyResultBtn.disabled = !value.trim();
  renderResultPreview(value);
  const parsed = tryParseStrategyJson(value || "");
  syncStep7BuilderFromStrategyJson(parsed.data);
  saveStrategySession();
  syncStep();

  if (!parsed.data && /[{\[]/.test(value || "")) {
    const requestedValue = (value || "").trim();
    const ticket = ++state.resultRepairTicket;
    repairJsonViaServer(value)
      .then((json) => {
        if (ticket !== state.resultRepairTicket) return;
        if ((els.resultOutput?.value || "").trim() !== requestedValue) return;
        const repairedText = (json?.repairedText || "").trim();
        if (!repairedText) return;
        state.resultRepairTicket += 1;
        setResultValue(repairedText);
        setStatus("붙여넣은 전략 JSON의 작은 오류를 자동 보정했습니다.");
      })
      .catch(() => {
        // ignore repair failures and keep original preview
      });
  }
}

async function fetchHealth() {
  try {
    const response = await fetch("/api/health");
    const json = await response.json();
    state.health = json;

    if (!json?.automationAvailable) {
      els.autoGenerateBtn.style.display = "none";
      setStatus("이 배포 환경에서는 자동 생성 대신 프롬프트 복사 방식으로 사용할 수 있습니다.");
    }
  } catch {
    // ignore health check failures
  }
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function gatherPayload() {
  return {
    brandName: els.brandNameInput.value.trim(),
    blogType: els.blogTypeInput.value.trim(),
    primaryCategory: els.primaryCategoryInput.value.trim(),
    targetAudience: els.targetAudienceInput.value.trim(),
    toneAndManner: els.toneInput.value.trim(),
    avoidDirection: els.avoidInput.value.trim(),
    workGoals: els.goalsInput.value.trim(),
    researchData: els.researchDataInput.value.trim(),
  };
}

function gatherStep7Payload() {
  return {
    brandName: els.brandNameInput.value.trim(),
    blogType: els.blogTypeInput.value.trim(),
    primaryCategory: els.primaryCategoryInput.value.trim(),
    targetAudience: els.targetAudienceInput.value.trim(),
    toneAndManner: els.toneInput.value.trim(),
    avoidDirection: els.avoidInput.value.trim(),
    workGoals: els.goalsInput.value.trim(),
    researchData: els.researchDataInput.value.trim(),
    selectedPlan: els.step7SelectionSummary?.value.trim() || "",
  };
}

function saveSettings() {
  try {
    localStorage.setItem(
      STRATEGY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        brandName: els.brandNameInput.value,
        blogType: els.blogTypeInput.value,
        primaryCategory: els.primaryCategoryInput.value,
        targetAudience: els.targetAudienceInput.value,
        toneAndManner: els.toneInput.value,
        avoidDirection: els.avoidInput.value,
        workGoals: els.goalsInput.value,
      })
    );
  } catch {
    // ignore storage errors
  }
}

function saveStrategySession() {
  try {
    localStorage.setItem(
      STRATEGY_SESSION_STORAGE_KEY,
      JSON.stringify({
        brandName: els.brandNameInput.value,
        blogType: els.blogTypeInput.value,
        primaryCategory: els.primaryCategoryInput.value,
        targetAudience: els.targetAudienceInput.value,
        toneAndManner: els.toneInput.value,
        avoidDirection: els.avoidInput.value,
        workGoals: els.goalsInput.value,
        researchData: els.researchDataInput.value,
        resultText: els.resultOutput.value,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore storage errors
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STRATEGY_SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    els.brandNameInput.value = parsed.brandName || "";
    els.blogTypeInput.value = parsed.blogType || "";
    els.primaryCategoryInput.value = parsed.primaryCategory || "";
    els.targetAudienceInput.value = parsed.targetAudience || "";
    els.toneInput.value = parsed.toneAndManner || "";
    els.avoidInput.value = parsed.avoidDirection || "";
    els.goalsInput.value = parsed.workGoals || "";
  } catch {
    // ignore storage errors
  }
}

function loadResearchSnapshotFromStorage() {
  try {
    const raw = localStorage.getItem(RESEARCH_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatSavedAt(isoString) {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function applyResearchSnapshot(snapshot) {
  state.snapshot = snapshot;
  els.researchDataInput.value = snapshot?.snapshotText || "";

  if (!snapshot?.snapshotText) {
    els.snapshotMeta.textContent = "리서치툴에서 먼저 검색하면 최근 수집 결과를 자동으로 가져올 수 있습니다.";
    return;
  }

  const savedAt = formatSavedAt(snapshot.savedAt);
  const queryLine = Array.isArray(snapshot.queries) && snapshot.queries.length
    ? snapshot.queries.join(", ")
    : "최근 검색";
  const countLine = typeof snapshot.totalUnique === "number"
    ? `${snapshot.totalUnique.toLocaleString("ko-KR")}건`
    : "건수 확인 어려움";

  els.snapshotMeta.textContent = `${savedAt || "방금"} 저장된 리서치 결과입니다. 기준 키워드: ${queryLine} · 정리된 결과 ${countLine}`;
  saveStrategySession();
  syncStep();
}

async function buildPrompt() {
  setError("");
  const payload = gatherPayload();

  if (!payload.researchData) {
    throw new Error("리서치 수집 결과를 먼저 불러오거나 붙여넣어 주세요.");
  }

  const response = await fetch("/api/research-strategy/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.error || "콘텐츠 기획 프롬프트 생성에 실패했어요.");
  }

  state.prompt = json.prompt || "";
  els.promptOutput.value = state.prompt;
  els.copyPromptBtn.disabled = !state.prompt;
  saveStrategySession();
  setStatus(`콘텐츠 기획 프롬프트를 만들었습니다. 리서치 데이터 ${json.researchLength?.toLocaleString?.("ko-KR") || json.researchLength || 0}자를 반영했습니다.`);
  syncStep();
  return state.prompt;
}

async function buildStep7Prompt() {
  setError("");
  const payload = gatherStep7Payload();

  if (!payload.selectedPlan) {
    throw new Error("STEP 2에서 글감 1개를 먼저 선택해 주세요.");
  }

  const response = await fetch("/api/research-strategy/step7-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.error || "STEP 7 전용 프롬프트 생성에 실패했어요.");
  }

  state.step7Prompt = json.prompt || "";
  if (els.step7PromptOutput) {
    els.step7PromptOutput.value = state.step7Prompt;
  }
  if (els.step7CopyPromptBtn) {
    els.step7CopyPromptBtn.disabled = !state.step7Prompt;
  }
  setStatus(`STEP 7 전용 프롬프트를 만들었습니다. 선택 요약 ${json.selectedLength?.toLocaleString?.("ko-KR") || json.selectedLength || 0}자와 집중 리서치 ${json.focusedResearchLength?.toLocaleString?.("ko-KR") || json.focusedResearchLength || 0}자를 반영했습니다.`);
  return state.step7Prompt;
}

async function handleBuildPrompt() {
  try {
    setProgressLines([]);
    saveSettings();
    await buildPrompt();
  } catch (error) {
    setError(error?.message || "프롬프트 생성 중 오류가 발생했어요.");
  }
}

async function handleBuildStep7Prompt() {
  try {
    setProgressLines([]);
    saveSettings();
    await buildStep7Prompt();
  } catch (error) {
    setError(error?.message || "STEP 7 전용 프롬프트 생성 중 오류가 발생했어요.");
  }
}

async function handleAutoGenerate() {
  setError("");
  saveSettings();
  els.autoGenerateBtn.disabled = true;
  els.buildPromptBtn.disabled = true;
  setProgressLines(["프롬프트 생성 중…"]);
  setProgress(8);

  try {
    const prompt = await buildPrompt();
    setProgressLines(["프롬프트 생성 완료 ✓", "ChatGPT 자동화 시작…"]);
    setProgress(18);

    const response = await fetch("/api/research-strategy/auto-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson?.error || "자동 생성에 실패했어요.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const logs = ["프롬프트 생성 완료 ✓", "ChatGPT 자동화 시작…"];
    let resultText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.type === "log" && payload.message) {
          logs.push(payload.message);
          setProgressLines(logs);
        } else if (payload.type === "progress") {
          setProgress(payload.percent || 0);
        } else if (payload.type === "result") {
          resultText = payload.text || "";
        } else if (payload.type === "error") {
          throw new Error(payload.message || "자동 생성 중 오류가 발생했어요.");
        }
      }
    }

    if (!resultText) {
      throw new Error("기획 결과를 받지 못했어요. 프롬프트 복사 방식으로 다시 시도해 주세요.");
    }

    setResultValue(resultText);
    setProgress(100);
    setProgressLines([...logs, "콘텐츠 기획안 생성 완료 ✓"]);
    setStatus("콘텐츠 기획 결과를 받아왔습니다.");
  } catch (error) {
    setError(error?.message || "자동 생성 중 오류가 발생했어요.");
  } finally {
    els.autoGenerateBtn.disabled = false;
    els.buildPromptBtn.disabled = false;
  }
}

async function handleStep7AutoGenerate() {
  setError("");
  saveSettings();
  els.step7AutoGenerateBtn.disabled = true;
  els.step7BuildPromptBtn.disabled = true;
  setProgressLines(["STEP 7 전용 프롬프트 생성 중…"]);
  setProgress(8);

  try {
    const prompt = await buildStep7Prompt();
    setProgressLines(["STEP 7 전용 프롬프트 생성 완료 ✓", "ChatGPT 자동화 시작…"]);
    setProgress(18);

    const response = await fetch("/api/research-strategy/auto-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson?.error || "STEP 7 자동 생성에 실패했어요.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const logs = ["STEP 7 전용 프롬프트 생성 완료 ✓", "ChatGPT 자동화 시작…"];
    let resultText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.type === "log" && payload.message) {
          logs.push(payload.message);
          setProgressLines(logs);
        } else if (payload.type === "progress") {
          setProgress(payload.percent || 0);
        } else if (payload.type === "result") {
          resultText = payload.text || "";
        } else if (payload.type === "error") {
          throw new Error(payload.message || "STEP 7 자동 생성 중 오류가 발생했어요.");
        }
      }
    }

    if (!resultText) {
      throw new Error("STEP 7 결과를 받지 못했어요. 프롬프트 복사 방식으로 다시 시도해 주세요.");
    }

    setStep7ResultValue(resultText);
    setProgress(100);
    setProgressLines([...logs, "STEP 7 글 생성 완료 ✓"]);
    setStatus("STEP 7 전용 블로그 글 결과를 받아왔습니다.");
  } catch (error) {
    setError(error?.message || "STEP 7 자동 생성 중 오류가 발생했어요.");
  } finally {
    els.step7AutoGenerateBtn.disabled = false;
    els.step7BuildPromptBtn.disabled = false;
  }
}

function resetAll() {
  els.brandNameInput.value = "";
  els.blogTypeInput.value = "";
  els.primaryCategoryInput.value = "";
  els.targetAudienceInput.value = "";
  els.toneInput.value = "";
  els.avoidInput.value = "";
  els.goalsInput.value = "";
  els.researchDataInput.value = "";
  els.promptOutput.value = "";
  els.copyPromptBtn.disabled = true;
  state.prompt = "";
  state.snapshot = null;
  setStatus("");
  setError("");
  setProgressLines([]);
  els.snapshotMeta.textContent = "리서치툴에서 먼저 검색하면 최근 수집 결과를 자동으로 가져올 수 있습니다.";
  setResultValue("");
  clearStep7Builder();

  try {
    localStorage.removeItem(STRATEGY_SETTINGS_STORAGE_KEY);
    localStorage.removeItem(STRATEGY_SESSION_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }

  syncStep();
}

function bindEvents() {
  [
    els.brandNameInput,
    els.blogTypeInput,
    els.primaryCategoryInput,
    els.targetAudienceInput,
    els.toneInput,
    els.avoidInput,
    els.goalsInput,
  ].forEach((input) => {
    input.addEventListener("change", () => {
      saveSettings();
      saveStrategySession();
    });
  });

  els.loadResearchBtn.addEventListener("click", () => {
    const snapshot = loadResearchSnapshotFromStorage();
    if (!snapshot?.snapshotText) {
      setError("최근 리서치 결과를 찾지 못했어요. 리서치툴에서 먼저 검색해 주세요.");
      return;
    }
    applyResearchSnapshot(snapshot);
    setStatus("최근 리서치 결과를 불러왔습니다.");
    setError("");
  });

  els.buildPromptBtn.addEventListener("click", handleBuildPrompt);
  els.copyPromptBtn.addEventListener("click", async () => {
    if (!els.promptOutput.value.trim()) return;
    await copyText(els.promptOutput.value);
    setStatus("콘텐츠 기획 프롬프트를 복사했습니다.");
  });

  els.autoGenerateBtn.addEventListener("click", handleAutoGenerate);

  els.copyResultBtn.addEventListener("click", async () => {
    if (!els.resultOutput.value.trim()) return;
    await copyText(els.resultOutput.value);
    setStatus("기획 결과를 복사했습니다.");
  });

  els.expandAllStepsBtn.addEventListener("click", () => {
    els.resultPreview.querySelectorAll(".result-step-block").forEach((node) => {
      node.open = true;
    });
    setStatus("모든 STEP을 펼쳤습니다.");
  });

  els.collapseAllStepsBtn.addEventListener("click", () => {
    els.resultPreview.querySelectorAll(".result-step-block").forEach((node) => {
      node.open = false;
    });
    setStatus("모든 STEP을 접었습니다.");
  });

  els.clearResultBtn.addEventListener("click", () => {
    setResultValue("");
    setStatus("기획 결과를 비웠습니다.");
  });

  els.resultOutput.addEventListener("input", () => {
    setResultValue(els.resultOutput.value, { writeToField: false });
  });

  els.researchDataInput.addEventListener("input", () => {
    syncStep();
    saveStrategySession();
  });

  els.resetBtn.addEventListener("click", resetAll);
}

function loadAgentPlanBridge() {
  const PLAN_BRIDGE_KEY = 'agent:planBridge';
  const raw = localStorage.getItem(PLAN_BRIDGE_KEY);
  if (!raw) return;

  let bridge;
  try { bridge = JSON.parse(raw); } catch { return; }

  if (Date.now() - (bridge.savedAt || 0) > 10 * 60 * 1000) {
    localStorage.removeItem(PLAN_BRIDGE_KEY);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.get('from')) return;

  localStorage.removeItem(PLAN_BRIDGE_KEY);

  // Fill in brand info fields if available
  if (bridge.topic && els.primaryCategoryInput) {
    els.primaryCategoryInput.value = bridge.topic;
  }

  // Fill in research data if available
  if (bridge.researchData && els.researchDataInput) {
    els.researchDataInput.value = bridge.researchData;
  }

  // Fill keywords into research data if no summary
  if (!bridge.researchData && bridge.keywords?.length && els.researchDataInput) {
    els.researchDataInput.value = '[에이전트 키워드]\n' + bridge.keywords.map(k => `${k.keyword}${k.volume ? ` (${k.volume.toLocaleString()}회)` : ''}`).join('\n');
  }

  setStatus('에이전트에서 기획 데이터를 불러왔어요. 브랜드 정보를 채우고 기획을 시작해 보세요!');
  syncStep();
}

function init() {
  loadSettings();
  const snapshot = loadResearchSnapshotFromStorage();
  if (snapshot?.snapshotText) {
    applyResearchSnapshot(snapshot);
  }
  bindEvents();
  setStepToggleAvailability(false);
  renderResultPreview("");
  clearStep7Builder();
  syncStep();
  fetchHealth();
  loadAgentPlanBridge();
}

init();
