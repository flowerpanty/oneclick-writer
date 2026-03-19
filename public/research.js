const $ = (id) => document.getElementById(id);
const RESEARCH_SNAPSHOT_STORAGE_KEY = "naverResearch:lastSnapshot";

const els = {
  step1: $("step1"),
  step2: $("step2"),
  step3: $("step3"),
  conn1: $("conn1"),
  conn2: $("conn2"),
  configBadge: $("configBadge"),
  configNotice: $("configNotice"),
  queryInput: $("queryInput"),
  sortSelect: $("sortSelect"),
  recentDaysSelect: $("recentDaysSelect"),
  searchBtn: $("searchBtn"),
  resetBtn: $("resetBtn"),
  statusText: $("statusText"),
  errorText: $("errorText"),
  statQueries: $("statQueries"),
  metricSearchTotal: $("metricSearchTotal"),
  metricSearchPc: $("metricSearchPc"),
  metricSearchMobile: $("metricSearchMobile"),
  metricContentTotal: $("metricContentTotal"),
  metricSaturationTotal: $("metricSaturationTotal"),
  metricSaturationBlog: $("metricSaturationBlog"),
  metricSaturationCafe: $("metricSaturationCafe"),
  keywordChips: $("keywordChips"),
  headlineList: $("headlineList"),
  resultTabBlog: $("resultTabBlog"),
  resultTabCafeQuestion: $("resultTabCafeQuestion"),
  resultTabCafe: $("resultTabCafe"),
  resultTabRecent: $("resultTabRecent"),
  resultViewTitle: $("resultViewTitle"),
  resultViewHint: $("resultViewHint"),
  resultViewCount: $("resultViewCount"),
  resultViewList: $("resultViewList"),
  copySummaryBtn: $("copySummaryBtn"),
  copyPromptBtn: $("copyPromptBtn"),
  exportCsvBtn: $("exportCsvBtn"),
};

const nf = new Intl.NumberFormat("ko-KR");

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCount(value, fallback = "확인 어려움") {
  return isFiniteNumber(value) ? nf.format(value) : fallback;
}

function formatPercent(value, fallback = "확인 어려움") {
  return isFiniteNumber(value) ? `${value}%` : fallback;
}

function formatRatio(value, fallback = "확인 어려움") {
  return isFiniteNumber(value) ? `${value.toFixed(2)}배` : fallback;
}

const state = {
  health: null,
  lastResult: null,
  resultView: "blog",
};

function setStep(active) {
  const steps = [els.step1, els.step2, els.step3].filter(Boolean);
  const conns = [els.conn1, els.conn2].filter(Boolean);

  steps.forEach((step, index) => {
    step.classList.remove("active", "done");
    if (index + 1 < active) step.classList.add("done");
    if (index + 1 === active) step.classList.add("active");
  });

  conns.forEach((conn, index) => {
    conn.classList.toggle("done", index + 1 < active);
  });
}

const headlineSectionOrder = ["정보형", "후기형", "추천형", "기록형", "공감형", "브랜딩형"];

const resultViewMeta = {
  blog: {
    title: "블로그 글",
    hint: "상위 블로그 글 제목과 설명을 먼저 보면서 어떤 흐름으로 쓰는지 빠르게 잡아보세요.",
    emptyText: "블로그 글 결과가 없습니다."
  },
  cafeQuestion: {
    title: "카페 질문",
    hint: "질문형 카페 제목을 최대 60개까지 모아둔 화면입니다. 사람들이 실제로 무엇을 궁금해하는지 보기 좋습니다.",
    emptyText: "질문형 카페 제목이 아직 없습니다."
  },
  cafe: {
    title: "카페 글",
    hint: "카페 글은 후기, 고민, 비교 포인트를 보는 용도로 좋습니다.",
    emptyText: "카페 글 결과가 없습니다."
  },
  recent: {
    title: "최신 글",
    hint: "날짜가 잡히는 글만 따로 모았습니다. 최근 흐름을 보고 싶을 때 보세요.",
    emptyText: "날짜 정보가 있는 최신 글이 아직 없습니다."
  }
};

function setStatus(message = "") {
  els.statusText.textContent = message;
}

function setError(message = "") {
  els.errorText.textContent = message;
}

function setSearchBusy(isBusy) {
  els.searchBtn.disabled = isBusy || !state.health?.naverSearchConfigured;
  els.searchBtn.textContent = isBusy ? "리서치 중..." : "리서치 시작";
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

function getPreferredResearchData(data) {
  const enriched = data?.insights?.enrichedSummary;
  return typeof enriched === "string" && enriched.trim() ? enriched.trim() : "";
}

function buildSummaryText(data) {
  const enrichedSummary = getPreferredResearchData(data);
  if (enrichedSummary) {
    return enrichedSummary;
  }

  const keywords = [...(data.insights.relatedKeywords || [])]
    .sort((a, b) => (b.totalSearch || 0) - (a.totalSearch || 0))
    .slice(0, 8)
    .map((item) => item.keyword)
    .join(", ");
  const questionTitles = data.insights.communityQuestions.slice(0, 3).map((item) => item.title).join(" / ");
  const headlines = (data.insights.headlineIdeas || [])
    .slice(0, 6)
    .map((item, index) => `${index + 1}. [${item.section || "제목"}] ${item.title}`)
    .join("\n");
  const metrics = data.insights.metrics || {};

  return [
    `[기준 키워드] ${metrics.focusKeyword || data.queries.join(", ")}`,
    `[월간 검색량] ${formatCount(metrics.totalSearch)}회`,
    `[네이버 블로그 문서수] ${formatCount(metrics.blogDocumentCount)}건`,
    `[상위 노출 가능성] ${metrics.blogCompetition?.chanceLabel || "확인 어려움"} / 블로그 경쟁도 ${metrics.blogCompetition?.competitionLabel || "확인 어려움"} / 문서·검색 비율 ${formatRatio(metrics.blogCompetition?.ratio)}`,
    `[원본 수집] ${nf.format(data.totalFetched)}건`,
    `[중복 제거 후] ${nf.format(data.totalUnique)}건`,
    `[연관검색어] ${keywords || "-"}`,
    `[카페 질문] ${questionTitles || "-"}`,
    ...(data.insights.headlineMemory?.similarSearchCount ? [`[누적 검색 메모] ${data.insights.headlineMemory.note}`] : []),
    "[제목 후보]",
    headlines
  ].join("\n");
}

function shortenSnapshotText(text, maxLength = 180) {
  const clean = (text || "").toString().replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function buildStrategyResearchSnapshot(data) {
  const enrichedSummary = getPreferredResearchData(data);
  if (enrichedSummary) {
    return enrichedSummary;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const blogItems = items.filter((item) => item.source === "blog");
  const cafeItems = items.filter((item) => item.source === "cafe");
  const cafeQuestions = Array.isArray(data?.insights?.communityQuestions) ? data.insights.communityQuestions : [];
  const keywords = [...(data?.insights?.relatedKeywords || [])]
    .sort((a, b) => (b.totalSearch || 0) - (a.totalSearch || 0))
    .slice(0, 20);
  const headlines = Array.isArray(data?.insights?.headlineIdeas) ? data.insights.headlineIdeas.slice(0, 20) : [];
  const metrics = data?.insights?.metrics || {};

  return [
    "[기준 키워드]",
    `${metrics.focusKeyword || (data.queries || []).join(", ") || "-"}`,
    "",
    "[월간 검색량]",
    `PC ${formatCount(metrics.pcSearch)} / Mobile ${formatCount(metrics.mobileSearch)} / Total ${formatCount(metrics.totalSearch)}`,
    "",
    "[네이버 블로그 문서수]",
    `${formatCount(metrics.blogDocumentCount)}건`,
    "",
    "[상위 노출 가능성]",
    `${metrics.blogCompetition?.chanceLabel || "확인 어려움"} / 블로그 경쟁도 ${metrics.blogCompetition?.competitionLabel || "확인 어려움"} / 문서·검색 비율 ${formatRatio(metrics.blogCompetition?.ratio)}`,
    "",
    "[연관검색어]",
    ...(keywords.length
      ? keywords.map((item, index) => `${index + 1}. ${item.keyword} (${formatCount(item.totalSearch)}회)`)
      : ["-"]),
    "",
    "[블로그 제목 추천]",
    ...(headlines.length
      ? headlines.map((item, index) => `${index + 1}. ${item.title}`)
      : ["-"]),
    "",
    "[카페 질문 수집 결과]",
    ...(cafeQuestions.length
      ? cafeQuestions.map((item, index) => `${index + 1}. ${item.title} | ${item.author || "작성자 미상"} | ${(item.matchedQueries || []).join(", ") || "-"} | ${item.link || "-"}`)
      : ["-"]),
    "",
    "[블로그 글 수집 결과]",
    ...(blogItems.length
      ? blogItems.map((item, index) => `${index + 1}. ${item.title} | ${item.author || "출처 미상"} | ${item.displayDate || "-"} | ${(item.matchedQueries || []).join(", ") || "-"} | ${shortenSnapshotText(item.description)}`)
      : ["-"]),
    "",
    "[카페 글 수집 결과]",
    ...(cafeItems.length
      ? cafeItems.map((item, index) => `${index + 1}. ${item.title} | ${item.author || "출처 미상"} | ${item.displayDate || "-"} | ${(item.matchedQueries || []).join(", ") || "-"} | ${shortenSnapshotText(item.description)}`)
      : ["-"])
  ].join("\n");
}

function persistResearchSnapshot(data) {
  try {
    const snapshot = {
      savedAt: new Date().toISOString(),
      queries: data?.queries || [],
      totalFetched: data?.totalFetched || 0,
      totalUnique: data?.totalUnique || 0,
      snapshotText: buildStrategyResearchSnapshot(data)
    };
    localStorage.setItem(RESEARCH_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
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

function downloadCsv(data) {
  const rows = [
    ["source", "title", "author", "date", "matchedQueries", "description", "link"],
    ...data.items.map((item) => [
      item.sourceLabel,
      item.title,
      item.author,
      item.displayDate,
      item.matchedQueries.join(" | "),
      item.description,
      item.link
    ])
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${(cell || "").toString().replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `naver-research-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderConfigState(health) {
  state.health = health;
  const configured = Boolean(health?.naverSearchConfigured);
  const trendConfigured = Boolean(health?.naverTrendConfigured);
  const keywordToolConfigured = Boolean(health?.naverKeywordToolConfigured);

  els.configBadge.textContent = configured ? "NAVER API 연결 준비 완료" : "NAVER API 키 필요";
  els.configBadge.classList.toggle("ready", configured);
  els.configBadge.classList.toggle("missing", !configured);

  if (configured) {
    if (trendConfigured) {
      if (keywordToolConfigured) {
        els.configNotice.classList.add("hidden");
        els.configNotice.innerHTML = "";
      } else {
        els.configNotice.classList.remove("hidden");
        els.configNotice.innerHTML = [
          "<strong>추가 설정 가능</strong>",
          "<br />검색 리서치와 데이터랩은 준비 완료입니다.",
          "<br />연관검색어까지 쓰려면 검색광고 API 키도 `.env`에 넣어주세요."
        ].join("");
      }
    } else {
      els.configNotice.classList.remove("hidden");
      els.configNotice.innerHTML = [
        "<strong>추가 설정 가능</strong>",
        "<br />검색 리서치는 준비 완료입니다.",
        "<br />트렌드 보드까지 쓰려면 `.env`에 `NAVER_DATALAB_CLIENT_ID`, `NAVER_DATALAB_CLIENT_SECRET`를 넣어주세요."
      ].join("");
    }
  } else {
    els.configNotice.classList.remove("hidden");
    els.configNotice.innerHTML = [
      "<strong>설정 방법</strong>",
      "<br />1. [애플리케이션 등록]에서 네이버 검색 API 사용 설정",
      "<br />2. `.env` 파일에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 입력",
      "<br />3. 서버 재실행 후 다시 접속",
      "<br />4. 트렌드 보드까지 쓰려면 데이터랩 검색어 트렌드 API 권한도 함께 켜기",
      "<br />5. 필요하면 `NAVER_DATALAB_CLIENT_ID`, `NAVER_DATALAB_CLIENT_SECRET`를 별도로 입력"
    ].join("");
  }

  setSearchBusy(false);
}

function renderStats(data) {
  els.statQueries.textContent = data.insights.metrics?.focusKeyword || data.queries.join(", ");
}

function renderMetrics(metrics) {
  if (!metrics) {
    els.metricSearchTotal.textContent = "-";
    els.metricSearchPc.textContent = "-";
    els.metricSearchMobile.textContent = "-";
    els.metricContentTotal.textContent = "-";
    els.metricSaturationTotal.textContent = "-";
    els.metricSaturationBlog.textContent = "-";
    els.metricSaturationCafe.textContent = "-";
    return;
  }

  els.metricSearchTotal.textContent = formatCount(metrics.totalSearch, "-");
  els.metricSearchPc.textContent = formatCount(metrics.pcSearch, "-");
  els.metricSearchMobile.textContent = formatCount(metrics.mobileSearch, "-");
  els.metricContentTotal.textContent = formatCount(metrics.blogDocumentCount, "확인 어려움");
  els.metricSaturationTotal.textContent = metrics.blogCompetition?.chanceLabel || "확인 어려움";
  els.metricSaturationBlog.textContent = metrics.blogCompetition?.competitionLabel || "확인 어려움";
  els.metricSaturationCafe.textContent = formatRatio(metrics.blogCompetition?.ratio, "확인 어려움");
}

function renderChipCloud(target, items, textSelector, scoreSelector, emptyText) {
  const safeItems = Array.isArray(items) ? items : [];

  if (!safeItems.length) {
    target.className = "chip-cloud empty";
    target.textContent = emptyText;
    return;
  }

  target.className = "chip-cloud";
  target.innerHTML = safeItems
    .map((item) => `<span class="chip">#${escapeHtml(textSelector(item))} <small>${escapeHtml(scoreSelector(item))}</small></span>`)
    .join("");
}

function pickTopHeadlineItems(items, scoreKey, limit = 3) {
  const seen = new Set();
  const picked = [];

  for (const item of [...items].sort((a, b) => (b[scoreKey] || 0) - (a[scoreKey] || 0))) {
    const key = (item.title || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    picked.push(item);
    if (picked.length >= limit) break;
  }

  return picked;
}

function renderHeadlineIdeas(target, items, headlineMemory) {
  const safeItems = Array.isArray(items) ? items : [];

  if (!safeItems.length) {
    target.className = "headline-board empty";
    target.textContent = "제목 후보가 아직 없습니다.";
    return;
  }

  const sectionRanks = new Map(headlineSectionOrder.map((section, index) => [section, index]));
  const orderedItems = [...safeItems].sort((a, b) => {
    const sectionDiff = (sectionRanks.get(a.section) ?? 99) - (sectionRanks.get(b.section) ?? 99);
    if (sectionDiff !== 0) return sectionDiff;
    return (b.naturalScore || 0) - (a.naturalScore || 0);
  });

  const pickGroups = [
    {
      label: "가장 자연스러운 제목 TOP 3",
      items: pickTopHeadlineItems(safeItems, "naturalScore")
    },
    {
      label: "검색 유입에 유리한 제목 TOP 3",
      items: pickTopHeadlineItems(safeItems, "seoScore")
    },
    {
      label: "클릭률이 좋아 보이는 제목 TOP 3",
      items: pickTopHeadlineItems(safeItems, "clickScore")
    },
    {
      label: "브랜드 느낌이 잘 살아 있는 제목 TOP 3",
      items: pickTopHeadlineItems(safeItems, "brandScore")
    }
  ];
  const balancedTop = [...safeItems].sort((a, b) => {
    const aScore = ((a.seoScore || 0) + (a.clickScore || 0) + (a.naturalScore || 0)) / 3;
    const bScore = ((b.seoScore || 0) + (b.clickScore || 0) + (b.naturalScore || 0)) / 3;
    return bScore - aScore;
  })[0] || safeItems[0];
  const finalPicks = [
    {
      label: "가장 무난한 제목 1개",
      item: balancedTop
    },
    {
      label: "가장 자연스러운 제목 1개",
      item: pickGroups[0].items[0] || safeItems[0]
    },
    {
      label: "가장 검색 친화적인 제목 1개",
      item: pickGroups[1].items[0] || safeItems[0]
    },
    {
      label: "가장 클릭하고 싶은 제목 1개",
      item: pickGroups[2].items[0] || safeItems[0]
    }
  ];

  target.className = "headline-board";
  target.innerHTML = [
    `
      <section class="headline-section">
        <h4>제목 20개</h4>
        <ol class="headline-list">
          ${orderedItems.map((item) => `
            <li class="headline-item">
              <strong>${escapeHtml(item.title)}</strong>
            </li>
          `).join("")}
        </ol>
      </section>
    `,
    `
      <div class="headline-pick-grid">
        ${pickGroups.map((group) => `
          <article class="headline-pick-card">
            <h4>${escapeHtml(group.label)}</h4>
            <ol class="headline-pick-list">
              ${group.items.map((item) => `
                <li>
                  <strong>${escapeHtml(item.title)}</strong>
                </li>
              `).join("")}
            </ol>
          </article>
        `).join("")}
      </div>
    `,
    `
      <section class="headline-section">
        <h4>마지막 추천</h4>
        <div class="headline-final-grid">
          ${finalPicks.map((entry) => `
            <article class="headline-final-card">
              <span>${escapeHtml(entry.label)}</span>
              <strong>${escapeHtml(entry.item?.title || "-")}</strong>
            </article>
          `).join("")}
        </div>
      </section>
    `
  ].join("");
}

function renderRecentPosts(target, items, emptyText = "날짜 정보가 있는 최신 글이 아직 없습니다.") {
  if (!items.length) {
    target.className = "recent-strip empty";
    target.textContent = emptyText;
    return;
  }

  target.className = "recent-strip";
  target.innerHTML = items
    .map(
      (item) => `
        <article class="recent-card">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.source)} · ${escapeHtml(item.author)}</span>
          <span>${escapeHtml(item.date || "-")}</span>
        </article>
      `
    )
    .join("");
}

function renderCommunityQuestions(target, items, emptyText = "질문형 카페 제목이 아직 없습니다.") {
  if (!items.length) {
    target.className = "results-list empty";
    target.textContent = emptyText;
    return;
  }

  target.className = "results-list";
  target.innerHTML = items
    .map(
      (item) => `
        <article class="result-card">
          <div class="result-meta">
            <span class="meta-pill cafe">카페 질문</span>
            <span class="meta-pill">${escapeHtml(item.author || "작성자 미상")}</span>
            ${item.matchedQueries.map((query) => `<span class="meta-pill">${escapeHtml(query)}</span>`).join("")}
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <div class="result-footer">
            <span>${escapeHtml(item.link)}</span>
            <a class="result-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">원문 열기</a>
          </div>
        </article>
      `
    )
    .join("");
}

function renderResults(target, items, emptyText = "검색 결과가 없습니다.") {
  if (!items.length) {
    target.className = "results-list empty";
    target.textContent = emptyText;
    return;
  }

  target.className = "results-list";
  target.innerHTML = items
    .map(
      (item) => `
        <article class="result-card">
          <div class="result-meta">
            <span class="meta-pill ${item.source === "cafe" ? "cafe" : ""}">${escapeHtml(item.sourceLabel)}</span>
            <span class="meta-pill">${escapeHtml(item.author || "출처 미상")}</span>
            <span class="meta-pill">${escapeHtml(item.displayDate || "날짜 없음")}</span>
            ${item.matchedQueries.map((query) => `<span class="meta-pill">${escapeHtml(query)}</span>`).join("")}
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description || "요약 설명이 없는 결과입니다.")}</p>
          <div class="result-footer">
            <span>${escapeHtml(item.link)}</span>
            <a class="result-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">원문 열기</a>
          </div>
        </article>
      `
    )
    .join("");
}

function buildResultGroups(data) {
  const items = Array.isArray(data?.items) ? data.items : [];

  return {
    blog: items.filter((item) => item.source === "blog"),
    cafeQuestion: Array.isArray(data?.insights?.communityQuestions) ? data.insights.communityQuestions : [],
    cafe: items.filter((item) => item.source === "cafe"),
    recent: Array.isArray(data?.insights?.recentPosts) ? data.insights.recentPosts : []
  };
}

function getAvailableResultView(groups) {
  if (groups.blog.length) return "blog";
  if (groups.cafeQuestion.length) return "cafeQuestion";
  if (groups.cafe.length) return "cafe";
  return "recent";
}

function updateResultTabButtons(groups) {
  const tabs = [
    { key: "blog", button: els.resultTabBlog, label: "블로그 글" },
    { key: "cafeQuestion", button: els.resultTabCafeQuestion, label: "카페 질문" },
    { key: "cafe", button: els.resultTabCafe, label: "카페 글" },
    { key: "recent", button: els.resultTabRecent, label: "최신 글" }
  ];

  tabs.forEach(({ key, button, label }) => {
    const count = Array.isArray(groups[key]) ? groups[key].length : 0;
    const isActive = state.resultView === key;
    button.textContent = `${label} ${nf.format(count)}건`;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function renderResultView(data) {
  const groups = buildResultGroups(data);
  if (!groups[state.resultView]?.length) {
    state.resultView = getAvailableResultView(groups);
  }

  const currentItems = groups[state.resultView] || [];
  const currentMeta = resultViewMeta[state.resultView] || resultViewMeta.blog;

  updateResultTabButtons(groups);
  els.resultViewTitle.textContent = currentMeta.title;
  els.resultViewHint.textContent = currentMeta.hint;
  els.resultViewCount.textContent = `${nf.format(currentItems.length)}건`;

  if (state.resultView === "cafeQuestion") {
    renderCommunityQuestions(els.resultViewList, currentItems, currentMeta.emptyText);
    return;
  }

  if (state.resultView === "recent") {
    renderRecentPosts(els.resultViewList, currentItems, currentMeta.emptyText);
    return;
  }

  renderResults(els.resultViewList, currentItems, currentMeta.emptyText);
}

function renderResult(data) {
  state.lastResult = data;
  persistResearchSnapshot(data);
  renderStats(data);
  renderMetrics(data.insights.metrics);
  renderChipCloud(
    els.keywordChips,
    [...(data.insights.relatedKeywords || [])].sort((a, b) => (b.totalSearch || 0) - (a.totalSearch || 0)),
    (item) => item.keyword,
    (item) => `${formatCount(item.totalSearch)}회`,
    "연관검색어가 아직 없습니다."
  );
  renderHeadlineIdeas(els.headlineList, data.insights.headlineIdeas, data.insights.headlineMemory);
  renderResultView(data);

  els.copySummaryBtn.disabled = false;
  els.copyPromptBtn.disabled = false;
  els.exportCsvBtn.disabled = false;
  setStep(3);
}

function clearRenderedResult() {
  state.lastResult = null;
  state.resultView = "blog";
  els.statQueries.textContent = "-";
  renderMetrics(null);
  els.keywordChips.className = "chip-cloud empty";
  els.keywordChips.textContent = "검색광고 API 기반 연관검색어가 여기에 나옵니다.";
  els.headlineList.className = "headline-board empty";
  els.headlineList.textContent = "더 자연스럽고 쉬운 제목 후보가 여기에 나옵니다.";
  els.resultViewTitle.textContent = resultViewMeta.blog.title;
  els.resultViewHint.textContent = "검색을 하면 선택한 결과만 이 영역에 정리됩니다.";
  els.resultViewCount.textContent = "0건";
  els.resultViewList.className = "results-list empty";
  els.resultViewList.textContent = "검색 결과 카드가 여기 쌓입니다.";
  els.copySummaryBtn.disabled = true;
  els.copyPromptBtn.disabled = true;
  els.exportCsvBtn.disabled = true;
  updateResultTabButtons(buildResultGroups({}));
}

async function fetchHealth() {
  try {
    const response = await fetch("/api/health");
    const json = await response.json();
    renderConfigState(json);
  } catch {
    renderConfigState({ naverSearchConfigured: false });
    setError("서버 상태를 확인하지 못했어요.");
  }
}

function gatherPayload() {
  return {
    query: els.queryInput.value.trim(),
    sources: ["blog", "cafe"],
    sort: els.sortSelect.value,
    display: 20,
    pages: 3,
    recentDays: Number(els.recentDaysSelect.value),
    dedupe: true
  };
}

async function handleSearch() {
  setError("");
  const payload = gatherPayload();

  if (!payload.query) {
    setError("검색어를 먼저 입력해 주세요.");
    return;
  }

  setSearchBusy(true);
  setStatus("네이버 공개 검색 결과를 모으고 있습니다...");
  setStep(2);

  try {
    const response = await fetch("/api/naver/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json?.error || "검색 요청이 실패했어요.");
    }

    renderResult(json);
    const memoryLine = json.insights?.headlineMemory?.similarSearchCount
      ? ` 유사 검색 ${nf.format(json.insights.headlineMemory.similarSearchCount)}건도 반영했습니다.`
      : "";
    setStatus(`검색 완료: ${nf.format(json.totalUnique)}건을 정리했습니다.${memoryLine}`);
  } catch (error) {
    setError(error?.message || "검색 중 오류가 발생했어요.");
    setStep(state.lastResult ? 3 : 1);
  } finally {
    setSearchBusy(false);
  }
}

function resetForm() {
  els.queryInput.value = "";
  els.sortSelect.value = "sim";
  els.recentDaysSelect.value = "90";
  setStatus("");
  setError("");
  clearRenderedResult();
  setStep(1);
}

function setResultView(view) {
  state.resultView = view;
  if (state.lastResult) {
    renderResultView(state.lastResult);
  } else {
    updateResultTabButtons(buildResultGroups({}));
  }
}

function bindActions() {
  els.searchBtn.addEventListener("click", handleSearch);
  els.resetBtn.addEventListener("click", resetForm);
  els.resultTabBlog.addEventListener("click", () => setResultView("blog"));
  els.resultTabCafeQuestion.addEventListener("click", () => setResultView("cafeQuestion"));
  els.resultTabCafe.addEventListener("click", () => setResultView("cafe"));
  els.resultTabRecent.addEventListener("click", () => setResultView("recent"));
  els.copySummaryBtn.addEventListener("click", async () => {
    if (!state.lastResult) return;
    await copyText(buildSummaryText(state.lastResult));
    setStatus("리서치 요약을 복사했습니다.");
  });
  els.copyPromptBtn.addEventListener("click", async () => {
    if (!state.lastResult) return;
    await copyText(state.lastResult.insights.researchPrompt);
    setStatus("블로그 글쓰기 프롬프트를 복사했습니다.");
  });
  els.exportCsvBtn.addEventListener("click", () => {
    if (!state.lastResult) return;
    downloadCsv(state.lastResult);
    setStatus("CSV 파일을 저장했습니다.");
  });
}

function init() {
  bindActions();
  clearRenderedResult();
  setStep(1);
  fetchHealth();
  loadAgentResearchBridge();
}

// ── 에이전트 브릿지: 에이전트에서 넘어온 검색어 자동 적용 ──────
function loadAgentResearchBridge() {
  const RESEARCH_BRIDGE_KEY = 'agent:research';
  const raw = localStorage.getItem(RESEARCH_BRIDGE_KEY);
  if (!raw) return;

  let bridge;
  try { bridge = JSON.parse(raw); } catch { return; }

  // 5분 이상 지난 데이터는 무시
  if (Date.now() - (bridge.savedAt || 0) > 5 * 60 * 1000) {
    localStorage.removeItem(RESEARCH_BRIDGE_KEY);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.get('from')) return;

  if (bridge.query && els.queryInput) {
    els.queryInput.value = bridge.query;
    setStatus(`에이전트에서 "${bridge.query}" 키워드를 불러왔어요. 리서치를 시작해 보세요!`);
  }

  localStorage.removeItem(RESEARCH_BRIDGE_KEY);
}

init();
