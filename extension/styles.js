/**
 * UI styles — "green · minimal" revision (from the Claude Design project
 * "웹픽커 UI"). Floating pill FAB, white card panel, double-ring highlight.
 * All scoped under .wp-* / #wp-* to avoid clobbering the host page.
 */
export const HIGHLIGHT_ID = 'wp-highlight';
export const PANEL_ID = 'wp-panel';
export const FAB_ID = 'wp-fab';

// Green pick icon used across the FAB, panel header, and popup.
export const PICK_ICON = (stroke = '#052e16', size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l7 16 2-6 6-2z"/></svg>`;

export const STYLES = `
#${FAB_ID} {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  display: inline-flex; align-items: center; gap: 8px;
  background: #22c55e; color: #052e16; border: none; cursor: pointer;
  border-radius: 999px; padding: 11px 17px; font: 600 13px system-ui, sans-serif;
  box-shadow: 0 8px 22px rgba(34,197,94,.35);
}
#${FAB_ID}:hover { background: #1eb856; }

#${PANEL_ID} {
  position: fixed; right: 16px; bottom: 72px; z-index: 2147483646;
  width: 300px; max-height: 74vh; overflow: auto;
  background: #fff; color: #0b0f12;
  border: 1px solid #e6e8ec; border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 10px 30px rgba(16,24,40,.20);
  font: 13px/1.5 system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
}
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .wp-hd { display: flex; align-items: center; gap: 9px; padding: 13px 15px 11px; }
#${PANEL_ID} .wp-ttl { font-weight: 600; font-size: 13.5px; letter-spacing: -.01em; }
#${PANEL_ID} .wp-conn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
#${PANEL_ID} .wp-conn.ok { color: #15803d; }
#${PANEL_ID} .wp-conn.err { color: #d92d20; }
#${PANEL_ID} .wp-x {
  margin-left: auto; width: 20px; height: 20px; border-radius: 6px; border: none;
  background: transparent; color: #98a2b3; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex: none;
}
#${PANEL_ID} .wp-x:hover { background: #f2f3f5; color: #667085; }
#${PANEL_ID} .wp-badge { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #8a919b; }
#${PANEL_ID} .wp-bd { padding: 4px 15px 16px; }

#${PANEL_ID} .wp-srow {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-size: 13px; padding: 9px 0; border-top: 1px solid #f2f3f5;
}
#${PANEL_ID} .wp-srow:first-child { border-top: none; }
#${PANEL_ID} .wp-slbl { color: #8a919b; }
#${PANEL_ID} .wp-sval { display: flex; align-items: center; gap: 7px; font-weight: 500; color: #1d2939; }

#${PANEL_ID} .wp-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex: none; }
#${PANEL_ID} .wp-mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }

#${PANEL_ID} .wp-code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
  background: #f6f7f9; border: 1px solid #eceef1; border-radius: 8px;
  padding: 9px 11px; color: #1d2939; word-break: break-all; line-height: 1.5;
}
#${PANEL_ID} .wp-dim { color: #aab0b8; }

#${PANEL_ID} .wp-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  font: 600 13px system-ui, sans-serif; border-radius: 10px; padding: 11px 15px;
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
  width: 100%; border: 1px solid #dfe2e7; border-radius: 10px; padding: 11px 12px;
  font: 13px/1.55 system-ui, sans-serif; color: #1d2939; min-height: 60px; resize: vertical;
}
#${PANEL_ID} textarea.wp-ta::placeholder { color: #98a2b3; }
#${PANEL_ID} textarea.wp-ta:focus { outline: none; border-color: #22c55e; }

#${PANEL_ID} .wp-note { font-size: 11.5px; color: #98a2b3; line-height: 1.55; }

/* success */
#${PANEL_ID} .wp-succ { text-align: center; padding: 26px 20px 20px; }
#${PANEL_ID} .wp-succ-icon {
  width: 46px; height: 46px; border-radius: 50%; background: #dcfce7;
  display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;
}
#${PANEL_ID} .wp-succ-title { font-size: 14px; font-weight: 600; margin-bottom: 7px; }

/* state cards (fail / block / occupied) */
#${PANEL_ID} .wp-state { display: flex; gap: 11px; align-items: flex-start; padding: 4px 0 2px; }
#${PANEL_ID} .wp-state .wp-dot { margin-top: 5px; }
#${PANEL_ID} .wp-state-title { font-size: 12.5px; font-weight: 600; margin-bottom: 3px; }

/* double-ring highlight (visible on light or dark pages) */
#${HIGHLIGHT_ID} {
  position: fixed; z-index: 2147483645; pointer-events: none;
  border-radius: 4px; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #22c55e;
}
#${HIGHLIGHT_ID} .wp-sel-label {
  position: absolute; left: 0; top: -26px;
  background: #22c55e; color: #052e16; box-shadow: 0 0 0 2px #fff;
  font: 700 10.5px/1 ui-monospace, Menlo, monospace; padding: 4px 7px; border-radius: 6px;
  white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis;
}
`;
