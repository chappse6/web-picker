// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { captureElement, capturePayload, maskShape } from '../../extension/capture.js';

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
