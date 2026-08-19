/** Exact daemon status/code pairs safe to expose to a content script. */
const PUBLIC_ERROR_STATUS = new Map([
  ['invalid-payload', 400],
  ['forbidden-origin', 403],
  ['payload-too-large', 413],
  ['persistence-failed', 507],
  ['daemon-unavailable', 503],
]);

const DAEMON_UNAVAILABLE = Object.freeze({
  status: 503,
  code: 'daemon-unavailable',
});

export function normalizePublicError(status, code) {
  if (PUBLIC_ERROR_STATUS.get(code) === status) return { status, code };
  return DAEMON_UNAVAILABLE;
}
