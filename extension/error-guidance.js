/** Static, content-safe guidance for public daemon error codes. */
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
