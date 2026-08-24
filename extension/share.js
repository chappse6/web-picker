/**
 * Offline / non-MCP share path: format a masked prompt and copy it.
 * Pure helpers so the clipboard fallback unit-tests without chrome.*.
 */
import { maskPiiInText } from './capture.js';

export function isMcpMode(state) {
  return Boolean(state?.agentLive);
}

export function submitLabel(mcpMode) {
  return mcpMode ? '보내기' : '복사';
}

export function safePageUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

export function formatClipboardPrompt(payload) {
  const el = payload?.element || {};
  const evidence = el.locatorEvidence || {};
  const candidates = Array.isArray(evidence.candidates) ? evidence.candidates : [];
  const lines = [
    '웹 화면 요소 수정 요청입니다. 아래 위치 증거를 보고 코드를 고쳐 주세요.',
    '',
    `요청: ${maskPiiInText(payload?.userQuestion || '')}`,
    `페이지: ${safePageUrl(payload?.url)}`,
    '',
    '대상 요소:',
    `  selector: ${el.selector || '(none)'}`,
    `  tag: ${el.tagName || '(none)'}`,
    `  id: ${el.id ?? '(none)'}`,
    `  class: ${el.className ?? '(none)'}`,
    `  visibleLabel: ${el.visibleLabel ?? '(none)'}`,
    `  landmark: ${el.landmark ?? '(none)'}`,
    `  maskedText: ${el.maskedText || ''}`,
    `  maskedOuterHTML: ${el.maskedOuterHTML || ''}`,
    '',
    'locator evidence:',
    `  confidence: ${evidence.confidence || 'low'}`,
    ...candidates.map((candidate, index) =>
      `  ${index + 1}. ${candidate.kind} ${candidate.value} — ${candidate.matchCount} ${candidate.matchCount === 1 ? 'match' : 'matches'}`,
    ),
    '',
    'masking: text-shaped, values-removed',
  ];
  return lines.join('\n');
}

function fallbackCopy(text, doc) {
  if (!doc?.body) return false;
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  doc.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = Boolean(doc.execCommand?.('copy'));
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export async function copyText(text, opts = {}) {
  const clipboard = opts.clipboard ?? globalThis.navigator?.clipboard;
  const doc = opts.document ?? globalThis.document;
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  return fallbackCopy(text, doc);
}
