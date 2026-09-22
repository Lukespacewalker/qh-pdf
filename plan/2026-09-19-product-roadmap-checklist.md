# QH PDF product roadmap checklist

This is the current execution checklist, not a completion claim. A box is checked only when the linked revision has direct test or measurement evidence. The approved product/architecture design remains `docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md`.

## P0 — Large-document reliability

- [x] Replace `Private · Browser-based` with the narrower mechanism statement `Runs in your browser`.
- [x] Add reproducible synthetic fixtures for 10, 50, 100, 300, and 500 pages.
- [x] Measure import time, first thumbnail, thumbnail throughput, export time, approximate peak JS heap, UI responsiveness, and cancellation.
- [x] Move `pdf-lib` assembly and image embedding into a dedicated module worker.
- [x] Transfer copies of referenced source buffers without detaching originals.
- [x] Preserve additive rotations, duplicates, mixed-source ordering, and fail-closed export validation.
- [x] Show page-based export progress.
- [x] Cancel assembly and optional password encryption without losing the workspace or creating a download.
- [x] Bound thumbnail work to two concurrent jobs.
- [x] Prioritize visible/near-visible thumbnails and cancel stale queued work.
- [x] Add browser-native rendering containment for off-screen cards.
- [x] Decide whether true DOM windowing is needed from benchmark evidence; retain stable DOM reorder targets for now and revisit windowing only if real-document profiling shows DOM/layout is the bottleneck.
- [x] Verify the final revision with Node 24 unit, build, Chromium browser, and local Cloudflare hosting suites.
- [x] Record which benchmark sizes completed and the actual browser/fixture coverage.

Evidence on the release candidate containing this checklist: `volta run --node 24 npm run bench:large-documents` completed five synthetic blank-page Chromium cases (10/50/100/300/500) on 2026-09-20. At 500 pages the recorded sample was 245 ms import, 301 ms to first thumbnail, 28.7 thumbnails/s while scrolling, 255 ms export, 16.8 ms maximum sampled frame gap, and 217 ms cancellation. These are local regression measurements, not public performance claims. Node 24 ran 47 Vitest tests, 21 production-build Chromium workflows, and 22 local Cloudflare/Chromium workflows successfully; the build still reports its existing large-chunk warning.

## Release gate — Brand discovery and production delivery

- [x] Make the existing header wordmark a clear, accessible link to `https://quackandhonk.com` without adding mobile height or a remote request on load.
- [x] Verify the linked wordmark and no horizontal overflow in Chromium at 390 px.
- [x] Exercise the explicitly supplied 293.6 MiB PDF locally through import, first thumbnail, editing, cancellation, and full export with the request privacy guard active.
- [x] Validate the exported document locally, remove the temporary output, and keep the source/output out of Git and CI.
- [x] Merge and verify the same-origin app icon and favicon from PR #11 before the production release.
- [x] Add a pinned, least-privilege GitHub Actions production deployment that runs only after `Verify` succeeds on `main` or by manual dispatch.
- [x] Store Cloudflare credentials only as scoped secrets in the GitHub `production` environment.
- [x] Dry-run Wrangler on the release revision before publication.
- [x] Merge PR #10 to `main` only after all required checks pass.
- [x] Observe successful production CI/CD and run the full live-production Chromium/Cloudflare suite against `https://pdf.quackandhonk.com`.

Release evidence: PR #11 and PR #10 were merged to `main` after their required checks passed. `Verify` completed successfully on merge commit `0323186`, then the guarded `Deploy production` workflow deployed that exact revision and passed its 22-test live-production Chromium/Cloudflare suite. A Bangkok cold-path follow-up measured password unlock at 5.98 seconds, exposing an overly tight five-second test wait; the test harness now allows 15 seconds while preserving all output, privacy, and decoded-thumbnail assertions.

Real-document evidence: the supplied 307,905,032-byte PDF contained 4,120 pages. The original one-page-per-`copyPages` export did not complete within 40 minutes, so the release gate initially failed. After batching copies per source/rotation group, a warm import completed in 1.2 seconds, first thumbnail in 0.37 seconds, edit/undo/redo and cancellation passed, and a full export retaining a 90° first-page edit completed in 21.4 seconds. `pdfinfo` reopened the 307,798,679-byte PDF with 4,120 pages and the expected rotation; the request guard recorded zero violations. The temporary export was then deleted. A cold OneDrive/filesystem read had taken about 216 seconds, complex sampled thumbnails averaged 0.4 pages/second, the pre-fix run used roughly 2 GiB Chromium working set, and the final run sampled a 633 ms maximum frame gap; these remain documented constraints rather than product guarantees.

## P1 — Full-page preview

- [x] Define preview navigation, focus return, Escape behavior, zoom limits, and mobile layout.
- [x] Open a page in a large modal/dialog without changing selection accidentally.
- [x] Support previous/next page navigation and `Page N / M` status.
- [x] Render a higher-resolution page only while focused and release its resources on close/navigation.
- [x] Keep rotate actions accessible from preview and reflected in the grid.
- [x] Test keyboard-only use, focus trapping/return, reduced motion, and 390px layout.

Evidence on the feature revision: targeted Vitest cases exercise page-specific undoable rotation, source/workspace rotation composition, raster bounds, source-byte preservation and abort cleanup. Production-build Chromium workflows exercise selection preservation, native-dialog Escape and focus return, navigation, 50–200% zoom, zoomed keyboard scrolling, retry, rapid cancellation and URL disposal, PDF/PNG/JPEG/WebP previews, exported rotation, reduced motion and the 390-pixel layout. The full Node 24 unit, build, browser and local-hosting results are recorded in the ignored implementation report for the revision.

## P1 — Selection UX

- [x] Add Select all and Deselect all.
- [x] Add Shift-select contiguous range anchored to the last intentional selection.
- [x] Make selected count prominent on desktop and mobile.
- [x] Keep Delete, Duplicate, Rotate left, and Rotate right operating on the full selected set.
- [x] Preserve Ctrl/Cmd additive selection and define touch behavior without modifier keys.
- [x] Test range selection across reordered and duplicated pages plus undo/redo invariants.

Evidence on the feature revision: focused domain/store tests cover additive toggles, forward/reverse/additive ranges, ID-based anchors through reorder and duplication, deletion, restore, undo/redo, all/none and invalid-selection cleanup without selection-only history entries. Production-build Chromium workflows exercise the labeled page checkboxes with mouse, keyboard and a 390-pixel touch viewport, live counts, all/none, modifier ranges, selection-preserving preview, and multi-page rotate, duplicate, delete and undo.

## P1 — Save selected pages

- [x] Add `Save selected pages` only when at least one page is selected.
- [x] Derive an export snapshot without mutating workspace order or selection.
- [x] Reuse the same export worker, validation, progress, cancellation, and password flow.
- [x] Keep `Save PDF` as the clear all-pages primary action.
- [x] Test selected output order, rotations, duplicates, mixed sources, failure, cancellation, and password export.

Evidence on the feature revision: real synthetic outputs are reopened to verify current workspace order after reorder, additive source/workspace rotations, duplicates, mixed PDF/image sources, an encrypted selected subset, and the unchanged all-pages download. Browser workflows also verify subset-specific progress totals, cancellation without a download, worker failure with preserved selection/workspace and successful retry. Domain validation rejects empty, duplicate and stale selected IDs before export.

## P2 — Bundle and startup work

- [x] Record initial JS/WASM transfer and decoded sizes before changing split points; keep decoded bytes distinct from JavaScript parse time.
- [x] Confirm moving `pdf-lib` assembly to the export worker removes it from the initial application path.
- [x] Lazy-load PDF.js after the user starts an operation that needs it.
- [x] Keep QPDF/pdfstudio lazy and absent unless opening or creating a protected PDF.
- [x] Evaluate loading recovery UI/repository after first paint without delaying restore detection; retain eager detection to prevent an import/restore race.
- [x] Compare cold load, warm load, and first interaction; do not hide warnings by raising thresholds.

Evidence on the feature revision: a matched five-sample Node 24.21.0 / Playwright Chromium 153 production-build benchmark reduced initial JavaScript from 753,587 to 316,617 raw bytes, 230,589 to 99,809 computed gzip bytes, and 193,645 to 86,436 computed Brotli bytes. The first cold Resource Timing sample reported 230,889 to 100,109 transfer bytes, 230,589 to 99,809 encoded-body bytes, and 753,587 to 316,617 decoded-body bytes for the entry module; decoded-body bytes are not parse duration. A direct Vite module-graph report found no `pdfjs-dist`, `pdf-lib` or `pdfstudio` module in the initial static graph, and every cold/warm network sample kept PDF.js, export, security and WASM assets unloaded. PDF.js moved to a dynamic 436,570-byte raw renderer chunk requested with its worker on first PDF use. Median cold enabled-readiness changed from 111.6 to 80.6 ms and warm readiness from 43.2 to 36.9 ms. First PDF import changed from 95.6 to 100.3 ms, first decoded thumbnail from 194.9 to 200.2 ms, and all three thumbnails from 295.8 to 297.1 ms; these small local differences are descriptive rather than claimed improvements. Warning thresholds, recovery schema and security/deployment configuration were unchanged.

## P2 — Browser and device evidence

- [ ] Run the core workflow in current Firefox.
- [ ] Run the core workflow in current Safari/WebKit.
- [ ] Exercise import, editing, export, cancel, password, and recovery on a physical iPhone.
- [ ] Exercise the same core workflow on a physical Android device.
- [ ] Record memory or file-size limits as observed constraints, not universal guarantees.
- [ ] Keep Chromium emulation results clearly distinguished from physical-device evidence.

## Deferred capability

- [ ] Reassess compression only after performance, preview, selection, selected export, bundle splitting, and cross-browser/device work meet their acceptance criteria.
- [ ] If compression is pursued, write a separate design comparing lossless structural cleanup, image recompression, quality controls, worker/WASM cost, and preservation risks.
- [ ] Do not add a route-per-tool catalogue or weaken the visual workspace identity.
