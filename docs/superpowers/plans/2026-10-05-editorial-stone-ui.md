# Editorial Stone UI Implementation Plan

**Goal:** Implement the selected warm Editorial Modern homepage and matching PDF workspace, verify the complete app, and deploy through the repository's existing production workflow.

**Architecture:** Root owns implementation and integration in an isolated worktree. Change presentational React components, CSS and bundled font assets; keep PdfEngine, the workspace model and processing/recovery behavior intact. Use read-only specialists for test constraints and frozen-target review.

**Tech stack:** React 19, TypeScript, Vite, plain CSS, locally bundled WOFF2 fonts; Node.js 24; Vitest and Playwright Chromium.

**Spec:** [Approved direction](../specs/2026-10-05-editorial-stone-ui-design.md).

## Constraints and review focus

- Preserve all document processing locally, original source bytes, accessible labels, explicit non-drag controls and original mascot assets.
- Preserve lazy PDF engine loading, request privacy guards, password and recovery assertions. No dependency or hosting configuration changes are needed.
- Check file picking and formats above the fold on small screens, long filenames, focus near sticky controls, preview/password errors, and recovery restore/clear states.
- Review source against an exact commit and inspect real desktop/mobile renders. Passing screenshots alone cannot prove editing or export behavior.

## Task 1: Prove the new homepage requirements

Files: `e2e/design.spec.ts`; existing `e2e/workspace.spec.ts` and startup/privacy tests remain unchanged.

- [x] Add browser coverage for desktop split layout, keyboard file-picker activation, responsive initial CTA/formats, same-origin font loading and long-filename workspace controls.
- [x] Run the new desktop test against the baseline build and confirm failure for the missing selected homepage.
- [x] Install locked dependencies with Node 24 and run baseline unit tests.

## Task 2: Implement the complete visual system

Files: `src/brand/brand.css`, `src/index.css`, `src/app/App.tsx`, `src/workspace/WelcomePanel.tsx`, `src/workspace/WorkspaceScreen.tsx`, `src/workspace/Capabilities.tsx`, `src/workspace/PageCard.tsx`, `src/workspace/SavePanel.tsx`, `src/brand/BrandBanner.tsx`, `src/components/Icon.tsx`, `src/assets/fonts/*`, `index.html`.

- [x] Bundle licensed DM Serif Display and DM Sans WOFF2 assets and retain license/source information.
- [x] Implement the selected warm split homepage, three numbered steps and compact brand footer using original artwork.
- [x] Restyle the active workspace, page cards, save controls, preview, password dialogs, progress, notices and recovery.
- [x] Preserve names/semantics and all processing handlers. Retain mobile four-row toolbar and explicit controls; avoid changing deletion/storage logic.
- [x] Run new design coverage, then required unit/build/browser/hosting suites against the same source revision.

## Task 3: Review rendered usability and freeze the delivery

Files: README and design/plan acceptance records; product files only if review finds a required fix.

- [x] Inspect actual desktop, tablet, mobile and zoomed renders; execute file picking, selection, preview and export.
- [x] Obtain independent frozen-commit source review and a usability review, disclosing prior design-advice involvement and browser limitations.
- [x] Resolve material issues, rerun affected checks, and update documentation to the current decision while preserving history.
- [x] Commit the reviewed implementation and create/attach a scoped PR with concrete validation evidence.

## Task 4: Deploy and verify production

- [ ] Confirm PR checks/review and merge the approved delivery scope.
- [ ] Observe Verify and Deploy production for the exact merged commit; do not bypass environment gates or create credentials.
- [ ] Verify live production with the synthetic Chromium/hosting suite and a rendered homepage inspection.
- [ ] Record actual evidence, PR/production links and limitations. Mark the goal complete only after successful deployment and live verification.

## Execution record

- Native managed worktree created from clean `e065450`; branch `codex/editorial-stone-ui`.
- User authorization covers writing the plan, implementation and deployment; no additional design-approval pause is needed.
- Node 24.21.0 via `volta run --node 24`; locked clean install and baseline unit suite passed (72 tests). The new homepage test failed on the old heading before implementation, then all seven design tests passed.
- Ruling: use an ignored local Playwright configuration on port 4183 because port 4173 belongs to another project's live development server. Test assertions and CI's canonical configuration are unchanged.
- Ruling: validate every thumbnail and page-number badge after bringing its page into view. The four-column grid changes viewport coverage; the existing scheduler still defers off-screen thumbnails. Every requested page remains checked for real blob-image decoding and unobscured numbering.
- Initial full suites exposed preview space below the original >500px render assertion. Compacting the preview header restored document space; all three affected Chromium cases then passed without lowering the render threshold or changing privacy assertions.
- Commit `d9268a1` passed 72 unit, 43 Chromium browser and 44 local Cloudflare-hosting tests. Desktop, tablet, 390/320px, preview, password and focus captures were inspected as actual renders, not interaction proof.
- Independent source review of `e065450..d9268a1` found one P2: recovery clearing and checkbox labels missed the 42px mobile target. A new enabled-recovery browser test reproduced the 20.796875px label, then passed after both target styles were raised to 44px. The fix changes hit areas only; clear/storage handlers remain unchanged.
- Commit `7d69667` passed 72 unit, 44 Chromium browser and 45 local Cloudflare-hosting tests after the target fix.
- Main advanced to `1df3bbf` (PR #18) during implementation. Merge its existing document-finishing features into this branch; retain crop-aware thumbnail rotation, output settings/preview, compression results, guarded shortcuts, translated labels and language preference. Incoming dependency/lockfile changes are retained unchanged. New editorial copy is translated and finishing surfaces use the warm tokens. A second clean Node 24 install passed after stopping this worktree's preview process, which had locked esbuild on Windows.
- Integrated `3a8999f` passed 195 unit, production build, 53 Chromium browser and 54 local Cloudflare-hosting tests. Main's engine/domain/recovery code is unchanged. Source review confirmed integration fidelity and found a footer label-in-name mismatch; accessible labels now include the visible English/Thai wording and the new-tab notice. The shortcut disclosure measured 38px in a failing test, then passed at 44px with actual open/close interaction coverage.
- Render review additionally found clipping of English in the mobile language picker and Latin tracking/font overrides in Thai headings/branding. The picker has more room, Thai eyebrows use normal spacing and the Latin QH PDF wordmark retains DM Serif. Current captures wait for the enabled primary CTA's color transition to finish. All review fixes are presentational.
- Final product commit `354fd19b53e9be9e30ef9f4fcd42d1dad39f5136` passed 195 unit tests, TypeScript/Vite production build, 53 Chromium browser workflows and 54 local Cloudflare-hosting workflows on Node 24.21.0. Fixtures cover synthetic PDF/PNG/JPEG/WebP and encrypted PDFs, crop/decorations/compression, export/retry/cancellation, recovery and static-request guards. Canonical CI configuration and privacy assertions remain intact.
- Source verdict PASS: reviewer had no maker involvement, inherited their earlier source-review context, shared filesystem/process state, and did not run interactions or edit files. Engine/domain/recovery and finishing logic match `1df3bbf`.
- Render/usability verdict PASS: reviewer previously advised on the visual direction and inherited that context, but did not implement or edit. Reviewed actual Chromium renders at 1440/768/390/320, English/Thai, page/crop/export previews, passwords and focus. Interaction evidence comes from executed suites and Root's local BrowserOS selection/preview/export check, not screenshots alone.
- Local acceptance is PASS for the documented scope. Safari/Firefox, screen readers, physical touch devices, native browser zoom and dark/high-contrast modes are not certified; the zoom check uses CSS content zoom. Deployment and live acceptance remain pending below.
- [PR #19](https://github.com/Lukespacewalker/qh-pdf/pull/19) is attached to the task. Its first Verify run failed one incoming compression test: separate Off and Lossless exports differed by one byte. Fresh PDF metadata timestamps are independently compressed; a source investigation reproduced 575/576 bytes for identical content with different seconds. The production adapter already prevents growth against its own input. The test now observes input length before native worker transfer and asserts exact non-growth for every compressed level against that same job. Image-reduction ratios, content/geometry/password checks and privacy guards remain unchanged. The affected real workflow passed three repeats; CI will verify the final revision.
