# Document finishing implementation plan

Goal: deliver the authorized five feature groups and retain a concrete deferred cross-browser test plan.

Spec: [document-finishing-design](../specs/2026-09-22-document-finishing-design.md). Base: `e065450f77a7e1578d3ab33222f46dc34ac0c44b`. Integration branch: `codex/document-finishing`.

Root owns integration, crop, UI composition, acceptance and this one current execution record. Sol high handles bounded export-decoration/compression/localization assignments when useful; workers do not delegate. Concurrent writers use isolated worktrees and declared file ownership. Reuse existing project patterns and existing valid verification. The user has authorized continued implementation; the extra approval menus/model-tier rules/per-task ceremony in skill templates do not override project workflow preferences.

## Interfaces and sequence

- [ ] 1. Establish design, contracts and isolated worktree. Define `CropMargins`, export numbering sections/style/watermark/compression types in domain modules; keep UI dependent on PdfEngine. Baseline Node 24 install/unit tests.
- [ ] 2. Numbering/watermark engine: pure validation/formatting plus `decoratePdf(output, settings, outputIndices?)` in an engine-only module. A delegated writer owns new domain export-options/numbering and decoration files, tests, font assets/license and fontkit dependency only. Root wires assembly/protocol/UI after the commit. Tests: decimal/Roman/Latin/Thai boundaries, overlapping/out-of-range sections, actual extracted output text and rotated/cropped page positions. Real font rendered visibly.
- [ ] 3. Root crop: optional normalized margins, validation and rotation mapping; store actions/history; validated recovery serialization; crop-aware thumbnail/full preview/export; focused crop dialog with numeric controls and overlay. Test zero/all rotations, nonzero CropBox/MediaBox origin, mixed sizes, duplicate independence, undo, selected output, legacy and malformed recovery.
- [ ] 4. Compression probe/implementation: delegated isolated engine modules with standalone tests, no editing security adapter. Verify pinned pdfstudio/QPDF API and actual image optimization. Agree exact exported function `compressPdf(bytes, level, signal?)`; Root wires compression phase before password protection. Test text/geometry preservation, meaningful image fixture, already optimized input, cancellation/failure and smaller-output choice.
- [ ] 5. Save composition: collapsible numbering (simple/sections), watermark and compression controls; explicit all/selected target for real output preview, grouped validation, cloned export settings and visible actual final size. Preview must share assembly and font path; no stale downloads or URL/task leaks. Keep save actions and password handling readable at desktop and 390 px.
- [ ] 6. Thai UI/shortcuts: scoped translation dictionary/hook, persisted language preference, translated components/errors/labels; keyboard hook with locked/editable/modal/composition guards and localized help. Root integrates after shared component contracts stabilize. Tests for native input undo/select/save, modal focus, deletion+undo, disabled states and language persistence.
- [ ] 7. Verify all features together with synthetic exported files, Chromium interactions, visual renders, privacy and startup boundary checks. Run npm test/build/test:browser/test:hosting on final code. Review exact commit+delta independently (required crop/recovery/deletion gate), fix findings, update current docs/roadmap, create scoped PR and wait for CI. Merge/deploy is separate.

## Shared boundaries checked before execution

| Tasks | Shared boundary | Decision |
| --- | --- | --- |
| 2, 3, 5 | PdfExportProtocol/assemblePdf | Root integrates only; worker supplies standalone decorator consuming actual final CropBox/rotation |
| 3, 6 | PageCard/Preview/WorkspaceScreen | Localization starts after crop/UI composition lands; no concurrent shared-file writers |
| 4, 5 | BrowserPdfEngine/export progress | Worker supplies standalone compression runner; Root owns phase and UI integration |
| 2, 6 | Thai font vs UI translation | Font assets belong to export engine; translation is separate; no remote runtime fonts |
| 1–7 | Privacy/bytes/recovery/tests | Original source copies preserved; new invalid fields fail explicitly; final review includes malformed recovery and keyboard safeguards |

## Deferred cross-browser/device plan

Do not install or execute Firefox/WebKit now. After explicit resumption, add separate Playwright Firefox and WebKit projects against the same build. Start with core import/edit/preview/save all/save selected/password/recovery/cancel/privacy scenarios, then run applicable regression suites. Browser-specific failed dynamic-import cache behavior is tested according to observed behavior rather than assuming Chromium's request count.

Test actual Firefox Stable on Windows and Safari on macOS separately from patched automation engines. Physical iPhone Safari and Android Chrome use the same cleared synthetic fixture pack: PDF, images, rotated/cropped pages, numbered sections, Thai text, watermarks, compression levels, protected PDF, cancellation and recovery. Import from device Files, save and reopen the actual file, inspect portrait/landscape/touch focus, background/resume and increasing document sizes. Android debugging can use USB/ADB; iOS remote inspection requires an available Mac. Record device/OS/browser/build/fixture/results and memory/file-size observations. Physical-device evidence cannot be substituted by Chromium mobile emulation or desktop WebKit. No procurement/account action is authorized by this plan.

## Execution record

- User approved Save-time numbering, independent contiguous non-overlapping sections, decimal/Roman/Latin/Thai systems with alphabet rollover, shared styling and bundled Noto Sans Thai Looped. All five feature groups remain in scope; cross-browser execution is deferred by user instruction.
- Ruling: compression uses named quality presets with measured actual output size, not guaranteed MB targets; arbitrary input cannot be promised a particular size without uncontrolled quality loss.
- Ruling: crop is relative visible-area editing, with an explicit hidden-content explanation; no claim of redaction or permanent erasure.
- Root created managed isolated worktree at `097ae61`; Node 24 baseline: 72 unit tests passed.
- Crop engine, render paths, dialog, undo and validated recovery implemented. Current focused evidence: 91 unit tests and build pass; two Chromium crop workflows pass (all source rotations, actual exported CropBoxes, full preview aspect ratio, undo/reset, invalid crop, cancel and 390 px). Final all-feature acceptance remains pending.
- Export decoration and compression are isolated Sol assignments with Root-owned integration. No shared-file concurrent writers. Compression feasibility must be demonstrated before exposing presets.
