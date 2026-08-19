/**
 * Content script: floating pill, panel, pick mode, submit.
 *
 * Classic content script (not a module) so it dynamically imports the ESM logic
 * modules via chrome.runtime.getURL. Only activates on localhost pages.
 *
 * UI follows the "green · minimal" design (Claude Design project "웹픽커 UI").
 */
(async () => {
  const url = (p) => chrome.runtime.getURL(p);
  const config = await import(url('config.js'));

  if (!config.isLocalhost(location.hostname)) return;
  if (window.__webPickerLoaded) return;
  window.__webPickerLoaded = true;

  const { STYLES, HIGHLIGHT_ID, PANEL_ID, FAB_ID, PICK_ICON } = await import(url('styles.js'));
  const { createPicker } = await import(url('pick.js'));
  const { capturePayload } = await import(url('capture.js'));
  const { runtimeErrorGuidance } = await import(url('error-guidance.js'));

  async function send(type, payload) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) {
      throw Object.assign(new Error(response?.error?.code || 'runtime-error'), response?.error);
    }
    return response.data;
  }

  const ICON_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_LOCK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a919b" stroke-width="2.4"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  const ICON_CHECK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  const style = document.createElement('style');
  style.textContent = STYLES;
  document.documentElement.appendChild(style);

  let panel = null;
  let highlight = null;
  let selected = null;

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.title = '웹픽커';
  fab.innerHTML = `${PICK_ICON('#052e16', 16)}<span>요소 선택</span>`;
  fab.addEventListener('click', togglePanel);
  document.documentElement.appendChild(fab);

  function togglePanel() {
    if (panel) return closePanel();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    document.documentElement.appendChild(panel);
    renderIdle();
    refreshStatus();
  }

  function closePanel() {
    panel?.remove();
    panel = null;
    selected = null;
    clearHighlight();
  }

  function header(title, right) {
    return `<div class="wp-hd">${PICK_ICON('#22c55e', 18)}<span class="wp-ttl">${title}</span>${right || ''}
      <button class="wp-x" id="wp-close">${ICON_X}</button></div>`;
  }

  function wireCommon() {
    panel.querySelector('#wp-close')?.addEventListener('click', closePanel);
  }

  // ---- idle ----
  function renderIdle() {
    panel.innerHTML =
      header('웹픽커', '<span class="wp-conn" id="wp-conn"><span class="wp-dot" style="background:#d0d5dd"></span>확인 중…</span>') +
      `<div class="wp-bd">
        <div class="wp-srow"><span class="wp-slbl">현재 페이지</span><span class="wp-sval">localhost 허용</span></div>
        <div class="wp-srow"><span class="wp-slbl">대기 중 요청</span><span class="wp-sval" id="wp-pending">—</span></div>
        <button class="wp-btn wp-btn-pri" id="wp-pick" style="width:100%;margin-top:14px">요소 선택 시작</button>
        <p class="wp-note" style="margin:12px 2px 0">localhost 전용 · 텍스트·HTML 기본 마스킹</p>
        <div id="wp-status"></div>
      </div>`;
    wireCommon();
    panel.querySelector('#wp-pick').addEventListener('click', startPick);
  }

  async function refreshStatus() {
    const conn = panel?.querySelector('#wp-conn');
    const pending = panel?.querySelector('#wp-pending');
    try {
      const s = await send('web-picker:get-status');
      const n = (s.queue || []).filter((r) => r.status === 'pending').length;
      if (conn) conn.innerHTML = '<span class="wp-dot" style="background:#22c55e"></span>연결됨';
      if (conn) conn.className = 'wp-conn ok';
      if (pending) pending.textContent = String(n);
    } catch (error) {
      if (conn) conn.innerHTML = '<span class="wp-dot" style="background:#f04438"></span>데몬 미실행';
      if (conn) conn.className = 'wp-conn err';
      if (pending) pending.textContent = '—';
      const guidance = runtimeErrorGuidance(error?.code);
      showStateCard(guidance.title, guidance.note, '#f04438');
    }
  }

  function showStateCard(title, note, color) {
    const host = panel?.querySelector('#wp-status');
    if (!host) return;
    host.innerHTML = `<div class="wp-state" style="margin-top:12px">
      <span class="wp-dot" style="background:${color}"></span>
      <div><div class="wp-state-title">${escapeHtml(title)}</div><p class="wp-note" style="color:#667085;margin:0">${note}</p></div></div>`;
  }

  function setStatus(msg, kind) {
    const host = panel?.querySelector('#wp-status');
    if (!host) return;
    const color = kind === 'err' ? '#d92d20' : kind === 'ok' ? '#15803d' : '#98a2b3';
    host.innerHTML = `<p class="wp-note" style="margin:12px 2px 0;color:${color}">${escapeHtml(msg)}</p>`;
  }

  // ---- pick mode ----
  const picker = createPicker(document, {
    onHover: showHighlight,
    onPick: onPicked,
    onCancel: () => {
      clearHighlight();
      setStatus('선택 취소됨 (Esc)', null);
    },
  });

  function startPick() {
    setStatus('요소 위에 마우스를 올리고 클릭하세요. Esc로 취소.', null);
    picker.start();
  }

  function showHighlight(el) {
    if (!el || el === fab || el.closest?.(`#${PANEL_ID}`) || el.closest?.(`#${FAB_ID}`)) return;
    const r = el.getBoundingClientRect();
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = HIGHLIGHT_ID;
      highlight.innerHTML = '<span class="wp-sel-label"></span>';
      document.documentElement.appendChild(highlight);
    }
    Object.assign(highlight.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    });
    const tag = el.tagName.toLowerCase();
    highlight.querySelector('.wp-sel-label').textContent =
      `${el.id ? tag + '#' + el.id : tag} · ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  function clearHighlight() {
    highlight?.remove();
    highlight = null;
  }

  function onPicked(el) {
    clearHighlight();
    selected = el;
    const cap = capturePayload(el, { userQuestion: '' }).element;
    const dims = `${Math.round(cap.rect.width)}×${Math.round(cap.rect.height)}`;
    panel.innerHTML =
      header('선택한 요소', `<span class="wp-badge">${ICON_LOCK}마스킹됨</span>`) +
      `<div class="wp-bd">
        <div class="wp-code" style="margin-bottom:12px">${escapeHtml(cap.selector)} <span class="wp-dim">· ${dims}</span></div>
        <textarea class="wp-ta" id="wp-q" placeholder="이 요소를 어떻게 고칠까요?"></textarea>
        <div style="display:flex;gap:12px;align-items:center;margin-top:12px">
          <button class="wp-link" id="wp-again">다시 선택</button>
          <button class="wp-btn wp-btn-pri" id="wp-send" style="flex:1">보내기</button>
        </div>
        <div id="wp-status"></div>
      </div>`;
    wireCommon();
    panel.querySelector('#wp-send').addEventListener('click', submit);
    panel.querySelector('#wp-again').addEventListener('click', startPick);
    panel.querySelector('#wp-q').focus();
  }

  async function submit() {
    const q = panel.querySelector('#wp-q').value.trim();
    if (!q) return setStatus('수정 요청을 입력하세요.', 'err');
    if (!selected) return setStatus('선택된 요소가 없습니다.', 'err');
    setStatus('보내는 중…', null);
    try {
      const payload = capturePayload(selected, { userQuestion: q });
      const res = await send('web-picker:create-request', payload);
      selected = null;
      let pending = null;
      try {
        const s = await send('web-picker:get-status');
        pending = (s.queue || []).filter((r) => r.status === 'pending').length;
      } catch {}
      renderSuccess(res.id, pending);
    } catch (error) {
      const guidance = runtimeErrorGuidance(error?.code);
      showStateCard(guidance.title, guidance.note, '#f04438');
    }
  }

  function renderSuccess(id, pending) {
    const tail = pending == null ? '' : ` 대기 ${pending}건.`;
    panel.innerHTML =
      header('웹픽커', '') +
      `<div class="wp-bd wp-succ">
        <div class="wp-succ-icon">${ICON_CHECK}</div>
        <div class="wp-succ-title">요청을 큐에 보냈습니다</div>
        <p class="wp-note" style="font-size:12px;color:#667085;margin:0 6px 18px">Claude Code 또는 Codex에서 처리하세요.${tail}</p>
        <button class="wp-btn wp-btn-pri" id="wp-new" style="width:100%">새 요청</button>
      </div>`;
    wireCommon();
    panel.querySelector('#wp-new').addEventListener('click', () => {
      renderIdle();
      refreshStatus();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
})();
