/**
 * Element capture + masking (the target-accuracy core).
 *
 * Two goals held in balance:
 *  - Security: never export a sensitive value (input values, emails, tokens...).
 *  - Target accuracy: keep the minimum clues an agent needs to find the element
 *    in a codebase (selector, ancestors, landmark, a short visible label).
 *
 * Pure functions over a DOM element so they unit-test under jsdom. No chrome.*
 * globals here; content.js is the adapter that calls these.
 */

const BULLET = '•'; // •
const MAX_LABEL = 60;
const MAX_SHAPE = 120;
const MAX_ANCESTORS = 4;

const ATTR_ALLOWLIST = ['id', 'class', 'role', 'aria-label', 'name'];

const SENSITIVE_NAME = /pass(word)?|secret|token|auth|cookie|email|otp|ssn|card|cvv|credit|api[-_]?key/i;
const LANDMARK_TAGS = new Set(['header', 'nav', 'main', 'aside', 'footer', 'section', 'form']);
const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'form']);
const FORM_CONTROLS = new Set(['input', 'textarea', 'select']);

/** Value shapes we must never surface even as a "label". */
const VALUE_LIKE = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
  /\d[\d\s-]{5,}\d/, // long digit runs (cards, phones)
  /[A-Za-z0-9_-]{20,}/, // token / hash / api key
];

function collapse(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function looksSensitive(text) {
  return VALUE_LIKE.some((re) => re.test(text));
}

/** Mask text to its length/word shape: chars → •, spaces kept. */
export function maskShape(text) {
  const s = collapse(text);
  if (!s) return '';
  const capped = s.slice(0, MAX_SHAPE);
  const masked = capped.replace(/\S/g, BULLET);
  return s.length > MAX_SHAPE ? masked + '…' : masked;
}

function classNameOf(el) {
  // SVG elements expose className as SVGAnimatedString
  const raw = typeof el.className === 'string' ? el.className : el.getAttribute('class') || '';
  const c = collapse(raw);
  return c || null;
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function buildSelector(el) {
  if (el.id) return `#${cssEscape(el.id)}`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < MAX_ANCESTORS) {
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    if (node.classList && node.classList.length) {
      part += '.' + Array.from(node.classList).slice(0, 2).map(cssEscape).join('.');
    } else {
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

export function collectAttributes(el) {
  const out = {};
  for (const name of ATTR_ALLOWLIST) {
    if (!el.hasAttribute(name)) continue;
    if (name === 'name' && SENSITIVE_NAME.test(el.getAttribute('name') || '')) continue;
    out[name === 'class' ? 'class' : name] = el.getAttribute(name);
  }
  return out;
}

export function summarizeAncestors(el) {
  const out = [];
  let node = el.parentElement;
  while (node && node.nodeType === 1 && node.tagName !== 'HTML' && out.length < MAX_ANCESTORS) {
    out.push({
      tagName: node.tagName.toLowerCase(),
      id: node.id || null,
      className: classNameOf(node),
      role: node.getAttribute('role'),
    });
    if (node.tagName === 'BODY') break;
    node = node.parentElement;
  }
  return out;
}

export function findLandmark(el) {
  let node = el;
  while (node && node.nodeType === 1 && node.tagName !== 'BODY') {
    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role');
    if (LANDMARK_TAGS.has(tag)) return tag;
    if (role && LANDMARK_ROLES.has(role)) return role;
    node = node.parentElement;
  }
  return null;
}

/** Derive a short, non-sensitive visible label, or null. */
function deriveVisibleLabel(el, rawText) {
  const tag = el.tagName.toLowerCase();
  if (FORM_CONTROLS.has(tag)) {
    // never use value/placeholder; prefer aria-label, then a non-sensitive name
    const aria = collapse(el.getAttribute('aria-label') || '');
    if (aria && !looksSensitive(aria)) return aria.slice(0, MAX_LABEL);
    const name = el.getAttribute('name');
    if (name && !SENSITIVE_NAME.test(name) && !looksSensitive(name)) return name.slice(0, MAX_LABEL);
    return null;
  }
  if (!rawText || looksSensitive(rawText)) return null;
  return rawText.slice(0, MAX_LABEL);
}

function rectOf(el) {
  const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
  return { x: r.x || 0, y: r.y || 0, width: r.width || 0, height: r.height || 0 };
}

export function maskOuterHTML(el) {
  const tag = el.tagName.toLowerCase();
  const attrs = collectAttributes(el);
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const inner = el.childNodes && el.childNodes.length ? '…' : '';
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

export function captureElement(el) {
  const rawText = FORM_CONTROLS.has(el.tagName.toLowerCase()) ? '' : collapse(el.textContent || '');
  return {
    selector: buildSelector(el),
    tagName: el.tagName.toLowerCase(),
    id: el.id || null,
    className: classNameOf(el),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    dataset: el.dataset ? Object.keys(el.dataset) : [],
    attributes: collectAttributes(el),
    ancestors: summarizeAncestors(el),
    rect: rectOf(el),
    maskedText: maskShape(rawText),
    maskedOuterHTML: maskOuterHTML(el),
    landmark: findLandmark(el),
    visibleLabel: deriveVisibleLabel(el, rawText),
  };
}

export function capturePayload(el, { userQuestion, win = typeof window !== 'undefined' ? window : undefined } = {}) {
  const doc = (win && win.document) || (typeof document !== 'undefined' ? document : undefined);
  return {
    url: (win && win.location && win.location.href) || '',
    title: (doc && doc.title) || '',
    viewport: {
      width: (win && win.innerWidth) || 0,
      height: (win && win.innerHeight) || 0,
    },
    element: captureElement(el),
    userQuestion: userQuestion || '',
    createdAt: new Date().toISOString(),
    source: 'chrome-extension',
  };
}
