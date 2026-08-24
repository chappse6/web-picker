// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { capturePayload } from '../../extension/capture.js';
import {
  copyText,
  formatClipboardPrompt,
  isMcpMode,
  safePageUrl,
  submitLabel,
} from '../../extension/share.js';

describe('share mode', () => {
  it('treats an active MCP session as MCP mode', () => {
    expect(isMcpMode({ agentLive: true })).toBe(true);
    expect(isMcpMode({ agentLive: false })).toBe(false);
    expect(isMcpMode({})).toBe(false);
    expect(submitLabel(true)).toBe('보내기');
    expect(submitLabel(false)).toBe('복사');
  });

  it('drops query strings and hashes from page URLs', () => {
    expect(safePageUrl('http://localhost:3000/profile?token=abc&email=a@b.com#secret'))
      .toBe('http://localhost:3000/profile');
    expect(safePageUrl('not a url')).toBe('');
  });
});

describe('clipboard prompt', () => {
  it('formats a masked prompt and never leaks personal values', () => {
    document.body.innerHTML = `
      <main>
        <button id="profile-save" class="btn">저장하기</button>
        <p id="email">owner@example.com</p>
      </main>`;
    const payload = capturePayload(document.getElementById('email')!, {
      userQuestion: '이 이메일 owner@example.com 과 전화 010-1234-5678 을 숨기고 정렬을 고쳐 주세요',
      win: {
        location: { href: 'http://localhost:3000/account?session=tok_abcdefghijklmnopqrstuvwxyz' },
        document: { title: 'Account' },
        innerWidth: 800,
        innerHeight: 600,
      },
    });

    const text = formatClipboardPrompt(payload);

    expect(text).toContain('요청:');
    expect(text).toContain('selector:');
    expect(text).toContain('maskedText:');
    expect(text).toContain('masking: text-shaped, values-removed');
    expect(text).toContain('http://localhost:3000/account');
    expect(text).not.toContain('owner@example.com');
    expect(text).not.toContain('010-1234-5678');
    expect(text).not.toContain('tok_abcdefghijklmnopqrstuvwxyz');
    expect(text).not.toContain('session=');
  });
});

describe('copyText', () => {
  it('writes through the clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText('hello', { clipboard: { writeText } })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the clipboard API is missing', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    await expect(copyText('fallback', { clipboard: {} })).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
