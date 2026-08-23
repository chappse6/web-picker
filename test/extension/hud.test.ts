// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyChipStatus,
  chipInnerHTML,
  clampPos,
  connectionState,
  createReloadTracker,
  dragThresholdExceeded,
  HUD_POS_KEY,
  inflightCount,
  isChromeTarget,
  loadPos,
  panelAnchor,
  pendingCount,
  queueLabel,
  savePos,
} from '../../extension/hud.js';

describe('connection and queue', () => {
  it('counts only pending rows', () => {
    expect(pendingCount({
      queue: [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'resolved' },
        { status: 'claimed' },
      ],
    })).toBe(2);
  });

  it('treats a reachable daemon as connected and an active session as live', () => {
    expect(connectionState({ ok: false })).toEqual({
      connected: false, pending: 0, inflight: 0, agentLive: false,
    });
    expect(connectionState({
      ok: true,
      status: { activeSessionId: 'agent-1', queue: [{ status: 'pending' }] },
    })).toEqual({ connected: true, pending: 1, inflight: 1, agentLive: true });
    expect(inflightCount({
      queue: [{ status: 'pending' }, { status: 'claimed' }, { status: 'resolved' }],
    })).toBe(2);
  });

  it('hides empty queues and caps large counts', () => {
    expect(queueLabel(0)).toBe('');
    expect(queueLabel(-1)).toBe('');
    expect(queueLabel(3)).toBe('3');
    expect(queueLabel(100)).toBe('99+');
  });
});

describe('chip status', () => {
  it('paints the brand chip with a green queue badge when work is waiting', () => {
    document.body.innerHTML = `<button id="wp-fab">${chipInnerHTML()}</button>`;
    const fab = document.getElementById('wp-fab')!;
    applyChipStatus(fab, { connected: true, pending: 4, agentLive: true });
    expect(fab.classList.contains('ok')).toBe(true);
    expect(fab.classList.contains('agent')).toBe(true);
    expect(fab.querySelector('#wp-qbadge')!.hidden).toBe(false);
    expect(fab.querySelector('#wp-qbadge')!.textContent).toBe('4');
    expect(fab.title).toContain('webpicker');
    expect(fab.title).toContain('대기 4');
  });

  it('swaps the queue badge for a reload button after in-flight work finishes', () => {
    document.body.innerHTML = `<button id="wp-fab">${chipInnerHTML()}</button>`;
    const fab = document.getElementById('wp-fab')!;
    const tracker = createReloadTracker();
    expect(tracker.apply({ queue: [{ status: 'pending' }] })).toBe(false);
    applyChipStatus(fab, { connected: true, pending: 1, inflight: 1, readyToReload: false });
    expect(fab.querySelector('#wp-qbadge')!.hidden).toBe(false);
    expect(fab.querySelector('#wp-reload')!.hidden).toBe(true);

    expect(tracker.apply({ queue: [{ status: 'resolved' }] })).toBe(true);
    applyChipStatus(fab, { connected: true, pending: 0, inflight: 0, readyToReload: true });
    expect(fab.querySelector('#wp-qbadge')!.hidden).toBe(true);
    expect(fab.querySelector('#wp-reload')!.hidden).toBe(false);
    expect(fab.title).toContain('새로고침');
  });

  it('uses a red dot and hides the badge when disconnected', () => {
    document.body.innerHTML = `<button id="wp-fab">${chipInnerHTML()}</button>`;
    const fab = document.getElementById('wp-fab')!;
    applyChipStatus(fab, { connected: false, pending: 2, agentLive: false });
    expect(fab.classList.contains('err')).toBe(true);
    expect(fab.querySelector('#wp-qbadge')!.hidden).toBe(true);
    expect(fab.title).toContain('연결 안 됨');
  });
});

describe('drag geometry', () => {
  it('keeps the chip inside the viewport', () => {
    expect(clampPos(-40, -10, 120, 36, 400, 300)).toEqual({ left: 8, top: 8 });
    expect(clampPos(500, 400, 120, 36, 400, 300)).toEqual({ left: 272, top: 256 });
  });

  it('anchors the composer above the chip when there is room', () => {
    const pos = panelAnchor({ top: 220, bottom: 256, left: 200, right: 340 }, 280, 140, 400, 400);
    expect(pos.top).toBe(70);
    expect(pos.left).toBe(60);
  });

  it('persists finite positions only', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };
    savePos({ left: 24, top: 80 }, storage);
    expect(loadPos(storage)).toEqual({ left: 24, top: 80 });
    savePos({ left: Number.NaN, top: 1 }, storage);
    expect(store.get(HUD_POS_KEY)).toBe('{"left":24,"top":80}');
    expect(loadPos({ getItem: () => 'nope' })).toBeNull();
  });

  it('ignores small pointer jitter as a click', () => {
    expect(dragThresholdExceeded(3, 3)).toBe(false);
    expect(dragThresholdExceeded(6, 0)).toBe(true);
  });
});

describe('chrome hit-test', () => {
  it('recognizes overlay nodes so pick mode can ignore them', () => {
    document.body.innerHTML = '<div id="wp-fab"><span class="wp-brand">webpicker</span></div><button id="page">x</button>';
    expect(isChromeTarget(document.querySelector('.wp-brand'), ['wp-fab'])).toBe(true);
    expect(isChromeTarget(document.getElementById('page'), ['wp-fab'])).toBe(false);
  });
});
