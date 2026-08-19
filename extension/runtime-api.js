/**
 * Pure Chrome runtime message handler.
 *
 * Content scripts may ask the service worker to call the daemon only when
 * Chrome reports that the message came from a localhost tab.
 */
const LOCATOR_KINDS = ['id', 'test-id', 'aria', 'landmark', 'css-path'];
const LOCATOR_CONFIDENCE = ['high', 'medium', 'low'];
const LOCATOR_REASONS = ['unique-candidate', 'no-unique-candidate'];

const ERROR_GUIDANCE = {
  'invalid-payload': '요소를 다시 선택해 요청을 작성해 주세요.',
  'forbidden-origin': '확장 프로그램을 새로고침하거나 다시 설치해 주세요.',
  'payload-too-large': '요청을 짧게 줄이거나 더 작은 요소를 다시 선택해 주세요.',
  'persistence-failed': '디스크 여유 공간과 웹픽커 저장 폴더 권한을 확인해 주세요.',
  'daemon-unavailable': '웹픽커 데몬을 시작하거나 도구 등록을 다시 실행해 주세요.',
};

export function runtimeErrorGuidance(code) {
  return {
    title: '요청을 보낼 수 없습니다',
    note: ERROR_GUIDANCE[code] || ERROR_GUIDANCE['daemon-unavailable'],
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isRect(value) {
  return isRecord(value)
    && ['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number');
}

function isAncestor(value) {
  return isRecord(value)
    && typeof value.tagName === 'string'
    && isNullableString(value.id)
    && isNullableString(value.className)
    && isNullableString(value.role);
}

function isLocatorEvidence(value) {
  return isRecord(value)
    && Array.isArray(value.candidates)
    && value.candidates.length <= 8
    && value.candidates.every((candidate) => isRecord(candidate)
      && LOCATOR_KINDS.includes(candidate.kind)
      && typeof candidate.value === 'string'
      && Number.isInteger(candidate.matchCount)
      && candidate.matchCount >= 0
      && Number.isInteger(candidate.stability)
      && candidate.stability >= 0
      && candidate.stability <= 100)
    && LOCATOR_CONFIDENCE.includes(value.confidence)
    && Array.isArray(value.reasons)
    && value.reasons.every((reason) => LOCATOR_REASONS.includes(reason));
}

function isCapturedElement(value) {
  return isRecord(value)
    && typeof value.selector === 'string'
    && value.selector.length > 0
    && typeof value.tagName === 'string'
    && isNullableString(value.id)
    && isNullableString(value.className)
    && isNullableString(value.role)
    && isNullableString(value.ariaLabel)
    && Array.isArray(value.dataset)
    && value.dataset.every((key) => typeof key === 'string')
    && isRecord(value.attributes)
    && Object.values(value.attributes).every((attribute) => typeof attribute === 'string')
    && Array.isArray(value.ancestors)
    && value.ancestors.every(isAncestor)
    && isRect(value.rect)
    && typeof value.maskedText === 'string'
    && typeof value.maskedOuterHTML === 'string'
    && isNullableString(value.landmark)
    && isNullableString(value.visibleLabel)
    && isLocatorEvidence(value.locatorEvidence);
}

function isCapturePayload(value) {
  return isRecord(value)
    && typeof value.url === 'string'
    && typeof value.title === 'string'
    && isRecord(value.viewport)
    && typeof value.viewport.width === 'number'
    && typeof value.viewport.height === 'number'
    && isCapturedElement(value.element)
    && typeof value.userQuestion === 'string'
    && value.userQuestion.length <= 2_000
    && typeof value.createdAt === 'string'
    && value.source === 'chrome-extension';
}

function validKnownMessage(message) {
  if (message?.type === 'web-picker:create-request') {
    return hasExactKeys(message, ['type', 'payload']) && isCapturePayload(message.payload);
  }
  if (message?.type === 'web-picker:get-status' || message?.type === 'web-picker:release') {
    return hasExactKeys(message, ['type']);
  }
  return true;
}

export async function handleRuntimeMessage(message, sender, deps) {
  let senderUrl;
  try {
    senderUrl = new URL(sender?.tab?.url || '');
  } catch {
    senderUrl = null;
  }

  const local = senderUrl
    && (senderUrl.hostname === 'localhost'
      || senderUrl.hostname === '127.0.0.1'
      || senderUrl.hostname.endsWith('.localhost'));
  if (!local) {
    return { ok: false, error: { code: 'forbidden-sender', status: 403 } };
  }

  if (!validKnownMessage(message)) {
    return { ok: false, error: { code: 'invalid-message', status: 400 } };
  }

  try {
    if (message?.type === 'web-picker:create-request') {
      return { ok: true, data: await deps.postRequest(message.payload) };
    }
    if (message?.type === 'web-picker:get-status') {
      return { ok: true, data: await deps.getStatus() };
    }
    if (message?.type === 'web-picker:release') {
      return { ok: true, data: await deps.release() };
    }
    return { ok: false, error: { code: 'unknown-message', status: 400 } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error?.code || 'daemon-unavailable',
        status: error?.status || 503,
      },
    };
  }
}
