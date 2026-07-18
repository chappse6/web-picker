/**
 * UI styles for the floating button, panel, and pick-mode highlight.
 * Exported as a string and injected once by content.js into a <style> element,
 * scoped under the .wp-* namespace to avoid clobbering the host page.
 */
export const HIGHLIGHT_ID = 'wp-highlight';
export const PANEL_ID = 'wp-panel';
export const FAB_ID = 'wp-fab';

export const STYLES = `
#${FAB_ID} {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: #2563eb; color: #fff; font-size: 18px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.25);
}
#${FAB_ID}:hover { background: #1d4ed8; }

#${PANEL_ID} {
  position: fixed; right: 16px; bottom: 72px; z-index: 2147483646;
  width: 320px; max-height: 70vh; overflow: auto;
  background: #fff; color: #111; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 12px;
  font: 13px/1.4 system-ui, sans-serif;
}
#${PANEL_ID} h1 { font-size: 14px; margin: 0 0 8px; }
#${PANEL_ID} button.wp-action {
  width: 100%; padding: 8px; margin-top: 8px; border-radius: 6px;
  border: none; background: #2563eb; color: #fff; cursor: pointer;
}
#${PANEL_ID} button.wp-secondary { background: #6b7280; }
#${PANEL_ID} textarea {
  width: 100%; min-height: 60px; margin-top: 8px; box-sizing: border-box;
  border: 1px solid #d1d5db; border-radius: 6px; padding: 6px; font: inherit;
}
#${PANEL_ID} .wp-summary {
  background: #f9fafb; border: 1px solid #eee; border-radius: 6px;
  padding: 8px; margin-top: 8px; font-family: ui-monospace, monospace; font-size: 12px;
  white-space: pre-wrap; word-break: break-all;
}
#${PANEL_ID} .wp-status { margin-top: 8px; font-size: 12px; }
#${PANEL_ID} .wp-status.ok { color: #16a34a; }
#${PANEL_ID} .wp-status.err { color: #dc2626; }

#${HIGHLIGHT_ID} {
  position: fixed; z-index: 2147483645; pointer-events: none;
  border: 2px solid #2563eb; background: rgba(37,99,235,.12);
  border-radius: 2px;
}
#${HIGHLIGHT_ID} .wp-sel-label {
  position: absolute; top: -20px; left: 0; background: #2563eb; color: #fff;
  font: 11px/1 ui-monospace, monospace; padding: 3px 5px; border-radius: 3px;
  white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis;
}
`;
