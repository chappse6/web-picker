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
const LOCATOR_LIMIT = 8;

const ATTR_ALLOWLIST = ['id', 'class', 'role', 'aria-label', 'name'];
const SAFE_TEST_ATTRS = ['data-testid', 'data-cy'];

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

/** Replace email / phone / token shapes in free text with bullet masks. */
export function maskPiiInText(text) {
  let out = String(text || '');
  if (!out) return '';
  for (const re of VALUE_LIKE) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    out = out.replace(new RegExp(re.source, flags), (match) => maskShape(match));
  }
  return out;
}

function collapse(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function looksSensitive(text) {
  return VALUE_LIKE.some((re) => re.test(text));
}

function sanitizeAttributeValue(name, value) {
  const collapsed = collapse(value || '');
  if (!collapsed) return null;
  if (name === 'class') {
    const safeTokens = collapsed.split(' ').filter((token) => !looksSensitive(token));
    return safeTokens.join(' ') || null;
  }
  if (looksSensitive(collapsed)) return null;
  if (name === 'name' && SENSITIVE_NAME.test(collapsed)) return null;
  return collapsed;
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
  return sanitizeAttributeValue('class', raw);
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function buildSelector(el) {
  const elementId = sanitizeAttributeValue('id', el.getAttribute('id'));
  if (elementId) return `#${cssEscape(elementId)}`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < MAX_ANCESTORS) {
    const id = sanitizeAttributeValue('id', node.getAttribute('id'));
    if (id) {
      parts.unshift(`#${cssEscape(id)}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const className = classNameOf(node);
    if (className) {
      part += '.' + className.split(' ').slice(0, 2).map(cssEscape).join('.');
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
    const value = sanitizeAttributeValue(name, el.getAttribute(name));
    if (value) out[name] = value;
  }
  return out;
}

export function summarizeAncestors(el) {
  const out = [];
  let node = el.parentElement;
  while (node && node.nodeType === 1 && node.tagName !== 'HTML' && out.length < MAX_ANCESTORS) {
    out.push({
      tagName: node.tagName.toLowerCase(),
      id: sanitizeAttributeValue('id', node.getAttribute('id')),
      className: classNameOf(node),
      role: sanitizeAttributeValue('role', node.getAttribute('role')),
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

function addCandidate(out, root, kind, value, stability) {
  if (!value || looksSensitive(value) || out.some((item) => item.kind === kind && item.value === value)) return;
  let matchCount = 0;
  try {
    matchCount = root.querySelectorAll(value).length;
  } catch {
    return;
  }
  out.push({ kind, value, matchCount, stability });
}

/** Generate ranked, privacy-checked selectors for resolving an element later. */
export function generateLocatorEvidence(el) {
  const root = el.ownerDocument;
  const candidates = [];

  const id = sanitizeAttributeValue('id', el.getAttribute('id'));
  if (id) {
    addCandidate(candidates, root, 'id', `#${cssEscape(id)}`, 100);
  }
  for (const name of SAFE_TEST_ATTRS) {
    const value = sanitizeAttributeValue(name, el.getAttribute(name));
    if (value) addCandidate(candidates, root, 'test-id', `[${name}="${cssEscape(value)}"]`, 95);
  }
  const role = sanitizeAttributeValue('role', el.getAttribute('role'));
  const aria = sanitizeAttributeValue('aria-label', el.getAttribute('aria-label'));
  if (role && aria) {
    addCandidate(candidates, root, 'aria', `[role="${cssEscape(role)}"][aria-label="${cssEscape(aria)}"]`, 85);
  }
  const landmark = findLandmark(el);
  if (landmark) addCandidate(candidates, root, 'landmark', `${landmark} ${el.tagName.toLowerCase()}`, 65);
  addCandidate(candidates, root, 'css-path', buildSelector(el), 45);

  candidates.sort((a, b) => Number(a.matchCount !== 1) - Number(b.matchCount !== 1) || b.stability - a.stability);
  const ranked = candidates.slice(0, LOCATOR_LIMIT);
  const best = ranked[0];
  const confidence = best?.matchCount === 1 && best.stability >= 85 ? 'high' : best?.matchCount === 1 ? 'medium' : 'low';
  const reasons = best?.matchCount === 1 ? ['unique-candidate'] : ['no-unique-candidate'];

  return { candidates: ranked, confidence, reasons };
}

/** Derive a short, non-sensitive visible label, or null. */
function deriveVisibleLabel(el, rawText) {
  const tag = el.tagName.toLowerCase();
  if (FORM_CONTROLS.has(tag)) {
    // never use value/placeholder; prefer aria-label, then a non-sensitive name
    const aria = sanitizeAttributeValue('aria-label', el.getAttribute('aria-label'));
    if (aria) return aria.slice(0, MAX_LABEL);
    const name = sanitizeAttributeValue('name', el.getAttribute('name'));
    if (name) return name.slice(0, MAX_LABEL);
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
    id: sanitizeAttributeValue('id', el.getAttribute('id')),
    className: classNameOf(el),
    role: sanitizeAttributeValue('role', el.getAttribute('role')),
    ariaLabel: sanitizeAttributeValue('aria-label', el.getAttribute('aria-label')),
    dataset: el.dataset ? Object.keys(el.dataset).filter((key) => !SENSITIVE_NAME.test(key)) : [],
    attributes: collectAttributes(el),
    ancestors: summarizeAncestors(el),
    rect: rectOf(el),
    maskedText: maskShape(rawText),
    maskedOuterHTML: maskOuterHTML(el),
    landmark: findLandmark(el),
    visibleLabel: deriveVisibleLabel(el, rawText),
    locatorEvidence: generateLocatorEvidence(el),
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
