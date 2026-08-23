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

export function connectionState({ ok, status } = {}) {
  if (!ok) {
    return { connected: false, pending: 0, agentLive: false };
  }
  return {
    connected: true,
    pending: pendingCount(status),
    agentLive: Boolean(status?.activeSessionId),
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

export function chipInnerHTML(brand = BRAND) {
  return `<span class="wp-dot" id="wp-dot" aria-hidden="true"></span>`
    + `<span class="wp-brand">${brand}</span>`
    + `<span class="wp-qbadge" id="wp-qbadge" hidden></span>`;
}

export function applyChipStatus(root, state) {
  if (!root) return;
  const connected = Boolean(state?.connected);
  const pending = Number.isInteger(state?.pending) ? state.pending : 0;
  const agentLive = Boolean(connected && state?.agentLive);
  const badge = root.querySelector('#wp-qbadge');
  const label = connected ? queueLabel(pending) : '';

  root.classList.toggle('ok', connected);
  root.classList.toggle('err', !connected);
  root.classList.toggle('agent', agentLive);

  if (badge) {
    badge.hidden = !label;
    badge.textContent = label;
  }

  const conn = !connected ? '연결 안 됨' : agentLive ? '에이전트 연결됨' : '연결됨';
  const queue = label ? ` · 대기 ${pending}` : '';
  const title = `${BRAND} · ${conn}${queue}`;
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
