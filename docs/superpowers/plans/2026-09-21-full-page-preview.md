# Full-page preview implementation plan

**Goal:** Let people inspect document contents before arranging and saving pages, using a large preview with navigation, zoom, and rotation.

**Design basis:** Approved product design `docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md` and the Full-page preview milestone in `plan/2026-09-19-product-roadmap-checklist.md`. The user authorized implementation and testing with `gpt-5.6-sol` at high effort. One implementer owns the coupled UI, rendering, and tests; Root owns integration and acceptance.

## Interaction and architecture

- Add an explicit Preview button on each card; keep thumbnail click for selection. Opening, navigating, zooming, and closing preview never alter the selection.
- Use a native modal dialog with an accessible title, visible Close control, Escape dismissal, trapped keyboard focus, and focus restored to the opening button. Preserve the grid scroll position.
- Show Page N / M and previous/next controls following current workspace order; disable unavailable directions. Arrow keys navigate when they do not interfere with another control. Reset zoom/scroll on navigation.
- Start fitted to the available viewport; expose Zoom out, Zoom in, a percentage, and Fit page. Limit zoom to 50–200% relative to fit, in 25% steps. Keep all controls reachable at 390px and under reduced motion. Zoomed content scrolls inside the image area, never forcing page-level overflow.
- Rotate left/right changes only the currently previewed workspace page, preserves the selection, enters existing undo/redo history, and remains reflected in grid and exported output. Source rotation stays additive.
- Use PdfEngine for rendering. Add a preview render request supporting target size, additional workspace rotation, and AbortSignal. Cap raster allocation at 4 million pixels and 4096 pixels per dimension while preserving aspect ratio. Keep the thumbnail path compatible.
- Abort stale rendering on navigation, zoom, rotation, and close; release PDF.js tasks, canvases, image bitmaps, listeners, and object URLs on every success/error/abort path. Guard against stale asynchronous completion and unmounts. Show readable loading, error, and Retry states.
- Keep processing browser-local, use source-buffer copies, retain encrypted originals/unlocked-session semantics, and introduce no remote assets or dependency changes unless a concrete necessity emerges.

## Task 1 — Implement and exercise the complete preview flow

**Owned files:** New preview dialog/render helper and tests; `src/engine/PdfEngine.ts`, `src/engine/BrowserPdfEngine.ts`, `src/workspace/PageCard.tsx`, `src/workspace/WorkspaceScreen.tsx`, `src/workspace/useWorkspaceStore.ts`, `src/index.css`, related tests, README and the preview roadmap section. Root maintains this plan. Leave export, recovery, security, and deployment behavior outside the change.

1. Install committed dependencies with Node 24 (`volta run --node 24 npm ci`) and run baseline unit tests.
2. Add failing tests for explicit preview entry, selection preservation, modal keyboard/focus behavior, navigation, zoom limits/fit, rotation of only the viewed page, mobile layout, cancellation/resource disposal, and byte preservation. Record the expected failures before implementation.
3. Implement the preview render boundary and targeted page rotation through the existing workspace model. Use bounded dimensions for portrait, landscape, unusually long pages, PDF source rotation plus workspace rotation, and image inputs.
4. Implement the dialog and card entry in the current visual style, with stable controls and recoverable render errors. Avoid changing the established selection or drag interactions.
5. Exercise real synthetic PDF and PNG/JPEG/WebP inputs; assert decoded larger previews, exact output rotation/order after preview edits, unchanged selection, repeated open/close, rapid navigation/close, keyboard focus return, and privacy request guard. Test 390px layout and reduced motion.
6. Run Node 24 `npm test`, `npm run build`, `npm run test:browser`, and `npm run test:hosting` on the completed revision. Do not weaken assertions or hide the existing chunk warning. Save exact commands, results, revision/delta, and browser/fixture limits in the implementation report.
7. Update README and check only the preview roadmap items supported by direct evidence. Commit the scoped change, then freeze it for independent review and actual rendered interaction checks. Resolve acceptance findings and rerun affected checks; all three required final commands must cover the final code revision.
8. Root pushes the feature branch and opens a PR after acceptance. Do not merge or deploy.

## Review focus

- Rotating an unselected viewed page while several other pages are selected changes only the viewed page and remains undoable.
- Rapid navigation/zoom/close cannot show the wrong page, leak URLs/tasks, or turn expected cancellation into an error.
- Source rotation, workspace rotation, extreme aspect ratios, and large image dimensions stay correctly oriented and bounded.
- Keyboard-only use, focus return, viewport resize, mobile controls, and zoom scrolling remain usable.
- Renderer failure preserves the workspace and allows navigation, retry, and close; no document data leaves the browser.

## Execution record

- Base: `6f9f7df` (current origin/main); branch `codex/full-page-preview`, isolated worktree.
- Baseline reported by the Sol implementer: Node 24 `npm ci` succeeded, followed by 47 unit tests passing in 8 files at `6f9f7df`.
- RED/GREEN checkpoint reported: missing preview/store APIs and missing explicit Preview entry failed as expected; renderer tests subsequently passed for geometry bounds, additive rotation, copied bytes, and abort cleanup.
- Root's early source inspection identified a keyboard conflict between page navigation and horizontal panning in the focused zoomed viewport. Implementation must preserve panning there and cover it with a browser regression.
- Product implementation: `1b5ac0ac3ae9e20bf8271bf3ed7cc98f2d89b1da` by a separate `gpt-5.6-sol` high implementer.
- Final Node 24 verification on that committed content: `npm test` passed 55 tests in 9 files; `npm run build` passed with the existing chunk warning retained; `npm run test:browser` passed 27 Chromium tests; `npm run test:hosting` passed 28 local Cloudflare/Chromium tests.
- The changed benchmark selector was exercised with `QH_PDF_BENCH_PAGES=10` and the existing performance Playwright configuration: 1/1 Chromium smoke case passed. The scoped environment variable was removed afterward.
- Root exercised BrowserOS with a readable synthetic three-page PDF. Desktop checks covered selection preservation, 200% zoom, rotation of only the viewed page, Undo, Escape and opener restoration. At 390 x 844, controls stayed in view without page-level overflow. Root found a Tab boundary escape, the implementer reproduced it in Playwright, and the corrected build (`index-DMTSyXRk.js`) passed forward/reverse wrapping and Escape/focus-return checks in BrowserOS.
- Root and the independent reviewer inspected actual Playwright screenshots at 1440 x 1000 and 390 x 844. BrowserOS screenshot capture timed out, so its evidence is executed interactions and DOM measurements; rendered visual evidence comes from the Playwright screenshots.
- Independent review: PASS with no blocking or actionable findings against frozen product commit `1b5ac0a` and the then-current requirements plan hash `DD142C282A93AE6F4E64EC62EA45B4329B728F1938F57E9C95312C73AD61F152`. The fresh reviewer was a separate Sol session with no maker involvement or inherited conversation; it reused recorded test evidence, inspected source and screenshots, and changed no files. Root authored the plan and contributed the early panning/focus findings. All review sessions shared a frozen worktree rather than independent test installations.
- Evidence limits: Chromium and synthetic PDF/PNG/JPEG/WebP fixtures only; no Firefox, Safari/WebKit or physical-device claim. A dedicated rotated-raster-image regression and live resize-after-open regression remain optional coverage gaps. Raster bounds do not cap parser, decoded-source or whole-browser memory.
- Acceptance: complete for this feature scope. Integration is a scoped pull request; merge and deployment remain outside this task.
