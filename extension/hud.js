/**
 * Minimized HUD helpers — connection/queue chip, drag math, chrome hit-tests.
 * Pure enough to unit-test under jsdom without a live content script.
 */

export const HUD_POS_KEY = 'web-picker:hud-pos';
export const STATUS_POLL_MS = 3000;
export const DRAG_THRESHOLD_PX = 5;
export const BRAND = 'webpicker';

export function pendingCount(status) {
  return (status?.queue || []).filter((row) => row.status === 'pending').length;
}

export function inflightCount(status) {
  return (status?.queue || []).filter((row) => row.status === 'pending' || row.status === 'claimed').length;
}

export function connectionState({ ok, status } = {}) {
  if (!ok) {
    return { connected: false, pending: 0, inflight: 0, agentLive: false };
  }
  return {
    connected: true,
    pending: pendingCount(status),
    inflight: inflightCount(status),
    agentLive: Boolean(status?.activeSessionId),
  };
}

export function createReloadTracker() {
  let sawWork = false;
  let ready = false;
  return {
    noteSubmit() {
      sawWork = true;
      ready = false;
    },
    apply(status) {
      const n = inflightCount(status);
      if (n > 0) {
        sawWork = true;
        ready = false;
      } else if (sawWork) {
        ready = true;
      }
      return ready;
    },
    ready() {
      return ready;
    },
  };
}

export function queueLabel(count) {
  if (!Number.isInteger(count) || count < 1) return '';
  return count > 99 ? '99+' : String(count);
}

export function clampPos(left, top, width, height, vw, vh, pad = 8) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const viewW = Math.max(0, Number(vw) || 0);
  const viewH = Math.max(0, Number(vh) || 0);
  const maxL = Math.max(pad, viewW - w - pad);
  const maxT = Math.max(pad, viewH - h - pad);
  return {
    left: Math.min(maxL, Math.max(pad, Number(left) || 0)),
    top: Math.min(maxT, Math.max(pad, Number(top) || 0)),
  };
}

export function loadPos(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(HUD_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left !== 'number' || typeof parsed?.top !== 'number') return null;
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

export function savePos(pos, storage = globalThis.localStorage) {
  if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;
  if (!Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
  storage?.setItem(HUD_POS_KEY, JSON.stringify({ left: pos.left, top: pos.top }));
}

export function isChromeTarget(el, ids = []) {
  if (!el || typeof el.closest !== 'function') return false;
  return ids.some((id) => el.id === id || Boolean(el.closest(`#${id}`)));
}

export function dragThresholdExceeded(dx, dy, threshold = DRAG_THRESHOLD_PX) {
  return (dx * dx) + (dy * dy) > (threshold * threshold);
}

const RELOAD_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.2-5.8"/><path d="M21 3v6h-6"/></svg>';

export const PICK_MARK = '<svg class="wp-pick-svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="12" fill="#3a3f48"/>'
  + '<rect x="4.6" y="7.2" width="14.6" height="9.4" rx="2.4" fill="none" stroke="#c8f542" stroke-width="1.7" stroke-dasharray="2.5 1.9" stroke-linecap="round"/>'
  + '<path fill="#fff" d="M13.05 12.35v6.7l1.55-1.85 1.7 3.7 1.25-.55-1.7-3.65 2.15-.35z"/>'
  + '</svg>';

export function chipInnerHTML(brand = BRAND) {
  return `<span class="wp-dot" id="wp-dot" role="button" aria-label="연결 안 됨"></span>`
    + `<span class="wp-hit wp-pick" id="wp-pick" hidden role="button" aria-label="요소 선택">${PICK_MARK}</span>`
    + `<span class="wp-brand">${brand}</span>`
    + `<span class="wp-aside">`
    + `<span class="wp-qbadge" id="wp-qbadge" hidden></span>`
    + `<span class="wp-hit wp-reload" id="wp-reload" hidden role="button" aria-label="새로고침해서 변경 보기">${RELOAD_ICON}</span>`
    + `</span>`;
}

export function applyChipStatus(root, state) {
  if (!root) return;
  const connected = Boolean(state?.connected);
  const pending = Number.isInteger(state?.pending) ? state.pending : 0;
  const inflight = Number.isInteger(state?.inflight) ? state.inflight : pending;
  const agentLive = Boolean(connected && state?.agentLive);
  const readyToReload = Boolean(connected && state?.readyToReload);
  const badge = root.querySelector('#wp-qbadge');
  const reload = root.querySelector('#wp-reload');
  const pick = root.querySelector('#wp-pick');
  const dot = root.querySelector('#wp-dot');
  const label = connected ? queueLabel(inflight) : '';
  const showReload = readyToReload && !label;

  root.classList.toggle('ok', connected);
  root.classList.toggle('err', !connected);
  root.classList.toggle('agent', agentLive);
  root.classList.toggle('reloadable', showReload);

  if (pick) pick.hidden = !connected;
  if (dot) dot.hidden = connected;
  if (badge) {
    badge.hidden = !label;
    badge.textContent = label;
  }
  if (reload) reload.hidden = !showReload;

  const conn = !connected ? '연결 안 됨' : agentLive ? '에이전트 연결됨' : '연결됨';
  const extra = label ? ` · 대기 ${inflight}` : showReload ? ' · 완료 · 새로고침' : '';
  const title = `${BRAND} · ${conn}${extra}`;
  root.title = title;
  root.setAttribute('aria-label', title);
}

export function panelAnchor(chipRect, panelWidth, panelHeight, vw, vh) {
  const pw = panelWidth || 280;
  const ph = panelHeight || 160;
  const above = chipRect.top - ph - 10;
  const top = above >= 8 ? above : chipRect.bottom + 10;
  const left = chipRect.right - pw;
  return clampPos(left, top, pw, ph, vw, vh);
}
