// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createPicker } from '../../extension/pick.js';

beforeEach(() => {
  document.body.innerHTML = `<button id="b">click me</button><div id="d">other</div>`;
});

describe('createPicker', () => {
  it('selects the clicked element and prevents the default click', () => {
    let picked: Element | null = null;
    const picker = createPicker(document, { onPick: (el) => { picked = el; } });
    picker.start();
    const btn = document.getElementById('b')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(picked).toBe(btn);
    expect(ev.defaultPrevented).toBe(true);
    expect(picker.isActive()).toBe(false);
  });

  it('reports hovered elements while active', () => {
    const hovered: Element[] = [];
    const picker = createPicker(document, { onPick() {}, onHover: (el) => hovered.push(el) });
    picker.start();
    const d = document.getElementById('d')!;
    d.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(hovered.at(-1)).toBe(d);
    picker.stop();
  });

  it('cancels on Escape', () => {
    let cancelled = false;
    const picker = createPicker(document, { onPick() {}, onCancel: () => { cancelled = true; } });
    picker.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toBe(true);
    expect(picker.isActive()).toBe(false);
  });

  it('does not pick when inactive', () => {
    let picked = false;
    const picker = createPicker(document, { onPick: () => { picked = true; } });
    picker.start();
    picker.stop();
    document.getElementById('b')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(picked).toBe(false);
  });

  it('does not consume clicks on ignored overlay chrome', () => {
    document.body.innerHTML += '<button id="wp-fab">webpicker</button>';
    let picked: Element | null = null;
    const picker = createPicker(document, {
      onPick: (el) => { picked = el; },
      ignore: (el) => (el as Element).id === 'wp-fab' || Boolean((el as Element).closest?.('#wp-fab')),
    });
    picker.start();
    const chrome = document.getElementById('wp-fab')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    chrome.dispatchEvent(ev);
    expect(picked).toBeNull();
    expect(ev.defaultPrevented).toBe(false);
    expect(picker.isActive()).toBe(true);
    picker.stop();
  });
});
