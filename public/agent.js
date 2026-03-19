/* ===== AI 에이전트 허브 ===== */

// ─── localStorage 키 ─────────────────────────────────────────
const BRIDGE_KEY          = 'agent:bridge';       // 원클릭 글생성기
const RESEARCH_BRIDGE_KEY = 'agent:research';     // 네이버 리서치 툴
const RESEARCH_DATA_KEY   = 'agent:researchData'; // 에이전트 내부 공유
const PLAN_DATA_KEY       = 'agent:planData';     // 에이전트 내부 공유
const PLAN_BRIDGE_KEY     = 'agent:planBridge';   // 콘텐츠 기획 툴
const BLOG_BRIDGE_KEY     = 'agent:blogBridge';   // 블로그 브리지 데이터

// ─── 에이전트 레지스트리 ─────────────────────────────────────
const AGENTS = {
  research: {
    id: 'research', name: '리서치 에이전트', icon: '🔍',
    tagColor: 'rgba(6,182,212,0.15)', tagBorder: 'rgba(6,182,212,0.35)', tagText: '#22d3ee',
    endpoint: '/api/agent/research',
    desc: '네이버 블로그/카페 검색 · 키워드 검색량 분석 · 경쟁도 파악',
    placeholder: '리서치할 키워드나 주제를 입력하세요… (예: 여행 파우치 추천)',
    steps: [
      { id: 'parse',    label: '검색어 분석' },
      { id: 'blog',     label: '블로그 수집 (상위 20 + 최신 20)' },
      { id: 'cafe',     label: '카페 수집 (질문 30 + 일반 30)' },
      { id: 'keywords', label: '주요/연관 키워드 검색량 분석' },
      { id: 'insights', label: '콘텐츠 인사이트 분석' },
    ],
    examples: [
      { icon: '🧳', text: '여행 파우치 추천 키워드 리서치해줘' },
      { icon: '👜', text: '직장인 크로스백 경쟁도 분석해줘' },
      { icon: '🍪', text: '수제 쿠키 블로그 상위 포스트 분석' },
      { icon: '💄', text: '봄 코디 인스타 트렌드 조사' },
    ],
    welcome: `안녕하세요! <strong>리서치 에이전트</strong>입니다.<br>
주제를 입력하면 네이버 블로그·카페를 검색하고 키워드 검색량·경쟁도를 자동 분석해 드려요.
<div class="wc-chips">
  <span class="wc-chip">🔍 블로그/카페 검색</span>
  <span class="wc-chip">📊 키워드 검색량</span>
  <span class="wc-chip">⚡ 콘텐츠 공백 분석</span>
</div>`,
  },


  content: {
    id: 'content', name: '원클릭 글생성 에이전트', icon: '✍️',
    tagColor: 'rgba(16,185,129,0.15)', tagBorder: 'rgba(16,185,129,0.35)', tagText: '#34d399',
    endpoint: '/api/agent/content',
    desc: '원클릭 글생성기 기반 · 네이버 리서치 + 프롬프트 자동 생성',
    placeholder: '주제와 내 이야기를 입력하세요… (예: 여행 파우치 직접 써봤어요)',
    steps: [
      { id: 'research', label: '네이버 키워드 리서치' },
      { id: 'prompt',   label: '원클릭 프롬프트 생성' },
    ],
    examples: [
      { icon: '🧳', text: '여행 파우치 추천 블로그 글 써줘 — 30대 여성' },
      { icon: '👜', text: '직장인 크로스백 비교 후기 5채널 콘텐츠' },
      { icon: '🍪', text: '수제 쿠키 창업 이야기 인스타+블로그' },
      { icon: '🌸', text: '봄 코디 룩북 인스타 + 네이버 블로그' },
    ],
    welcome: `안녕하세요! <strong>원클릭 글생성 에이전트</strong>입니다.<br>
주제와 내 이야기를 입력하면 원클릭 글생성기와 <strong>동일한 프롬프트</strong>를 자동으로 만들어 드려요.
<div class="wc-chips">
  <span class="wc-chip">🔍 네이버 리서치 자동</span>
  <span class="wc-chip">✍️ 원클릭 프롬프트</span>
  <span class="wc-chip">📋 ChatGPT 연동</span>
</div>`,
  },

  realBlog: {
    id: 'realBlog', name: '진짜블로그에이전트', icon: '✍️',
    tagColor: 'rgba(168,85,247,0.15)', tagBorder: 'rgba(168,85,247,0.35)', tagText: '#c084fc',
    endpoint: '/api/agent/blog',
    desc: '리서치 → STEP 1~6 기획 → 항목 선택 → 블로그 완성',
    placeholder: '아이디어나 경험을 자유롭게 적어주세요. (예: 수제 쿠키로 돌잔치 답례품 만드는데, 포장이나 가격 책정 고민이 많아요. 직접 만든 경험 위주로 블로그 쓰고 싶어요)',
    steps: [
      { id: 'research', label: '네이버 리서치 (블로그 + 카페)' },
      { id: 'keywords', label: '키워드 검색량 분석' },
      { id: 'planning', label: 'STEP 1~6 콘텐츠 기획 자동생성' },
    ],
    examples: [
      { icon: '🍪', text: '수제 쿠키 돌잔치 답례품 블로그' },
      { icon: '👜', text: '직장인 크로스백 추천 비교 블로그' },
      { icon: '🌸', text: '봄 코디 룩북 네이버 블로그 글' },
      { icon: '🏃', text: '러닝화 추천 입문자 가이드 블로그' },
    ],
    welcome: `안녕하세요! <strong>진짜블로그에이전트</strong>입니다.<br>
주제만 입력하지 말고 <strong>아이디어, 경험, 하고 싶은 말</strong>을 자유롭게 써주세요.<br>
리서치 → 기획 → 선택 → 블로그 완성까지 한 번에 진행합니다.
<div class="wc-chips">
  <span class="wc-chip">💡 아이디어/경험 분석</span>
  <span class="wc-chip">🔍 네이버 리서치</span>
  <span class="wc-chip">📋 STEP 1~6 기획</span>
  <span class="wc-chip">✍️ 직접 선택 후 생성</span>
</div>`,
  },

  naverBlog: {
    id: 'naverBlog', name: '네이버블로그 에이전트', icon: '📝',
    tagColor: 'rgba(79,70,229,0.15)', tagBorder: 'rgba(79,70,229,0.35)', tagText: '#818cf8',
    endpoint: '/api/agent/blog',
    desc: '아이디어 분석 → 네이버 리서치 → 키워드 분석 → 블로그 프롬프트 생성 → 블로그 생성기 연동',
    placeholder: '아이디어나 경험을 자유롭게 적어주세요. (예: 집에서 수제 쿠키 만드는데 돌잔치 답례품 주문이 생겼어요. 처음 해보는 거라 포장이 고민이에요. 이 경험으로 블로그 쓰고 싶어요)',
    steps: [
      { id: 'research', label: '네이버 블로그/카페 리서치' },
      { id: 'keywords', label: '키워드 검색량 분석' },
      { id: 'prompt',   label: '블로그 프롬프트 생성' },
    ],
    examples: [
      { icon: '🍪', text: '수제 쿠키 돌잔치 답례품 블로그 글 써줘' },
      { icon: '👜', text: '직장인 크로스백 추천 비교 블로그' },
      { icon: '🌸', text: '봄 코디 룩북 네이버 블로그' },
      { icon: '🏃', text: '러닝화 입문자 추천 가이드' },
    ],
    welcome: `안녕하세요! <strong>네이버블로그 에이전트</strong>입니다.<br>
<strong>아이디어, 경험, 하고 싶은 말</strong>을 자유롭게 써주세요. 짧은 주제만 적으면 글이 평범해져요.<br>
리서치 → 키워드 분석 → 프롬프트 생성 → 블로그 생성기 연동까지 한 번에!
<div class="wc-chips">
  <span class="wc-chip">💡 아이디어/경험 분석</span>
  <span class="wc-chip">🔍 네이버 리서치</span>
  <span class="wc-chip">📊 키워드 분석</span>
  <span class="wc-chip">📝 블로그 생성기 연동</span>
</div>`,
  },
};

// ─── DOM ─────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const chatMessages    = $('chatMessages');
const chatInput       = $('chatInput');
const sendBtn         = $('sendBtn');
const typingWrap      = $('typingIndicator');
const typingLabel     = $('typingLabel');
const tAvatar         = $('tAvatar');
const inputStatus     = $('inputStatus');
const agentTag        = $('agentTag');
const agentRoot       = document.querySelector('.agent-root');
const agentSidebar    = $('agentSidebar');
const sidebarClose    = $('sidebarClose');
const sidebarReopen   = $('sidebarReopen');
const aicAvatar       = $('aicAvatar');
const aicName         = $('aicName');
const aicDesc         = $('aicDesc');
const aicStatus       = $('aicStatus');
const quickList       = $('quickList');
const sessionHistory  = $('sessionHistory');
const clearHistoryBtn = $('clearHistoryBtn');
const pills           = document.querySelectorAll('.a-pill');

// ─── State ───────────────────────────────────────────────────
let currentAgent  = null;
let isRunning     = false;
let lastPrompt    = '';
let lastResearch  = null;
let historyData   = JSON.parse(localStorage.getItem('agentHistory2') || '[]');

// ─── Utils ───────────────────────────────────────────────────
const now = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 2600);
}

function copyText(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast('복사됐어요!'))
    .catch(() => {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
      showToast('복사됐어요!');
    });
}

window.copyText = copyText;

function getPreferredResearchData(source = {}) {
  const value = source?.researchData || source?.researchSummary || source?.enrichedSummary || source?.insights?.enrichedSummary || '';
  return typeof value === 'string' ? value : '';
}

function scrollBottom() {
  requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
}

// ─── Sidebar ─────────────────────────────────────────────────
sidebarClose?.addEventListener('click', () => {
  agentSidebar.classList.add('collapsed');
  sidebarReopen.classList.add('show');
});
sidebarReopen?.addEventListener('click', () => {
  agentSidebar.classList.remove('collapsed');
  sidebarReopen.classList.remove('show');
});

// ─── Bridge Status ───────────────────────────────────────────
function updateBridgeStatus() {
  const hasBridge   = Boolean(localStorage.getItem(BRIDGE_KEY));
  const hasResearch = Boolean(localStorage.getItem(RESEARCH_DATA_KEY));
  const hasPlan     = Boolean(localStorage.getItem(PLAN_DATA_KEY));

  setDot('br-research', hasResearch);
  setDot('br-plan',     hasPlan);
  setDot('br-content',  hasBridge);

  if (hasBridge) {
    $('goToWriter')?.classList.add('ready');
    const hint = $('writerHint');
    if (hint) hint.textContent = '✔ 프롬프트 준비됨';
  }
  if (hasResearch) {
    $('goToResearch')?.classList.add('ready');
    const hint = $('researchHint');
    if (hint) hint.textContent = '✔ 리서치 데이터 있음';
  }
  if (hasPlan) {
    $('goToStrategyTool')?.classList.add('ready');
    const hint = $('strategyHint');
    if (hint) hint.textContent = '✔ 기획 데이터 있음';
  }
}

function setDot(id, on) {
  const el = document.querySelector(`#${id} .br-dot`);
  if (el) { el.classList.toggle('on', on); el.classList.toggle('off', !on); }
}

updateBridgeStatus();

// ─── History ─────────────────────────────────────────────────
clearHistoryBtn?.addEventListener('click', () => {
  historyData = [];
  localStorage.removeItem('agentHistory2');
  renderHistory();
});

function addHistory(agentId, text) {
  const s = `[${AGENTS[agentId]?.icon||''}] ` + (text.length > 32 ? text.slice(0,32)+'…' : text);
  historyData.unshift({ s, full: text, agentId });
  if (historyData.length > 10) historyData.pop();
  localStorage.setItem('agentHistory2', JSON.stringify(historyData));
  renderHistory();
}

function renderHistory() {
  if (!historyData.length) {
    sessionHistory.innerHTML = '<div class="history-empty">기록 없음</div>';
    return;
  }
  sessionHistory.innerHTML = historyData.map((h, i) =>
    `<div class="history-item" data-i="${i}">${esc(h.s)}</div>`
  ).join('');
  sessionHistory.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const h = historyData[el.dataset.i];
      if (h.agentId && h.agentId !== currentAgent?.id) switchAgent(h.agentId);
      chatInput.value = h.full;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    });
  });
}
renderHistory();

// ─── Input ───────────────────────────────────────────────────
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isRunning) sendMessage(); }
});
sendBtn.addEventListener('click', () => { if (!isRunning) sendMessage(); });

// ─── Running state ───────────────────────────────────────────
function setRunning(running, label = '실행 중…') {
  isRunning = running;
  sendBtn.disabled = running || !currentAgent;
  chatInput.disabled = running;
  aicStatus.className = running ? 'aic-status running' : 'aic-status';
  typingLabel.textContent = label;
  if (running) {
    typingWrap.classList.remove('hidden');
    inputStatus.textContent = label;
  } else {
    typingWrap.classList.add('hidden');
    inputStatus.textContent = '';
  }
}

// ─── Switch Agent ─────────────────────────────────────────────
function switchAgent(id) {
  const agent = AGENTS[id];
  if (!agent) return;
  currentAgent = agent;

  // Update pills
  pills.forEach(p => p.classList.toggle('active', p.dataset.agent === id));

  // Update root attribute (for CSS color theming)
  agentRoot.dataset.agent = id;

  // Update sidebar info
  aicAvatar.textContent = agent.icon;
  aicName.textContent   = agent.name;
  aicDesc.textContent   = agent.desc;

  // Update agent tag on input
  agentTag.textContent  = agent.name;
  agentTag.style.background = agent.tagColor;
  agentTag.style.borderColor = agent.tagBorder;
  agentTag.style.color = agent.tagText;

  // Typing avatar
  tAvatar.textContent = agent.icon;

  // Placeholder
  chatInput.placeholder = agent.placeholder;

  // Quick examples
  quickList.innerHTML = agent.examples.map(e =>
    `<button class="quick-btn" data-text="${esc(e.text)}">
      <span class="qb-icon">${e.icon}</span><span>${esc(e.text)}</span>
    </button>`
  ).join('');
  quickList.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.text;
      chatInput.dispatchEvent(new Event('input'));
      sendMessage();
    });
  });

  // Enable send
  sendBtn.disabled = false;

  // Show welcome in chat
  clearChat();
  appendWelcome(agent);
}

// ─── Pills click ──────────────────────────────────────────────
pills.forEach(pill => {
  pill.addEventListener('click', () => switchAgent(pill.dataset.agent));
});

// Auto-select first agent on load
switchAgent('research');

// ─── Chat helpers ─────────────────────────────────────────────
function clearChat() {
  chatMessages.innerHTML = '';
}

function appendWelcome(agent) {
  const el = document.createElement('div');
  el.className = 'message agent-message welcome-msg';
  el.innerHTML = `
    <div class="msg-avatar">${agent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble">${agent.welcome}</div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

function appendUser(text) {
  const el = document.createElement('div');
  el.className = 'message user-message';
  el.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-body">
      <div class="msg-bubble">${esc(text).replace(/\n/g,'<br>')}</div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

function appendAgent(html, extraClass = '') {
  const el = document.createElement('div');
  el.className = `message agent-message ${extraClass}`;
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent?.icon || '🤖'}</div>
    <div class="msg-body">
      <div class="msg-bubble">${html}</div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
  return el;
}

function appendStepsCard(steps) {
  const rows = steps.map(s =>
    `<div class="step-row" id="sr-${s.id}"><span class="step-icon">⏳</span><span>${esc(s.label)}</span></div>`
  ).join('');
  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent?.icon || '🤖'}</div>
    <div class="msg-body">
      <div class="steps-card">
        <div class="sc-title">${currentAgent?.icon} ${esc(currentAgent?.name)} 실행 중…</div>
        ${rows}
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
  return el;
}

function updateStep(el, id, status, label) {
  const row = el.querySelector(`#sr-${id}`);
  if (!row) return;
  const icon = row.querySelector('.step-icon');
  row.className = `step-row ${status}`;
  if (status === 'running') {
    icon.innerHTML = '<span class="step-spinner"></span>';
    if (label) row.querySelector('span:last-child').textContent = label;
  } else if (status === 'done')  icon.textContent = '✅';
  else if (status === 'error')   icon.textContent = '❌';
  scrollBottom();
}

function addKeywordsToCard(stepsEl, keywords) {
  const card = stepsEl.querySelector('.steps-card');
  if (!card || !keywords?.length) return;
  card.querySelector('.kw-row')?.remove();
  const chips = keywords.slice(0, 10).map(k =>
    `<span class="kw-chip ${k.level||''}">${esc(k.keyword)}${k.volume?`<span class="chip-vol">${(k.volume/1000).toFixed(0)}k</span>`:''}</span>`
  ).join('');
  card.insertAdjacentHTML('beforeend',
    `<div style="font-size:11px;color:var(--text-muted);margin:8px 0 4px">키워드</div>
     <div class="kw-row">${chips}</div>`);
  scrollBottom();
}

// ─── Result renderers ─────────────────────────────────────────

function renderResearchResult(data) {
  const {
    query, keywords = [], insights = {}, researchSummary,
    topBlogItems = [], recentBlogItems = [],
    cafeQuestions = [], cafeGeneral = [],
    // 하위 호환
    blogItems = [], cafeItems = [],
  } = data;

  // 새 필드 없으면 구버전 데이터 사용
  const topBlogs    = topBlogItems.length    ? topBlogItems    : blogItems;
  const recentBlogs = recentBlogItems.length ? recentBlogItems : [];
  const cafeQs      = cafeQuestions.length   ? cafeQuestions   : cafeItems.filter(i => /\?|？|추천해주세요|어떤|뭐가/.test(i.title||''));
  const cafeAll     = cafeGeneral.length      ? cafeGeneral     : cafeItems;
  const researchData = getPreferredResearchData(data);

  // Save for other agents
  localStorage.setItem(RESEARCH_DATA_KEY, JSON.stringify({
    savedAt: Date.now(),
    query,
    keywords,
    blogItems: topBlogs,
    cafeQuestions: cafeQs,
    insights,
    researchData,
    researchSummary: researchData,
    enrichedSummary: researchData,
  }));
  updateBridgeStatus();

  const compLevel = insights.competition?.includes('높음') ? 'high' : insights.competition?.includes('보통') ? 'mid' : 'low';

  // ─ 키워드 테이블 렌더 ─
  const nf = v => v ? Number(v).toLocaleString('ko-KR') : '-';
  const kwRows = keywords.map(k => {
    const total   = k.volume  ? nf(k.volume)   : '-';
    const pc      = k.pcVol   ? nf(k.pcVol)    : '-';
    const mobile  = k.mobileVol ? nf(k.mobileVol) : '-';
    const barPct  = k.volume  ? Math.min(100, Math.round(k.volume / 300)) : 0;
    const levelLabel = k.level === 'high' ? '고검색' : k.level === 'mid' ? '중검색' : '저검색';
    return `
      <tr class="kw-table-row">
        <td class="kw-table-kw"><span class="kw-badge ${k.level||''}">${esc(k.keyword)}</span></td>
        <td class="kw-table-vol">
          <div class="kw-vol-bar-wrap">
            <div class="kw-vol-bar" style="width:${barPct}%"></div>
          </div>
          <span class="kw-vol-num">${total}</span>
        </td>
        <td class="kw-table-split"><span class="kw-pc">PC ${pc}</span><span class="kw-mob">모바일 ${mobile}</span></td>
        <td><span class="kw-level-tag ${k.level||''}">${levelLabel}</span></td>
      </tr>`;
  }).join('');

  // ─ 콘텐츠 공백 ─
  const gapItems = (insights.contentGaps||[]).map(g =>
    `<span class="gap-chip">${esc(g)}</span>`
  ).join('');

  // ─ 4개 탭 데이터 ─
  const cardId = 'rc_' + Date.now();
  const tabs = [
    { id: 'tab-topblog',    label: `📌 상위블로그`, count: topBlogs.length,    active: true },
    { id: 'tab-recentblog', label: `🆕 최신블로그`, count: recentBlogs.length, active: false },
    { id: 'tab-cafeq',      label: `💬 카페질문`,   count: cafeQs.length,      active: false },
    { id: 'tab-cafe',       label: `📋 카페글`,     count: cafeAll.length,     active: false },
  ];
  const tabHtml = tabs.map(t =>
    `<button class="rs-tab ${t.active ? 'active' : ''}" data-tab="${t.id}" data-card="${cardId}"
      onclick="switchResearchTab(this)">
      ${t.label} <span class="rs-tab-count">${t.count}</span>
    </button>`
  ).join('');

  function listRows(items, limit = 30) {
    if (!items.length) return '<div class="rs-item-empty">수집된 항목 없음</div>';
    return items.slice(0, limit).map((i, n) =>
      `<div class="rs-item">
        <span class="rs-item-no">${n+1}</span>
        <span class="rs-item-title">${esc(i.title || '-')}</span>
        ${i.link ? `<a class="rs-item-link" href="${esc(i.link)}" target="_blank" rel="noopener">↗</a>` : ''}
      </div>`
    ).join('');
  }

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble">
        <p>✅ <strong>"${esc(query)}"</strong> 리서치 완료!</p>
        <p style="font-size:12px;color:var(--text-muted)">
          상위블로그 ${topBlogs.length}개 · 최신블로그 ${recentBlogs.length}개 · 카페질문 ${cafeQs.length}개 · 카페글 ${cafeAll.length}개
        </p>
      </div>
      <div class="result-card research" id="${cardId}">

        <div class="rc-head research">
          <span class="rc-title">🔍 리서치 결과</span>
          <span class="competition-badge ${compLevel}">${esc(insights.competition||'-')}</span>
        </div>

        <!-- 키워드 섹션 -->
        <div class="rc-section">
          <div class="rc-label">🔑 주요 키워드 · 연관 키워드 검색량</div>
          <div class="kw-table-wrap">
            <table class="kw-table">
              <thead>
                <tr>
                  <th>키워드</th>
                  <th>월간검색량</th>
                  <th>PC / 모바일</th>
                  <th>경쟁도</th>
                </tr>
              </thead>
              <tbody>${kwRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:10px">검색량 데이터 없음</td></tr>'}</tbody>
            </table>
          </div>
          ${gapItems ? `
          <div style="margin-top:8px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">⚠️ 콘텐츠 공백</div>
            <div class="gap-row">${gapItems}</div>
          </div>` : ''}
        </div>

        <!-- 탭 네비 -->
        <div class="rs-tabs">${tabHtml}</div>

        <!-- 탭 패널들 -->
        <div class="rs-panel active" id="tab-topblog-${cardId}">
          <div class="rs-panel-label">📌 상위 블로그 ${topBlogs.length}개 (관련도순)</div>
          <div class="rs-list">${listRows(topBlogs, 20)}</div>
        </div>
        <div class="rs-panel" id="tab-recentblog-${cardId}">
          <div class="rs-panel-label">🆕 최신 블로그 ${recentBlogs.length}개 (최신순)</div>
          <div class="rs-list">${listRows(recentBlogs, 20)}</div>
        </div>
        <div class="rs-panel" id="tab-cafeq-${cardId}">
          <div class="rs-panel-label">💬 최신 카페 질문글 ${cafeQs.length}개</div>
          <div class="rs-list">${listRows(cafeQs, 30)}</div>
        </div>
        <div class="rs-panel" id="tab-cafe-${cardId}">
          <div class="rs-panel-label">📋 최신 카페글 ${cafeAll.length}개</div>
          <div class="rs-list">${listRows(cafeAll, 30)}</div>
        </div>

        <div class="rc-cta-box" style="border-top:1px solid rgba(6,182,212,0.12);background:rgba(6,182,212,0.03)">
          <div class="rc-cta-label" style="color:#22d3ee">📤 연결된 도구</div>
          <div class="rc-actions">
            <button class="action-btn ab-cyan ab-large" onclick="goToResearchTool()">🔍 네이버 리서치 툴에서 보기 →</button>
            <button class="action-btn ab-purple" onclick="sendResearchToPlanning()">📋 기획 에이전트로 보내기</button>
            <button class="action-btn ab-secondary" onclick="copyText(window._lastResearchSummary||'')">📋 요약 복사</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  window._lastResearchSummary = researchData || researchSummary;
  scrollBottom();
}

// 리서치 탭 전환
window.switchResearchTab = function(btn) {
  const tabId  = btn.dataset.tab;
  const cardId = btn.dataset.card;
  const card   = document.getElementById(cardId);
  if (!card) return;
  card.querySelectorAll('.rs-tab').forEach(t => t.classList.remove('active'));
  card.querySelectorAll('.rs-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  card.querySelector(`#${tabId}-${cardId}`)?.classList.add('active');
};

function renderPlanningResult(data) {
  const { topic, angles = [], planningPrompt, keywords = [] } = data;
  const rd = (() => { try { return JSON.parse(localStorage.getItem(RESEARCH_DATA_KEY) || '{}'); } catch { return {}; } })();
  localStorage.setItem(PLAN_DATA_KEY, JSON.stringify({ savedAt: Date.now(), topic, angles, planningPrompt, keywords }));
  // Also save strategy page bridge
  try {
    localStorage.setItem(PLAN_BRIDGE_KEY, JSON.stringify({
      savedAt: Date.now(), topic,
      keywords: keywords || rd.keywords || [],
      researchData: getPreferredResearchData(rd),
    }));
  } catch { /* ignore */ }
  updateBridgeStatus();
  lastPrompt = planningPrompt;

  const calRows = angles.map(a =>
    `<tr>
      <td><span class="cal-week">${a.week}주차</span><div class="cal-theme">${a.icon} ${esc(a.theme)}</div></td>
      <td>${a.topics.map(t => `<div style="margin-bottom:3px">• ${esc(t)}</div>`).join('')}</td>
    </tr>`
  ).join('');

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ <strong>"${esc(topic)}"</strong> 4주 콘텐츠 기획 완료!</p></div>
      <div class="result-card" style="border-color:rgba(139,92,246,0.25);background:var(--surface)">
        <div class="rc-head planning"><span class="rc-title">📋 4주 콘텐츠 캘린더</span></div>
        <div style="overflow-x:auto">
          <table class="calendar-table">
            <thead><tr><th>주차/테마</th><th>추천 주제</th></tr></thead>
            <tbody>${calRows}</tbody>
          </table>
        </div>
        <div class="prompt-preview">${esc(planningPrompt.slice(0,250))}…</div>
        <div class="rc-cta-box" style="border-top:1px solid rgba(139,92,246,0.12);background:rgba(139,92,246,0.03)">
          <div class="rc-cta-label" style="color:#a78bfa">📤 연결된 도구</div>
          <div class="rc-actions">
            <button class="action-btn ab-purple ab-large" onclick="goToStrategyToolPage()">📊 콘텐츠 기획 툴로 보내기 →</button>
            <button class="action-btn ab-primary" onclick="copyText(lastPrompt)">📋 기획 프롬프트 복사</button>
            <button class="action-btn ab-secondary" onclick="window.open('https://chat.openai.com','_blank')">↗ ChatGPT 열기</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  appendPlanningJsonCard();
  scrollBottom();
}

function renderContentResult(data) {
  const { prompt, keywords = [], summary, meta } = data;
  lastPrompt = prompt || '';
  saveBridge({ prompt, keywords, meta });

  const kwChips = keywords.slice(0, 8).map(k =>
    `<span class="kw-chip ${k.level||''}">${esc(k.keyword)}${k.volume?`<span class="chip-vol">${(k.volume/1000).toFixed(0)}k</span>`:''}</span>`
  ).join('');

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ <strong>${esc(summary||'원클릭 프롬프트 생성 완료!')}</strong></p></div>
      <div class="result-card content" style="border-color:rgba(16,185,129,0.25);background:var(--surface)">
        <div class="rc-head content">
          <span class="rc-title">✍️ 원클릭 글생성기 프롬프트</span>
          <button class="action-btn ab-secondary" style="font-size:11px;padding:3px 9px" onclick="copyText(lastPrompt)">전체 복사</button>
        </div>
        ${kwChips ? `<div style="padding:8px 14px;border-bottom:1px solid var(--glass-border)"><div class="kw-row">${kwChips}</div></div>` : ''}
        <div class="rc-section">
          <div class="rc-label" style="display:flex;justify-content:space-between;align-items:center">
            <span>📋 생성된 프롬프트 <span style="font-weight:400;opacity:.6;font-size:11px">아래 내용을 복사해서 ChatGPT에 넣어주세요</span></span>
          </div>
          <textarea class="blog-plan-prompt-display" readonly style="min-height:160px">${esc(prompt||'')}</textarea>
        </div>
        <div class="rc-cta-box" style="border-top:1px solid rgba(16,185,129,0.12);background:rgba(16,185,129,0.03)">
          <div class="rc-actions">
            <button class="action-btn ab-green ab-large" onclick="goToWriter()">✍️ 원클릭 글 생성기로 →</button>
            <button class="action-btn ab-primary" onclick="copyText(lastPrompt)">📋 프롬프트 복사</button>
            <button class="action-btn ab-secondary" onclick="copyText(lastPrompt);window.open('https://chat.openai.com','_blank')">↗ ChatGPT 열기</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

function renderBlogResult(data) {
  const { topic, keywords = [], blogItems = [], planningPrompt = '', researchSummary = '', brandInfo = {} } = data;
  const cardId = 'blog_plan_' + Date.now();
  const researchData = getPreferredResearchData(data) || researchSummary;

  const kwChips = keywords.slice(0, 8).map(k =>
    `<span class="kw-chip ${k.level||''}">${esc(k.keyword)}${k.volume ? `<span class="chip-vol">${(k.volume/1000).toFixed(0)}k</span>` : ''}</span>`
  ).join('');
  const blogRows = blogItems.slice(0, 5).map(i => `<div class="blog-item">📄 ${esc(i.title || '')}</div>`).join('');

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.id = cardId;
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ 리서치 완료! <strong>아래 기획 프롬프트를 ChatGPT에 붙여넣고, 결과를 다시 여기에 붙여넣어 주세요.</strong></p></div>
      <div class="result-card blog-sel" style="border-color:rgba(249,115,22,0.3);background:var(--surface)">
        <div class="rc-head blog-r">
          <span class="rc-title">📝 블로그 생성 에이전트</span>
          <span class="rc-badge" style="background:rgba(249,115,22,0.15);color:#fb923c;border:1px solid rgba(249,115,22,0.3);font-size:11px;padding:2px 8px;border-radius:999px">${esc(topic)}</span>
        </div>

        ${kwChips ? `
        <div class="rc-section">
          <div class="rc-label">🔑 수집된 키워드</div>
          <div class="kw-row">${kwChips}</div>
        </div>` : ''}

        ${blogRows ? `
        <div class="rc-section">
          <div class="rc-label">📊 상위 블로그</div>
          <div class="blog-list compact">${blogRows}</div>
        </div>` : ''}

        <div class="rc-section">
          <div class="rc-label" style="display:flex;justify-content:space-between;align-items:center">
            <span>📋 콘텐츠 기획 프롬프트 <span style="font-weight:400;opacity:.6;font-size:11px">이걸 ChatGPT에 넣어주세요</span></span>
            <button class="action-btn ab-secondary" style="font-size:11px;padding:3px 9px" onclick="copyBlogPlanPrompt('${cardId}')">📋 복사</button>
          </div>
          <textarea class="blog-plan-prompt-display" id="${cardId}_planning" readonly>${esc(planningPrompt)}</textarea>
        </div>

        <div class="rc-section">
          <div class="rc-label">💬 ChatGPT 기획 결과 붙여넣기 <span style="font-weight:400;opacity:.6;font-size:11px">ChatGPT 답변 전체를 붙여넣으세요</span></div>
          <textarea class="blog-sel-outline" id="${cardId}_pasted" rows="7" placeholder="ChatGPT에서 받은 기획안 내용을 여기에 붙여넣으세요…"></textarea>
        </div>

        <div class="rc-cta-box" style="margin-top:12px">
          <button class="action-btn ab-orange ab-large" id="${cardId}_btn"
            onclick="submitBlogPlan('${cardId}','${esc(topic)}','${esc(brandInfo.targetAudience||'')}','${esc(brandInfo.brandName||'')}')">
            ✅ 이 기획안으로 블로그 프롬프트 생성
          </button>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;

  // Store researchSummary for later use
  el.dataset.researchSummary = researchData;
  chatMessages.appendChild(el);
  scrollBottom();
}

function copyBlogPlanPrompt(cardId) {
  const ta = document.getElementById(cardId + '_planning');
  if (ta) copyText(ta.value);
}

async function submitBlogPlan(cardId, topic, targetAudience, brandName) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const btn = document.getElementById(cardId + '_btn');
  const pastedEl = document.getElementById(cardId + '_pasted');
  const pastedPlan = pastedEl ? pastedEl.value.trim() : '';

  if (!pastedPlan) {
    pastedEl && (pastedEl.style.borderColor = '#f87171');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }
  const researchData = card.dataset.researchSummary || '';

  try {
    // Consolidated endpoint /api/agent/real-blog-write handles Step 7 prompt generation (streaming)
    const resp = await fetch('/api/agent/real-blog-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        topic, 
        audience: targetAudience, 
        brand: brandName, 
        researchData,
        researchSummary: researchData,
        selectionSummary: pastedPlan 
      }),
    });
    
    if (!resp.ok) throw new Error('프롬프트 생성 요청 실패');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', finalResult = null;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));
          if (msg.type === 'result') finalResult = msg.data;
          if (msg.type === 'error') throw new Error(msg.message);
        } catch {}
      }
    }

    if (!finalResult) throw new Error('결과를 받지 못했어요.');
    card.remove();
    renderBlogFinalResult({ topic, writingPlan: pastedPlan, ...finalResult });
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ 이 기획안으로 블로그 프롬프트 생성'; }
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:#f87171;font-size:12px;padding:8px 0';
    errEl.textContent = err.message || '오류가 발생했어요.';
    btn?.parentNode?.appendChild(errEl);
  }
}

function renderBlogFinalResult({ topic, writingPlan = '', prompt = '', brandInfo = {} }) {
  lastPrompt = prompt;

  try {
    localStorage.setItem(BLOG_BRIDGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      ...(brandInfo || {}),
      writingPlan,
    }));
    updateBridgeStatus();
  } catch { /* ignore */ }

  const planLines = writingPlan.split('\n').filter(l => l.trim()).slice(0, 8)
    .map(l => `<div class="outline-line">${esc(l)}</div>`).join('');

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ <strong>"${esc(topic)}"</strong> 블로그 프롬프트 완성!</p></div>
      <div class="result-card blog" style="border-color:rgba(249,115,22,0.3);background:var(--surface)">
        <div class="rc-head blog-r">
          <span class="rc-title">📝 블로그 생성 결과</span>
          <span class="rc-badge" style="background:rgba(249,115,22,0.15);color:#fb923c;border:1px solid rgba(249,115,22,0.3);font-size:11px;padding:2px 8px;border-radius:999px">완료</span>
        </div>
        ${planLines ? `
        <div class="rc-section">
          <div class="rc-label">🗂️ 기획안 요약</div>
          <div class="outline-box">${planLines}</div>
        </div>` : ''}
        <div class="rc-section">
          <div class="rc-label">✍️ 최적화 프롬프트 미리보기</div>
          <div class="prompt-preview">${esc((prompt||'').slice(0,220))}…</div>
        </div>
        <div class="rc-cta-box">
          <div class="rc-cta-label">📤 연결된 도구</div>
          <div class="rc-actions">
            <button class="action-btn ab-primary" onclick="copyText(lastPrompt)">📋 블로그 프롬프트 복사</button>
            <button class="action-btn ab-secondary" onclick="copyText(lastPrompt);window.open('https://chat.openai.com','_blank')">↗ ChatGPT 열기</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  appendJsonCard();
  scrollBottom();
}

// ══════════════════════════════════════════════════════════════
//  진짜블로그에이전트
// ══════════════════════════════════════════════════════════════

// ── helper: strategy JSON → selectable groups ──────────────
function buildRealBlogGroups(data) {
  if (!data || typeof data !== 'object') return [];
  const toT  = v => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(' / ') : '').replace(/<[^>]+>/g, '').trim();
  const toArr = v => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).map(x => toT(x)).filter(Boolean);
  const groups = [];
  const s1 = data.step1 || {}, s2 = data.step2 || {}, s3 = data.step3 || {},
        s4 = data.step4 || {}, s5 = data.step5 || {}, s6 = data.step6 || {};

  const push = (id, title, helper, mode, rec, items) => {
    if (items.length) groups.push({ id, title, helper, mode, recommendedCount: rec, items });
  };
  const item = (gid, idx, title, desc, lines) => ({
    id: `${gid}-${idx}`, title: toT(title) || `항목 ${idx+1}`, description: toT(desc), summaryLines: lines.filter(Boolean)
  });

  // STEP 1
  const kws = toArr(s1.coreKeywords?.map ? s1.coreKeywords.map(k => k?.keyword) : s1.coreKeywords);
  if (kws.length) push('s1-kw', 'STEP 1 핵심 키워드', '글에 쓸 메인/보조 키워드를 고르세요.', 'multi', 3,
    kws.map((k, i) => item('s1-kw', i, k, (s1.coreKeywords?.[i]?.reason || ''), [`키워드: ${k}`, `이유: ${toT(s1.coreKeywords?.[i]?.reason)}`])));
  const qs = Array.isArray(s1.questions) ? s1.questions : [];
  if (qs.length) push('s1-q', 'STEP 1 질문/고민', '독자 공감 포인트를 선택하세요.', 'multi', 2,
    qs.map((q, i) => item('s1-q', i, q?.question, q?.intent, [`질문: ${toT(q?.question)}`, `의도: ${toT(q?.intent)}`])));

  // STEP 2
  const topics = Array.isArray(s2.topics) ? s2.topics : [];
  if (topics.length) push('s2-topics', 'STEP 2 글감', '주제 방향을 1개 고르세요.', 'single', 1,
    topics.map((t, i) => item('s2-topics', i, t?.title || t?.topic, t?.reason,
      [`주제: ${toT(t?.topic)}`, `제목: ${toT(t?.title)}`, `이유: ${toT(t?.reason)}`, `목차: ${toArr(t?.outline).join(' / ')}`])));

  // STEP 3
  const prios = Array.isArray(s3.priorities) ? s3.priorities : [];
  if (prios.length) push('s3-prio', 'STEP 3 우선 발행', '지금 바로 쓸 주제를 1개 고르세요.', 'single', 1,
    prios.map((p, i) => item('s3-prio', i, p?.title || p?.topic, p?.whyNow,
      [`주제: ${toT(p?.topic)}`, `제목: ${toT(p?.title)}`, `이유: ${toT(p?.whyNow)}`])));

  // STEP 4
  const titles = Array.isArray(s4.titles) ? s4.titles : [];
  if (titles.length) push('s4-titles', 'STEP 4 제목 후보', '마음에 드는 제목을 고르세요.', 'multi', 3,
    titles.map((t, i) => item('s4-titles', i, t, '', [`제목: ${toT(t)}`])));

  // STEP 5
  const outlines = Array.isArray(s5.detailedOutlines) ? s5.detailedOutlines : [];
  if (outlines.length) push('s5-outline', 'STEP 5 상세 목차', '글 구조를 1개 고르세요.', 'single', 1,
    outlines.map((o, i) => item('s5-outline', i, o?.title, o?.planningIntent,
      [`기획 의도: ${toT(o?.planningIntent)}`, `목차: ${[o?.outline?.intro, o?.outline?.body1, o?.outline?.body2, o?.outline?.body3, o?.outline?.conclusion].filter(Boolean).map(toT).join(' / ')}`])));

  // STEP 6
  const intros = Array.isArray(s6.introDrafts) ? s6.introDrafts : [];
  if (intros.length) push('s6-intro', 'STEP 6 도입문', '도입 톤을 1개 고르세요.', 'single', 1,
    intros.map((intro, i) => item('s6-intro', i, intro?.title, toArr(intro?.introA)[0] || '',
      [`도입 A: ${toArr(intro?.introA).join(' / ')}`])));

  return groups;
}

function buildRealBlogSummary(groups, selectedIds) {
  const lines = ['[STEP 1~6 선택 요약]'];
  groups.forEach(g => {
    const sel = g.items.filter(it => selectedIds.has(it.id));
    if (!sel.length) return;
    lines.push('', `## ${g.title}`);
    sel.forEach((it, idx) => {
      lines.push(`${idx+1}. ${it.title}`);
      it.summaryLines.forEach(l => l && lines.push(`- ${l}`));
    });
  });
  return lines.length > 1 ? lines.join('\n') : '';
}

// ── Phase 1 result: show selection board or manual paste ───
function renderRealBlogResult(data) {
  const { topic, audience, brand, keywords = [], topBlog = [], planningPrompt = '', researchSummary = '' } = data;
  const cardId = 'rb_' + Date.now();
  const researchData = getPreferredResearchData(data) || researchSummary;

  const kwChips = keywords.slice(0, 8).map(k =>
    `<span class="kw-chip ${k.level||''}">${esc(k.keyword)}${k.volume ? `<span class="chip-vol">${(k.volume/1000).toFixed(0)}k</span>` : ''}</span>`
  ).join('');
  const blogRows = topBlog.slice(0, 5).map(b => `<div class="rb-blog-item">📄 ${esc(b.title||'')}</div>`).join('');

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.id = cardId;
  el.dataset.topic = topic;
  el.dataset.audience = audience || '';
  el.dataset.brand = brand || '';
  el.dataset.researchSummary = researchData;
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ 리서치 완료! 아래 프롬프트를 복사해 ChatGPT에 붙여넣고, 결과를 다시 여기에 붙여넣어 주세요.</p></div>
      <div class="result-card" style="border-color:rgba(168,85,247,0.3);background:var(--surface)">
        <div class="rc-head" style="background:rgba(168,85,247,0.08)">
          <span class="rc-title">✍️ 진짜블로그에이전트</span>
          <span class="rc-badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);">${esc(topic)}</span>
        </div>

        ${kwChips ? `<div class="rc-section"><div class="rc-label">🔑 수집 키워드</div><div class="kw-row">${kwChips}</div></div>` : ''}
        ${blogRows ? `<div class="rc-section"><div class="rc-label">📊 상위 블로그</div><div class="rb-blog-list">${blogRows}</div></div>` : ''}

        <div class="rc-section">
          <div class="rc-label" style="display:flex;justify-content:space-between;align-items:center">
            <span>① 콘텐츠 기획 프롬프트 <span style="font-weight:400;opacity:.6;font-size:11px">이걸 ChatGPT에 붙여넣으세요</span></span>
            <button class="action-btn ab-secondary" style="font-size:11px;padding:3px 9px"
              onclick="copyText(document.getElementById('${cardId}_pp').value)">📋 복사</button>
          </div>
          <textarea class="blog-plan-prompt-display" id="${cardId}_pp" readonly>${esc(planningPrompt)}</textarea>
        </div>

        <div class="rc-section">
          <div class="rc-label">② ChatGPT 기획 결과 붙여넣기 <span style="font-weight:400;opacity:.6;font-size:11px">STEP 1~6 JSON 또는 텍스트</span></div>
          <textarea class="blog-sel-outline" id="${cardId}_paste" rows="6"
            placeholder="ChatGPT에서 받은 기획 결과를 여기에 붙여넣으세요…"></textarea>
        </div>

        <div class="rc-cta-box" style="background:rgba(168,85,247,0.04);border-top:1px solid rgba(168,85,247,0.1)">
          <button class="action-btn ab-purple ab-large" onclick="analyzeRealBlogPlan('${cardId}')">
            📋 붙여넣기 완료 → STEP 1~6 선택 보드 열기
          </button>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

function analyzeRealBlogPlan(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const pasteEl = document.getElementById(cardId + '_paste');
  const rawText = pasteEl ? pasteEl.value.trim() : '';
  if (!rawText) { pasteEl && (pasteEl.style.borderColor = '#f87171'); return; }

  const topic = card.dataset.topic;
  const audience = card.dataset.audience;
  const brand = card.dataset.brand;
  const researchSummary = card.dataset.researchSummary;

  // Try to parse as JSON
  let strategyJson = null;
  try {
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    strategyJson = JSON.parse(fenceMatch ? fenceMatch[1].trim() : rawText);
  } catch {}

  card.remove();

  if (strategyJson) {
    renderRealBlogBoard({ topic, audience, brand, researchSummary, strategyJson });
  } else {
    // No JSON — treat whole text as selection summary directly
    renderRealBlogBoardRaw({ topic, audience, brand, researchSummary, rawText });
  }
}

function renderRealBlogBoard({ topic, audience, brand, researchSummary, strategyJson }) {
  const groups = buildRealBlogGroups(strategyJson);
  const cardId = 'rbb_' + Date.now();

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.id = cardId;
  el.dataset.topic = topic;
  el.dataset.audience = audience || '';
  el.dataset.brand = brand || '';
  el.dataset.researchSummary = researchSummary || '';
  el.dataset.autoGenerated = '1';

  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ STEP 1~6 기획 완료! 원하는 항목을 고른 뒤 블로그 프롬프트를 생성하세요.</p></div>
      <div class="result-card" style="border-color:rgba(168,85,247,0.3);background:var(--surface)">
        <div class="rc-head" style="background:rgba(168,85,247,0.08)">
          <span class="rc-title">📋 STEP 1~6 선택 보드</span>
          <span class="rc-badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);">${esc(topic)}</span>
        </div>
        <div class="rc-section">
          <div class="rb-board" id="${cardId}_board">
            ${groups.map(g => `
              <div class="rb-group">
                <div class="rb-group-head">
                  <span class="rb-group-title">${esc(g.title)}</span>
                  <span class="rb-group-mode">${g.mode === 'single' ? '1개 선택' : '복수 선택'}</span>
                </div>
                <div class="rb-group-helper">${esc(g.helper)}</div>
                <div class="rb-group-items">
                  ${g.items.map(it => `
                    <button type="button" class="rb-choice"
                      data-id="${esc(it.id)}" data-gid="${esc(g.id)}" data-mode="${esc(g.mode)}"
                      onclick="toggleRealBlogChoice(this,'${cardId}')">
                      <strong>${esc(it.title)}</strong>
                      ${it.description ? `<span>${esc(it.description.slice(0,90))}</span>` : ''}
                    </button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <div class="rb-sel-meta" id="${cardId}_meta">선택된 항목이 없습니다. 각 STEP에서 원하는 항목을 골라주세요.</div>
        </div>
        <div class="rc-cta-box" style="background:rgba(168,85,247,0.04);border-top:1px solid rgba(168,85,247,0.1)">
          <button class="action-btn ab-purple ab-large" id="${cardId}_genbtn"
            onclick="submitRealBlogSelections('${cardId}')">
            ✅ 선택 완료 → STEP 7 프롬프트 생성
          </button>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

function renderRealBlogBoardRaw({ topic, audience, brand, researchSummary, rawText }) {
  // Text was not JSON — use it directly as selection summary
  const cardId = 'rbr_' + Date.now();
  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.id = cardId;
  el.dataset.topic = topic;
  el.dataset.audience = audience || '';
  el.dataset.brand = brand || '';
  el.dataset.researchSummary = researchSummary || '';
  el.dataset.rawText = rawText;

  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ 기획 내용 확인 완료. 이 내용으로 STEP 7 프롬프트를 생성할게요.</p></div>
      <div class="result-card" style="border-color:rgba(168,85,247,0.3);background:var(--surface)">
        <div class="rc-head" style="background:rgba(168,85,247,0.08)">
          <span class="rc-title">📋 기획 내용</span>
          <span class="rc-badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);">${esc(topic)}</span>
        </div>
        <div class="rc-section">
          <div class="rb-blog-preview">${esc(rawText.slice(0, 400))}${rawText.length > 400 ? '…' : ''}</div>
        </div>
        <div class="rc-cta-box" style="background:rgba(168,85,247,0.04);border-top:1px solid rgba(168,85,247,0.1)">
          <button class="action-btn ab-purple ab-large" onclick="submitRealBlogRaw('${cardId}')">
            ✅ 이 내용으로 STEP 7 프롬프트 생성
          </button>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

async function submitRealBlogRaw(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  await _doRealBlogWrite(card, card.dataset.rawText);
}

async function _doRealBlogWrite(card, selectionSummary) {
  const btn = card.querySelector('.action-btn.ab-purple');
  if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }

  try {
    const resp = await fetch('/api/agent/real-blog-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: card.dataset.topic,
        audience: card.dataset.audience,
        brand: card.dataset.brand,
        selectionSummary,
        researchData: card.dataset.researchSummary,
        researchSummary: card.dataset.researchSummary,
      }),
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', finalResult = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try { const msg = JSON.parse(line.slice(6)); if (msg.type === 'result') finalResult = msg.data; } catch {}
      }
    }
    if (!finalResult) throw new Error('결과를 받지 못했어요.');
    card.remove();
    renderRealBlogWriteResult(finalResult);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ 다시 시도'; }
  }
}

function toggleRealBlogChoice(btn, cardId) {
  const itemId = btn.dataset.id;
  const groupId = btn.dataset.gid;
  const mode = btn.dataset.mode;
  const board = document.getElementById(cardId + '_board');
  if (!board) return;

  if (mode === 'single') {
    board.querySelectorAll(`[data-gid="${groupId}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    btn.classList.toggle('active');
  }
  updateRealBlogMeta(cardId, board);
}

function updateRealBlogMeta(cardId, board) {
  const meta = document.getElementById(cardId + '_meta');
  if (!meta) return;
  const count = board ? board.querySelectorAll('.rb-choice.active').length : 0;
  meta.textContent = count
    ? `선택된 항목 ${count}개 · 완료되면 "블로그 글 생성" 버튼을 눌러주세요.`
    : '선택된 항목이 없습니다. 각 STEP에서 원하는 항목을 골라주세요.';
}

async function submitRealBlogSelections(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const btn = document.getElementById(cardId + '_genbtn');
  const topic = card.dataset.topic;
  const audience = card.dataset.audience;
  const brand = card.dataset.brand;
  const researchSummary = card.dataset.researchSummary;
  const autoGenerated = card.dataset.autoGenerated === '1';

  let selectionSummary = '';

  if (autoGenerated) {
    // Build summary from board selections
    const board = document.getElementById(cardId + '_board');
    if (!board) return;
    const activeItems = board.querySelectorAll('.rb-choice.active');
    if (!activeItems.length) {
      updateRealBlogMeta(cardId, board);
      return;
    }
    // Build simple selection text
    const lines = ['[STEP 1~6 선택 요약]'];
    const groups = {};
    activeItems.forEach(b => {
      const gid = b.dataset.gid;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(b.querySelector('strong')?.textContent || b.textContent.trim());
    });
    Object.entries(groups).forEach(([gid, items]) => {
      const label = board.querySelector(`[data-gid="${gid}"]`)?.closest('.rb-group')?.querySelector('.rb-group-title')?.textContent || gid;
      lines.push('', `## ${label}`);
      items.forEach((it, i) => lines.push(`${i+1}. ${it}`));
    });
    selectionSummary = lines.join('\n');
  } else {
    // Manual paste mode
    const pasteEl = document.getElementById(cardId + '_paste');
    selectionSummary = pasteEl ? pasteEl.value.trim() : '';
    if (!selectionSummary) {
      if (pasteEl) pasteEl.style.borderColor = '#f87171';
      return;
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = '블로그 글 생성 중…'; }

  // Stream from /api/agent/real-blog-write
  try {
    const resp = await fetch('/api/agent/real-blog-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, audience, brand, selectionSummary, researchData: researchSummary, researchSummary }),
    });
    if (!resp.ok) throw new Error('블로그 글 생성 요청 실패');

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));
          if (msg.type === 'result') finalResult = msg.data;
          if (msg.type === 'error') throw new Error(msg.message);
        } catch {}
      }
    }

    if (!finalResult) throw new Error('결과를 받지 못했어요.');
    card.remove();
    renderRealBlogWriteResult(finalResult);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ 선택 완료 → 블로그 글 생성'; }
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:#f87171;font-size:12px;padding:8px 0';
    errEl.textContent = err.message || '오류 발생';
    btn?.parentNode?.appendChild(errEl);
  }
}

function renderRealBlogWriteResult({ topic, step7Prompt, blogText, autoGenerated, brandInfo = {} }) {
  lastPrompt = step7Prompt || '';

  // Save to blog bridge — brandName 비워두고 primaryCategory 자동 추론
  try {
    localStorage.setItem(BLOG_BRIDGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      ...(brandInfo || {}),
      brandName: '',
      primaryCategory: inferNaverBlogCategory(topic),
      writingPlan: blogText || step7Prompt || '',
    }));
    updateBridgeStatus();
  } catch {}

  const el = document.createElement('div');
  el.className = 'message agent-message';

  if (autoGenerated && blogText) {
    // Show the blog post result
    const preview = blogText.slice(0, 500);
    el.innerHTML = `
      <div class="msg-avatar">${currentAgent.icon}</div>
      <div class="msg-body">
        <div class="msg-bubble"><p>✅ <strong>"${esc(topic)}"</strong> 블로그 글 완성!</p></div>
        <div class="result-card" style="border-color:rgba(168,85,247,0.3);background:var(--surface)">
          <div class="rc-head" style="background:rgba(168,85,247,0.08)">
            <span class="rc-title">✍️ 완성된 블로그 글</span>
            <span class="rc-badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);">완료</span>
          </div>
          <div class="rc-section">
            <div class="rc-label">📄 미리보기</div>
            <div class="rb-blog-preview">${esc(preview)}${blogText.length > 500 ? '…' : ''}</div>
          </div>
          <div class="rc-cta-box" style="background:rgba(168,85,247,0.04);border-top:1px solid rgba(168,85,247,0.1)">
            <div class="rc-cta-label">📤 연결된 도구</div>
            <div class="rc-actions">
              <button class="action-btn ab-primary" onclick="copyText(${JSON.stringify(blogText)})">📋 블로그 글 전체 복사</button>
              <button class="action-btn ab-secondary" onclick="copyText(lastPrompt)">📋 프롬프트 복사</button>
            </div>
          </div>
        </div>
        <div class="msg-time">${now()}</div>
      </div>`;
  } else {
    // Prompt-only mode
    el.innerHTML = `
      <div class="msg-avatar">${currentAgent.icon}</div>
      <div class="msg-body">
        <div class="msg-bubble"><p>✅ STEP 7 블로그 프롬프트 완성! ChatGPT에 붙여넣어 주세요.</p></div>
        <div class="result-card" style="border-color:rgba(168,85,247,0.3);background:var(--surface)">
          <div class="rc-head" style="background:rgba(168,85,247,0.08)">
            <span class="rc-title">📋 STEP 7 블로그 프롬프트</span>
            <span class="rc-badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);">${esc(topic)}</span>
          </div>
          <div class="rc-section">
            <div class="rc-label">✍️ 프롬프트 미리보기</div>
            <div class="prompt-preview">${esc((step7Prompt||'').slice(0,300))}…</div>
          </div>
          <div class="rc-cta-box" style="background:rgba(168,85,247,0.04);border-top:1px solid rgba(168,85,247,0.1)">
            <div class="rc-cta-label">📤 연결된 도구</div>
            <div class="rc-actions">
              <button class="action-btn ab-primary" onclick="copyText(lastPrompt)">📋 프롬프트 복사</button>
              <button class="action-btn ab-secondary" onclick="copyText(lastPrompt);window.open('https://chat.openai.com','_blank')">↗ ChatGPT 열기</button>
            </div>
          </div>
        </div>
        <div class="msg-time">${now()}</div>
      </div>`;
  }
  chatMessages.appendChild(el);
  scrollBottom();
}

// JSON 붙여넣기 카드 (글생성 에이전트용)
function appendJsonCard() {
  const cardId = 'jc_' + Date.now();
  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent?.icon||'🤖'}</div>
    <div class="msg-body">
      <div class="json-card">
        <div class="json-head">
          <span>📥 ChatGPT 결과 붙여넣기</span>
          <button class="action-btn ab-secondary" style="font-size:11px;padding:3px 8px" onclick="this.closest('.message').remove()">닫기</button>
        </div>
        <div class="json-body">
          <textarea class="json-textarea" id="${cardId}" placeholder='{"instagram":{...}} 형식의 JSON을 붙여넣으세요.'></textarea>
          <div class="json-foot">
            <button class="action-btn ab-primary" onclick="sendJsonToWriter('${cardId}')">✍️ 글 생성기에 바로 적용</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

// 기획안 JSON 붙여넣기 카드 (콘텐츠기획 에이전트 전용)
function appendPlanningJsonCard() {
  const cardId = 'pjc_' + Date.now();
  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">📋</div>
    <div class="msg-body">
      <div class="json-card planning-json-card">
        <div class="json-head planning-json-head">
          <div>
            <div style="font-size:13px;font-weight:700;color:#a78bfa">📥 GPT 기획안 붙여넣기</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">위 프롬프트를 ChatGPT에 붙여넣고, 나온 JSON 결과를 여기에 붙여넣으세요</div>
          </div>
          <button class="action-btn ab-secondary" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="this.closest('.message').remove()">닫기</button>
        </div>
        <div class="json-body">
          <textarea class="json-textarea planning-textarea" id="${cardId}" placeholder='GPT가 준 JSON 결과물을 여기에 붙여넣으세요…&#10;&#10;예시:&#10;{&#10;  "planTitle": "...",&#10;  "weeks": [...]&#10;}'></textarea>
          <div class="json-foot" style="flex-wrap:wrap;gap:6px">
            <button class="action-btn ab-purple ab-large" onclick="analyzePlanningJson('${cardId}')">🔍 기획안 분석하기</button>
            <button class="action-btn ab-secondary" style="font-size:11px" onclick="this.closest('.message').remove()">취소</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

// 기획안 JSON 분석 렌더러
window.analyzePlanningJson = function(cardId) {
  const raw = $(cardId)?.value.trim();
  if (!raw) { showToast('JSON을 붙여넣어 주세요.', 'error'); return; }

  let data;
  try {
    // Extract JSON from code block if present
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonStr = fenced ? fenced[1].trim() : raw;
    data = JSON.parse(jsonStr);
  } catch {
    showToast('JSON 형식이 맞지 않아요. GPT 응답을 확인해 주세요.', 'error');
    return;
  }

  // Save to localStorage for strategy tool
  try {
    const existing = JSON.parse(localStorage.getItem(PLAN_DATA_KEY) || '{}');
    localStorage.setItem(PLAN_DATA_KEY, JSON.stringify({ ...existing, planJson: data, savedAt: Date.now() }));
    updateBridgeStatus();
  } catch { /* ignore */ }

  renderPlanningJsonResult(data);
};

function renderPlanningJsonResult(data) {
  const weeks = Array.isArray(data.weeks) ? data.weeks : [];
  const kw = data.keywordStrategy || {};
  const primaryKws = (kw.primary || []).map(k => `<span class="kw-chip high">${esc(k)}</span>`).join('');
  const secKws     = (kw.secondary || []).map(k => `<span class="kw-chip">${esc(k)}</span>`).join('');
  const ltKws      = (kw.longTail || []).map(k => `<span class="kw-chip low">${esc(k)}</span>`).join('');

  const weekCards = weeks.map(w => {
    const posts = Array.isArray(w.posts) ? w.posts : [];
    const postHtml = posts.map(p => `
      <div class="plan-post-card">
        <div class="plan-post-no">${p.no || ''}편</div>
        <div class="plan-post-titles">
          ${(p.titles || []).map((t, i) => `
            <div class="plan-title-row ${i === 0 ? 'main' : ''}">
              <span class="plan-title-idx">${i === 0 ? '★' : '○'}</span>
              <span>${esc(t)}</span>
            </div>`).join('')}
        </div>
        <div class="plan-post-meta">
          ${p.keyword ? `<span class="kw-chip">${esc(p.keyword)}</span>` : ''}
          ${p.type    ? `<span class="plan-type-badge">${esc(p.type)}</span>` : ''}
        </div>
        ${p.angle ? `<div class="plan-angle">💡 ${esc(p.angle)}</div>` : ''}
        ${p.outline?.length ? `
          <div class="plan-outline">
            ${p.outline.map((o, i) => `<div class="plan-outline-item"><span class="plan-ol-num">${i+1}</span>${esc(o)}</div>`).join('')}
          </div>` : ''}
        ${p.expectedReaction ? `<div class="plan-reaction">👥 ${esc(p.expectedReaction)}</div>` : ''}
      </div>`).join('');

    return `
      <div class="plan-week-card">
        <div class="plan-week-head">
          <span class="plan-week-num">${w.icon || ''} ${w.week}주차</span>
          <span class="plan-week-theme">${esc(w.theme || '')}</span>
        </div>
        ${w.desc ? `<div class="plan-week-desc">${esc(w.desc)}</div>` : ''}
        <div class="plan-posts">${postHtml}</div>
      </div>`;
  }).join('');

  const totalPosts = weeks.reduce((s, w) => s + (w.posts?.length || 0), 0);

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">📋</div>
    <div class="msg-body">
      <div class="msg-bubble">
        <p>✅ <strong>${esc(data.planTitle || '4주 콘텐츠 기획안')}</strong> 분석 완료!</p>
        <p style="font-size:12px;color:var(--text-muted)">📅 ${esc(data.period || '4주')} · 👥 ${esc(data.targetAudience || '')} · 📝 총 ${totalPosts}편</p>
      </div>
      <div class="result-card planning-result-card">
        <div class="rc-head planning"><span class="rc-title">📋 콘텐츠 기획안</span></div>

        ${(primaryKws || secKws || ltKws) ? `
        <div class="rc-section">
          <div class="rc-label">🔑 키워드 전략</div>
          ${primaryKws ? `<div style="margin-bottom:4px"><span style="font-size:11px;color:var(--text-muted)">주키워드</span><div class="kw-row">${primaryKws}</div></div>` : ''}
          ${secKws     ? `<div style="margin-bottom:4px"><span style="font-size:11px;color:var(--text-muted)">부키워드</span><div class="kw-row">${secKws}</div></div>` : ''}
          ${ltKws      ? `<div><span style="font-size:11px;color:var(--text-muted)">롱테일</span><div class="kw-row">${ltKws}</div></div>` : ''}
        </div>` : ''}

        <div class="plan-weeks-container">
          ${weekCards}
        </div>

        <div class="rc-cta-box" style="border-top:1px solid rgba(139,92,246,0.12);background:rgba(139,92,246,0.03)">
          <div class="rc-cta-label" style="color:#a78bfa">📤 다음 단계</div>
          <div class="rc-actions">
            <button class="action-btn ab-purple ab-large" onclick="goToStrategyToolPage()">📊 콘텐츠 기획 툴로 보내기 →</button>
            <button class="action-btn ab-green" onclick="switchAgent('content')">✍️ 글생성 에이전트로</button>
            <button class="action-btn ab-blog" onclick="switchAgent('blog')">📝 블로그 에이전트로</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

// ─── Cross-agent navigation ───────────────────────────────────
window.sendResearchToPlanning = function() {
  switchAgent('planning');
  showToast('기획 에이전트로 이동했어요. 리서치 데이터가 자동 반영됩니다!');
};

window.sendResearchToContent = function() {
  switchAgent('content');
  showToast('글생성 에이전트로 이동했어요. 리서치 데이터가 반영됩니다!');
};

window.switchToContentAgent = function() {
  switchAgent('content');
};

window.goToWriter = function() {
  showToast('원클릭 글 생성기로 이동합니다!');
  setTimeout(() => { window.location.href = '/?from=agent'; }, 600);
};

// 네이버 리서치 툴로 이동 (리서치 에이전트 결과 → research 페이지)
window.goToResearchTool = function() {
  const rd = JSON.parse(localStorage.getItem(RESEARCH_DATA_KEY) || '{}');
  if (rd.query) localStorage.setItem(RESEARCH_BRIDGE_KEY, JSON.stringify({ savedAt: Date.now(), query: rd.query }));
  showToast('네이버 리서치 툴로 이동합니다!');
  setTimeout(() => { window.location.href = '/research?from=agent'; }, 600);
};

// 구 함수명 호환
window.goToResearch = window.goToResearchTool;

// 콘텐츠 기획 툴로 이동 (기획 에이전트 결과 → strategy 페이지)
window.goToStrategyToolPage = function() {
  try {
    const rd = JSON.parse(localStorage.getItem(RESEARCH_DATA_KEY) || '{}');
    const pd = JSON.parse(localStorage.getItem(PLAN_DATA_KEY) || '{}');
    const planBridge = {
      savedAt: Date.now(),
      topic: pd.topic || rd.query || '',
      keywords: pd.keywords || rd.keywords || [],
      researchData: getPreferredResearchData(rd),
    };
    localStorage.setItem(PLAN_BRIDGE_KEY, JSON.stringify(planBridge));
  } catch { /* ignore */ }
  showToast('콘텐츠 기획 툴로 이동합니다!');
  setTimeout(() => { window.location.href = '/strategy?from=agent'; }, 600);
};

// ══════════════════════════════════════════════════════════════
//  네이버블로그 에이전트
// ══════════════════════════════════════════════════════════════

function inferNaverBlogCategory(topic = '') {
  if (/가방|백팩|파우치|지갑|토트|크로스백|숄더백|클러치|핸드백/i.test(topic)) return '가방';
  if (/쿠키|케이크|디저트|베이킹|마카롱|빵|브라우니|카스테라|답례품|수제/i.test(topic)) return '쿠키';
  return '일반';
}

function renderNaverBlogResult(data) {
  const { topic, audience, keywords = [], topBlog = [], planningPrompt = '', brandInfo = {} } = data;

  // Save to blog bridge — brandName 비워두고 primaryCategory는 자동 추론
  try {
    localStorage.setItem(BLOG_BRIDGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      ...(brandInfo || {}),
      brandName: '',
      primaryCategory: inferNaverBlogCategory(topic),
      writingPlan: planningPrompt,
    }));
    updateBridgeStatus();
  } catch { /* ignore */ }

  const kwChips = keywords.slice(0, 8).map(k =>
    `<span class="kw-chip ${k.level||''}">${esc(k.keyword)}${k.volume ? `<span class="chip-vol">${(k.volume/1000).toFixed(0)}k</span>` : ''}</span>`
  ).join('');
  const blogRows = topBlog.slice(0, 5).map(b => `<div class="rb-blog-item">📄 ${esc(b.title||'')}</div>`).join('');

  const el = document.createElement('div');
  el.className = 'message agent-message';
  el.innerHTML = `
    <div class="msg-avatar">${currentAgent.icon}</div>
    <div class="msg-body">
      <div class="msg-bubble"><p>✅ <strong>"${esc(topic)}"</strong> 네이버 리서치 + 블로그 프롬프트 완성!</p></div>
      <div class="result-card" style="border-color:rgba(79,70,229,0.3);background:var(--surface)">
        <div class="rc-head" style="background:rgba(79,70,229,0.08)">
          <span class="rc-title">📝 네이버블로그 에이전트</span>
          <span class="rc-badge" style="background:rgba(79,70,229,0.15);color:#818cf8;border:1px solid rgba(79,70,229,0.3);">${esc(topic)}</span>
        </div>

        ${kwChips ? `<div class="rc-section"><div class="rc-label">🔑 수집 키워드</div><div class="kw-row">${kwChips}</div></div>` : ''}
        ${blogRows ? `<div class="rc-section"><div class="rc-label">📊 상위 블로그</div><div class="rb-blog-list">${blogRows}</div></div>` : ''}

        <div class="rc-section">
          <div class="rc-label" style="display:flex;justify-content:space-between;align-items:center">
            <span>블로그 기획 프롬프트 <span style="font-weight:400;opacity:.6;font-size:11px">블로그 생성기에서 사용됩니다</span></span>
            <button class="action-btn ab-secondary" style="font-size:11px;padding:3px 9px"
              onclick="copyText(this.closest('.rc-section').querySelector('textarea').value)">📋 복사</button>
          </div>
          <textarea class="blog-plan-prompt-display" readonly style="max-height:120px">${esc(planningPrompt)}</textarea>
        </div>

        <div class="rc-cta-box" style="background:rgba(79,70,229,0.04);border-top:1px solid rgba(79,70,229,0.1)">
          <div class="rc-cta-label">📤 연결된 도구</div>
          <div class="rc-actions">
            <button class="action-btn ab-large" style="background:rgba(79,70,229,0.8);color:#fff;border:none"
              onclick="goToNaverBlogWriter()">📝 블로그 생성기로 보내기 →</button>
            <button class="action-btn ab-secondary" onclick="copyText(this.closest('.rc-cta-box').previousElementSibling.querySelector('textarea').value);window.open('https://chat.openai.com','_blank')">↗ ChatGPT로 열기</button>
          </div>
        </div>
      </div>
      <div class="msg-time">${now()}</div>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

// 네이버블로그 생성기로 이동
window.goToNaverBlogWriter = function() {
  showToast('블로그 생성기로 이동합니다!');
  setTimeout(() => { window.location.href = '/naver-blog-writer?from=agent'; }, 600);
};

window.sendJsonToWriter = function(cardId) {
  const json = $(cardId)?.value.trim();
  if (!json) { showToast('JSON을 붙여넣어 주세요.', 'error'); return; }
  try {
    const bridge = JSON.parse(localStorage.getItem(BRIDGE_KEY) || '{}');
    bridge.resultJson = json;
    localStorage.setItem(BRIDGE_KEY, JSON.stringify(bridge));
    showToast('글 생성기로 이동합니다!');
    setTimeout(() => { window.location.href = '/?from=agent&json=1'; }, 600);
  } catch { showToast('JSON 형식을 확인해주세요.', 'error'); }
};

// ─── Bridge save ──────────────────────────────────────────────
function saveBridge(data) {
  try {
    const bridge = {
      savedAt: Date.now(),
      topic:   data.meta?.topic || '',
      targetAudience: data.meta?.targetAudience || '',
      channels: data.meta?.channels || '',
      focusKeyword: data.keywords?.[0]?.keyword || '',
      lsiKeywords: (data.keywords||[]).slice(1, 7).map(k => k.keyword).join(', '),
      seoLevel: $('settingSeo')?.checked ? 'strong' : 'balanced',
      prompt:  data.prompt || '',
      keywords: data.keywords || [],
    };
    localStorage.setItem(BRIDGE_KEY, JSON.stringify(bridge));
    updateBridgeStatus();
  } catch { /* ignore */ }
}

// ─── Main send ────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isRunning || !currentAgent) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  appendUser(text);
  addHistory(currentAgent.id, text);
  setRunning(true, '분석 중…');

  const stepsEl = appendStepsCard(currentAgent.steps);

  const settings = {
    includeResearch: $('settingResearch')?.checked !== false,
    seoStrength:     $('settingSeo')?.checked ? 'strong' : 'balanced',
    variants:        $('settingAb')?.checked ? 2 : 1,
  };

  // Planning agent: attach cached research data
  let body = { task: text, settings };
  if (currentAgent.id === 'planning') {
    try {
      const rd = JSON.parse(localStorage.getItem(RESEARCH_DATA_KEY) || '{}');
      const researchData = getPreferredResearchData(rd);
      if (researchData) body.researchData = researchData;
    } catch { /* ignore */ }
  }

  try {
    const res = await fetch(currentAgent.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`서버 오류 (${res.status})`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(raw); } catch { continue; }

        switch (ev.type) {
          case 'step_start':
            updateStep(stepsEl, ev.step, 'running', ev.label);
            setRunning(true, ev.label || '실행 중…');
            break;
          case 'step_done':
            updateStep(stepsEl, ev.step, 'done');
            break;
          case 'step_error':
            updateStep(stepsEl, ev.step, 'error');
            break;
          case 'keywords':
          case 'blog_items':
            if (ev.type === 'keywords') addKeywordsToCard(stepsEl, ev.data);
            break;
          case 'result':
            finalResult = ev.data;
            break;
          case 'error':
            throw new Error(ev.message || '알 수 없는 오류');
        }
      }
    }

    setRunning(false);

    if (finalResult) {
      switch (currentAgent.id) {
        case 'research':   renderResearchResult(finalResult);   break;
        case 'planning':   renderPlanningResult(finalResult);   break;
        case 'content':    renderContentResult(finalResult);    break;
        case 'realBlog':   renderRealBlogResult(finalResult);   break;
        case 'naverBlog':  renderNaverBlogResult(finalResult);  break;
      }
    }

  } catch (err) {
    setRunning(false);
    currentAgent.steps.forEach(s => {
      const row = stepsEl.querySelector(`#sr-${s.id}`);
      if (row && !row.classList.contains('done')) updateStep(stepsEl, s.id, 'error');
    });
    appendAgent(
      `<p>❌ <strong>오류</strong></p><p style="color:var(--danger);font-size:12px;">${esc(err.message)}</p>`,
      'error-message'
    );
  }
}
