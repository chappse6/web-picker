// Popup: brand + connection dot + queued count.
const BASE = 'http://127.0.0.1:8787';

async function refresh() {
  const daemon = document.getElementById('daemon');
  const session = document.getElementById('session');
  const pending = document.getElementById('pending');
  const dot = document.getElementById('dot');
  const ver = document.getElementById('ver');
  try {
    const vRes = await fetch(`${BASE}/version.json`);
    if (!vRes.ok) throw new Error('version');
    const v = await vRes.json();
    ver.textContent = `v${v.version}`;
    const sRes = await fetch(`${BASE}/status`);
    if (!sRes.ok) throw new Error('status');
    const s = await sRes.json();
    const n = (s.queue || []).filter((r) => r.status === 'pending').length;
    const live = Boolean(s.activeSessionId);
    daemon.textContent = live ? '에이전트 연결됨' : '연결됨 · 일반 모드';
    dot.className = live ? 'dot ok' : 'dot err';
    pending.hidden = n < 1;
    pending.textContent = n > 99 ? '99+' : String(n);
    session.textContent = live ? `세션 ${String(s.activeSessionId).slice(0, 12)}` : '';
  } catch {
    daemon.textContent = '연결 안 됨';
    dot.className = 'dot err';
    pending.hidden = true;
    pending.textContent = '';
    session.textContent = '';
  }
}

refresh();
