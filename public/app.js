/* ===== OneClick Writer — Client Application ===== */
const $ = (id) => document.getElementById(id);

// ===== Element References =====
const els = {
  topic: $("topic"),
  story: $("story"),
  format: $("format"),
  brandName: $("brandName"),
  productName: $("productName"),
  category: $("category"),
  focusKeyword: $("focusKeyword"),
  lsiKeywords: $("lsiKeywords"),
  mustInclude: $("mustInclude"),
  cta: $("cta"),
  seoLevel: $("seoLevel"),
  keywordIntent: $("keywordIntent"),
  keywordMentions: $("keywordMentions"),
  targetAudience: $("targetAudience"),
  includeFaq: $("includeFaq"),
  twoVariants: $("twoVariants"),
  styleNotes: $("styleNotes"),
  saveStyleNotesBtn: $("saveStyleNotesBtn"),
  styleSampleSource: $("styleSampleSource"),
  styleSampleLabel: $("styleSampleLabel"),
  styleSampleText: $("styleSampleText"),
  learnStyleTextBtn: $("learnStyleTextBtn"),
  styleUrl: $("styleUrl"),
  learnStyleUrlBtn: $("learnStyleUrlBtn"),
  clearStyleMemoryBtn: $("clearStyleMemoryBtn"),
  styleSummary: $("styleSummary"),
  styleSamples: $("styleSamples"),

  generateBtn: $("generateBtn"),
  autoGenerateBtn: $("autoGenerateBtn"),
  openChatgptBtn: $("openChatgptBtn"),
  applyJsonBtn: $("applyJsonBtn"),
  clearBtn: $("clearBtn"),
  copyPromptBtn: $("copyPromptBtn"),

  generatedPrompt: $("generatedPrompt"),
  resultJson: $("resultJson"),

  status: $("status"),
  error: $("error"),

  versionTabs: $("versionTabs"),
  seoAudit: $("seoAudit"),

  progressContainer: $("progressContainer"),
  progressBar: $("progressBar"),
  progressLog: $("progressLog"),

  toast: $("toast"),

  // Steps
  step1: $("step1"),
  step2: $("step2"),
  step3: $("step3"),
  conn1: $("conn1"),
  conn2: $("conn2"),

  // Channel outputs
  igCaption: $("igCaption"),
  igHashtags: $("igHashtags"),
  igAlt: $("igAlt"),
  copyIg: $("copyIg"),

  nvTitle: $("nvTitle"),
  nvBody: $("nvBody"),
  nvHashtags: $("nvHashtags"),
  copyNvAll: $("copyNvAll"),
  copyNvTitle: $("copyNvTitle"),

  wpSeoTitle: $("wpSeoTitle"),
  wpSlug: $("wpSlug"),
  wpMeta: $("wpMeta"),
  wpFocus: $("wpFocus"),
  wpLsi: $("wpLsi"),
  wpBody: $("wpBody"),
  copyWpSeoTitle: $("copyWpSeoTitle"),
  copyWpSlug: $("copyWpSlug"),
  copyWpMeta: $("copyWpMeta"),
  copyWpFocus: $("copyWpFocus"),
  copyWpLsi: $("copyWpLsi"),
  copyWpBody: $("copyWpBody"),

  // Threads outputs (A/B shown simultaneously)
  thTextA: $("thTextA"),
  thHashtagsA: $("thHashtagsA"),
  copyThA: $("copyThA"),
  thTextB: $("thTextB"),
  thHashtagsB: $("thHashtagsB"),
  thAltB: $("thAltB"),
  copyThB: $("copyThB"),

  // SNS Summary outputs
  ssThreadsText: $("ssThreadsText"),
  copySsThreads: $("copySsThreads"),
  ssInstagramText: $("ssInstagramText"),
  copySsInstagram: $("copySsInstagram"),
  ssHashtags: $("ssHashtags"),
  copySsHashtags: $("copySsHashtags"),
};

// ===== State =====
const state = {
  parsed: null,
  variantCount: 1,
  activeVersion: 0,
  prompt: "",
  styleMemory: null,
};

// ===== Toast Notification =====
let toastTimer = null;
function showToast(msg, duration = 2000) {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, duration);
}

// ===== Status & Error =====
function setStatus(msg) {
  els.status.textContent = msg || "";
}

function setError(msg) {
  els.error.textContent = msg || "";
}

// ===== Step Indicator =====
function setStep(active) {
  const steps = [els.step1, els.step2, els.step3];
  const conns = [els.conn1, els.conn2];

  steps.forEach((s, i) => {
    s.classList.remove("active", "done");
    if (i + 1 < active) s.classList.add("done");
    if (i + 1 === active) s.classList.add("active");
  });

  conns.forEach((c, i) => {
    c.classList.toggle("done", i + 1 < active);
  });
}

// ===== Progress Bar =====
function showProgress() {
  els.progressContainer.classList.add("visible");
  els.progressBar.style.width = "0%";
  els.progressBar.classList.remove("indeterminate");
  els.progressLog.innerHTML = "";
}

function setProgress(pct) {
  els.progressBar.classList.remove("indeterminate");
  els.progressBar.style.width = `${pct}%`;
}

function setProgressIndeterminate() {
  els.progressBar.classList.add("indeterminate");
}

function addProgressLog(msg) {
  const div = document.createElement("div");
  div.className = "log-line";
  div.textContent = msg;
  els.progressLog.appendChild(div);
  els.progressLog.scrollTop = els.progressLog.scrollHeight;
}

function hideProgress() {
  els.progressContainer.classList.remove("visible");
}

// ===== Copy to Clipboard =====
async function copyToClipboard(text) {
  const value = (text || "").toString();
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  showToast("✅ 복사 완료!");
}

// ===== Copy button feedback =====
function attachCopyFeedback(btn) {
  btn.addEventListener("click", () => {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  });
}

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setButtonBusy(btn, isBusy, busyLabel) {
  if (!btn) return;
  if (!btn.dataset.labelDefault) {
    btn.dataset.labelDefault = btn.textContent;
  }
  btn.disabled = isBusy;
  btn.textContent = isBusy ? busyLabel : btn.dataset.labelDefault;
}

function renderStyleMemory(data) {
  state.styleMemory = data || null;
  const profile = data?.profile;
  const samples = Array.isArray(data?.samples) ? data.samples : [];

  els.styleNotes.value = data?.notes || "";

  if (!profile?.hasData) {
    els.styleSummary.innerHTML =
      '<div class="style-empty">아직 저장된 스타일 데이터가 없습니다. 샘플 글이나 URL을 넣으면 다음 프롬프트부터 반영됩니다.</div>';
    els.styleSamples.innerHTML =
      '<div class="style-empty">저장된 샘플이 없습니다.</div>';
    return;
  }

  const summaryItems = [
    profile.toneLabel ? `말투: ${profile.toneLabel}` : "",
    profile.sentenceRhythm ? `문장 호흡: ${profile.sentenceRhythm}` : "",
    profile.paragraphStyle ? `문단 리듬: ${profile.paragraphStyle}` : "",
    profile.closingStyle ? `마무리 습관: ${profile.closingStyle}` : "",
    profile.emojiStyle ? `이모지 습관: ${profile.emojiStyle}` : "",
  ].filter(Boolean);

  const termsHtml =
    profile.frequentTerms?.length
      ? `<div class="style-tags">${profile.frequentTerms
        .map((term) => `<span class="style-tag">${escapeHtml(term)}</span>`)
        .join("")}</div>`
      : '<div class="style-empty">자주 쓰는 표현은 샘플이 더 쌓이면 표시됩니다.</div>';

  els.styleSummary.innerHTML = [
    `<div class="style-meta">저장 샘플 ${profile.sampleCount}개</div>`,
    `<ul class="style-list">${summaryItems
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ul>`,
    termsHtml,
  ].join("");

  els.styleSamples.innerHTML = samples.length
    ? samples
      .slice()
      .reverse()
      .map((sample) => {
        const metaBits = [
          sample.sourceType === "url" ? "URL" : sample.sourceType,
          sample.charCount ? `${sample.charCount}자` : "",
        ].filter(Boolean);
        const linkHtml = sample.sourceUrl
          ? `<a href="${escapeHtml(sample.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 열기</a>`
          : "";
        return [
          '<div class="style-sample-card">',
          `<div class="style-sample-head"><strong>${escapeHtml(sample.sourceLabel || "샘플")}</strong><span>${escapeHtml(metaBits.join(" · "))}</span></div>`,
          `<div class="style-sample-text">${escapeHtml(sample.excerpt || "")}</div>`,
          linkHtml ? `<div class="style-sample-link">${linkHtml}</div>` : "",
          "</div>",
        ].join("");
      })
      .join("")
    : '<div class="style-empty">저장된 샘플이 없습니다.</div>';
}

async function loadStyleMemory() {
  try {
    const res = await fetch("/api/style-memory");
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "스타일 메모리를 불러오지 못했어요.");
    }
    renderStyleMemory(json);
  } catch (err) {
    setError(err?.message || "스타일 메모리를 불러오지 못했어요.");
  }
}

async function saveStyleNotes() {
  setError("");
  setStatus("");
  setButtonBusy(els.saveStyleNotesBtn, true, "저장 중...");

  try {
    const res = await fetch("/api/style-memory/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: els.styleNotes.value || "" }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "스타일 메모 저장 실패");
    }
    renderStyleMemory(json);
    setStatus("스타일 메모를 저장했습니다.");
    showToast("스타일 메모 저장 완료");
  } catch (err) {
    setError(err?.message || "스타일 메모 저장 중 오류가 발생했어요.");
  } finally {
    setButtonBusy(els.saveStyleNotesBtn, false, "저장 중...");
  }
}

async function learnStyleFromText() {
  setError("");
  setStatus("");

  const text = (els.styleSampleText.value || "").trim();
  if (!text) {
    setError("학습할 샘플 글을 붙여넣어 주세요.");
    return;
  }

  setButtonBusy(els.learnStyleTextBtn, true, "학습 중...");

  try {
    const res = await fetch("/api/style-memory/sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: els.styleSampleSource.value || "manual",
        sourceLabel: (els.styleSampleLabel.value || "").trim() || "직접 입력 샘플",
        text,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "샘플 학습 실패");
    }
    renderStyleMemory(json);
    els.styleSampleText.value = "";
    els.styleSampleLabel.value = "";
    setStatus("스타일 샘플을 저장했습니다. 다음 프롬프트부터 반영됩니다.");
    showToast("샘플 학습 완료");
  } catch (err) {
    setError(err?.message || "샘플 학습 중 오류가 발생했어요.");
  } finally {
    setButtonBusy(els.learnStyleTextBtn, false, "학습 중...");
  }
}

async function learnStyleFromUrl() {
  setError("");
  setStatus("");

  const url = (els.styleUrl.value || "").trim();
  if (!url) {
    setError("학습할 URL을 입력해 주세요.");
    return;
  }

  setButtonBusy(els.learnStyleUrlBtn, true, "가져오는 중...");

  try {
    const res = await fetch("/api/style-memory/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "URL 학습 실패");
    }
    renderStyleMemory(json);
    els.styleUrl.value = "";
    const importedTitle = json?.imported?.title ? ` (${json.imported.title})` : "";
    setStatus(`URL에서 스타일 샘플을 저장했습니다${importedTitle}.`);
    showToast("URL 학습 완료");
  } catch (err) {
    setError(err?.message || "URL 학습 중 오류가 발생했어요.");
  } finally {
    setButtonBusy(els.learnStyleUrlBtn, false, "가져오는 중...");
  }
}

async function clearStyleMemory() {
  setError("");
  setStatus("");
  setButtonBusy(els.clearStyleMemoryBtn, true, "비우는 중...");

  try {
    const res = await fetch("/api/style-memory", {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "스타일 메모리 초기화 실패");
    }
    renderStyleMemory(json);
    els.styleSampleText.value = "";
    els.styleSampleLabel.value = "";
    els.styleUrl.value = "";
    setStatus("스타일 메모리를 비웠습니다.");
    showToast("스타일 메모리 초기화");
  } catch (err) {
    setError(err?.message || "스타일 메모리를 비우지 못했어요.");
  } finally {
    setButtonBusy(els.clearStyleMemoryBtn, false, "비우는 중...");
  }
}

// ===== Gather form input =====
function gatherInput() {
  return {
    topic: els.topic.value.trim(),
    story: els.story.value.trim(),
    format: els.format.value.trim(),
    variants: els.twoVariants.checked ? 2 : 1,
    brandName: els.brandName.value.trim(),
    productName: els.productName.value.trim(),
    category: els.category.value,
    focusKeyword: els.focusKeyword.value.trim(),
    lsiKeywords: els.lsiKeywords.value.trim(),
    mustInclude: els.mustInclude.value.trim(),
    cta: els.cta.value.trim(),
    seoLevel: els.seoLevel.value,
    keywordIntent: els.keywordIntent.value,
    keywordMentions: els.keywordMentions.value,
    targetAudience: els.targetAudience.value.trim(),
    includeFaq: Boolean(els.includeFaq.checked),
  };
}

// ===== Tab Switching =====
function activateTab(name) {
  document.querySelectorAll(".channel-tab[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });

  ["instagram", "naver", "wordpress", "threads", "sns_summary"].forEach((tab) => {
    const panel = $(`panel-${tab}`);
    if (panel) panel.classList.toggle("active", tab === name);
  });
}

// ===== SEO Audit =====
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text, keyword) {
  if (!text || !keyword) return 0;
  const re = new RegExp(escapeRegex(keyword), "gi");
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function getWordCount(text) {
  return (text || "")
    .replace(/[#*`>\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function runSeoAudit(v) {
  if (!v) {
    els.seoAudit.textContent =
      "결과를 불러오면 핵심 키워드 기반 SEO 체크가 표시됩니다.";
    return;
  }

  const seo = v.seo || {};
  const body = (v.body || "").trim();
  const focus = (
    els.focusKeyword.value ||
    seo.focus_keyphrase ||
    ""
  ).trim();

  if (!focus) {
    els.seoAudit.innerHTML =
      "핵심 키워드가 비어 있어 정밀 체크를 건너뜁니다. <strong>핵심 키워드</strong>를 입력하면 점검이 강화됩니다.";
    return;
  }

  const mentionsRange = (els.keywordMentions.value || "3-5")
    .split("-")
    .map((n) => parseInt(n, 10));
  const minMentions = Number.isFinite(mentionsRange[0]) ? mentionsRange[0] : 3;
  const maxMentions = Number.isFinite(mentionsRange[1]) ? mentionsRange[1] : 5;

  const wordCount = getWordCount(body);
  const occurrences = countOccurrences(body, focus);
  const density = wordCount
    ? ((occurrences / wordCount) * 100).toFixed(2)
    : "0.00";

  const firstParagraph = body.split(/\n\s*\n/)[0] || "";
  const h2Lines = body
    .split("\n")
    .filter((line) => line.trim().startsWith("## "));
  const bodyLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = bodyLines[bodyLines.length - 1] || "";
  const beforeLast = bodyLines[bodyLines.length - 2] || "";
  const endsWithQuestion =
    /[?？]$/.test(beforeLast) || /[?？]$/.test(body.trim());
  const hasFinalHashtagLine = /^#/.test(lastLine);

  const checks = [
    {
      label: "SEO Title에 핵심 키워드 포함",
      pass: (seo.seo_title || "").includes(focus),
    },
    {
      label: "Meta description에 핵심 키워드 포함",
      pass: (seo.meta_description || "").includes(focus),
    },
    {
      label: `본문 키워드 반복 ${minMentions}-${maxMentions}회`,
      pass: occurrences >= minMentions && occurrences <= maxMentions,
    },
    {
      label: "첫 문단에 핵심 키워드 포함",
      pass: firstParagraph.includes(focus),
    },
    {
      label: "H2 제목에 핵심 키워드(또는 변형) 1개 이상",
      pass: h2Lines.some((line) => line.includes(focus)),
    },
    {
      label: "LSI 키워드 6개 이상",
      pass: Array.isArray(seo.lsi_keywords) && seo.lsi_keywords.length >= 6,
    },
    {
      label: "마지막 문단이 질문으로 끝남",
      pass: endsWithQuestion,
    },
    {
      label: "본문 마지막 줄 해시태그 1줄",
      pass: hasFinalHashtagLine,
    },
  ];

  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);

  const lines = checks
    .map((c) => `<li>${c.pass ? "✅" : "⚠️"} ${c.label}</li>`)
    .join("");

  els.seoAudit.innerHTML = [
    `<div><strong>SEO 점수:</strong> ${score}/100</div>`,
    `<div><strong>핵심 키워드:</strong> ${focus}</div>`,
    `<div><strong>본문 키워드 횟수:</strong> ${occurrences}회 (${density}%)</div>`,
    `<ul>${lines}</ul>`,
  ].join("");
}

// ===== Version Tabs =====
function setVersionTabs(count) {
  els.versionTabs.innerHTML = "";
  if (count <= 1) {
    els.versionTabs.classList.add("hidden");
    state.activeVersion = 0;
    return;
  }

  els.versionTabs.classList.remove("hidden");
  ["A 버전", "B 버전"].forEach((label, idx) => {
    if (idx >= count) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab-btn${idx === state.activeVersion ? " active" : ""}`;
    btn.dataset.version = String(idx);
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.activeVersion = idx;
      setVersionTabs(count);
      fillOutputs();
    });
    els.versionTabs.appendChild(btn);
  });
}

function getActiveVersion(channel) {
  const versions = state.parsed?.[channel]?.versions || [];
  return versions[state.activeVersion] || versions[0] || null;
}

function fillOutputs() {
  if (!state.parsed) return;

  const ig = getActiveVersion("instagram") || {};
  const nv = getActiveVersion("naver") || {};
  const wp = getActiveVersion("wordpress") || {};
  const seo = wp.seo || {};

  // Threads: always show both A and B simultaneously
  const thVersions = state.parsed?.threads?.versions || [];
  const thA = thVersions[0] || {};
  const thB = thVersions[1] || {};

  // SNS Summary: show the first version
  const ssVersions = state.parsed?.sns_summary?.versions || [];
  const ss = ssVersions[0] || {};

  els.igCaption.value = ig.caption || "";
  els.igHashtags.value = ig.hashtags || "";
  els.igAlt.value = ig.alt_text || "";

  els.nvTitle.value = nv.title || "";
  els.nvBody.value = nv.body || "";
  els.nvHashtags.value = nv.hashtags || "";

  els.wpSeoTitle.value = seo.seo_title || "";
  els.wpSlug.value = seo.slug || "";
  els.wpMeta.value = seo.meta_description || "";
  els.wpFocus.value = seo.focus_keyphrase || "";
  els.wpLsi.value = (seo.lsi_keywords || []).join(", ");
  els.wpBody.value = wp.body || "";

  els.thTextA.value = thA.text || "";
  els.thHashtagsA.value = thA.hashtags || "";
  els.thTextB.value = thB.text || "";
  els.thHashtagsB.value = thB.hashtags || "";
  els.thAltB.value = thB.alt_text || "";

  els.ssThreadsText.value = ss.threads_text || "";
  els.ssInstagramText.value = ss.instagram_text || "";
  els.ssHashtags.value = ss.hashtags || "";

  runSeoAudit({ seo, body: wp.body || "" });
}

// ===== Build Prompt =====
async function buildPrompt() {
  setError("");
  setStatus("");

  const payload = gatherInput();
  if (!payload.story) {
    setError("'내 이야기'가 비어 있어요. 한 줄 이상 적어주세요.");
    return;
  }

  els.generateBtn.disabled = true;
  setStatus("프롬프트 생성 중…");
  setStep(1);

  try {
    const res = await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "프롬프트 생성 실패");
    }

    state.prompt = json.prompt || "";
    state.variantCount = json.variantCount === 2 ? 2 : 1;
    els.generatedPrompt.value = state.prompt;

    await copyToClipboard(state.prompt);
    const styleMessage =
      json?.styleApplied && json?.styleSampleCount
        ? ` 스타일 메모리 ${json.styleSampleCount}개도 반영됐습니다.`
        : "";
    setStatus(`프롬프트 준비 완료! ChatGPT에 붙여넣고 생성하세요.${styleMessage}`);
    setStep(2);
  } catch (err) {
    setError(err?.message || "오류가 발생했어요.");
  } finally {
    els.generateBtn.disabled = false;
  }
}

// ===== Apply JSON result =====
async function applyResultJson() {
  setError("");
  setStatus("");

  const raw = (els.resultJson.value || "").trim();
  if (!raw) {
    setError("ChatGPT 결과 JSON을 붙여넣어 주세요.");
    return;
  }

  els.applyJsonBtn.disabled = true;
  setStatus("결과 검증/적용 중…");

  try {
    const res = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, variants: state.variantCount }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "결과 검증 실패");
    }

    state.parsed = json;
    const count = json?.wordpress?.versions?.length || 1;
    state.variantCount = count;
    state.activeVersion = 0;

    setVersionTabs(count);
    fillOutputs();
    activateTab("instagram");
    setStep(3);
    setStatus("");
    showToast("✅ 결과 반영 완료!");
  } catch (err) {
    setError(err?.message || "오류가 발생했어요.");
  } finally {
    els.applyJsonBtn.disabled = false;
  }
}

// ===== Auto Generate (SSE) =====
async function autoGenerate() {
  setError("");
  setStatus("");

  const payload = gatherInput();
  if (!payload.story) {
    setError("'내 이야기'가 비어 있어요. 한 줄 이상 적어주세요.");
    return;
  }

  // Step 1: Build prompt first
  els.autoGenerateBtn.disabled = true;
  els.generateBtn.disabled = true;
  setStep(2);
  showProgress();
  setProgressIndeterminate();
  addProgressLog("프롬프트 생성 중…");

  try {
    const promptRes = await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const promptJson = await promptRes.json();
    if (!promptRes.ok) {
      throw new Error(promptJson?.error || "프롬프트 생성 실패");
    }

    state.prompt = promptJson.prompt || "";
    state.variantCount = promptJson.variantCount === 2 ? 2 : 1;
    els.generatedPrompt.value = state.prompt;

    addProgressLog("프롬프트 생성 완료 ✓");
    if (promptJson?.styleApplied && promptJson?.styleSampleCount) {
      addProgressLog(`스타일 메모리 ${promptJson.styleSampleCount}개 반영 ✓`);
    }
    setProgress(15);

    // Step 2: Call auto-generate API with SSE
    addProgressLog("ChatGPT 브라우저 자동화 시작…");

    const response = await fetch("/api/auto-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: state.prompt,
        variants: state.variantCount,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson?.error || "자동 생성 실패");
    }

    // Read SSE-like streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let resultData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "log") {
              addProgressLog(data.message);
            } else if (data.type === "progress") {
              setProgress(data.percent);
            } else if (data.type === "result") {
              resultData = data.data;
              setProgress(100);
              addProgressLog("완료! 결과를 표시합니다…");
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          } catch (parseErr) {
            if (parseErr.message !== "Unexpected end of JSON input") {
              // might be an actual error from auto-generate
              if (
                parseErr.message &&
                !parseErr.message.includes("Unexpected")
              ) {
                throw parseErr;
              }
            }
          }
        }
      }
    }

    if (resultData) {
      state.parsed = resultData;
      const count = resultData?.wordpress?.versions?.length || 1;
      state.variantCount = count;
      state.activeVersion = 0;

      setVersionTabs(count);
      fillOutputs();
      activateTab("instagram");
      setStep(3);
      showToast("🎉 자동 생성 완료!");
    } else {
      throw new Error("결과를 받지 못했어요. 다시 시도해주세요.");
    }
  } catch (err) {
    setError(err?.message || "자동 생성 중 오류가 발생했어요.");
    addProgressLog("❌ 오류: " + (err?.message || "알 수 없는 오류"));
  } finally {
    els.autoGenerateBtn.disabled = false;
    els.generateBtn.disabled = false;
    setTimeout(hideProgress, 3000);
  }
}

// ===== Clear All =====
function clearAll() {
  [
    els.topic,
    els.story,
    els.format,
    els.brandName,
    els.productName,
    els.focusKeyword,
    els.lsiKeywords,
    els.mustInclude,
    els.cta,
    els.targetAudience,
    els.generatedPrompt,
    els.resultJson,
    els.igCaption,
    els.igHashtags,
    els.igAlt,
    els.nvTitle,
    els.nvBody,
    els.nvHashtags,
    els.wpSeoTitle,
    els.wpSlug,
    els.wpMeta,
    els.wpFocus,
    els.wpLsi,
    els.wpBody,
    els.thTextA,
    els.thHashtagsA,
    els.thTextB,
    els.thHashtagsB,
    els.thAltB,
    els.ssThreadsText,
    els.ssInstagramText,
    els.ssHashtags,
    els.styleSampleLabel,
    els.styleSampleText,
    els.styleUrl,
  ].forEach((el) => {
    el.value = "";
  });

  els.category.value = "";
  els.seoLevel.value = "balanced";
  els.keywordIntent.value = "정보형";
  els.keywordMentions.value = "3-5";
  els.styleSampleSource.value = "manual";
  els.includeFaq.checked = false;
  els.twoVariants.checked = false;

  state.parsed = null;
  state.variantCount = 1;
  state.activeVersion = 0;
  state.prompt = "";

  setVersionTabs(1);
  runSeoAudit(null);
  setStatus("");
  setError("");
  setStep(1);
  hideProgress();
  showToast("초기화 완료");
}

// ===== Event Listeners =====
els.generateBtn.addEventListener("click", buildPrompt);
els.autoGenerateBtn.addEventListener("click", autoGenerate);
els.openChatgptBtn.addEventListener("click", () => {
  window.open("https://chatgpt.com", "_blank", "noopener,noreferrer");
});
els.applyJsonBtn.addEventListener("click", applyResultJson);
els.clearBtn.addEventListener("click", clearAll);
els.copyPromptBtn.addEventListener("click", () =>
  copyToClipboard(els.generatedPrompt.value || "")
);
els.saveStyleNotesBtn.addEventListener("click", saveStyleNotes);
els.learnStyleTextBtn.addEventListener("click", learnStyleFromText);
els.learnStyleUrlBtn.addEventListener("click", learnStyleFromUrl);
els.clearStyleMemoryBtn.addEventListener("click", clearStyleMemory);

// Channel tabs
Array.from(document.querySelectorAll(".channel-tab[data-tab]")).forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Style memory section toggle hint text
const styleSection = document.getElementById("styleMemorySection");
if (styleSection) {
  const toggleHint = styleSection.querySelector(".toggle-hint");
  if (toggleHint) {
    styleSection.addEventListener("toggle", () => {
      toggleHint.textContent = styleSection.open ? "접기 ▾" : "펼치기 ▸";
    });
  }
}

// Copy buttons with feedback animation
document.querySelectorAll(".btn-copy").forEach(attachCopyFeedback);

els.copyIg.addEventListener("click", () => {
  const text = [els.igCaption.value.trim(), els.igHashtags.value.trim()]
    .filter(Boolean)
    .join("\n\n");
  copyToClipboard(text);
});

els.copyNvAll.addEventListener("click", () => {
  const text = [
    els.nvTitle.value.trim(),
    els.nvBody.value.trim(),
    els.nvHashtags.value.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  copyToClipboard(text);
});

els.copyNvTitle.addEventListener("click", () =>
  copyToClipboard(els.nvTitle.value.trim())
);
els.copyWpSeoTitle.addEventListener("click", () =>
  copyToClipboard(els.wpSeoTitle.value.trim())
);
els.copyWpSlug.addEventListener("click", () =>
  copyToClipboard(els.wpSlug.value.trim())
);
els.copyWpMeta.addEventListener("click", () =>
  copyToClipboard(els.wpMeta.value.trim())
);
els.copyWpFocus.addEventListener("click", () =>
  copyToClipboard(els.wpFocus.value.trim())
);
els.copyWpLsi.addEventListener("click", () =>
  copyToClipboard(els.wpLsi.value.trim())
);
els.copyWpBody.addEventListener("click", () =>
  copyToClipboard(els.wpBody.value.trim())
);

els.copyThA.addEventListener("click", () => {
  const text = [els.thTextA.value.trim(), els.thHashtagsA.value.trim()]
    .filter(Boolean)
    .join("\n\n");
  copyToClipboard(text);
});

els.copyThB.addEventListener("click", () => {
  const text = [els.thTextB.value.trim(), els.thHashtagsB.value.trim()]
    .filter(Boolean)
    .join("\n\n");
  copyToClipboard(text);
});

els.copySsThreads.addEventListener("click", () =>
  copyToClipboard(els.ssThreadsText.value.trim())
);
els.copySsInstagram.addEventListener("click", () =>
  copyToClipboard(els.ssInstagramText.value.trim())
);
els.copySsHashtags.addEventListener("click", () =>
  copyToClipboard(els.ssHashtags.value.trim())
);

// Ctrl/Cmd + Enter -> build prompt
els.story.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    buildPrompt();
  }
});

// Toggle A/B version tabs when checkbox changes
els.twoVariants.addEventListener("change", () => {
  const count = els.twoVariants.checked ? 2 : 1;
  state.variantCount = count;
  setVersionTabs(count);
  if (state.parsed) fillOutputs();
});

// Init
setStep(1);
runSeoAudit(null);
loadStyleMemory();

// Check server capabilities (hide auto-generate if Puppeteer not available)
fetch("/api/health")
  .then((r) => r.json())
  .then((data) => {
    if (!data.automationAvailable) {
      els.autoGenerateBtn.style.display = "none";
    }
  })
  .catch(() => {
    // Server not reachable — keep all buttons visible
  });
