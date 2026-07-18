// Popup: show whether the local daemon is reachable.
(async () => {
  const dot = document.getElementById('daemon-dot');
  const label = document.getElementById('daemon-status');
  try {
    const res = await fetch('http://127.0.0.1:8787/version.json');
    if (!res.ok) throw new Error(String(res.status));
    const { version } = await res.json();
    dot.className = 'dot ok';
    label.textContent = `데몬 실행 중 (v${version})`;
  } catch {
    dot.className = 'dot err';
    label.textContent = '데몬 미실행';
  }
})();
