/**
 * Content script: floating button, panel, pick mode, submit.
 *
 * Classic content script (not a module) so it dynamically imports the ESM logic
 * modules via chrome.runtime.getURL. Only activates on localhost pages.
 */
(async () => {
  const url = (p) => chrome.runtime.getURL(p);
  const config = await import(url('config.js'));

  // Activation guard: v1 is localhost-only.
  if (!config.isLocalhost(location.hostname)) return;
  if (window.__webPickerLoaded) return;
  window.__webPickerLoaded = true;

  const { STYLES, HIGHLIGHT_ID, PANEL_ID, FAB_ID } = await import(url('styles.js'));
  const { createPicker } = await import(url('pick.js'));
  const { capturePayload } = await import(url('capture.js'));
  const transport = await import(url('transport.js'));

  // one-time style injection
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.documentElement.appendChild(style);

  let panel = null;
  let highlight = null;
  let selected = null;

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.textContent = '픽';
  fab.title = '웹픽커';
  fab.addEventListener('click', togglePanel);
  document.documentElement.appendChild(fab);

  function togglePanel() {
    if (panel) return closePanel();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    renderIdle('요소를 선택해 수정 요청을 보내세요.');
    document.documentElement.appendChild(panel);
  }

  function closePanel() {
    panel?.remove();
    panel = null;
    selected = null;
    clearHighlight();
  }

  function renderIdle(msg) {
    panel.innerHTML = `
      <h1>웹픽커</h1>
      <button class="wp-action" id="wp-pick">요소 선택</button>
      <div class="wp-status" id="wp-status">${escapeHtml(msg)}</div>`;
    panel.querySelector('#wp-pick').addEventListener('click', startPick);
  }

  function setStatus(msg, kind) {
    const s = panel?.querySelector('#wp-status');
    if (s) {
      s.textContent = msg;
      s.className = 'wp-status' + (kind ? ' ' + kind : '');
    }
  }

  // ---- pick mode ----
  const picker = createPicker(document, {
    onHover: showHighlight,
    onPick: onPicked,
    onCancel: () => {
      clearHighlight();
      setStatus('선택 취소됨', null);
    },
  });

  function startPick() {
    setStatus('요소 위에 마우스를 올리고 클릭하세요. (Esc 취소)', null);
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
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    });
    const tag = el.tagName.toLowerCase();
    highlight.querySelector('.wp-sel-label').textContent = el.id ? `${tag}#${el.id}` : tag;
  }

  function clearHighlight() {
    highlight?.remove();
    highlight = null;
  }

  function onPicked(el) {
    clearHighlight();
    selected = el;
    const cap = capturePayload(el, { userQuestion: '' }).element;
    panel.innerHTML = `
      <h1>웹픽커</h1>
      <div class="wp-summary">tag: ${escapeHtml(cap.tagName)}
id: ${escapeHtml(cap.id || '(none)')}
class: ${escapeHtml(cap.className || '(none)')}
selector: ${escapeHtml(cap.selector)}
landmark: ${escapeHtml(cap.landmark || '(none)')}
label: ${escapeHtml(cap.visibleLabel || '(none)')}
rect: ${Math.round(cap.rect.width)}x${Math.round(cap.rect.height)}</div>
      <textarea id="wp-q" placeholder="이 요소를 어떻게 고칠까요?"></textarea>
      <button class="wp-action" id="wp-send">보내기</button>
      <button class="wp-action wp-secondary" id="wp-again">다시 선택</button>
      <div class="wp-status" id="wp-status"></div>`;
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
      const res = await transport.postRequest(payload);
      setStatus(`전송됨 (id: ${res.id})`, 'ok');
      selected = null;
    } catch (err) {
      setStatus('데몬 연결 실패. 데몬이 실행 중인지 확인하세요.', 'err');
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
})();
