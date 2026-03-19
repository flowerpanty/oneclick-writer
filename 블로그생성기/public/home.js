import {
  copyTextarea,
  ensureSelectedTitle,
  escapeHtml,
  getStep1Packages,
  getStep1Result,
  getStep2Result,
  getStep3Result,
  getStepStatusSummary,
  loadState,
  refreshServiceStatus
} from "./shared.js";

const state = loadState();
ensureSelectedTitle(state);

const elements = {
  toast: document.querySelector("#toast"),
  serviceStatus: document.querySelector("#service-status"),
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  projectSnapshot: document.querySelector("#project-snapshot"),
  workflowGrid: document.querySelector("#workflow-grid"),
  resumeLink: document.querySelector("#resume-link"),
  copyTopicButton: document.querySelector("#copy-topic-button")
};

renderHome();
refreshServiceStatus(elements.serviceStatus, elements.toast);

elements.refreshStatusButton?.addEventListener("click", () =>
  refreshServiceStatus(elements.serviceStatus, elements.toast)
);

elements.copyTopicButton?.addEventListener("click", async () => {
  const hiddenTextarea = document.querySelector("#topic-copy-buffer");
  hiddenTextarea.value = state.topic || "";
  await copyTextarea("topic-copy-buffer", elements.toast);
});

function renderHome() {
  const step1 = getStep1Result(state);
  const step2 = getStep2Result(state);
  const step3 = getStep3Result(state);
  const step1Packages = getStep1Packages(state);
  const summary = getStepStatusSummary(state);
  const resumeHref = step3 ? "/step3.html" : step2 ? "/step3.html" : step1 ? "/step2.html" : "/step1.html";

  elements.resumeLink.href = resumeHref;
  elements.projectSnapshot.innerHTML = `
    <div class="summary-grid">
      <div class="meta-block">
        <strong>현재 주제</strong>
        <p>${escapeHtml(state.topic || "아직 시작 전")}</p>
      </div>
      <div class="meta-block">
        <strong>검색의도</strong>
        <p>${escapeHtml(state.intent || "[미입력]")}</p>
      </div>
      <div class="meta-block">
        <strong>선택 제목</strong>
        <p>${escapeHtml(state.selectedTitle || "STEP 1에서 선택")}</p>
      </div>
      <div class="meta-block">
        <strong>결과 보관</strong>
        <p>브라우저 저장소에 STEP 결과와 프롬프트가 이어서 저장됩니다.</p>
      </div>
    </div>
  `;

  elements.workflowGrid.innerHTML = [
    {
      step: "STEP 1",
      title: "조사 + 키워드/제목",
      href: "/step1.html",
      stateLabel: summary.step1Done ? "완료" : summary.step1Ready ? "준비됨" : "입력 필요",
      description: summary.step1Done
        ? `${(step1?.keyword_strategy?.main_keywords || []).length || 0}개 메인 키워드와 ${step1Packages.length || 0}개 발행 패키지가 저장되어 있습니다.`
        : "주제 입력, 네이버 조사 데이터 수집, 수집 데이터 분석, STEP 1 프롬프트 생성, 결과 붙여넣기까지 처리합니다."
    },
    {
      step: "STEP 2",
      title: "선택 제목 기반 설계도",
      href: "/step2.html",
      stateLabel: summary.step2Done ? "완료" : summary.step2Ready ? "진행 가능" : "STEP 1 필요",
      description: summary.step2Done
        ? `${(step2?.sections || []).length || 0}개 섹션 구조와 브랜드 연결 설계가 저장되어 있습니다.`
        : "STEP 1 결과에서 발행 패키지 1개를 골라 본문 설계도 JSON을 만드는 단계입니다."
    },
    {
      step: "STEP 3",
      title: "최종 본문 패키지",
      href: "/step3.html",
      stateLabel: summary.step3Done ? "완료" : summary.step3Ready ? "진행 가능" : "STEP 2 필요",
      description: summary.step3Done
        ? `${escapeHtml(step3?.naver?.title || step3?.wordpress?.title || "최종 본문 생성 완료")} 상태입니다.`
        : "네이버 본문 패키지와 워드프레스 HTML 결과를 확인하는 마감 단계입니다."
    }
  ]
    .map(
      (item) => `
        <article class="workflow-card panel">
          <p class="section-kicker">${item.step}</p>
          <h3>${item.title}</h3>
          <span class="step-state">${item.stateLabel}</span>
          <p class="workflow-text">${item.description}</p>
          <a class="ghost-button link-button" href="${item.href}">열기</a>
        </article>
      `
    )
    .join("");
}
