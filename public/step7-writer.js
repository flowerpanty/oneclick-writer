const STRATEGY_SESSION_STORAGE_KEY = "naverStrategy:lastSession";

const $ = (id) => document.getElementById(id);

const els = {
  loadRecentStrategyBtn: $("loadRecentStrategyBtn"),
  sessionMeta: $("sessionMeta"),
  brandNameInput: $("brandNameInput"),
  blogTypeInput: $("blogTypeInput"),
  primaryCategoryInput: $("primaryCategoryInput"),
  targetAudienceInput: $("targetAudienceInput"),
  toneInput: $("toneInput"),
  avoidInput: $("avoidInput"),
  goalsInput: $("goalsInput"),
  researchDataInput: $("researchDataInput"),
  strategyResultInput: $("strategyResultInput"),
  selectionMeta: $("selectionMeta"),
  selectionBoard: $("selectionBoard"),
  selectionSummary: $("selectionSummary"),
  autoSelectBtn: $("autoSelectBtn"),
  clearSelectionBtn: $("clearSelectionBtn"),
  buildPromptBtn: $("buildPromptBtn"),
  autoGenerateBtn: $("autoGenerateBtn"),
  copyPromptBtn: $("copyPromptBtn"),
  clearPromptBtn: $("clearPromptBtn"),
  promptOutput: $("promptOutput"),
  copyResultBtn: $("copyResultBtn"),
  clearResultBtn: $("clearResultBtn"),
  resultOutput: $("resultOutput"),
  resultPreview: $("resultPreview"),
  resultPreviewHint: $("resultPreviewHint"),
  statusText: $("statusText"),
  errorText: $("errorText"),
  progressContainer: $("progressContainer"),
  progressBar: $("progressBar"),
  progressLog: $("progressLog"),
};

const state = {
  strategyJson: null,
  selectionGroups: [],
  selectedIds: new Set(),
  prompt: "",
  result: "",
  health: null,
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

function renderInlineText(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  els.progressLog.innerHTML = lines.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join("");
}

function setProgress(percent = 0) {
  els.progressContainer.classList.add("visible");
  els.progressBar.classList.remove("indeterminate");
  els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
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

function shortenText(value, maxLength = 160) {
  const text = toText(value);
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
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

function normalizeLikelyJsonMistakes(raw) {
  return (raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`)
    .trim();
}

function tryParseStrategyJson(raw) {
  const candidate = extractJsonObjectText(raw);
  if (!candidate) return { data: null, repaired: false };

  const attempts = [
    { text: candidate, repaired: false },
    { text: normalizeLikelyJsonMistakes(candidate), repaired: true },
  ];

  for (const attempt of attempts) {
    if (!attempt.text) continue;
    try {
      const parsed = JSON.parse(attempt.text);
      if (isPlainObject(parsed)) {
        return { data: parsed, repaired: attempt.repaired };
      }
    } catch {
      // try next
    }
  }

  return { data: null, repaired: false };
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
    `</${tag}>`,
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
    const summaryLines = [
      ["브랜드", toText(summaryBox.brand)],
      ["제품명", toText(summaryBox.productName) || toText(section?.productName)],
      ["가격", toText(summaryBox.price) || toText(section?.price)],
      ["사이즈", toText(summaryBox.size) || toText(section?.size)],
      ["소재", toText(summaryBox.material)],
      ["컬러", toText(summaryBox.color)],
      ["특징", toStringArray(summaryBox.features).join(", ")],
      ["추천 포인트", toStringArray(summaryBox.recommendPoints).join(", ")],
    ].filter(([, value]) => value);

    if (summaryLines.length) {
      chunks.push([
        "<div>",
        ...summaryLines.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</p>`),
        "</div>",
      ].join("\n"));
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
    "</div>",
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
            { label: "예상 독자 고민", value: toText(seoMeta.readerConcern) },
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
            { label: "추천 이미지 구간", value: toText(imageGuide.recommendedSection) },
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
                { label: "한줄평", value: toText(section?.oneLineSummary) },
              ])}
              ${isPlainObject(section?.summaryBox)
                ? `
                  <div class="result-preview-panel">
                    <h5>요약 박스</h5>
                    ${renderInfoRows([
                      { label: "브랜드", value: toText(section.summaryBox.brand) },
                      { label: "제품명", value: toText(section.summaryBox.productName) },
                      { label: "가격", value: toText(section.summaryBox.price) },
                      { label: "사이즈", value: toText(section.summaryBox.size) },
                      { label: "소재", value: toText(section.summaryBox.material) },
                      { label: "컬러", value: toText(section.summaryBox.color) },
                    ])}
                    ${renderTagRow("특징", section.summaryBox.features)}
                    ${renderTagRow("추천 포인트", section.summaryBox.recommendPoints)}
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
  return {
    id: `${groupId}-${index}`,
    title: toText(title) || `항목 ${index + 1}`,
    description: toText(description),
    summaryLines: Array.isArray(summaryLines)
      ? summaryLines.map((line) => shortenText(line, 220)).filter(Boolean)
      : [],
  };
}

function buildSelectionGroups(data) {
  if (!isPlainObject(data)) return [];

  const groups = [];
  const step1 = isPlainObject(data.step1) ? data.step1 : {};
  const step2 = isPlainObject(data.step2) ? data.step2 : {};
  const step3 = isPlainObject(data.step3) ? data.step3 : {};
  const step4 = isPlainObject(data.step4) ? data.step4 : {};
  const step5 = isPlainObject(data.step5) ? data.step5 : {};
  const step6 = isPlainObject(data.step6) ? data.step6 : {};

  const coreKeywords = Array.isArray(step1.coreKeywords) ? step1.coreKeywords : [];
  if (coreKeywords.length) {
    groups.push({
      id: "step1-coreKeywords",
      title: "STEP 1 핵심 키워드",
      helper: "글의 메인 키워드와 중요한 보조 키워드를 고르세요.",
      mode: "multi",
      recommendedCount: 3,
      items: coreKeywords.map((item, index) => createSelectionItem(
        "step1-coreKeywords",
        index,
        item?.keyword,
        item?.reason,
        [`키워드: ${toText(item?.keyword)}`, `중요한 이유: ${toText(item?.reason)}`],
      )),
    });
  }

  const questions = Array.isArray(step1.questions) ? step1.questions : [];
  if (questions.length) {
    groups.push({
      id: "step1-questions",
      title: "STEP 1 질문 / 고민 포인트",
      helper: "독자가 실제로 궁금해하는 질문을 골라 글의 공감 포인트로 씁니다.",
      mode: "multi",
      recommendedCount: 2,
      items: questions.map((item, index) => createSelectionItem(
        "step1-questions",
        index,
        item?.question,
        item?.intent,
        [`질문: ${toText(item?.question)}`, `검색 의도: ${toText(item?.intent)}`],
      )),
    });
  }

  const perspectives = Array.isArray(step1.perspectives) ? step1.perspectives : [];
  if (perspectives.length) {
    groups.push({
      id: "step1-perspectives",
      title: "STEP 1 발전 관점",
      helper: "이 글을 어떤 각도로 풀지 정하는 보조 관점입니다.",
      mode: "multi",
      recommendedCount: 1,
      items: perspectives.map((item, index) => createSelectionItem(
        "step1-perspectives",
        index,
        item?.type,
        item?.direction,
        [`관점: ${toText(item?.type)}`, `활용 방향: ${toText(item?.direction)}`],
      )),
    });
  }

  const topics = Array.isArray(step2.topics) ? step2.topics : [];
  if (topics.length) {
    groups.push({
      id: "step2-topics",
      title: "STEP 2 글감 TOP 10",
      helper: "최종 글의 큰 주제는 여기서 1개를 먼저 고르는 게 가장 안정적입니다.",
      mode: "single",
      recommendedCount: 1,
      items: topics.map((item, index) => createSelectionItem(
        "step2-topics",
        index,
        item?.title || item?.topic,
        item?.reason,
        [
          `글감 주제: ${toText(item?.topic)}`,
          `추천 제목: ${toText(item?.title)}`,
          `검색 의도: ${toText(item?.intent)}`,
          `추천 이유: ${toText(item?.reason)}`,
          `핵심 키워드: ${toStringArray(item?.keywords).join(", ")}`,
          `추천 목차: ${toStringArray(item?.outline).join(" / ")}`,
        ],
      )),
    });
  }

  const priorities = Array.isArray(step3.priorities) ? step3.priorities : [];
  if (priorities.length) {
    groups.push({
      id: "step3-priorities",
      title: "STEP 3 우선 발행 추천",
      helper: "STEP 7의 주제 방향은 보통 여기서 1개 고른 내용이 가장 강하게 반영됩니다.",
      mode: "single",
      recommendedCount: 1,
      items: priorities.map((item, index) => createSelectionItem(
        "step3-priorities",
        index,
        item?.title || item?.topic,
        item?.whyNow,
        [
          `우선 주제: ${toText(item?.topic)}`,
          `추천 제목: ${toText(item?.title)}`,
          `왜 먼저 써야 하는지: ${toText(item?.whyNow)}`,
          `예상 장점: ${toStringArray(item?.advantages).join(", ")}`,
          `우선순위 점수: ${toText(item?.score)}`,
        ],
      )),
    });
  }

  const titles = Array.isArray(step4.titles) ? step4.titles : [];
  if (titles.length) {
    groups.push({
      id: "step4-titles",
      title: "STEP 4 제목 후보",
      helper: "최종 SEO 제목과 대안 제목을 만들 때 참고할 제목을 여러 개 고를 수 있습니다.",
      mode: "multi",
      recommendedCount: 3,
      items: titles.map((title, index) => createSelectionItem(
        "step4-titles",
        index,
        title,
        "",
        [`제목 후보: ${toText(title)}`],
      )),
    });
  }

  const outlines = Array.isArray(step5.detailedOutlines) ? step5.detailedOutlines : [];
  if (outlines.length) {
    groups.push({
      id: "step5-outlines",
      title: "STEP 5 상세 목차",
      helper: "글 구조를 정하는 핵심 단계라서 보통 1개만 고르는 걸 추천합니다.",
      mode: "single",
      recommendedCount: 1,
      items: outlines.map((item, index) => createSelectionItem(
        "step5-outlines",
        index,
        item?.title,
        item?.planningIntent,
        [
          `기획 의도: ${toText(item?.planningIntent)}`,
          `예상 독자 반응: ${toText(item?.expectedReaction)}`,
          `상세 목차: ${[
            toText(item?.outline?.intro),
            toText(item?.outline?.body1),
            toText(item?.outline?.body2),
            toText(item?.outline?.body3),
            toText(item?.outline?.body4),
            toText(item?.outline?.conclusion),
          ].filter(Boolean).join(" / ")}`,
          `녹일 키워드: ${toStringArray(item?.keywords).join(", ")}`,
          `피해야 할 표현: ${toStringArray(item?.avoidExpressions).join(", ")}`,
        ],
      )),
    });
  }

  const intros = Array.isArray(step6.introDrafts) ? step6.introDrafts : [];
  if (intros.length) {
    groups.push({
      id: "step6-intros",
      title: "STEP 6 도입문 초안",
      helper: "도입 톤과 공감 멘트 흐름을 고르는 단계입니다.",
      mode: "single",
      recommendedCount: 1,
      items: intros.map((item, index) => createSelectionItem(
        "step6-intros",
        index,
        item?.title,
        shortenText(toStringArray(item?.introA)[0] || toStringArray(item?.introB)[0], 120),
        [
          `도입문 A: ${toStringArray(item?.introA).join(" / ")}`,
          `도입문 B: ${toStringArray(item?.introB).join(" / ")}`,
        ],
      )),
    });
  }

  return groups.filter((group) => Array.isArray(group.items) && group.items.length);
}

function getDefaultSelectedIds(groups) {
  const selected = new Set();
  groups.forEach((group) => {
    group.items.slice(0, Math.max(1, group.recommendedCount || 1)).forEach((item) => selected.add(item.id));
  });
  return selected;
}

function renderSelectionBoard() {
  const groups = state.selectionGroups || [];
  if (!groups.length) {
    els.selectionBoard.className = "step7-selection-board empty";
    els.selectionBoard.textContent = "콘텐츠 기획 결과 JSON을 붙여넣거나 최근 전략 결과를 불러오면 선택 보드가 열립니다.";
    return;
  }

  els.selectionBoard.className = "step7-selection-board";
  els.selectionBoard.innerHTML = groups.map((group) => `
    <article class="step7-selection-group">
      <div class="step7-selection-group-head">
        <div>
          <h3>${renderInlineText(group.title)}</h3>
          <p>${renderInlineText(group.helper || "")}</p>
        </div>
        <span class="step7-selection-mode">${group.mode === "single" ? "1개 선택 권장" : "여러 개 선택 가능"}</span>
      </div>
      <div class="step7-selection-items">
        ${group.items.map((item) => `
          <button
            type="button"
            class="step7-choice${state.selectedIds.has(item.id) ? " active" : ""}"
            data-choice-id="${escapeHtml(item.id)}"
            data-group-id="${escapeHtml(group.id)}"
            data-choice-mode="${escapeHtml(group.mode)}"
          >
            <strong>${renderInlineText(item.title)}</strong>
            ${item.description ? `<span>${renderInlineText(item.description)}</span>` : ""}
          </button>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function buildSelectionSummary() {
  const lines = ["[STEP 1~6 선택 요약]"];

  state.selectionGroups.forEach((group) => {
    const selectedItems = group.items.filter((item) => state.selectedIds.has(item.id));
    if (!selectedItems.length) return;

    lines.push("");
    lines.push(`## ${group.title}`);
    selectedItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      item.summaryLines.forEach((line) => {
        lines.push(`- ${line}`);
      });
    });
  });

  return lines.length > 1 ? lines.join("\n") : "";
}

function syncSelectionSummary() {
  const summary = buildSelectionSummary();
  els.selectionSummary.value = summary;
  els.selectionMeta.textContent = state.selectedIds.size
    ? `선택된 항목 ${state.selectedIds.size}개를 STEP 7 전용 글 생성기로 넘길 준비가 됐습니다.`
    : "선택된 항목이 아직 없습니다. STEP 1~6에서 글에 쓸 항목을 골라주세요.";
}

function clearPrompt() {
  state.prompt = "";
  els.promptOutput.value = "";
  els.copyPromptBtn.disabled = true;
}

function setResultValue(value = "", options = {}) {
  const { writeToField = true } = options;
  state.result = value;
  if (writeToField) {
    els.resultOutput.value = value;
  }
  els.copyResultBtn.disabled = !value.trim();
  renderResultPreview(value);
  saveSession();
}

function clearResult() {
  setResultValue("");
}

function syncFromStrategyJson(data) {
  const hasSteps = isPlainObject(data) && [1, 2, 3, 4, 5, 6].some((stepNumber) => isPlainObject(data[`step${stepNumber}`]));

  if (!hasSteps) {
    state.strategyJson = null;
    state.selectionGroups = [];
    state.selectedIds = new Set();
    renderSelectionBoard();
    syncSelectionSummary();
    clearPrompt();
    return;
  }

  state.strategyJson = data;
  state.selectionGroups = buildSelectionGroups(data);
  state.selectedIds = getDefaultSelectedIds(state.selectionGroups);
  renderSelectionBoard();
  syncSelectionSummary();
  clearPrompt();
}

function handleStrategyInput(rawValue) {
  const parsed = tryParseStrategyJson(rawValue);
  syncFromStrategyJson(parsed.data);
  saveSession();
}

function toggleSelection(itemId, groupId, mode) {
  if (!itemId) return;

  if (mode === "single") {
    [...state.selectedIds].forEach((selectedId) => {
      if (selectedId.startsWith(`${groupId}-`)) {
        state.selectedIds.delete(selectedId);
      }
    });
    state.selectedIds.add(itemId);
  } else if (state.selectedIds.has(itemId)) {
    state.selectedIds.delete(itemId);
  } else {
    state.selectedIds.add(itemId);
  }

  renderSelectionBoard();
  syncSelectionSummary();
  clearPrompt();
}

function applyDefaultSelections() {
  if (!state.selectionGroups.length) return;
  state.selectedIds = getDefaultSelectedIds(state.selectionGroups);
  renderSelectionBoard();
  syncSelectionSummary();
  clearPrompt();
  setStatus("추천 선택을 다시 적용했습니다.");
}

function clearSelections() {
  state.selectedIds = new Set();
  renderSelectionBoard();
  syncSelectionSummary();
  clearPrompt();
  setStatus("선택 항목을 비웠습니다.");
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
    selectedPlan: els.selectionSummary.value.trim(),
  };
}

function saveSession() {
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
        resultText: els.strategyResultInput.value,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STRATEGY_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySession(session, { announce = false } = {}) {
  if (!session) return false;

  els.brandNameInput.value = session.brandName || "";
  els.blogTypeInput.value = session.blogType || "";
  els.primaryCategoryInput.value = session.primaryCategory || "";
  els.targetAudienceInput.value = session.targetAudience || "";
  els.toneInput.value = session.toneAndManner || "";
  els.avoidInput.value = session.avoidDirection || "";
  els.goalsInput.value = session.workGoals || "";
  els.researchDataInput.value = session.researchData || "";
  els.strategyResultInput.value = session.resultText || "";

  const savedAt = formatSavedAt(session.savedAt);
  els.sessionMeta.textContent = session.resultText
    ? `${savedAt || "방금"} 저장된 전략 결과를 불러왔습니다. 이 화면에서 바로 STEP 7만 진행할 수 있습니다.`
    : "저장된 전략 결과가 아직 없습니다. 콘텐츠 기획 툴에서 결과를 만든 뒤 다시 불러와 주세요.";

  handleStrategyInput(session.resultText || "");

  if (announce && session.resultText) {
    setStatus("최근 전략 결과를 불러왔습니다.");
    setError("");
  }
  return Boolean(session.resultText);
}

async function buildPrompt() {
  setError("");
  const payload = gatherPayload();

  if (!payload.selectedPlan) {
    throw new Error("STEP 1~6에서 글에 쓸 항목을 먼저 선택해 주세요.");
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

  state.prompt = json.prompt || "";
  els.promptOutput.value = state.prompt;
  els.copyPromptBtn.disabled = !state.prompt;
  saveSession();
  setStatus(`STEP 7 전용 프롬프트를 만들었습니다. 선택 요약 ${json.selectedLength?.toLocaleString?.("ko-KR") || json.selectedLength || 0}자를 반영했습니다.`);
  return state.prompt;
}

async function handleBuildPrompt() {
  try {
    setProgressLines([]);
    await buildPrompt();
  } catch (error) {
    setError(error?.message || "STEP 7 전용 프롬프트 생성 중 오류가 발생했어요.");
  }
}

async function handleAutoGenerate() {
  setError("");
  els.autoGenerateBtn.disabled = true;
  els.buildPromptBtn.disabled = true;
  setProgressLines(["STEP 7 전용 프롬프트 생성 중…"]);
  setProgress(8);

  try {
    const prompt = await buildPrompt();
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

    setResultValue(resultText);
    setProgress(100);
    setProgressLines([...logs, "STEP 7 글 생성 완료 ✓"]);
    setStatus("STEP 7 전용 블로그 글 결과를 받아왔습니다.");
  } catch (error) {
    setError(error?.message || "STEP 7 자동 생성 중 오류가 발생했어요.");
  } finally {
    els.autoGenerateBtn.disabled = false;
    els.buildPromptBtn.disabled = false;
  }
}

function renderResultPreview(text = "") {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    els.resultPreview.className = "result-preview empty";
    els.resultPreview.textContent = "STEP 7 결과가 들어오면 여기서 최종 블로그 글 구조를 확인할 수 있습니다.";
    els.resultPreviewHint.textContent = "STEP 7 결과를 붙여넣으면 제목 후보, 메타 정보, HTML 본문까지 보기 좋게 정리해서 보여줍니다.";
    return;
  }

  const parsed = tryParseStrategyJson(normalized);
  const featuredDraft = extractFeaturedDraftPayload(parsed.data || {});

  if (featuredDraft) {
    els.resultPreview.className = "result-preview";
    els.resultPreview.innerHTML = renderFeaturedDraftCard(featuredDraft);
    els.resultPreviewHint.textContent = parsed.repaired
      ? "STEP 7 JSON의 작은 오류를 자동 보정해서 정리했습니다."
      : "STEP 7 JSON 결과를 보기 좋게 정리해서 보여주고 있습니다.";
    return;
  }

  els.resultPreview.className = "result-preview empty";
  els.resultPreview.textContent = normalized;
  els.resultPreviewHint.textContent = "JSON 형식이 아니어서 원문 그대로 보여주고 있습니다. 가능하면 JSON 결과를 붙여넣어 주세요.";
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
    // ignore
  }
}

function bindEvents() {
  els.loadRecentStrategyBtn.addEventListener("click", () => {
    const session = loadSession();
    if (!session?.resultText) {
      setError("최근 전략 결과를 찾지 못했어요. 콘텐츠 기획 툴에서 결과를 만든 뒤 다시 시도해 주세요.");
      return;
    }
    applySession(session, { announce: true });
  });

  [
    els.brandNameInput,
    els.blogTypeInput,
    els.primaryCategoryInput,
    els.targetAudienceInput,
    els.toneInput,
    els.avoidInput,
    els.goalsInput,
    els.researchDataInput,
  ].forEach((input) => {
    input.addEventListener("change", saveSession);
  });

  els.strategyResultInput.addEventListener("input", () => {
    handleStrategyInput(els.strategyResultInput.value);
  });

  els.selectionBoard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-choice-id]");
    if (!button) return;
    toggleSelection(
      button.getAttribute("data-choice-id"),
      button.getAttribute("data-group-id"),
      button.getAttribute("data-choice-mode"),
    );
  });

  els.autoSelectBtn.addEventListener("click", () => {
    if (!state.selectionGroups.length) {
      setError("먼저 콘텐츠 기획 결과 JSON을 불러와 주세요.");
      return;
    }
    applyDefaultSelections();
  });

  els.clearSelectionBtn.addEventListener("click", clearSelections);
  els.buildPromptBtn.addEventListener("click", handleBuildPrompt);
  els.autoGenerateBtn.addEventListener("click", handleAutoGenerate);

  els.copyPromptBtn.addEventListener("click", async () => {
    if (!els.promptOutput.value.trim()) return;
    await copyText(els.promptOutput.value);
    setStatus("STEP 7 프롬프트를 복사했습니다.");
  });

  els.clearPromptBtn.addEventListener("click", () => {
    clearPrompt();
    setStatus("STEP 7 프롬프트를 비웠습니다.");
  });

  els.copyResultBtn.addEventListener("click", async () => {
    if (!els.resultOutput.value.trim()) return;
    await copyText(els.resultOutput.value);
    setStatus("STEP 7 결과를 복사했습니다.");
  });

  els.clearResultBtn.addEventListener("click", () => {
    clearResult();
    setStatus("STEP 7 결과를 비웠습니다.");
  });

  els.resultOutput.addEventListener("input", () => {
    setResultValue(els.resultOutput.value, { writeToField: false });
  });
}

function init() {
  const session = loadSession();
  if (session) {
    applySession(session);
  } else {
    renderSelectionBoard();
    syncSelectionSummary();
  }
  renderResultPreview("");
  bindEvents();
  fetchHealth();
}

init();
