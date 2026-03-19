import {
  bindStateInput,
  clearTextareaField,
  copyTextarea,
  ensureSelectedTitle,
  escapeAttribute,
  escapeHtml,
  getResearchAnalysisMismatchMessages,
  getResearchAnalysisResult,
  getResearchAnalysisValidationMessages,
  getStep1ResultMismatchMessages,
  getStep1ResultValidationMessages,
  getStep1Result,
  loadState,
  postJson,
  readJsonTextarea,
  refreshServiceStatus,
  renderProjectSnapshot,
  renderResearchMetrics,
  renderResearchWarning,
  resetState,
  saveState,
  setButtonBusy,
  showToast,
  updateField,
  normalizeJsonTextareaInput,
  safeParseJson,
  BRAND_PRESETS
} from "./shared.js";

const state = loadState();
ensureSelectedTitle(state);
let analysisPromptButtonTimer = null;
let isAnalysisPromptReadyToCopy = false;
let step1PromptButtonTimer = null;
let isStep1PromptReadyToCopy = false;

// brandProfiles가 없는 기존 state 대비 마이그레이션
if (!state.brandProfiles) {
  state.brandProfiles = {
    nothingmatters: { name: "낫띵메터스", products: "", description: "" },
    nothingnormalnow: { name: "낫띵노말나우", products: "", description: "" }
  };
  saveState(state);
}

const elements = {
  toast: document.querySelector("#toast"),
  serviceStatus: document.querySelector("#service-status"),
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  projectSnapshot: document.querySelector("#project-snapshot"),
  topicInput: document.querySelector("#topic-input"),
  intentInput: document.querySelector("#intent-input"),
  brandTypeInput: document.querySelector("#brand-type-input"),
  toneInput: document.querySelector("#tone-input"),
  brandContextInput: document.querySelector("#brand-context-input"),
  writingGoalInput: document.querySelector("#writing-goal-input"),
  brandNameInput: document.querySelector("#brand-name-input"),
  ctaModeInput: document.querySelector("#cta-mode-input"),
  researchButton: document.querySelector("#research-button"),
  researchMetrics: document.querySelector("#research-metrics"),
  researchWarningStrip: document.querySelector("#research-warning-strip"),
  researchDataTextarea: document.querySelector("#research-data-textarea"),
  generateAnalysisButton: document.querySelector("#generate-analysis-button"),
  clearAnalysisPromptButton: document.querySelector("#clear-analysis-prompt-button"),
  clearAnalysisResultButton: document.querySelector("#clear-analysis-result-button"),
  researchAnalysisPromptTextarea: document.querySelector("#research-analysis-prompt-textarea"),
  researchAnalysisResultTextarea: document.querySelector("#research-analysis-result-textarea"),
  researchAnalysisStatus: document.querySelector("#research-analysis-status"),
  generateStep1Button: document.querySelector("#generate-step1-button"),
  clearStep1PromptButton: document.querySelector("#clear-step1-prompt-button"),
  clearStep1ResultButton: document.querySelector("#clear-step1-result-button"),
  step1PromptTextarea: document.querySelector("#step1-prompt-textarea"),
  step1ResultTextarea: document.querySelector("#step1-result-textarea"),
  step1ResultStatus: document.querySelector("#step1-result-status"),
  // 브랜드 스위처
  brandBtnNothingmatters: document.querySelector("#brand-btn-nothingmatters"),
  brandBtnNothingnormalnow: document.querySelector("#brand-btn-nothingnormalnow"),
  brandProfileName: document.querySelector("#brand-profile-name"),
  brandProfileProducts: document.querySelector("#brand-profile-products"),
  brandProfileDescription: document.querySelector("#brand-profile-description")
};

hydrate();
attachEvents();
renderAll();
setAnalysisPromptButtonMode("generate");
setStep1PromptButtonMode("generate");
refreshServiceStatus(elements.serviceStatus, elements.toast);

// ── 브랜드 스위처 ──────────────────────────────────────────

function getActiveBrandProfile() {
  const key = state.activeBrand || "nothingmatters";
  return state.brandProfiles?.[key] || { name: "", products: "", description: "" };
}

function saveBrandProfile(key, fields) {
  if (!state.brandProfiles) state.brandProfiles = {};
  state.brandProfiles[key] = { ...state.brandProfiles[key], ...fields };
  saveState(state);
}

function renderBrandSwitcher() {
  const active = state.activeBrand || "nothingmatters";
  [elements.brandBtnNothingmatters, elements.brandBtnNothingnormalnow].forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("active", btn.dataset.brand === active);
  });
  const profile = getActiveBrandProfile();
  if (elements.brandProfileName) elements.brandProfileName.value = profile.name || "";
  if (elements.brandProfileProducts) elements.brandProfileProducts.value = profile.products || "";
  if (elements.brandProfileDescription) elements.brandProfileDescription.value = profile.description || "";
}

function switchBrand(key) {
  state.activeBrand = key;
  saveState(state);
  renderBrandSwitcher();
  markResearchAnalysisStale();
  markStep1PromptStale();
  renderResearchAnalysisStatus();
  showToast(elements.toast, `${BRAND_PRESETS[key]?.label || key} 브랜드로 전환했습니다.`);
}



function hydrate() {
  bindStateInput(elements.topicInput, state, "topic", {
    afterChange: () => {
      markResearchAnalysisStale();
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
      renderResearchAnalysisStatus();
      renderStep1ResultStatus();
    }
  });
  bindStateInput(elements.intentInput, state, "intent", {
    eventName: "change",
    afterChange: () => {
      markResearchAnalysisStale();
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
      renderResearchAnalysisStatus();
      renderStep1ResultStatus();
    }
  });
  bindStateInput(elements.brandTypeInput, state, "brandType", {
    eventName: "change",
    afterChange: (value) => {
      markResearchAnalysisStale();
      markStep1PromptStale();
      if (!state.brandContext || state.brandContext === "브랜드형" || state.brandContext === "비브랜드형") {
        state.brandContext = value;
        elements.brandContextInput.value = value;
        saveState(state);
      }
      renderProjectSnapshot(elements.projectSnapshot, state);
    }
  });
  bindStateInput(elements.toneInput, state, "tone", {
    afterChange: () => {
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
    }
  });
  bindStateInput(elements.brandContextInput, state, "brandContext", {
    afterChange: () => {
      markResearchAnalysisStale();
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
      renderResearchAnalysisStatus();
    }
  });
  bindStateInput(elements.writingGoalInput, state, "writingGoal", {
    afterChange: () => {
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
    }
  });
  bindStateInput(elements.brandNameInput, state, "brandName", {
    afterChange: () => {
      markResearchAnalysisStale();
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
      renderResearchAnalysisStatus();
    }
  });
  bindStateInput(elements.ctaModeInput, state, "ctaMode", {
    eventName: "change",
    afterChange: () => {
      markStep1PromptStale();
      renderProjectSnapshot(elements.projectSnapshot, state);
    }
  });

  elements.researchDataTextarea.value = state.researchDataText;
  elements.researchAnalysisPromptTextarea.value = state.researchAnalysisPrompt;
  elements.researchAnalysisResultTextarea.value = state.researchAnalysisText;
  elements.step1PromptTextarea.value = state.step1Prompt;
  elements.step1ResultTextarea.value = state.step1ResultText;

  // 브랜드 스위처 초기화
  renderBrandSwitcher();
}

function attachEvents() {
  elements.refreshStatusButton?.addEventListener("click", () =>
    refreshServiceStatus(elements.serviceStatus, elements.toast)
  );

  // 새로 시작 버튼
  document.querySelector("#reset-all-button")?.addEventListener("click", () => {
    if (!confirm("모든 입력값과 결과를 초기화합니다.\n브랜드 정보는 유지됩니다.\n\n진행하시겠습니까?")) return;
    resetState();
    window.location.reload();
  });

  // 브랜드 스위처 버튼 이벤트
  [elements.brandBtnNothingmatters, elements.brandBtnNothingnormalnow].forEach((btn) => {
    btn?.addEventListener("click", () => switchBrand(btn.dataset.brand));
  });

  // 브랜드 프로필 입력 필드 이벤트 (현재 선택된 브랜드에 저장)
  elements.brandProfileName?.addEventListener("input", (e) => {
    markResearchAnalysisStale();
    markStep1PromptStale();
    saveBrandProfile(state.activeBrand, { name: e.target.value });
    renderResearchAnalysisStatus();
  });
  elements.brandProfileProducts?.addEventListener("input", (e) => {
    markResearchAnalysisStale();
    markStep1PromptStale();
    saveBrandProfile(state.activeBrand, { products: e.target.value });
    renderResearchAnalysisStatus();
  });
  elements.brandProfileDescription?.addEventListener("input", (e) => {
    markResearchAnalysisStale();
    markStep1PromptStale();
    saveBrandProfile(state.activeBrand, { description: e.target.value });
    renderResearchAnalysisStatus();
  });

  elements.researchDataTextarea.addEventListener("input", (event) => {
    markResearchAnalysisStale();
    markStep1PromptStale();
    normalizeJsonTextareaInput({
      textarea: event.target,
      state,
      key: "researchDataText"
    });
    renderResearchSection();
    renderResearchAnalysisStatus();
  });

  elements.researchAnalysisPromptTextarea.addEventListener("input", (event) => {
    updateField(state, "researchAnalysisPrompt", event.target.value);
  });

  elements.researchAnalysisResultTextarea.addEventListener("input", (event) => {
    markStep1PromptStale();
    normalizeJsonTextareaInput({
      textarea: event.target,
      state,
      key: "researchAnalysisText",
      toastElement: elements.toast,
      successMessage: "분석 JSON을 자동 보정했습니다."
    });
    renderProjectSnapshot(elements.projectSnapshot, state);
    renderResearchAnalysisStatus();
  });

  elements.step1PromptTextarea.addEventListener("input", (event) => {
    updateField(state, "step1Prompt", event.target.value);
  });

  elements.step1ResultTextarea.addEventListener("input", (event) => {
    normalizeJsonTextareaInput({
      textarea: event.target,
      state,
      key: "step1ResultText",
      toastElement: elements.toast,
      successMessage: "STEP 1 JSON을 자동 보정했습니다."
    });
    ensureSelectedTitle(state);
    renderProjectSnapshot(elements.projectSnapshot, state);
    renderStep1ResultStatus();
  });

  elements.researchButton.addEventListener("click", collectResearch);
  elements.generateAnalysisButton.addEventListener("click", handleAnalysisPromptAction);
  elements.generateStep1Button.addEventListener("click", handleStep1PromptAction);
  elements.clearAnalysisPromptButton?.addEventListener("click", () => {
    markResearchAnalysisStale();
    clearTextareaField({
      textarea: elements.researchAnalysisPromptTextarea,
      state,
      key: "researchAnalysisPrompt",
      toastElement: elements.toast,
      message: "분석 프롬프트를 비웠습니다."
    });
  });
  elements.clearAnalysisResultButton?.addEventListener("click", () => {
    clearTextareaField({
      textarea: elements.researchAnalysisResultTextarea,
      state,
      key: "researchAnalysisText",
      toastElement: elements.toast,
      message: "분석 결과를 비웠습니다.",
      afterClear: () => {
        markStep1PromptStale();
        renderProjectSnapshot(elements.projectSnapshot, state);
        renderResearchAnalysisStatus();
      }
    });
  });
  elements.clearStep1PromptButton?.addEventListener("click", () => {
    markStep1PromptStale();
    clearTextareaField({
      textarea: elements.step1PromptTextarea,
      state,
      key: "step1Prompt",
      toastElement: elements.toast,
      message: "STEP 1 프롬프트를 비웠습니다."
    });
  });
  elements.clearStep1ResultButton?.addEventListener("click", () => {
    clearTextareaField({
      textarea: elements.step1ResultTextarea,
      state,
      key: "step1ResultText",
      toastElement: elements.toast,
      message: "STEP 1 결과를 비웠습니다.",
      afterClear: () => {
        ensureSelectedTitle(state);
        renderProjectSnapshot(elements.projectSnapshot, state);
        renderStep1ResultStatus();
      }
    });
  });
}

function setStep1PromptButtonMode(mode = "generate") {
  const button = elements.generateStep1Button;

  if (!button) {
    return;
  }

  isStep1PromptReadyToCopy = mode === "copy";
  window.clearTimeout(step1PromptButtonTimer);
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
    step1PromptButtonTimer = window.setTimeout(() => {
      setStep1PromptButtonMode("copy");
    }, 1400);
  }
}

function setAnalysisPromptButtonMode(mode = "generate") {
  const button = elements.generateAnalysisButton;

  if (!button) {
    return;
  }

  isAnalysisPromptReadyToCopy = mode === "copy";
  window.clearTimeout(analysisPromptButtonTimer);
  button.dataset.originalLabel = mode === "copy" ? "복사" : "분석 프롬프트 생성";
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
      button.textContent = "분석 프롬프트 생성";
    }
  }

  if (mode === "copied") {
    analysisPromptButtonTimer = window.setTimeout(() => {
      setAnalysisPromptButtonMode("copy");
    }, 1400);
  }
}

function markResearchAnalysisStale() {
  setAnalysisPromptButtonMode("generate");
}

async function handleAnalysisPromptAction() {
  if (isAnalysisPromptReadyToCopy && elements.researchAnalysisPromptTextarea.value.trim()) {
    const copied = await copyTextarea("research-analysis-prompt-textarea", elements.toast);

    if (copied) {
      setAnalysisPromptButtonMode("copied");
    }

    return;
  }

  await generateResearchAnalysisPrompt();
}

function markStep1PromptStale() {
  setStep1PromptButtonMode("generate");
}

async function handleStep1PromptAction() {
  if (isStep1PromptReadyToCopy && elements.step1PromptTextarea.value.trim()) {
    const copied = await copyTextarea("step1-prompt-textarea", elements.toast);

    if (copied) {
      setStep1PromptButtonMode("copied");
    }

    return;
  }

  await generateStep1Prompt();
}

function renderAll() {
  renderProjectSnapshot(elements.projectSnapshot, state);
  renderResearchSection();
  renderResearchAnalysisStatus();
  renderStep1ResultStatus();
}

function renderResearchSection() {
  const research = safeParseJson(state.researchDataText);
  renderResearchMetrics(elements.researchMetrics, research);
  renderResearchWarning(elements.researchWarningStrip, research);
}

function renderResearchAnalysisStatus() {
  if (!elements.researchAnalysisStatus) {
    return;
  }

  const research = safeParseJson(state.researchDataText);

  if (!research) {
    elements.researchAnalysisStatus.className = "compact-summary empty-state";
    elements.researchAnalysisStatus.textContent = "먼저 데이터를 수집해야 분석 결과를 붙여넣을 수 있습니다.";
    return;
  }

  const parsed = getResearchAnalysisResult(state);

  if (!parsed) {
    elements.researchAnalysisStatus.className = "compact-summary empty-state";
    elements.researchAnalysisStatus.textContent = "수집 데이터를 분석한 JSON 결과를 붙여넣으면 STEP 1 프롬프트 생성이 열립니다.";
    return;
  }

  const mismatchMessages = getResearchAnalysisMismatchMessages(state);
  const validationMessages = getResearchAnalysisValidationMessages(state);

  if (mismatchMessages.length > 0) {
    elements.researchAnalysisStatus.className = "compact-summary error-state";
    elements.researchAnalysisStatus.innerHTML = mismatchMessages.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
    return;
  }

  if (validationMessages.length > 0) {
    elements.researchAnalysisStatus.className = "compact-summary error-state";
    elements.researchAnalysisStatus.innerHTML = validationMessages.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
    return;
  }

  const priorityAngles = Array.isArray(parsed.step1_direction?.priority_angles)
    ? parsed.step1_direction.priority_angles.filter(Boolean)
    : [];

  elements.researchAnalysisStatus.className = "compact-summary success-state";
  elements.researchAnalysisStatus.innerHTML = `
    <p>수집 데이터 분석 결과가 준비되었습니다.</p>
    <p>주제: ${escapeHtml(parsed.topic || state.topic || "[미입력]")} / 검색의도: ${escapeHtml(
      parsed.intent || state.intent || "[미입력]"
    )}</p>
    <p>우선 생성 각도: ${priorityAngles.length}개</p>
  `;
}

function renderStep1ResultStatus() {
  if (!elements.step1ResultStatus) {
    return;
  }

  const parsed = getStep1Result(state);

  if (!parsed) {
    elements.step1ResultStatus.className = "compact-summary empty-state";
    elements.step1ResultStatus.textContent = "현재 화면 설정과 붙여넣은 STEP 1 결과가 다르면 여기서 바로 알려드립니다.";
    return;
  }

  const mismatchMessages = getStep1ResultMismatchMessages(state);
  const validationMessages = getStep1ResultValidationMessages(state);

  if (mismatchMessages.length > 0) {
    elements.step1ResultStatus.className = "compact-summary error-state";
    elements.step1ResultStatus.innerHTML = mismatchMessages.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
    return;
  }

  if (validationMessages.length > 0) {
    elements.step1ResultStatus.className = "compact-summary error-state";
    elements.step1ResultStatus.innerHTML = `
      <p>STEP 1 결과가 최신 규칙을 아직 만족하지 않습니다.</p>
      ${validationMessages.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
    `;
    return;
  }

  elements.step1ResultStatus.className = "compact-summary success-state";
  elements.step1ResultStatus.innerHTML = `
    <p>현재 STEP 1 결과는 화면 설정과 일치합니다.</p>
    <p>주제: ${escapeHtml(parsed.topic || state.topic || "[미입력]")} / 검색의도: ${escapeHtml(
      parsed.intent || state.intent || "[미입력]"
    )}</p>
    <p>패키지 수: 8개 기준 통과</p>
  `;
}

async function collectResearch() {
  if (!state.topic.trim()) {
    showToast(elements.toast, "주제를 먼저 입력해 주세요.");
    elements.topicInput.focus();
    return;
  }

  setButtonBusy(elements.researchButton, true, "수집 중...");

  try {
    const payload = await postJson("/api/research", {
      topic: state.topic.trim()
    });

    state.researchDataText = JSON.stringify(payload.researchData, null, 2);
    elements.researchDataTextarea.value = state.researchDataText;
    state.researchAnalysisPrompt = "";
    state.researchAnalysisText = "";
    state.step1Prompt = "";
    state.step1ResultText = "";
    state.selectedTitle = "";
    elements.researchAnalysisPromptTextarea.value = "";
    elements.researchAnalysisResultTextarea.value = "";
    elements.step1PromptTextarea.value = "";
    elements.step1ResultTextarea.value = "";
    saveState(state);
    ensureSelectedTitle(state);
    markResearchAnalysisStale();
    markStep1PromptStale();
    renderResearchSection();
    renderResearchAnalysisStatus();
    renderProjectSnapshot(elements.projectSnapshot, state);
    renderStep1ResultStatus();
    showToast(elements.toast, "네이버 데이터를 불러왔습니다. 이제 수집 데이터 분석을 먼저 진행해 주세요.");
  } catch (error) {
    showToast(elements.toast, error.message);
  } finally {
    setButtonBusy(elements.researchButton, false, "데이터 수집");
  }
}

async function generateResearchAnalysisPrompt() {
  if (!state.topic.trim()) {
    showToast(elements.toast, "주제를 먼저 입력해 주세요.");
    elements.topicInput.focus();
    return;
  }

  if (!state.researchDataText.trim()) {
    showToast(elements.toast, "먼저 데이터를 수집해 주세요.");
    return;
  }

  setButtonBusy(elements.generateAnalysisButton, true, "생성 중...");

  const activeBrandKey = state.activeBrand || "nothingmatters";
  const brandProfile = state.brandProfiles?.[activeBrandKey] || {};

  try {
    const payload = await postJson("/api/prompts/research-analysis", {
      topic: state.topic,
      intent: state.intent,
      researchData: readJsonTextarea(state.researchDataText),
      brandName: brandProfile.name || "",
      brandProducts: brandProfile.products || "",
      brandDescription: brandProfile.description || ""
    });

    state.researchAnalysisPrompt = payload.prompt;
    elements.researchAnalysisPromptTextarea.value = payload.prompt;
    saveState(state);
    setAnalysisPromptButtonMode("copy");
    showToast(elements.toast, "분석 프롬프트를 만들었습니다. 이제 같은 버튼으로 복사하세요.");
  } catch (error) {
    showToast(elements.toast, error.message);
  } finally {
    setButtonBusy(
      elements.generateAnalysisButton,
      false,
      isAnalysisPromptReadyToCopy ? "복사" : "분석 프롬프트 생성"
    );
    setAnalysisPromptButtonMode(elements.generateAnalysisButton?.dataset.mode || "generate");
  }
}

async function generateStep1Prompt() {
  if (!state.topic.trim()) {
    showToast(elements.toast, "주제를 먼저 입력해 주세요.");
    return;
  }

  if (!state.researchDataText.trim()) {
    showToast(elements.toast, "먼저 데이터를 수집해 주세요.");
    return;
  }

  if (!state.researchAnalysisText.trim()) {
    showToast(elements.toast, "수집 데이터 분석 결과를 먼저 준비해 주세요.");
    return;
  }

  const analysisMismatchMessages = getResearchAnalysisMismatchMessages(state);
  const analysisValidationMessages = getResearchAnalysisValidationMessages(state);

  if (analysisMismatchMessages.length > 0 || analysisValidationMessages.length > 0) {
    showToast(elements.toast, "현재 화면 설정과 맞는 분석 결과 JSON을 먼저 붙여넣어 주세요.");
    renderResearchAnalysisStatus();
    return;
  }

  setButtonBusy(elements.generateStep1Button, true, "생성 중...");

  const activeBrandKey = state.activeBrand || "nothingmatters";
  const brandProfile = state.brandProfiles?.[activeBrandKey] || {};

  try {
    const payload = await postJson("/api/prompts/step1", {
      topic: state.topic,
      intent: state.intent,
      tone: state.tone,
      researchData: readJsonTextarea(state.researchDataText),
      researchAnalysisResult: readJsonTextarea(state.researchAnalysisText),
      brandContext: state.brandContext || state.brandType,
      writingGoal: state.writingGoal,
      brandName: brandProfile.name || "",
      brandProducts: brandProfile.products || "",
      brandDescription: brandProfile.description || ""
    });

    state.step1Prompt = payload.prompt;
    elements.step1PromptTextarea.value = payload.prompt;
    saveState(state);
    setStep1PromptButtonMode("copy");
    showToast(elements.toast, "프롬프트를 만들었습니다. 이제 같은 버튼으로 복사하세요.");
  } catch (error) {
    showToast(elements.toast, error.message);
  } finally {
    setButtonBusy(elements.generateStep1Button, false, isStep1PromptReadyToCopy ? "복사" : "프롬프트 생성");
    setStep1PromptButtonMode(elements.generateStep1Button?.dataset.mode || "generate");
  }
}
