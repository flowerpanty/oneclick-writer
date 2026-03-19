import {
  clearTextareaField,
  copyTextarea,
  escapeHtml,
  getStep2Result,
  loadState,
  parseStep3Deliverable,
  postJson,
  refreshServiceStatus,
  renderProjectSnapshot,
  resetState,
  sanitizePreviewHtml,
  saveState,
  setButtonBusy,
  showToast,
  updateField
} from "./shared.js";

const state = loadState();
let step3PromptButtonTimer = null;
let isStep3PromptReadyToCopy = false;

const elements = {
  toast: document.querySelector("#toast"),
  serviceStatus: document.querySelector("#service-status"),
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  projectSnapshot: document.querySelector("#project-snapshot"),
  guardMessage: document.querySelector("#guard-message"),
  brandNameInput: document.querySelector("#brand-name-input"),
  preferredToneInput: document.querySelector("#preferred-tone-input"),
  naverEditorLabelInput: document.querySelector("#naver-editor-label-input"),
  step2Digest: document.querySelector("#step2-digest"),
  generateStep3Button: document.querySelector("#generate-step3-button"),
  clearStep3PromptButton: document.querySelector("#clear-step3-prompt-button"),
  clearStep3ResultButton: document.querySelector("#clear-step3-result-button"),
  step3PromptTextarea: document.querySelector("#step3-prompt-textarea"),
  step3ResultTextarea: document.querySelector("#step3-result-textarea"),
  step3Summary: document.querySelector("#step3-summary"),
  naverTitleOutput: document.querySelector("#naver-title-output"),
  naverBodyOutput: document.querySelector("#naver-body-output"),
  wordpressTitleOutput: document.querySelector("#wordpress-title-output"),
  wordpressExcerptOutput: document.querySelector("#wordpress-excerpt-output"),
  wordpressHtmlOutput: document.querySelector("#wordpress-html-output"),
  wordpressPreview: document.querySelector("#wordpress-preview"),
  copyButtons: [...document.querySelectorAll(".copy-button")]
};

hydrate();
attachEvents();
renderAll();
setStep3PromptButtonMode("generate");
refreshServiceStatus(elements.serviceStatus, elements.toast);

function hydrate() {
  const activeBrandProfile = state.brandProfiles?.[state.activeBrand || "nothingmatters"] || {};

  elements.brandNameInput.value = state.brandName || activeBrandProfile.name || "";
  elements.preferredToneInput.value = state.preferredTone || state.tone || "";
  elements.naverEditorLabelInput.value = state.naverEditorLabel || "✍️ 에디터 노트";
  elements.step3PromptTextarea.value = state.step3Prompt;
  elements.step3ResultTextarea.value = state.step3ResultText;
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

  elements.brandNameInput?.addEventListener("input", (event) => {
    markStep3PromptStale();
    updateField(state, "brandName", event.target.value);
    renderProjectSnapshot(elements.projectSnapshot, state);
  });

  elements.preferredToneInput?.addEventListener("input", (event) => {
    markStep3PromptStale();
    updateField(state, "preferredTone", event.target.value);
    renderProjectSnapshot(elements.projectSnapshot, state);
  });

  elements.naverEditorLabelInput?.addEventListener("input", (event) => {
    markStep3PromptStale();
    updateField(state, "naverEditorLabel", event.target.value);
    renderProjectSnapshot(elements.projectSnapshot, state);
  });

  elements.step3PromptTextarea.addEventListener("input", (event) => {
    updateField(state, "step3Prompt", event.target.value);
  });

  elements.step3ResultTextarea.addEventListener("input", (event) => {
    updateField(state, "step3ResultText", event.target.value);
    renderStep3Summary();
    renderProjectSnapshot(elements.projectSnapshot, state);
  });

  elements.generateStep3Button.addEventListener("click", handleStep3PromptAction);
  elements.clearStep3PromptButton?.addEventListener("click", () => {
    markStep3PromptStale();
    clearTextareaField({
      textarea: elements.step3PromptTextarea,
      state,
      key: "step3Prompt",
      toastElement: elements.toast,
      message: "STEP 3 프롬프트를 비웠습니다."
    });
  });
  elements.clearStep3ResultButton?.addEventListener("click", () => {
    clearTextareaField({
      textarea: elements.step3ResultTextarea,
      state,
      key: "step3ResultText",
      toastElement: elements.toast,
      message: "STEP 3 결과를 비웠습니다.",
      afterClear: () => {
        renderStep3Summary();
        renderProjectSnapshot(elements.projectSnapshot, state);
      }
    });
  });

  elements.copyButtons.forEach((button) => {
    button.addEventListener("click", () => copyTextarea(button.dataset.copyTarget, elements.toast));
  });
}

function setStep3PromptButtonMode(mode = "generate") {
  const button = elements.generateStep3Button;

  if (!button) {
    return;
  }

  isStep3PromptReadyToCopy = mode === "copy";
  window.clearTimeout(step3PromptButtonTimer);
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
    step3PromptButtonTimer = window.setTimeout(() => {
      setStep3PromptButtonMode("copy");
    }, 1400);
  }
}

function markStep3PromptStale() {
  setStep3PromptButtonMode("generate");
}

async function handleStep3PromptAction() {
  if (isStep3PromptReadyToCopy && elements.step3PromptTextarea.value.trim()) {
    const copied = await copyTextarea("step3-prompt-textarea", elements.toast);

    if (copied) {
      setStep3PromptButtonMode("copied");
    }

    return;
  }

  await generateStep3Prompt();
}

function renderAll() {
  renderProjectSnapshot(elements.projectSnapshot, state);
  renderStep2Digest();
  renderStep3Summary();
}

function renderStep2Digest() {
  const parsed = getStep2Result(state);

  if (!parsed) {
    elements.guardMessage.className = "warning-banner";
    elements.guardMessage.innerHTML =
      'STEP 2 결과가 아직 없습니다. <a href="/step2.html">STEP 2 페이지</a>에서 설계도 JSON을 먼저 붙여넣어 주세요.';
    if (!elements.step2Digest) {
      return;
    }
    elements.step2Digest.className = "compact-summary empty-state";
    elements.step2Digest.textContent = "STEP 2 결과가 준비되면 여기서 간단히 확인할 수 있습니다.";
    return;
  }

  elements.guardMessage.className = "warning-banner hidden";
  if (!elements.step2Digest) {
    return;
  }
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];

  elements.step2Digest.className = "compact-summary";
  elements.step2Digest.innerHTML = `
    <div class="result-stack">
      <div class="result-section">
        <strong>선택 제목</strong>
        <p>${escapeHtml(parsed.selected_title || state.selectedTitle || "[미선택]")}</p>
      </div>
      <div class="result-section">
        <strong>핵심 메시지</strong>
        <p>${escapeHtml(parsed.core_message || "[미입력]")}</p>
        <p>도입 훅: ${escapeHtml(parsed.intro_strategy?.hook_direction || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>섹션</strong>
        <div class="result-list">
          ${sections
            .slice(0, 3)
            .map(
              (section) => `
                <div class="result-item">
                  <span>${escapeHtml(section.section_title || "[미입력]")}</span>
                  <small>${escapeHtml(section.section_goal || "")}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="result-section">
        <strong>브랜드 연결 위치</strong>
        <p>${escapeHtml(parsed.brand_bridge_plan?.recommended_position || "[미입력]")}</p>
      </div>
    </div>
  `;
}

async function generateStep3Prompt() {
  if (!state.step1ResultText.trim() || !state.step2ResultText.trim()) {
    showToast(elements.toast, "STEP 1과 STEP 2 결과 JSON이 모두 필요합니다.");
    return;
  }

  setButtonBusy(elements.generateStep3Button, true, "생성 중...");

  const activeBrandKey = state.activeBrand || "nothingmatters";
  const brandProfile = state.brandProfiles?.[activeBrandKey] || {};

  try {
    const payload = await postJson("/api/prompts/step3", {
      topic: state.topic,
      intent: state.intent,
      step1ResultJson: state.step1ResultText,
      step2ResultJson: state.step2ResultText,
      brandName: state.brandName || brandProfile.name || "",
      brandProducts: brandProfile.products || "",
      brandDescription: brandProfile.description || "",
      preferredTone: state.preferredTone || state.tone || "",
      naverEditorLabel: state.naverEditorLabel || "✍️ 에디터 노트"
    });

    state.step3Prompt = payload.prompt;
    elements.step3PromptTextarea.value = payload.prompt;
    saveState(state);
    setStep3PromptButtonMode("copy");
    showToast(elements.toast, "프롬프트를 만들었습니다. 이제 같은 버튼으로 복사하세요.");
  } catch (error) {
    showToast(elements.toast, error.message);
  } finally {
    setButtonBusy(elements.generateStep3Button, false, isStep3PromptReadyToCopy ? "복사" : "프롬프트 생성");
    setStep3PromptButtonMode(elements.generateStep3Button?.dataset.mode || "generate");
  }
}

function renderStep3Summary() {
  const rawValue = elements.step3ResultTextarea?.value || state.step3ResultText || "";
  const parsed = parseStep3Deliverable(rawValue);

  if (!parsed) {
    const hasInput = Boolean(rawValue.trim());
    elements.step3Summary.className = hasInput
      ? "compact-summary error-state"
      : "compact-summary empty-state";
    elements.step3Summary.innerHTML = hasInput
      ? "`NAVER_VERSION`과 `WORDPRESS_VERSION` 구간을 모두 찾지 못했습니다.<br />AI 전체 결과를 처음부터 끝까지 다시 붙여넣어 주세요."
      : "결과를 붙여넣으면 파싱 상태와 복사용 출력이 여기에 표시됩니다.";
    clearStep3Outputs();
    elements.wordpressPreview.className = "wordpress-preview empty-state";
    elements.wordpressPreview.textContent = "HTML 본문이 보이면 워드프레스 복붙 전 마지막 확인을 할 수 있습니다.";
    return;
  }

  const naverTitle = parsed.naver?.title || "";
  const naverBody = parsed.naver?.body || parsed.naver?.fullText || "";
  const wordpressTitle = parsed.wordpress?.title || naverTitle;
  const wordpressExcerpt = parsed.wordpress?.excerpt || "";
  const htmlBody = parsed.wordpress?.html || buildFallbackHtml(naverBody);

  setOutputValue(elements.naverTitleOutput, naverTitle);
  setOutputValue(elements.naverBodyOutput, naverBody);
  setOutputValue(elements.wordpressTitleOutput, wordpressTitle);
  setOutputValue(elements.wordpressExcerptOutput, wordpressExcerpt);
  setOutputValue(elements.wordpressHtmlOutput, htmlBody);

  elements.step3Summary.className = "compact-summary success-state";
  elements.step3Summary.innerHTML = `
    <div class="result-stack">
      <div class="result-section">
        <strong>파싱 완료</strong>
        <p>형식: ${escapeHtml(parsed.format === "sectioned" ? "최신 STEP 3 결과" : "기존 JSON 결과")}</p>
        <p>네이버 제목: ${escapeHtml(naverTitle || "[미입력]")}</p>
      </div>
      <div class="result-section">
        <strong>복사용 출력 상태</strong>
        <p>네이버 본문: ${naverBody ? `${naverBody.length}자` : "없음"}</p>
        <p>워드프레스 HTML: ${htmlBody ? `${htmlBody.length}자` : "없음"}</p>
      </div>
      <div class="result-section">
        <strong>워드프레스 제목/요약</strong>
        <p>${escapeHtml(wordpressTitle || "[미입력]")}</p>
        <p>${escapeHtml(wordpressExcerpt || "[미입력]")}</p>
      </div>
    </div>
  `;

  elements.wordpressPreview.className = htmlBody ? "wordpress-preview" : "wordpress-preview empty-state";
  elements.wordpressPreview.innerHTML = htmlBody
    ? sanitizePreviewHtml(htmlBody)
    : "워드프레스용 HTML이 아직 없습니다.";
}

function setOutputValue(element, value) {
  if (!element) {
    return;
  }

  element.value = value || "";
}

function clearStep3Outputs() {
  setOutputValue(elements.naverTitleOutput, "");
  setOutputValue(elements.naverBodyOutput, "");
  setOutputValue(elements.wordpressTitleOutput, "");
  setOutputValue(elements.wordpressExcerptOutput, "");
  setOutputValue(elements.wordpressHtmlOutput, "");
}

function buildFallbackHtml(body) {
  if (!body) {
    return "";
  }

  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join("\n");
}
