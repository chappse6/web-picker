/**
 * Content script: minimized webpicker chip, pick mode, slim composer.
 *
 * Classic content script (not a module) so it dynamically imports the ESM logic
 * modules via chrome.runtime.getURL. Only activates on localhost pages.
 */
(async () => {
  const url = (p) => chrome.runtime.getURL(p);
  const config = await import(url('config.js'));

  if (!config.isLocalhost(location.hostname)) return;
  if (window.__webPickerLoaded) return;
  window.__webPickerLoaded = true;

  const { STYLES, HIGHLIGHT_ID, PANEL_ID, FAB_ID } = await import(url('styles.js'));
  const { createPicker } = await import(url('pick.js'));
  const { capturePayload } = await import(url('capture.js'));
  const { runtimeErrorGuidance } = await import(url('error-guidance.js'));
  const hud = await import(url('hud.js'));
  const share = await import(url('share.js'));

  async function send(type, payload) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) {
      throw Object.assign(new Error(response?.error?.code || 'runtime-error'), response?.error);
    }
    return response.data;
  }

  const ICON_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_CHECK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  const CHROME_IDS = [FAB_ID, PANEL_ID, HIGHLIGHT_ID];

  const style = document.createElement('style');
  style.textContent = STYLES;
  document.documentElement.appendChild(style);

  let panel = null;
  let highlight = null;
  let selected = null;
  let lastAgentLive = false;
  let suppressClick = false;
  const reloadTracker = hud.createReloadTracker();

  const fab = document.createElement('div');
  fab.id = FAB_ID;
  fab.title = hud.BRAND;
  fab.innerHTML = hud.chipInnerHTML();
  document.documentElement.appendChild(fab);
  applySavedPos();
  wireDrag();
  bindAction('#wp-pick', onChipActivate);
  bindAction('#wp-dot', onChipActivate);
  bindAction('#wp-reload', () => { location.reload(); });

  function bindAction(id, handler) {
    const el = fab.querySelector(id);
    if (!el) return;
    let handled = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handled = true;
      handler();
      queueMicrotask(() => { handled = false; });
    });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (handled || suppressClick) {
        suppressClick = false;
        return;
      }
      handler();
    });
  }

  function isOurUi(el) {
    return hud.isChromeTarget(el, CHROME_IDS);
  }

  function applySavedPos() {
    const saved = hud.loadPos();
    const pos = saved || hud.defaultPos(fab.offsetWidth, fab.offsetHeight, innerWidth, innerHeight);
    applyPos(hud.clampPos(pos.left, pos.top, fab.offsetWidth, fab.offsetHeight, innerWidth, innerHeight));
  }

  function applyPos(pos) {
    Object.assign(fab.style, {
      left: `${pos.left}px`,
      top: `${pos.top}px`,
      right: 'auto',
      bottom: 'auto',
    });
  }

  function wireDrag() {
    const pointer = { id: null, sx: 0, sy: 0, sl: 0, st: 0, dragged: false };

    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (hud.isActionTarget(e.target)) return;
      const r = fab.getBoundingClientRect();
      pointer.id = e.pointerId;
      pointer.sx = e.clientX;
      pointer.sy = e.clientY;
      pointer.sl = r.left;
      pointer.st = r.top;
      pointer.dragged = false;
      fab.setPointerCapture?.(e.pointerId);
      fab.classList.add('wp-dragging');
    });

    fab.addEventListener('pointermove', (e) => {
      if (pointer.id !== e.pointerId) return;
      const dx = e.clientX - pointer.sx;
      const dy = e.clientY - pointer.sy;
      if (!pointer.dragged && !hud.dragThresholdExceeded(dx, dy)) return;
      pointer.dragged = true;
      applyPos(hud.clampPos(
        pointer.sl + dx,
        pointer.st + dy,
        fab.offsetWidth,
        fab.offsetHeight,
        innerWidth,
        innerHeight,
      ));
      placePanel();
    });

    function endPointer(e) {
      if (pointer.id !== e.pointerId) return;
      fab.releasePointerCapture?.(e.pointerId);
      fab.classList.remove('wp-dragging');
      if (pointer.dragged) {
        suppressClick = true;
        hud.savePos({ left: parseFloat(fab.style.left), top: parseFloat(fab.style.top) });
      }
      pointer.id = null;
      pointer.dragged = false;
    }

    fab.addEventListener('pointerup', endPointer);
    fab.addEventListener('pointercancel', endPointer);
  }

  function onChipActivate() {
    if (picker.isActive()) {
      picker.stop();
      leavePickMode();
      clearHighlight();
      return;
    }
    if (panel) {
      closePanel();
      return;
    }
    startPick();
  }

  function leavePickMode() {
    document.documentElement.classList.remove('wp-picking');
    fab.classList.remove('picking');
  }

  function closePanel() {
    picker.stop();
    leavePickMode();
    panel?.remove();
    panel = null;
    selected = null;
    clearHighlight();
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    document.documentElement.appendChild(panel);
    return panel;
  }

  function placePanel() {
    if (!panel) return;
    const anchor = selected || highlight || fab;
    const pos = hud.panelAnchor(
      anchor.getBoundingClientRect(),
      panel.offsetWidth || 280,
      panel.offsetHeight || 160,
      innerWidth,
      innerHeight,
    );
    Object.assign(panel.style, {
      left: `${pos.left}px`,
      top: `${pos.top}px`,
      right: 'auto',
      bottom: 'auto',
    });
  }

  function header(title) {
    return `<div class="wp-hd"><span class="wp-ttl">${title}</span>
      <button class="wp-x" id="wp-close" type="button">${ICON_X}</button></div>`;
  }

  function wireCommon() {
    panel.querySelector('#wp-close')?.addEventListener('click', closePanel);
    requestAnimationFrame(placePanel);
  }

  async function refreshStatus() {
    if (!fab.isConnected) return false;
    try {
      const s = await send('web-picker:get-status');
      lastAgentLive = Boolean(s?.activeSessionId);
      const readyToReload = reloadTracker.apply(s);
      hud.applyChipStatus(fab, { ...hud.connectionState({ ok: true, status: s }), readyToReload });
      if (panel?.dataset.wpState === 'error') {
        panel.remove();
        panel = null;
      }
      return true;
    } catch (error) {
      lastAgentLive = false;
      hud.applyChipStatus(fab, hud.connectionState({ ok: false }));
      return false;
    }
  }

  function stateCard(title, note, color) {
    return `<div class="wp-state">
      <span class="wp-dot" style="background:${color}"></span>
      <div><div class="wp-state-title">${escapeHtml(title)}</div>
      <p class="wp-note" style="color:#667085">${note}</p></div></div>`;
  }

  function showStateCard(title, note, color) {
    const host = panel?.querySelector('#wp-status');
    if (!host) return;
    host.innerHTML = `<div style="margin-top:10px">${stateCard(title, note, color)}</div>`;
  }

  function setStatus(msg, kind) {
    const host = panel?.querySelector('#wp-status');
    if (!host) return;
    const color = kind === 'err' ? '#d92d20' : kind === 'ok' ? '#15803d' : '#98a2b3';
    host.innerHTML = `<p class="wp-note" style="margin-top:10px;color:${color}">${escapeHtml(msg)}</p>`;
  }

  const picker = createPicker(document, {
    ignore: isOurUi,
    onHover: showHighlight,
    onPick: onPicked,
    onCancel: () => {
      leavePickMode();
      clearHighlight();
    },
  });

  function startPick() {
    if (panel) {
      panel.remove();
      panel = null;
    }
    selected = null;
    clearHighlight();
    document.documentElement.classList.add('wp-picking');
    fab.classList.add('picking');
    picker.start();
  }

  function showHighlight(el) {
    if (!el || isOurUi(el)) return;
    const r = el.getBoundingClientRect();
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = HIGHLIGHT_ID;
      highlight.innerHTML = '<span class="wp-sel-label"></span>';
      document.documentElement.appendChild(highlight);
    }
    highlight.classList.remove('wp-locked');
    Object.assign(highlight.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    });
    const tag = el.tagName.toLowerCase();
    highlight.querySelector('.wp-sel-label').textContent =
      `${el.id ? `${tag}#${el.id}` : tag} · ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  function clearHighlight() {
    highlight?.remove();
    highlight = null;
  }

  function onPicked(el) {
    if (!el || isOurUi(el)) return;
    leavePickMode();
    selected = el;
    showHighlight(el);
    highlight?.classList.add('wp-locked');
    const cap = capturePayload(el, { userQuestion: '' }).element;
    const dims = `${Math.round(cap.rect.width)}×${Math.round(cap.rect.height)}`;
    const mcpMode = share.isMcpMode({ agentLive: lastAgentLive });
    ensurePanel();
    delete panel.dataset.wpState;
    panel.innerHTML =
      header(`${escapeHtml(cap.selector)} · ${dims}`) +
      `<div class="wp-bd">
        <textarea class="wp-ta" id="wp-q" placeholder="이 요소를 어떻게 고칠까요?"></textarea>
        ${mcpMode ? '' : '<p class="wp-note" id="wp-mode-hint" style="margin:8px 0 0;color:#667085">MCP 미연결 · 보내면 마스킹된 요청이 클립보드에 복사됩니다.</p>'}
        <div style="display:flex;gap:12px;align-items:center;margin-top:10px">
          <button class="wp-link" id="wp-again" type="button">다시 선택</button>
          <button class="wp-btn wp-btn-pri" id="wp-send" type="button" style="flex:1">${share.submitLabel(mcpMode)}</button>
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
    const mcpMode = share.isMcpMode({ agentLive: lastAgentLive });
    setStatus(mcpMode ? '보내는 중…' : '복사하는 중…', null);
    try {
      const payload = capturePayload(selected, { userQuestion: q });
      if (!mcpMode) {
        const copied = await share.copyText(share.formatClipboardPrompt(payload));
        if (!copied) return setStatus('클립보드에 복사하지 못했습니다.', 'err');
        selected = null;
        renderCopied();
        return;
      }
      const res = await send('web-picker:create-request', payload);
      selected = null;
      reloadTracker.noteSubmit();
      await refreshStatus();
      renderSuccess(res.id);
    } catch (error) {
      const guidance = runtimeErrorGuidance(error?.code);
      showStateCard(guidance.title, guidance.note, '#f04438');
    }
  }

  function renderCopied() {
    ensurePanel();
    delete panel.dataset.wpState;
    panel.innerHTML =
      header('webpicker') +
      `<div class="wp-bd wp-succ">
        <div class="wp-succ-icon">${ICON_CHECK}</div>
        <div class="wp-succ-title">클립보드에 복사했습니다</div>
        <p class="wp-note" style="color:#667085;margin:0 0 14px">일반 채팅에 붙여넣으면 됩니다. 개인정보는 마스킹되어 있습니다.</p>
        <button class="wp-btn wp-btn-pri" id="wp-new" type="button" style="width:100%">새 요청</button>
      </div>`;
    wireCommon();
    panel.querySelector('#wp-new').addEventListener('click', () => {
      closePanel();
      startPick();
    });
  }

  function renderSuccess() {
    ensurePanel();
    delete panel.dataset.wpState;
    panel.innerHTML =
      header('webpicker') +
      `<div class="wp-bd wp-succ">
        <div class="wp-succ-icon">${ICON_CHECK}</div>
        <div class="wp-succ-title">요청을 큐에 보냈습니다</div>
        <p class="wp-note" style="color:#667085;margin:0 0 14px">에이전트에서 이어서 처리하세요.</p>
        <button class="wp-btn wp-btn-pri" id="wp-new" type="button" style="width:100%">새 요청</button>
      </div>`;
    wireCommon();
    panel.querySelector('#wp-new').addEventListener('click', () => {
      closePanel();
      startPick();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  addEventListener('resize', () => {
    if (!fab.style.left) return;
    applyPos(hud.clampPos(
      parseFloat(fab.style.left),
      parseFloat(fab.style.top),
      fab.offsetWidth,
      fab.offsetHeight,
      innerWidth,
      innerHeight,
    ));
    placePanel();
  });

  const poll = setInterval(() => {
    if (!fab.isConnected) {
      clearInterval(poll);
      return;
    }
    refreshStatus();
  }, hud.STATUS_POLL_MS);

  refreshStatus();
})();
