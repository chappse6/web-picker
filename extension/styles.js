/**
 * Overlay chrome — minimized "webpicker" chip, slim composer, lock-in highlight.
 * All scoped under .wp-* / #wp-* to avoid clobbering the host page.
 */
export const HIGHLIGHT_ID = 'wp-highlight';
export const PANEL_ID = 'wp-panel';
export const FAB_ID = 'wp-fab';

export const PICK_ICON = (stroke = '#052e16', size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l7 16 2-6 6-2z"/></svg>`;

export const STYLES = `
#${FAB_ID} {
  position: fixed; left: 16px; bottom: 16px; z-index: 2147483646;
  display: inline-flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 12px 0 10px;
  background: rgba(11, 18, 32, .92); color: #f8fafc;
  border: 1px solid rgba(255,255,255,.08); border-radius: 999px;
  cursor: grab; user-select: none; touch-action: none;
  font: 650 13px/1 ui-sans-serif, system-ui, "Apple SD Gothic Neo", sans-serif;
  letter-spacing: -.02em;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .28);
  backdrop-filter: blur(10px);
}
#${FAB_ID}:hover { background: rgba(15, 23, 42, .96); }
#${FAB_ID}.wp-dragging { cursor: grabbing; }
#${FAB_ID}.picking { box-shadow: 0 0 0 2px rgba(34,197,94,.45), 0 10px 28px rgba(15,23,42,.28); }
#${FAB_ID} .wp-brand { font-weight: 650; }
#${FAB_ID} .wp-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.22);
}
#${FAB_ID} .wp-dot[hidden] { display: none !important; }
#${FAB_ID}.err .wp-dot {
  background: #f04438;
  box-shadow: 0 0 0 3px rgba(240,68,56,.22);
}
#${FAB_ID}.agent .wp-dot {
  animation: wp-dot-pulse 1.4s ease-in-out infinite;
}
#${FAB_ID} .wp-hit {
  appearance: none; border: 0; background: transparent; padding: 0; color: inherit;
  display: inline-flex; align-items: center; justify-content: center;
  flex: none; width: 22px; height: 22px; border-radius: 50%;
  cursor: pointer; touch-action: manipulation; pointer-events: auto;
  position: relative; z-index: 2;
  transition: transform .16s ease, box-shadow .16s ease, filter .16s ease;
}
#${FAB_ID} .wp-hit::before {
  content: '';
  position: absolute;
  inset: -7px;
}
#${FAB_ID} .wp-hit:hover {
  transform: scale(1.06);
  filter: brightness(1.08);
  box-shadow: 0 0 0 2px rgba(200,245,66,.28);
}
#${FAB_ID} .wp-hit:active { transform: scale(0.98); }
#${FAB_ID} .wp-pick[hidden],
#${FAB_ID} .wp-reload[hidden] { display: none !important; }
#${FAB_ID}.picking .wp-pick {
  box-shadow: 0 0 0 2px rgba(200,245,66,.35);
}
#${FAB_ID} .wp-pick-svg { display: block; pointer-events: none; }
#${FAB_ID} .wp-aside {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; min-width: 22px; height: 22px; flex: none;
}
#${FAB_ID} .wp-qbadge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: #22c55e; color: #052e16;
  font: 700 11px/18px ui-sans-serif, system-ui, sans-serif;
  text-align: center; letter-spacing: 0;
}
#${FAB_ID} .wp-qbadge[hidden] { display: none !important; }
#${FAB_ID} .wp-reload {
  background: #22c55e; color: #052e16;
}
#${FAB_ID}.reloadable { box-shadow: 0 0 0 2px rgba(34,197,94,.28), 0 10px 28px rgba(15,23,42,.28); }

#${PANEL_ID} {
  position: fixed; z-index: 2147483646;
  display: flex; flex-direction: column;
  width: 280px; max-height: 70vh; overflow: auto;
  background: #fff; color: #0b0f12;
  border: 1px solid #e6e8ec; border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 10px 30px rgba(16,24,40,.20);
  font: 13px/1.5 system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
}
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .wp-hd { display: flex; align-items: center; gap: 8px; padding: 11px 13px 8px; }
#${PANEL_ID} .wp-ttl {
  font-weight: 600; font-size: 12.5px; letter-spacing: -.01em;
  color: #1d2939; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#${PANEL_ID} .wp-x {
  margin-left: auto; width: 20px; height: 20px; border-radius: 6px; border: none;
  background: transparent; color: #98a2b3; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex: none;
}
#${PANEL_ID} .wp-x:hover { background: #f2f3f5; color: #667085; }
#${PANEL_ID} .wp-bd { padding: 4px 13px 14px; }

#${PANEL_ID} .wp-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  font: 600 13px system-ui, sans-serif; border-radius: 10px; padding: 10px 14px;
  border: 0; cursor: pointer;
}
#${PANEL_ID} .wp-btn-pri { background: #22c55e; color: #052e16; }
#${PANEL_ID} .wp-btn-pri:hover { background: #1eb856; }
#${PANEL_ID} .wp-link {
  font-size: 12px; font-weight: 600; color: #8a919b; text-decoration: none;
  align-self: center; background: none; border: none; cursor: pointer; padding: 0;
}
#${PANEL_ID} .wp-link:hover { color: #667085; }

#${PANEL_ID} textarea.wp-ta {
  width: 100%; border: 1px solid #dfe2e7; border-radius: 10px; padding: 10px 11px;
  font: 13px/1.55 system-ui, sans-serif; color: #1d2939; min-height: 56px; resize: vertical;
}
#${PANEL_ID} textarea.wp-ta::placeholder { color: #98a2b3; }
#${PANEL_ID} textarea.wp-ta:focus { outline: none; border-color: #22c55e; }

#${PANEL_ID} .wp-note { font-size: 11.5px; color: #98a2b3; line-height: 1.55; margin: 0; }

#${PANEL_ID} .wp-succ {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; gap: 6px; padding: 8px 4px 10px;
}
#${PANEL_ID} .wp-succ-icon {
  width: 32px; height: 32px; border-radius: 50%; background: #dcfce7;
  display: flex; align-items: center; justify-content: center; flex: none;
}
#${PANEL_ID} .wp-succ-title { font-size: 13.5px; font-weight: 600; margin: 0; }
#${PANEL_ID} .wp-succ .wp-link { margin-top: 4px; }

#${PANEL_ID} .wp-state { display: flex; gap: 10px; align-items: flex-start; padding: 2px 0; }
#${PANEL_ID} .wp-state .wp-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex: none; margin-top: 5px; }
#${PANEL_ID} .wp-state-title { font-size: 12.5px; font-weight: 600; margin-bottom: 3px; }

html.wp-picking, html.wp-picking * { cursor: crosshair !important; }
html.wp-picking #${FAB_ID}, html.wp-picking #${FAB_ID} *,
html.wp-picking #${PANEL_ID}, html.wp-picking #${PANEL_ID} * { cursor: grab !important; }
html.wp-picking #${FAB_ID} .wp-hit { cursor: pointer !important; }
#${FAB_ID} .wp-hit { cursor: pointer !important; }

#${HIGHLIGHT_ID} {
  position: fixed; z-index: 2147483645; pointer-events: none;
  border-radius: 5px;
  background: rgba(34, 197, 94, .08);
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #22c55e, 0 0 14px rgba(34,197,94,.28);
  transition: left .07s linear, top .07s linear, width .07s linear, height .07s linear;
  animation: wp-pulse 1.05s ease-in-out infinite;
}
#${HIGHLIGHT_ID} .wp-sel-label {
  position: absolute; left: 0; top: -26px;
  background: #22c55e; color: #052e16; box-shadow: 0 0 0 2px #fff;
  font: 700 10.5px/1 ui-monospace, Menlo, monospace; padding: 4px 7px; border-radius: 6px;
  white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis;
}
#${HIGHLIGHT_ID}.wp-locked {
  animation: wp-lock .48s cubic-bezier(.2,.8,.2,1) forwards;
  background: rgba(34, 197, 94, .16);
}
#${HIGHLIGHT_ID}.wp-locked .wp-sel-label {
  animation: wp-label-pop .32s cubic-bezier(.2,.9,.2,1);
}

@keyframes wp-pulse {
  0%, 100% { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #22c55e, 0 0 12px rgba(34,197,94,.25); }
  50% { box-shadow: 0 0 0 2px #fff, 0 0 0 7px #4ade80, 0 0 20px rgba(34,197,94,.42); }
}
@keyframes wp-lock {
  0% {
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px #22c55e, 0 0 0 0 rgba(34,197,94,.5);
    background: rgba(34,197,94,.30);
  }
  40% {
    box-shadow: 0 0 0 3px #fff, 0 0 0 10px #22c55e, 0 0 0 22px rgba(34,197,94,.22);
    background: rgba(34,197,94,.20);
  }
  100% {
    box-shadow: 0 0 0 2px #fff, 0 0 0 5px #16a34a, 0 0 28px rgba(34,197,94,.45);
    background: rgba(34,197,94,.14);
  }
}
@keyframes wp-label-pop {
  0% { transform: translateY(6px) scale(.9); opacity: 0; }
  100% { transform: none; opacity: 1; }
}
@keyframes wp-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,.22), 0 0 8px rgba(34,197,94,.55); }
  50% { box-shadow: 0 0 0 5px rgba(34,197,94,.12), 0 0 12px rgba(34,197,94,.8); }
}
`;
