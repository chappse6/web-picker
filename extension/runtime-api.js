/**
 * Pure Chrome runtime message handler.
 *
 * Content scripts may ask the service worker to call the daemon only when
 * Chrome reports that the message came from a localhost tab.
 */
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
