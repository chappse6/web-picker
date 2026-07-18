// Popup: show daemon connection, occupied session, and pending count.
const BASE = 'http://127.0.0.1:8787';

async function refresh() {
  const daemon = document.getElementById('daemon');
  const session = document.getElementById('session');
  const pending = document.getElementById('pending');
  const ver = document.getElementById('ver');
  try {
    const v = await (await fetch(`${BASE}/version.json`)).json();
    ver.textContent = `v${v.version}`;
    const s = await (await fetch(`${BASE}/status`)).json();
    const n = (s.queue || []).filter((r) => r.status === 'pending').length;
    daemon.innerHTML = '<span class="dot" style="background:#22c55e"></span><span class="mono">127.0.0.1:8787</span>';
    session.textContent = s.activeSessionId ? String(s.activeSessionId).slice(0, 12) : '없음';
    pending.textContent = String(n);
  } catch {
    daemon.innerHTML = '<span class="dot" style="background:#f04438"></span><span class="mono">미실행</span>';
    session.textContent = '—';
    pending.textContent = '—';
  }
}

document.getElementById('refresh').addEventListener('click', refresh);
refresh();
