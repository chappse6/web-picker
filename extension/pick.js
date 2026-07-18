/**
 * Pick mode: hover tracking + click-to-select + Esc-to-cancel.
 *
 * Pure over a document object so it unit-tests under jsdom. The visual overlay
 * (blue outline, selector label) is applied by content.js via onHover; this
 * module only manages the event lifecycle and selection.
 */
export function createPicker(doc, { onPick, onHover, onCancel } = {}) {
  let active = false;
  let current = null;

  function onMove(e) {
    if (!active) return;
    current = e.target;
    if (onHover) onHover(current);
  }

  function onClick(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    stop();
    if (onPick) onPick(el);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      stop();
      if (onCancel) onCancel();
    }
  }

  function start() {
    if (active) return;
    active = true;
    // capture phase so we intercept before the page's own handlers
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
  }

  function stop() {
    active = false;
    current = null;
    doc.removeEventListener('mousemove', onMove, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKey, true);
  }

  return {
    start,
    stop,
    isActive: () => active,
    current: () => current,
  };
}
