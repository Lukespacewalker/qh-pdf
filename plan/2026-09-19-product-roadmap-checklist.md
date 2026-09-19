# QH PDF product roadmap checklist

This is the current execution checklist, not a completion claim. A box is checked only when the linked revision has direct test or measurement evidence. The approved product/architecture design remains `docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md`.

## P0 — Large-document reliability

- [ ] Replace `Private · Browser-based` with the narrower mechanism statement `Runs in your browser`.
- [ ] Add reproducible synthetic fixtures for 10, 50, 100, 300, and 500 pages.
- [ ] Measure import time, first thumbnail, thumbnail throughput, export time, approximate peak JS heap, UI responsiveness, and cancellation.
- [ ] Move `pdf-lib` assembly and image embedding into a dedicated module worker.
- [ ] Transfer copies of referenced source buffers without detaching originals.
- [ ] Preserve additive rotations, duplicates, mixed-source ordering, and fail-closed export validation.
- [ ] Show page-based export progress.
- [ ] Cancel assembly and optional password encryption without losing the workspace or creating a download.
- [ ] Bound thumbnail work to two concurrent jobs.
- [ ] Prioritize visible/near-visible thumbnails and cancel stale queued work.
- [ ] Add browser-native rendering containment for off-screen cards.
- [ ] Decide whether true DOM windowing is needed from benchmark evidence; do not adopt it if it breaks stable dnd-kit reorder targets.
- [ ] Verify the final revision with Node 24 unit, build, Chromium browser, and local Cloudflare hosting suites.
- [ ] Record which benchmark sizes completed and the actual browser/fixture coverage.

## P1 — Full-page preview

- [ ] Define preview navigation, focus return, Escape behavior, zoom limits, and mobile layout.
- [ ] Open the selected page in a large modal/dialog without changing selection accidentally.
- [ ] Support previous/next page navigation and `Page N / M` status.
- [ ] Render a higher-resolution page only while focused and release its resources on close/navigation.
- [ ] Keep rotate actions accessible from preview and reflected in the grid.
- [ ] Test keyboard-only use, focus trapping/return, reduced motion, and 390px layout.

## P1 — Selection UX

- [ ] Add Select all and Deselect all.
- [ ] Add Shift-select contiguous range anchored to the last intentional selection.
- [ ] Make selected count prominent on desktop and mobile.
- [ ] Keep Delete, Duplicate, Rotate left, and Rotate right operating on the full selected set.
- [ ] Preserve Ctrl/Cmd additive selection and define touch behavior without modifier keys.
- [ ] Test range selection across reordered and duplicated pages plus undo/redo invariants.

## P1 — Save selected pages

- [ ] Add `Save selected pages` only when at least one page is selected.
- [ ] Derive an export snapshot without mutating workspace order or selection.
- [ ] Reuse the same export worker, validation, progress, cancellation, and password flow.
- [ ] Keep `Save PDF` as the clear all-pages primary action.
- [ ] Test selected output order, rotations, duplicates, mixed sources, failure, cancellation, and password export.

## P2 — Bundle and startup work

- [ ] Record initial JS/WASM transfer and parsed sizes before changing split points.
- [ ] Confirm moving `pdf-lib` assembly to the export worker removes it from the initial application path.
- [ ] Lazy-load PDF.js after the user starts import if measurement shows a useful startup win.
- [ ] Keep QPDF/pdfstudio lazy and absent unless opening or creating a protected PDF.
- [ ] Evaluate loading recovery UI/repository after first paint without delaying restore detection.
- [ ] Compare cold load, warm load, and first interaction; do not hide warnings by raising thresholds.

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
