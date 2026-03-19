import {
  clearTextareaField,
  copyTextarea,
  ensureSelectedTitle,
  escapeAttribute,
  escapeHtml,
  getStep1ResultMismatchMessages,
  getStep1ResultValidationMessages,
  isStep1PackageIntentAligned,
  getPackageOutline,
  getSelectedStep1Package,
  getStep1Packages,
  getStep2Result,
  loadState,
  normalizeJsonTextareaInput,
  postJson,
  refreshServiceStatus,
  renderProjectSnapshot,
  resetState,
  saveState,
  setButtonBusy,
  showToast,
  updateField
} from "./shared.js";

const state = loadState();
ensureSelectedTitle(state);
let step2PromptButtonTimer = null;
let isStep2PromptReadyToCopy = false;

const TITLE_PRIORITY_PATTERNS = [
  /기준/,
  /체크/,
  /체크리스트/,
  /비교/,
  /확인/,
  /예산/,
  /구성/,
  /포장/,
  /배송/,
  /보관/,
  /선택/,
  /고르는 법/,
  /고를 때/,
  /어떤 기준/,
  /어떻게/,
  /먼저 보는/,
  /알아둘/,
  /알아두면/,
  /준비할 때/,
  /비교할 때/,
  /단체 주문/,
  /주문 전/,
  /실수/,
  /문제/,
  /조건/
];

const TITLE_PENALTY_PATTERNS = [
  /센스/,
  /칭찬/,
  /비밀/,
  /힘$/,
  /정답/,
  /대세/,
  /진짜/,
  /직접 먹어본 사람만 아는/,
  /사람들이 더 좋아/,
  /요령/
];

const PRIMARY_TITLE_LIMIT = 8;
const TITLE_RECOMMENDED_MIN_SCORE = 16;

const INTENT_SIGNAL_PATTERNS = {
  정보형: {
    blocked: [/후기|리뷰|먹어본|받아본|써본|사용기|추천|추천형|추천하는|추천 구성|구매|전환/i],
    allowedTitleTypes: ["정보형", "체크리스트형", "실수방지형", "입문형"],
    preferred: [/기준|체크|체크리스트|확인|정리|가이드|방법|포인트|실수|보관|포장|예산|주문 전/i]
  },
  비교형: {
    blocked: [/후기|리뷰|먹어본|받아본|써본|사용기|추천형/i],
    allowedTitleTypes: ["비교형", "체크리스트형", "실수방지형"],
    preferred: [/vs|비교|차이|장단점|어떤|무엇이 더|선택 기준/i]
  },
  후기형: {
    blocked: [/체크리스트|주문 전 확인|가이드 정리/i],
    allowedTitleTypes: ["후기형"],
    preferred: [/후기|리뷰|먹어본|받아본|써본|사용기|체감|반응/i]
  },
  추천형: {
    blocked: [/후기|리뷰|먹어본|받아본|써본|사용기/i],
    allowedTitleTypes: ["추천형", "상황별형", "입문형"],
    preferred: [/추천|상황별|선택지|어울리는|제안|고르는 법/i]
  }
};

const elements = {
  toast: document.querySelector("#toast"),
  serviceStatus: document.querySelector("#service-status"),
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  projectSnapshot: document.querySelector("#project-snapshot"),
  guardMessage: document.querySelector("#guard-message"),
  titlePicker: document.querySelector("#title-picker"),
  step1Digest: document.querySelector("#step1-digest"),
  moreTitleDetails: document.querySelector("#more-title-details"),
  secondaryTitlePicker: document.querySelector("#secondary-title-picker"),
  selectedPackageSummary: document.querySelector("#selected-package-summary"),
  generateStep2Button: document.querySelector("#generate-step2-button"),
  clearStep2PromptButton: document.querySelector("#clear-step2-prompt-button"),
  clearStep2ResultButton: document.querySelector("#clear-step2-result-button"),
  step2PromptTextarea: document.querySelector("#step2-prompt-textarea"),
  step2ResultTextarea: document.querySelector("#step2-result-textarea"),
  step2Summary: document.querySelector("#step2-summary")
};

hydrate();
attachEvents();
renderAll();
setStep2PromptButtonMode("generate");
refreshServiceStatus(elements.serviceStatus, elements.toast);

function hydrate() {
  elements.step2PromptTextarea.value = state.step2Prompt;
  elements.step2ResultTextarea.value = state.step2ResultText;
}

function attachEvents() {
  elements.refreshStatusButton?.addEventListener("click", () =>
    refreshServiceStatus(elements.serviceStatus, elements.toast)
  );

  document.querySelector("#reset-all-button")?.addEventListener("click", () => {
    if (!confirm("모든 입력값과 결과를 초기화합니다.\n브랜드 정보는 유지됩니다.\n\n진행하시겠습니까?")) return;
    resetState();
    window.location.href = "/step1.html";
  });

  elements.step2PromptTextarea.addEventListener("input", (event) => {
    updateField(state, "step2Prompt", event.target.value);
  });

  elements.step2ResultTextarea.addEventListener("input", (event) => {
    normalizeJsonTextareaInput({
      textarea: event.target,
      state,
      key: "step2ResultText",
      toastElement: elements.toast,
      successMessage: "STEP 2 JSON을 자동 보정했습니다."
    });
    renderStep2Summary();
    renderProjectSnapshot(elements.projectSnapshot, state);
  });

  elements.generateStep2Button.addEventListener("click", handleStep2PromptAction);
  elements.clearStep2PromptButton?.addEventListener("click", () => {
    markStep2PromptStale();
    clearTextareaField({
      textarea: elements.step2PromptTextarea,
      state,
      key: "step2Prompt",
      toastElement: elements.toast,
      message: "STEP 2 프롬프트를 비웠습니다."
    });
  });
  elements.clearStep2ResultButton?.addEventListener("click", () => {
    clearTextareaField({
      textarea: elements.step2ResultTextarea,
      state,
      key: "step2ResultText",
      toastElement: elements.toast,
      message: "STEP 2 결과를 비웠습니다.",
      afterClear: () => {
        renderStep2Summary();
        renderProjectSnapshot(elements.projectSnapshot, state);
      }
    });
  });
}

function renderAll() {
  renderProjectSnapshot(elements.projectSnapshot, state);
  renderStep1Digest();
  renderSelectedPackageSummary();
  renderStep2Summary();
}

function renderStep1Digest() {
  const packages = getStep1Packages(state);
  const mismatchMessages = getStep1ResultMismatchMessages(state);
  const validationMessages = getStep1ResultValidationMessages(state);

  if (packages.length === 0) {
    elements.guardMessage.className = "warning-banner";
    elements.guardMessage.innerHTML =
      'STEP 1 결과가 아직 없습니다. <a href="/step1.html">STEP 1 페이지</a>에서 먼저 JSON을 붙여넣어 주세요.';
    elements.titlePicker.className = "title-picker empty-state";
    elements.titlePicker.textContent = "STEP 1 결과가 있어야 발행 패키지를 고를 수 있습니다.";
    elements.step1Digest.style.display = "none";
    if (elements.moreTitleDetails) {
      elements.moreTitleDetails.style.display = "none";
    }
    return;
  }

  if (mismatchMessages.length > 0) {
    elements.guardMessage.className = "warning-banner";
    elements.guardMessage.innerHTML = `
      <strong>STEP 1 설정과 결과 JSON이 다릅니다.</strong><br />
      ${mismatchMessages.map((item) => escapeHtml(item)).join("<br />")}<br />
      STEP 1에서 프롬프트를 다시 생성하고 새 결과 JSON을 붙여넣어 주세요.
    `;
    elements.titlePicker.className = "title-picker empty-state";
    elements.titlePicker.textContent = "현재 STEP 1 결과가 오래된 상태라 발행 패키지를 잠시 숨겼습니다.";
    elements.step1Digest.style.display = "none";
    if (elements.moreTitleDetails) {
      elements.moreTitleDetails.style.display = "none";
    }
    if (elements.selectedPackageSummary) {
      elements.selectedPackageSummary.className = "compact-summary error-state";
      elements.selectedPackageSummary.innerHTML =
        "현재 STEP 1 화면 설정과 붙여넣은 STEP 1 결과의 주제/검색의도가 다릅니다.<br />STEP 1 결과를 새로 붙여넣어 주세요.";
    }
    return;
  }

  elements.guardMessage.className = "warning-banner hidden";
  const { rankedPackages, primaryPackages, secondaryPackages, hiddenPackages, intentMismatchPackages } =
    partitionTitleCandidates(packages);
  syncPreferredSelectedTitle(rankedPackages, primaryPackages, secondaryPackages);

  if (validationMessages.length > 0) {
    elements.guardMessage.className = "warning-banner";
    elements.guardMessage.innerHTML = `
      <strong>STEP 1 결과가 최신 출력 규칙을 벗어났습니다.</strong><br />
      ${validationMessages.map((item) => escapeHtml(item)).join("<br />")}<br />
      STEP 1에서 같은 검색의도로 다시 생성해 주세요.
    `;
  }

  if (primaryPackages.length === 0 && secondaryPackages.length === 0) {
    elements.guardMessage.className = "warning-banner";
    elements.guardMessage.innerHTML = `
      현재 검색의도는 <strong>${escapeHtml(state.intent || "[미입력]")}</strong>인데,
      붙여넣은 STEP 1 결과에서 이 의도에 맞는 발행 패키지를 찾지 못했습니다.<br />
      STEP 1에서 같은 검색의도로 다시 생성해 주세요.
    `;
  }

  elements.step1Digest.style.display = "block";
  elements.step1Digest.className = "compact-summary";
  elements.step1Digest.innerHTML = `
    <strong>검색의도에 맞는 패키지 ${primaryPackages.length}개 표시</strong>
    <p>현재 검색의도와 맞는 패키지를 점수순으로 정렬해 모두 보여줍니다.</p>
    <p>현재 검색의도(${escapeHtml(state.intent || "[미입력]")})에 맞는 패키지 ${
      primaryPackages.length + secondaryPackages.length
    }개 / 재생성 필요한 이탈 패키지 ${intentMismatchPackages.length}개</p>
  `;

  renderPackageCardGroup(elements.titlePicker, primaryPackages, "primary");

  if (elements.moreTitleDetails && elements.secondaryTitlePicker) {
    if (secondaryPackages.length > 0) {
      elements.moreTitleDetails.style.display = "block";
      renderPackageCardGroup(elements.secondaryTitlePicker, secondaryPackages, "secondary");
    } else {
      elements.moreTitleDetails.style.display = "none";
      elements.secondaryTitlePicker.innerHTML = "";
    }
  }
}

function partitionTitleCandidates(packages) {
  const currentIntent = String(state.intent || "").trim();
  const rankedPackages = packages
    .map((item, index) => ({
      ...item,
      _originalIndex: index,
      _intentCompatible: isPackageIntentCompatible(item, currentIntent),
      _score: scoreTitleCandidate(item, currentIntent)
    }))
    .sort((a, b) => b._score - a._score || a._originalIndex - b._originalIndex);

  const intentMismatchPackages = rankedPackages.filter((item) => !item._intentCompatible);
  const visiblePackages = rankedPackages.filter((item) => item._intentCompatible);
  const primaryPackages = visiblePackages.slice(0, PRIMARY_TITLE_LIMIT);
  const secondaryPackages = visiblePackages.slice(PRIMARY_TITLE_LIMIT);

  return {
    rankedPackages,
    primaryPackages,
    secondaryPackages,
    hiddenPackages: [],
    intentMismatchPackages
  };
}

function syncPreferredSelectedTitle(rankedPackages, primaryPackages, secondaryPackages) {
  const visiblePackages = [...primaryPackages, ...secondaryPackages];

  if (visiblePackages.length === 0) {
    const fallbackTitle = rankedPackages[0]?.title || "";

    if (state.selectedTitle !== fallbackTitle) {
      state.selectedTitle = fallbackTitle;
      saveState(state);
    }

    return;
  }

  const selectedIsVisible = visiblePackages.some((item) => item.title === state.selectedTitle);

  if (!selectedIsVisible) {
    state.selectedTitle = visiblePackages[0].title;
    saveState(state);
  }
}

function renderPackageCardGroup(container, packages, bucket) {
  if (!container) {
    return;
  }

  if (packages.length === 0) {
    container.className = "title-picker empty-state";
    container.textContent = "조건에 맞는 발행 패키지 후보가 없습니다.";
    return;
  }

  container.className = "title-picker package-grid";
  container.innerHTML = packages
    .map((item, index) => {
      const outline = getPackageOutline(item);
      const tone = getTitleChipTone(item._score);
      const kicker = [item.title_type, item.main_keyword].filter(Boolean).join(" · ");
      const meta = getTitleChipLabel(item, index, bucket);
      const outlineMarkup = outline
        .map(
          (entry, outlineIndex) =>
            `<span class="package-outline-item">${escapeHtml(`${outlineIndex + 1}. ${entry}`)}</span>`
        )
        .join("");

      return `
        <button class="title-chip package-card ${item.title === state.selectedTitle ? "active" : ""} ${tone}" type="button" data-title="${escapeAttribute(item.title)}">
          <span class="title-chip-meta">${escapeHtml(meta)}</span>
          <span class="title-chip-label">${escapeHtml(item.title)}</span>
          <span class="package-card-kicker">${escapeHtml(kicker || "패키지 정보")}</span>
          <span class="package-card-angle">${escapeHtml(item.article_angle || "글 각도 미입력")}</span>
          <span class="package-outline-preview">${outlineMarkup}</span>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".title-chip").forEach((button) => {
    button.addEventListener("click", () => {
      markStep2PromptStale();
      state.selectedTitle = button.dataset.title;
      saveState(state);
      renderAll();
      showToast(elements.toast, "발행 패키지를 선택했습니다.");
    });
  });
}

function renderSelectedPackageSummary() {
  if (!elements.selectedPackageSummary) {
    return;
  }

  const mismatchMessages = getStep1ResultMismatchMessages(state);

  if (mismatchMessages.length > 0) {
    elements.selectedPackageSummary.className = "compact-summary error-state";
    elements.selectedPackageSummary.innerHTML =
      "현재 STEP 1 화면 설정과 붙여넣은 STEP 1 결과의 주제/검색의도가 다릅니다.<br />STEP 1 결과를 새로 붙여넣어 주세요.";
    return;
  }

  const selectedPackage = getSelectedStep1Package(state);

  if (!selectedPackage) {
    elements.selectedPackageSummary.className = "compact-summary empty-state";
    elements.selectedPackageSummary.textContent = "선택된 패키지가 없으면 미리보기가 표시되지 않습니다.";
    return;
  }

  if (!isPackageIntentCompatible(selectedPackage, state.intent)) {
    elements.selectedPackageSummary.className = "compact-summary error-state";
    elements.selectedPackageSummary.innerHTML = `
      현재 검색의도는 <strong>${escapeHtml(state.intent || "[미입력]")}</strong>인데
      선택된 패키지는 이 의도와 맞지 않습니다.<br />
      STEP 1 결과를 다시 생성하거나 다른 패키지를 선택해 주세요.
    `;
    return;
  }

  const outline = getPackageOutline(selectedPackage);
  const subKeywords = Array.isArray(selectedPackage.sub_keywords) ? selectedPackage.sub_keywords : [];

  elements.selectedPackageSummary.className = "compact-summary";
  elements.selectedPackageSummary.innerHTML = `
    <div class="result-stack">
      <div class="result-section">
        <strong>${escapeHtml(selectedPackage.title || "[미입력]")}</strong>
        <p>${escapeHtml(selectedPackage.article_angle || "글 각도 미입력")}</p>
      </div>
      <div class="result-section">
        <strong>검색의도와 독자 고민</strong>
        <p>검색의도: ${escapeHtml(selectedPackage.search_intent || "[미입력]")}</p>
        <p>독자 고민: ${escapeHtml(selectedPackage.reader_problem || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>목차 3개</strong>
        <div class="result-list">
          ${outline
            .map((entry, index) => `<div class="result-item"><span>${escapeHtml(`${index + 1}. ${entry}`)}</span></div>`)
            .join("")}
        </div>
      </div>
      <div class="result-section">
        <strong>브랜드 연결 힌트</strong>
        <p>${escapeHtml(selectedPackage.brand_connection_hint || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>CTA 방향</strong>
        <p>${escapeHtml(selectedPackage.cta_direction || "[미입력]")}</p>
        <div class="chip-row">
          ${subKeywords
            .slice(0, 5)
            .map((keyword) => `<span class="list-pill">${escapeHtml(keyword)}</span>`)
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function setStep2PromptButtonMode(mode = "generate") {
  const button = elements.generateStep2Button;

  if (!button) {
    return;
  }

  isStep2PromptReadyToCopy = mode === "copy";
  window.clearTimeout(step2PromptButtonTimer);
  button.dataset.originalLabel = mode === "copy" ? "복사" : "프롬프트 생성";
  button.dataset.mode = mode;
  button.classList.toggle("ready-to-copy", mode === "copy" || mode === "copied");
  button.classList.toggle("copied", mode === "copied");

  if (mode === "copy" || mode === "copied") {
    button.classList.remove("mode-transition");
    void button.offsetWidth;
    button.classList.add("mode-transition");
  } else {
    button.classList.remove("mode-transition");
  }

  if (!button.disabled) {
    if (mode === "copied") {
      button.textContent = "복사 완료";
    } else if (mode === "copy") {
      button.textContent = "복사";
    } else {
      button.textContent = "프롬프트 생성";
    }
  }

  if (mode === "copied") {
    step2PromptButtonTimer = window.setTimeout(() => {
      setStep2PromptButtonMode("copy");
    }, 1400);
  }
}

function markStep2PromptStale() {
  setStep2PromptButtonMode("generate");
}

async function handleStep2PromptAction() {
  if (isStep2PromptReadyToCopy && elements.step2PromptTextarea.value.trim()) {
    const copied = await copyTextarea("step2-prompt-textarea", elements.toast);

    if (copied) {
      setStep2PromptButtonMode("copied");
    }

    return;
  }

  await generateStep2Prompt();
}

function scoreTitleCandidate(item, currentIntent = "") {
  const title = String(item?.title || "");
  const mainKeyword = String(item?.main_keyword || "");
  const charCount = Number(item?.char_count || title.length || 0);
  let score = 0;

  TITLE_PRIORITY_PATTERNS.forEach((pattern) => {
    if (pattern.test(title)) {
      score += 5;
    }
  });

  TITLE_PENALTY_PATTERNS.forEach((pattern) => {
    if (pattern.test(title)) {
      score -= 7;
    }
  });

  if (mainKeyword && title.includes(mainKeyword)) {
    score += title.indexOf(mainKeyword) <= 15 ? 8 : 4;
  }

  if (charCount >= 22 && charCount <= 34) {
    score += 4;
  } else if (charCount < 18 || charCount > 38) {
    score -= 3;
  }

  if (["정보형", "비교형", "체크리스트형", "실수방지형"].includes(item?.title_type)) {
    score += 6;
  } else if (["추천형", "후기형", "상황별형", "입문형"].includes(item?.title_type)) {
    score += 4;
  }

  if (/3가지|체크리스트|비교|기준|확인/.test(title)) {
    score += 5;
  }

  if (!isPackageIntentCompatible(item, currentIntent)) {
    score -= 100;
  } else {
    score += 8;
  }

  return score;
}

function isPackageIntentCompatible(item, intent) {
  const normalizedIntent = String(intent || "").trim();

  if (!normalizedIntent || !INTENT_SIGNAL_PATTERNS[normalizedIntent]) {
    return true;
  }

  if (!isStep1PackageIntentAligned(item, normalizedIntent)) {
    return false;
  }

  const config = INTENT_SIGNAL_PATTERNS[normalizedIntent];
  const combinedText = [
    item?.title,
    item?.search_intent,
    item?.article_angle,
    item?.reader_problem,
    item?.why_this_title_works
  ]
    .filter(Boolean)
    .join(" ");
  const titleType = String(item?.title_type || "").trim();

  if (config.blocked.some((pattern) => pattern.test(combinedText))) {
    return false;
  }

  if (config.allowedTitleTypes.includes(titleType)) {
    return true;
  }

  if (config.preferred.some((pattern) => pattern.test(combinedText))) {
    return true;
  }

  return false;
}

function getTitleChipTone(score) {
  if (score >= 24) {
    return "recommended";
  }

  if (score <= 8) {
    return "caution";
  }

  return "neutral";
}

function getTitleChipLabel(item, index, bucket) {
  if (bucket === "primary") {
    if (item._score >= 24) {
      return `추천 ${index + 1}순위 · 발행 가능한 구조`;
    }

    if (item._score >= TITLE_RECOMMENDED_MIN_SCORE) {
      return `추천 ${index + 1}순위 · 확장 쉬운 패키지`;
    }

    return `추천 ${index + 1}순위 · 보완 가능`;
  }

  if (bucket === "secondary") {
    return "추가 구조형 후보";
  }

  return "일반 후보";
}

async function generateStep2Prompt() {
  if (!state.step1ResultText.trim()) {
    showToast(elements.toast, "STEP 1 결과 JSON을 먼저 준비해 주세요.");
    return;
  }

  const mismatchMessages = getStep1ResultMismatchMessages(state);
  const validationMessages = getStep1ResultValidationMessages(state);

  if (mismatchMessages.length > 0) {
    showToast(elements.toast, "STEP 1의 현재 검색의도/주제와 붙여넣은 결과 JSON이 다릅니다. STEP 1 결과를 새로 생성해 주세요.");
    return;
  }

  if (validationMessages.length > 0) {
    showToast(elements.toast, "STEP 1 결과가 최신 규칙을 벗어났습니다. 같은 검색의도로 다시 생성해 주세요.");
    return;
  }

  const selectedPackage = getSelectedStep1Package(state);

  if (!selectedPackage) {
    showToast(elements.toast, "STEP 2에 사용할 발행 패키지를 먼저 선택해 주세요.");
    return;
  }

  if (!isPackageIntentCompatible(selectedPackage, state.intent)) {
    showToast(elements.toast, "현재 검색의도와 맞지 않는 패키지입니다. STEP 1 결과를 다시 생성해 주세요.");
    return;
  }

  setButtonBusy(elements.generateStep2Button, true, "생성 중...");

  try {
    const payload = await postJson("/api/prompts/step2", {
      topic: state.topic,
      intent: state.intent,
      step1ResultJson: state.step1ResultText,
      selectedTitle: selectedPackage.title,
      selectedPackage
    });

    state.step2Prompt = payload.prompt;
    elements.step2PromptTextarea.value = payload.prompt;
    saveState(state);
    setStep2PromptButtonMode("copy");
    showToast(elements.toast, "프롬프트를 만들었습니다. 이제 같은 버튼으로 복사하세요.");
  } catch (error) {
    showToast(elements.toast, error.message);
  } finally {
    setButtonBusy(elements.generateStep2Button, false, isStep2PromptReadyToCopy ? "복사" : "프롬프트 생성");
    setStep2PromptButtonMode(elements.generateStep2Button?.dataset.mode || "generate");
  }
}

function renderStep2Summary() {
  if (!elements.step2Summary) {
    return;
  }

  const parsed = getStep2Result(state);

  if (!parsed) {
    elements.step2Summary.className = "compact-summary empty-state";
    elements.step2Summary.textContent = "STEP 2 설계도 JSON을 붙여넣으면 여기서 바로 검토할 수 있습니다.";
    return;
  }

  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const brandBridge = parsed.brand_bridge_plan || {};
  const cta = parsed.cta_strategy || {};
  const mustInclude = Array.isArray(parsed.writing_notes?.must_include) ? parsed.writing_notes.must_include : [];

  elements.step2Summary.className = "compact-summary";
  elements.step2Summary.innerHTML = `
    <div class="result-stack">
      <div class="result-section">
        <strong>${escapeHtml(parsed.selected_title || state.selectedTitle || "[미입력]")}</strong>
        <p>독자 단계: ${escapeHtml(parsed.reader_stage || "[미입력]")}</p>
        <p>글 목표: ${escapeHtml(parsed.content_goal || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>핵심 메시지</strong>
        <p>${escapeHtml(parsed.core_message || "[미입력]")}</p>
        <p>도입 훅: ${escapeHtml(parsed.intro_strategy?.hook_direction || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>섹션 ${sections.length}개</strong>
        <div class="result-list">
          ${sections
            .slice(0, 3)
            .map(
              (section) => `
                <div class="result-item">
                  <span>${escapeHtml(section.section_title || "[미입력]")}</span>
                  <small>${escapeHtml(section.section_goal || "")}</small>
                  <small>${escapeHtml(section.suggested_box?.box_type || "")}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="result-section">
        <strong>브랜드 연결 계획</strong>
        <p>위치: ${escapeHtml(brandBridge.recommended_position || "[미입력]")}</p>
        <p>${escapeHtml(brandBridge.bridge_logic || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>CTA 방향</strong>
        <p>${escapeHtml(cta.primary_cta_direction || "[미입력]")}</p>
        <p>톤: ${escapeHtml(cta.cta_tone || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>STEP 3 필수 반영 포인트</strong>
        <div class="chip-row">
          ${mustInclude
            .slice(0, 6)
            .map((item) => `<span class="list-pill">${escapeHtml(item)}</span>`)
            .join("")}
        </div>
      </div>
    </div>
  `;
}
