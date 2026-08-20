// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { captureElement, capturePayload, generateLocatorEvidence, maskShape } from '../../extension/capture.js';

function setDom() {
  document.body.innerHTML = `
    <header><nav aria-label="primary"><a href="/">home</a></nav></header>
    <main>
      <form>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="secret@user.com">
        <input id="pw" name="password" type="password" value="hunter2">
        <button id="save-btn" class="btn primary" data-action="persist" data-track-id="42">저장하기</button>
      </form>
      <section aria-label="cards">
        <a id="more" href="/x" class="card-link">자세히 보기</a>
      </section>
    </main>`;
}

beforeEach(setDom);

describe('maskShape', () => {
  it('preserves length and word breaks but hides characters', () => {
    expect(maskShape('저장하기')).toBe('••••');
    expect(maskShape('hi there')).toBe('•• •••••');
    expect(maskShape('')).toBe('');
  });
});

describe('captureElement — identity preservation', () => {
  it('ranks a unique safe id first and reports high confidence', () => {
    document.body.innerHTML = '<main><button id="profile-save">저장</button><button>저장</button></main>';
    const target = document.getElementById('profile-save')!;

    expect(generateLocatorEvidence(target)).toEqual(expect.objectContaining({
      confidence: 'high',
      candidates: expect.arrayContaining([
        expect.objectContaining({ kind: 'id', value: '#profile-save', matchCount: 1, stability: 100 }),
      ]),
    }));
    expect(captureElement(target).locatorEvidence.candidates.length).toBeGreaterThan(0);
  });

  it('keeps only sensitivity-checked data-testid and data-cy values', () => {
    document.body.innerHTML = '<button data-testid="save-button" data-cy="token_abcdefghijklmnopqrstuvwxyz" data-user-id="42">저장</button>';

    const json = JSON.stringify(generateLocatorEvidence(document.querySelector('button')!));
    expect(json).toContain('save-button');
    expect(json).not.toContain('token_abcdefghijklmnopqrstuvwxyz');
    expect(json).not.toContain('42');
  });

  it('preserves a short visible label for a button', () => {
    const el = document.getElementById('save-btn')!;
    const cap = captureElement(el);
    expect(cap.visibleLabel).toBe('저장하기');
    expect(cap.tagName).toBe('button');
    expect(cap.selector).toBe('#save-btn');
  });

  it('masks the button text into shape (no readable content in maskedText)', () => {
    const cap = captureElement(document.getElementById('save-btn')!);
    expect(cap.maskedText).toBe('••••');
  });

  it('exports dataset keys only, never values', () => {
    const cap = captureElement(document.getElementById('save-btn')!);
    expect(cap.dataset.sort()).toEqual(['action', 'trackId']);
    expect(JSON.stringify(cap)).not.toContain('persist');
    expect(JSON.stringify(cap)).not.toContain('42');
  });

  it('allowlists attributes (id/class/role/aria-label/name)', () => {
    const cap = captureElement(document.getElementById('more')!);
    expect(cap.attributes.class).toBe('card-link');
    expect(cap.attributes.id).toBe('more');
    // href is not allowlisted
    expect(cap.attributes).not.toHaveProperty('href');
  });

  it('detects the nearest landmark', () => {
    expect(captureElement(document.getElementById('save-btn')!).landmark).toBe('form');
    expect(captureElement(document.getElementById('more')!).landmark).toBe('section');
  });

  it('summarizes ancestors up the tree', () => {
    const cap = captureElement(document.getElementById('save-btn')!);
    const tags = cap.ancestors.map((a) => a.tagName);
    expect(tags).toContain('form');
    expect(tags).toContain('main');
  });
});

describe('captureElement — sensitive value protection', () => {
  it('never leaks an email input value anywhere', () => {
    const cap = captureElement(document.getElementById('email')!);
    expect(JSON.stringify(cap)).not.toContain('secret@user.com');
  });

  it('never leaks a password input value anywhere', () => {
    const cap = captureElement(document.getElementById('pw')!);
    expect(JSON.stringify(cap)).not.toContain('hunter2');
  });

  it('excludes a sensitive name attribute (email/password) but keeps id', () => {
    const email = captureElement(document.getElementById('email')!);
    expect(email.attributes).not.toHaveProperty('name');
    expect(email.attributes.id).toBe('email');
    const pw = captureElement(document.getElementById('pw')!);
    expect(pw.attributes).not.toHaveProperty('name');
  });

  it('does not set a visibleLabel for form inputs (no readable value)', () => {
    const cap = captureElement(document.getElementById('email')!);
    expect(cap.visibleLabel).toBe(null);
  });

  it('removes a token-shaped id from every exported field while retaining safe class identity', () => {
    const secretId = 'token_abcdefghijklmnopqrstuvwxyz';
    document.body.innerHTML = `<main><button id="${secretId}" class="btn primary">저장</button></main>`;

    const cap = captureElement(document.querySelector('button')!);
    const json = JSON.stringify(cap);

    expect(json).not.toContain(secretId);
    expect(cap.id).toBe(null);
    expect(cap.attributes).not.toHaveProperty('id');
    expect(cap.selector).toContain('button.btn.primary');
    expect(cap.locatorEvidence.candidates.some((candidate) => candidate.matchCount === 1)).toBe(true);
  });

  it('removes card-shaped class tokens from the target and its ancestor while retaining safe classes', () => {
    const targetSecret = 'card-4111-1111-1111-1111';
    const ancestorSecret = 'account-5555-5555-5555-4444';
    document.body.innerHTML = `
      <section class="profile ${ancestorSecret}">
        <button class="btn ${targetSecret}">저장</button>
      </section>`;

    const cap = captureElement(document.querySelector('button')!);
    const json = JSON.stringify(cap);

    expect(json).not.toContain(targetSecret);
    expect(json).not.toContain(ancestorSecret);
    expect(cap.className).toBe('btn');
    expect(cap.attributes.class).toBe('btn');
    expect(cap.ancestors[0]?.className).toBe('profile');
  });

  it('removes an email aria-label from top-level fields, attributes, labels, and masked HTML', () => {
    const email = 'owner@example.com';
    document.body.innerHTML = `<button class="contact" role="button" aria-label="${email}">연락</button>`;

    const cap = captureElement(document.querySelector('button')!);

    expect(JSON.stringify(cap)).not.toContain(email);
    expect(cap.ariaLabel).toBe(null);
    expect(cap.attributes).not.toHaveProperty('aria-label');
    expect(cap.visibleLabel).toBe('연락');
  });

  it('removes other token-shaped allowlisted attribute values without dropping safe attributes', () => {
    const secretRole = 'auth_token_abcdefghijklmnopqrstuvwxyz';
    document.body.innerHTML = `<button id="safe-button" class="action" role="${secretRole}">저장</button>`;

    const cap = captureElement(document.querySelector('button')!);

    expect(JSON.stringify(cap)).not.toContain(secretRole);
    expect(cap.role).toBe(null);
    expect(cap.attributes).not.toHaveProperty('role');
    expect(cap.id).toBe('safe-button');
    expect(cap.className).toBe('action');
  });
});

describe('decoy disambiguation (the moat)', () => {
  it('distinguishes three same-label buttons by landmark, not label', () => {
    document.body.innerHTML = `
      <header><button id="h" class="btn">저장</button></header>
      <main><button id="m" class="btn">저장</button></main>
      <footer><button id="f" class="btn">저장</button></footer>`;
    const h = captureElement(document.getElementById('h')!);
    const m = captureElement(document.getElementById('m')!);
    const f = captureElement(document.getElementById('f')!);

    // same visible label — a naive matcher cannot tell them apart
    expect([h, m, f].map((c) => c.visibleLabel)).toEqual(['저장', '저장', '저장']);
    // but landmark + selector uniquely identify each
    expect(h.landmark).toBe('header');
    expect(m.landmark).toBe('main');
    expect(f.landmark).toBe('footer');
    expect(new Set([h.selector, m.selector, f.selector]).size).toBe(3);
  });
});

describe('capturePayload', () => {
  it('assembles a full payload with the user question and source', () => {
    const el = document.getElementById('save-btn')!;
    const payload = capturePayload(el, { userQuestion: 'make it blue' });
    expect(payload.userQuestion).toBe('make it blue');
    expect(payload.source).toBe('chrome-extension');
    expect(payload.element.selector).toBe('#save-btn');
    expect(typeof payload.url).toBe('string');
    expect(typeof payload.createdAt).toBe('string');
    expect(JSON.stringify(payload)).not.toContain('secret@user.com');
  });
});
