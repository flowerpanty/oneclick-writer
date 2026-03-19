const BLOG_WRITER_STORAGE_KEY = "blogWriter:lastSession";

const $ = (id) => document.getElementById(id);

const els = {
  brandNameInput: $("brandNameInput"),
  blogTypeInput: $("blogTypeInput"),
  primaryCategoryInput: $("primaryCategoryInput"),
  targetAudienceInput: $("targetAudienceInput"),
  toneInput: $("toneInput"),
  avoidInput: $("avoidInput"),
  goalsInput: $("goalsInput"),
  researchDataInput: $("researchDataInput"),
  writingPlanInput: $("writingPlanInput"),
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
  prompt: "",
  result: "",
  health: null,
  resultRepairTicket: 0,
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

function tryParseJson(raw) {
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
        '<div style="margin:20px 0;padding:18px 22px;border-radius:14px;border:1px solid #d1d5db;border-left:4px solid #3b82f6;background:#f8fafc;">',
        ...summaryLines.map(([label, value]) => `<p style="margin:6px 0;line-height:1.7;"><strong style="color:#1e3a5f;">${escapeHtml(label)}</strong> &nbsp;${escapeHtml(value)}</p>`),
        '</div>',
      ].join("\n"));
    }

    if (toText(section?.betterComment)) {
      chunks.push(`<div style="margin:16px 0;padding:16px 20px;border-radius:14px;border:1px solid #fde68a;background:#fffbeb;display:flex;gap:10px;align-items:flex-start;"><span style="font-size:22px;line-height:1.3;">😎</span><div><p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#92400e;">베러의 한마디</p><p style="margin:0;line-height:1.7;color:#78350f;">${escapeHtml(toText(section.betterComment))}</p></div></div>`);
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

function htmlToNaverText(html) {
  if (!html) return "";
  
  let text = html
    // 1. 요약 박스 (Summary Box) 처리 - 파란색 배경 스타일 인식
    .replace(/<div style="[^"]*background:#f8fafc;[^"]*">([\s\S]*?)<\/div>/gi, (match, content) => {
      let inner = content
        .replace(/<p[^>]*><strong[^>]*>(.*?)<\/strong>\s*&nbsp;(.*?)<\/p>/gi, "📌 $1: $2")
        .replace(/<[^>]+>/g, "")
        .trim();
      return `\n\n[ 📝 제품 요약 및 핵심 정보 ]\n--------------------------------\n${inner}\n--------------------------------\n`;
    })
    // 2. 베러의 한마디 (Better Comment) 처리 - 노란색 배경 스타일 인식
    .replace(/<div style="[^"]*background:#fffbeb;[^"]*">([\s\S]*?)<\/div>/gi, (match, content) => {
      let inner = content
        .replace(/<span[^>]*>😎<\/span>/gi, "") // 이모지는 아래에서 추가
        .replace(/베러의 한마디/gi, "")
        .replace(/<[^>]+>/g, " ")
        .trim();
      return `\n💡 [베러의 한마디] 😎\n"${inner}"\n`;
    })
    // 3. 일반적인 태그 변환
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n\n■ $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n\n▸ $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
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
                  <div class="result-summary-box">
                    <h5>📦 요약 박스</h5>
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
                  <div class="result-better-comment">
                    <div class="result-better-comment-inner">
                      <span class="result-better-comment-label">베러의 한마디</span>
                      <p class="result-better-comment-text">${renderInlineText(toText(section.betterComment))}</p>
                    </div>
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
      <div class="result-preview-panel">
        <h5>해시태그 / 키워드 한 줄</h5>
        <p class="result-preview-text">${renderInlineText(toText(featuredDraft.hashtagsLine) || "내용이 없습니다.")}</p>
      </div>
      <div class="result-json-split-grid">
        <div class="result-preview-panel">
          <h5>📋 네이버 블로그용 본문</h5>
          <p class="result-preview-text" style="margin-bottom:8px;">네이버 블로그는 HTML을 지원하지 않으므로, 순수 텍스트로 변환된 본문입니다.</p>
          <button type="button" class="btn-copy copy-naver-text-btn" style="width:100%;">📋 네이버용 텍스트 복사</button>
          <textarea class="naver-text-storage" style="display:none;" aria-hidden="true">${escapeHtml(htmlToNaverText(displayedHtmlBody))}</textarea>
        </div>
        <div class="result-preview-panel">
          <h5>🌐 HTML 최종 본문 (워드프레스 등)</h5>
          <p class="result-preview-text" style="margin-bottom:8px;">워드프레스 등 HTML을 지원하는 플랫폼용 본문입니다.</p>
          <button type="button" class="btn-copy copy-html-body-btn" style="width:100%;">📋 HTML 본문 복사</button>
          <textarea class="html-body-storage" style="display:none;" aria-hidden="true">${escapeHtml(displayedHtmlBody)}</textarea>
        </div>
      </div>
    </article>
  `;
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

  const parsed = tryParseJson(value || "");
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
        setStatus("붙여넣은 블로그 JSON의 작은 오류를 자동 보정했습니다.");
      })
      .catch(() => {
        // ignore repair failures and keep original preview
      });
  }
}

function clearResult() {
  setResultValue("");
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
    selectedPlan: els.writingPlanInput.value.trim(),
  };
}

function saveSession() {
  try {
    localStorage.setItem(
      BLOG_WRITER_STORAGE_KEY,
      JSON.stringify({
        brandName: els.brandNameInput.value,
        blogType: els.blogTypeInput.value,
        primaryCategory: els.primaryCategoryInput.value,
        targetAudience: els.targetAudienceInput.value,
        toneAndManner: els.toneInput.value,
        avoidDirection: els.avoidInput.value,
        workGoals: els.goalsInput.value,
        researchData: els.researchDataInput.value,
        writingPlan: els.writingPlanInput.value,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(BLOG_WRITER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySession(session) {
  if (!session) return false;

  els.brandNameInput.value = session.brandName || "";
  els.blogTypeInput.value = session.blogType || "";
  els.primaryCategoryInput.value = session.primaryCategory || "";
  els.targetAudienceInput.value = session.targetAudience || "";
  els.toneInput.value = session.toneAndManner || "";
  els.avoidInput.value = session.avoidDirection || "";
  els.goalsInput.value = session.workGoals || "";
  els.researchDataInput.value = session.researchData || "";
  els.writingPlanInput.value = session.writingPlan || "";

  return true;
}

async function buildPrompt() {
  setError("");
  const payload = gatherPayload();

  if (!payload.selectedPlan || payload.selectedPlan.length < 20) {
    throw new Error("'글 구성 & 참고 정보'를 20자 이상 입력해 주세요. 주제, 키워드, 목차 등을 적어주세요.");
  }

  const response = await fetch("/api/research-strategy/step7-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.error || "블로그 프롬프트 생성에 실패했어요.");
  }

  state.prompt = json.prompt || "";
  els.promptOutput.value = state.prompt;
  els.copyPromptBtn.disabled = !state.prompt;
  saveSession();
  setStatus(`블로그 프롬프트를 만들었습니다. 글 구성 정보 ${json.selectedLength?.toLocaleString?.("ko-KR") || json.selectedLength || 0}자를 반영했습니다.`);
  return state.prompt;
}

async function handleBuildPrompt() {
  try {
    setProgressLines([]);
    await buildPrompt();
  } catch (error) {
    setError(error?.message || "블로그 프롬프트 생성 중 오류가 발생했어요.");
  }
}

async function handleAutoGenerate() {
  setError("");
  els.autoGenerateBtn.disabled = true;
  els.buildPromptBtn.disabled = true;
  setProgressLines(["블로그 프롬프트 생성 중…"]);
  setProgress(8);

  try {
    const prompt = await buildPrompt();
    setProgressLines(["블로그 프롬프트 생성 완료 ✓", "ChatGPT 자동화 시작…"]);
    setProgress(18);

    const response = await fetch("/api/research-strategy/auto-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson?.error || "블로그 자동 생성에 실패했어요.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const logs = ["블로그 프롬프트 생성 완료 ✓", "ChatGPT 자동화 시작…"];
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
          throw new Error(payload.message || "블로그 자동 생성 중 오류가 발생했어요.");
        }
      }
    }

    if (!resultText) {
      throw new Error("블로그 결과를 받지 못했어요. 프롬프트 복사 방식으로 다시 시도해 주세요.");
    }

    setResultValue(resultText);
    setProgress(100);
    setProgressLines([...logs, "블로그 글 생성 완료 ✓"]);
    setStatus("블로그 글 결과를 받아왔습니다.");
  } catch (error) {
    setError(error?.message || "블로그 자동 생성 중 오류가 발생했어요.");
  } finally {
    els.autoGenerateBtn.disabled = false;
    els.buildPromptBtn.disabled = false;
  }
}

function renderResultPreview(text = "") {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    els.resultPreview.className = "result-preview empty";
    els.resultPreview.textContent = "블로그 결과가 들어오면 여기서 최종 블로그 글 구조를 확인할 수 있습니다.";
    els.resultPreviewHint.textContent = "블로그 결과를 붙여넣으면 제목 후보, 메타 정보, HTML 본문까지 보기 좋게 정리해서 보여줍니다.";
    return;
  }

  const parsed = tryParseJson(normalized);
  const featuredDraft = extractFeaturedDraftPayload(parsed.data || {});

  if (featuredDraft) {
    els.resultPreview.className = "result-preview";
    els.resultPreview.innerHTML = renderFeaturedDraftCard(featuredDraft);
    els.resultPreviewHint.textContent = parsed.repaired
      ? "블로그 JSON의 작은 오류를 자동 보정해서 정리했습니다."
      : "블로그 JSON 결과를 보기 좋게 정리해서 보여주고 있습니다.";
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
  [
    els.brandNameInput,
    els.blogTypeInput,
    els.primaryCategoryInput,
    els.targetAudienceInput,
    els.toneInput,
    els.avoidInput,
    els.goalsInput,
    els.researchDataInput,
    els.writingPlanInput,
  ].forEach((input) => {
    input.addEventListener("change", saveSession);
  });

  els.buildPromptBtn.addEventListener("click", handleBuildPrompt);
  els.autoGenerateBtn.addEventListener("click", handleAutoGenerate);

  els.copyPromptBtn.addEventListener("click", async () => {
    if (!els.promptOutput.value.trim()) return;
    await copyText(els.promptOutput.value);
    setStatus("블로그 프롬프트를 복사했습니다.");
  });

  els.clearPromptBtn.addEventListener("click", () => {
    clearPrompt();
    setStatus("블로그 프롬프트를 비웠습니다.");
  });

  els.copyResultBtn.addEventListener("click", async () => {
    if (!els.resultOutput.value.trim()) return;
    await copyText(els.resultOutput.value);
    setStatus("블로그 결과를 복사했습니다.");
  });

  els.clearResultBtn.addEventListener("click", () => {
    clearResult();
    setStatus("블로그 결과를 비웠습니다.");
  });

  els.writingPlanInput.addEventListener("input", () => {
    if (!els.primaryCategoryInput.value) {
      const inferred = inferBlogCategory(els.writingPlanInput.value);
      if (inferred) els.primaryCategoryInput.value = inferred;
    }
  });

  els.resultOutput.addEventListener("input", () => {
    setResultValue(els.resultOutput.value, { writeToField: false });
  });

  els.resultPreview.addEventListener("click", async (event) => {
    const naverBtn = event.target.closest(".copy-naver-text-btn");
    if (naverBtn) {
      const textarea = naverBtn.parentElement.querySelector(".naver-text-storage");
      if (textarea?.value) {
        await copyText(textarea.value);
        setStatus("네이버 블로그용 텍스트를 복사했습니다.");
      }
      return;
    }
    const htmlBtn = event.target.closest(".copy-html-body-btn");
    if (htmlBtn) {
      const textarea = htmlBtn.parentElement.querySelector(".html-body-storage");
      if (textarea?.value) {
        await copyText(textarea.value);
        setStatus("HTML 본문을 복사했습니다.");
      }
    }
  });
}

function inferBlogCategory(text) {
  if (!text) return '';
  if (/가방|백팩|파우치|지갑|토트|크로스백|숄더백|클러치|핸드백/i.test(text)) return '가방';
  if (/쿠키|케이크|디저트|베이킹|마카롱|빵|브라우니|카스테라|답례품|수제/i.test(text)) return '쿠키';
  return '일반';
}

function loadAgentBlogBridge() {
  const BLOG_BRIDGE_KEY = 'agent:blogBridge';
  const raw = localStorage.getItem(BLOG_BRIDGE_KEY);
  if (!raw) return;

  let bridge;
  try { bridge = JSON.parse(raw); } catch { return; }

  if (Date.now() - (bridge.savedAt || 0) > 10 * 60 * 1000) {
    localStorage.removeItem(BLOG_BRIDGE_KEY);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.get('from')) return;

  localStorage.removeItem(BLOG_BRIDGE_KEY);

  // brandName은 항상 빈값으로 (이전 세션 덮어쓰기 방지)
  els.brandNameInput.value = bridge.brandName || '';
  if (bridge.blogType)        els.blogTypeInput.value        = bridge.blogType;
  if (bridge.targetAudience)  els.targetAudienceInput.value  = bridge.targetAudience;
  if (bridge.toneAndManner)   els.toneInput.value            = bridge.toneAndManner;
  if (bridge.avoidDirection)  els.avoidInput.value           = bridge.avoidDirection;
  if (bridge.workGoals)       els.goalsInput.value           = bridge.workGoals;
  if (bridge.researchData)    els.researchDataInput.value    = bridge.researchData;
  if (bridge.writingPlan)     els.writingPlanInput.value     = bridge.writingPlan;

  // 주력 카테고리: writingPlan 내용에서 유추
  const inferredCategory = inferBlogCategory(bridge.writingPlan || '');
  els.primaryCategoryInput.value = inferredCategory;

  setStatus('에이전트에서 블로그 글 구성을 불러왔어요. 내용을 확인하고 "블로그 프롬프트 만들기"를 눌러보세요!');
}

function init() {
  const session = loadSession();
  if (session) {
    applySession(session);
  }
  renderResultPreview("");
  bindEvents();
  fetchHealth();
  loadAgentBlogBridge();
}

init();
