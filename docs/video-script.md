# Three-minute submission video script

Hard limit: 3:00. Record at 1080p with browser, terminal, and editor text large enough to read. Do not show home-directory tokens or captured sensitive values.

## 0:00-0:20 - Problem and value

**Picture:** Demo page with three identical `저장` buttons, then Web Picker badge.

**Narration:** “UI 수정 요청은 ‘그 저장 버튼’이라는 말만으로 대상을 잃기 쉽습니다. Web Picker는 localhost 화면에서 요소를 직접 고르고, 개인정보를 줄인 위치 증거와 요청을 기존 MCP 코딩 에이전트에 넘기는 로컬 오픈소스 도구입니다.”

## 0:20-0:55 - Pick the decoy target

**Picture:** Click the `webpicker` chip; hover header, profile card, footer buttons; choose profile-card button; enter `이 버튼을 파란색으로`. The chip keeps the brand, a green/red connection dot, and a queued-count badge.

**Narration:** “세 버튼의 보이는 문구는 모두 같습니다. 프로필 카드 안 버튼을 고르면 콘텐츠 스크립트가 실제 렌더링 DOM에서 필요한 문맥만 수집합니다.”

## 0:55-1:20 - Masking and locator confidence

**Picture:** Show captured detail: masked text/value policy, `#profile-save`, match count 1, high confidence, landmark.

**Narration:** “입력값, 이메일, 토큰 모양 문자열은 보내지 않습니다. 안전한 ID, test ID, ARIA, landmark, 구조 경로를 순위화하고 실제 match count를 기록합니다. 이 대상은 고유 ID로 high confidence입니다.”

## 1:20-1:55 - MCP pull and source change

**Picture:** Agent calls `connect_web_picker`, `list_web_requests`, and `get_web_request`; editor opens the matching demo source and changes button color.

**Narration:** “MCP stdio adapter가 로컬 daemon을 시작하거나 재사용합니다. 에이전트는 토큰 인증 IPC로 요청을 가져오고, locator 근거를 확인한 뒤 저장소 코드를 수정합니다. Web Picker 자체는 모델을 호출하거나 코드를 자동 변경하지 않습니다.”

## 1:55-2:15 - Refresh and result

**Picture:** Refresh page; show blue profile button; call `resolve_web_request`.

**Narration:** “새로고침하면 선택한 프로필 버튼만 바뀝니다. 완료 요청은 resolve 처리되어 여러 에이전트 세션 사이에서도 상태가 분명합니다.”

## 2:15-2:35 - Daemon restart recovery

**Picture:** Submit another request, stop/restart daemon or adapter, reconnect, list recovered pending request.

**Narration:** “큐는 mode 0600 파일에 flush 후 원자적 rename으로 저장됩니다. daemon을 재시작해도 미완료 요청은 남고, 이전 세션 소유권은 제거되어 다시 처리할 수 있습니다.”

## 2:35-3:00 - Evidence and close

**Picture:** Benchmark summary, `npm test`, SBOM/dependency docs, MIT license; end card with verified public repository URL after publication.

**Narration:** “30개 고정 fixture에서 text-only 50%, Web Picker locator 80%, 모호한 label 구간은 0% 대 86.67%였습니다. daemon은 127.0.0.1과 고정 extension origin, IPC token을 사용합니다. MIT 라이선스와 CycloneDX SBOM을 제공합니다. 공개 저장소 주소는 제출 전 최종 화면에 삽입합니다.”

## Recording blockers

- Public repository URL: **unresolved - repository has no configured remote; publish only with owner authorization.**
- YouTube URL: **unresolved - record, upload, and verify after final build; do not invent a URL.**
