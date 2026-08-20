# 2026 Open Source Developer Contest submission checklist

Official evidence: [contest overview and report template](https://osscontest.kr/overview), [result-report template ZIP](https://api.osscontest.kr/static/uploads/46414fba-c473-4dae-b595-7214d635b494.zip), and [submission notice 39 API](https://api.osscontest.kr/api/v1/notice/39). Deadline: **2026-08-27 18:00 KST**.

## Local package

- [x] Official template retained and SHA-256 recorded.
- [x] Guide page removed from final report.
- [x] Result-report body remains within five pages.
- [x] Mandatory complete SBOM attachment included in report.
- [x] AI-model attachment removed because Web Picker embeds/applies no model.
- [x] Development-assistant use disclosed without representing it as product model integration.
- [x] Matching DOCX and PDF created from same report.
- [x] CycloneDX 1.5 JSON generated at `artifacts/sbom.cdx.json`.
- [x] Human-readable locked dependency/license inventory generated at `docs/dependencies.md`.
- [x] Architecture, security boundaries, limitations, and reproduction commands documented.
- [x] Three-minute timed video script prepared.

## Reproduction evidence

- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:e2e`
- [x] `npm run benchmark` twice with byte-identical JSON
- [x] `npm run sbom` and CycloneDX metadata/component validation
- [x] `npm audit --omit=dev` reports 0 known production vulnerabilities.
- [ ] Development-only Vitest 2/Vite/esbuild advisories resolved. **Deferred:** compatible update unavailable; only breaking Vitest 4 upgrade offered. Not part of shipped runtime.

## Submission identity and URLs - blocking

- [ ] Confirm team count against contest registration.
- [ ] Confirm student/general division against contest registration.
- [ ] Confirm free/designated task type against contest registration.
- [ ] Public repository URL resolves. **Blocked:** this checkout has no configured Git remote; publication is an external action requiring owner authorization.
- [ ] YouTube demo URL resolves and video length is at most three minutes. **Blocked:** no final recording/upload exists; upload is an external action requiring owner-provided media and authorization.
- [ ] Replace repository/video placeholders in DOCX and regenerate matching PDF after URLs resolve.

## Final upload

- [ ] Rename using official pattern: `2026 오픈소스 개발자대회 결과보고서_접수번호(팀명)` after receipt number is known.
- [ ] Put original DOCX and matching PDF into one ZIP.
- [ ] Add duplicate-benefit confirmation only if applicable.
- [ ] Verify both files open, body has at most five pages, SBOM attachment is present, and URL fields resolve.
- [ ] Upload through `osscontest.kr` before deadline.

Submission is **not complete** while any blocking URL or registration field above remains unchecked.
