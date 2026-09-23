# Quack & Honk PDF

A browser-local PDF workspace prototype by Quack & Honk. Import documents and pictures, arrange pages, and export a new PDF without a document-processing backend.

## Development

Use **Node.js 24** (`.nvmrc`). Install the committed dependency versions:

```bash
npm ci
npm test
npm run build
npm run dev
```

For browser regression tests against the production build:

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

Playwright starts `vite preview` on `127.0.0.1:4173` and stops it after the tests. On a new Linux machine, use `npx playwright install --with-deps chromium` if browser system dependencies are missing.

For an opt-in synthetic large-document benchmark:

```bash
npm run bench:large-documents
```

It exercises 10, 50, 100, 300 and 500 blank pages by default. Set `QH_PDF_BENCH_PAGES` to a comma-separated subset for a smoke run. Results are written beneath the ignored `test-results/` directory. The timings and approximate Chromium JS heap sample describe the test machine and fixture only; they are not product speed or capacity guarantees.

For a repeatable local startup and first-use measurement:

```bash
npm run bench:startup
```

The command builds the app, serves that exact build on `127.0.0.1:4175`, and runs five Playwright Chromium samples by default. Each cold sample uses a fresh browser context; warm reload and two PDF imports retain that context and its normal browser cache. Readiness waits until recovery detection has finished and **Choose files** is enabled. The report separates import completion, first decoded thumbnail, and all-thumbnail times. It also records raw, computed gzip and Brotli asset sizes separately from Chromium `PerformanceResourceTiming` transfer, encoded-body and decoded-body sizes. Decoded JavaScript bytes are not V8 parse time. Set `QH_STARTUP_SAMPLES` to an integer of at least three or `QH_STARTUP_RESULT` to an ignored output path. These local medians describe one machine and synthetic three-page fixture; they are not a user-facing speed guarantee.

## Current prototype

- Import PDF, JPEG, PNG and WebP through the file picker. The empty workspace also accepts file drops.
- Select one page, use Shift-click for a contiguous range, or use Ctrl/Cmd-click for additive selection. Visible page checkboxes support additive selection on touch and keyboard, with Select all and Deselect all in the toolbar.
- Open any page in a focused preview, move through the workspace, zoom from 50–200%, and rotate the viewed page without changing the selection.
- Rotate, duplicate, delete, move left/right, undo and redo.
- Crop selected pages using a preview and percentage margins. Crops rotate with the page, support undo/reset and survive optional recovery. Cropping hides content; it does not erase it.
- Reorder with a visible drag handle using a mouse, touch, or keyboard; arrow buttons remain available.
- Recover after deleting the last page using the empty-state Undo control.
- Combine pages from multiple PDFs and pictures into one download, or save only the selected pages in their current workspace order.
- Add Save-time page numbers: choose the first output page, starting value and decimal, Roman, Latin or Thai letters. Advanced sections use independent ranges and sequences with shared placement and styling. Preview the actual crop, numbering and Thai/Latin text watermark before saving.
- Choose Off, Lossless, Balanced or Smaller file compression, with an actual output size and optimization result. Compression preserves text and vectors and runs before optional password protection.
- Switch between English and Thai. Use the keyboard-shortcut help for undo/redo, selection, duplication, deletion and saving; shortcuts pause inside inputs/dialogs and during processing or dragging.
- Create the output in a dedicated browser worker with page-based progress and cancellation.
- Preserve source PDF page rotation and add the requested workspace rotation.
- Reject empty or incomplete exports instead of silently dropping pages.
- Open password-protected PDFs with the supplied password and optionally require a new password on exported PDFs (AES-256).
- Keep an optional recovery copy in this browser using IndexedDB, then restore it after reopening the page. Recovery is off by default; clearing the copy also turns it off without closing the open workspace.
- Load PDF.js and its rendering worker on the first PDF import, restore or preview that needs them. Opening the empty workspace and importing or exporting images do not load PDF.js.

The welcome screen describes the supported tasks and file types. Page editing controls are separate from the download/password section below the pages. Thumbnail clicks select one page unless Shift or Ctrl/Cmd is held; the labeled checkbox beside each Drag handle always adds or removes that page. Each page has an explicit Preview button; the preview returns focus to that button when it closes. To reorder with the keyboard, focus a page's Drag handle, press Space, use the arrow keys, then press Space to drop or Escape to cancel.

`Save PDF` always downloads every page shown. When one or more pages are selected, `Save selected pages` downloads that subset in workspace order. Both actions share the same optional output-password fields, worker progress, cancellation, and retry behavior. Exporting a subset does not change the workspace or selection.

Numbering, watermark and compression are Save options, separate from workspace history and recovery. Numbering uses the final output order at the moment of export: the first selected page is output page 1. Simple numbering runs from the chosen start page to the end; advanced sections leave uncovered pages unnumbered. Overlapping, reversed or out-of-range sections fail visibly. Latin letters continue from z to aa; the 41-letter Thai document sequence continues from ฮ to กก. Roman numerals support 1–3999. The preview target explicitly chooses all or selected pages, and its page numbers use that target's total.

Lossless uses QPDF Flate level 9 and object streams. Balanced and Smaller file additionally optimize eligible images at JPEG quality 75 and 45 respectively. These values are encoder settings, not a promised percentage of retained visual quality or a target file size. Existing JPEGs and other unsupported image structures may not shrink. A successful optimization that is larger retains the assembled bytes; a failed optimization is reported. Savings compare bytes before password protection, while the final download size includes it. No whole-page rasterization is used.

Recovery stores the original source files and current page edits atomically, not undo history. It retains encrypted originals and asks for their opening password again when restoring; decrypted working bytes and passwords are never persisted. A saved-status indicator reports pending and failed writes. Conflicting writes from another tab are rejected rather than silently replacing that tab's copy. Browser storage is not a backup: unsaved changes, storage eviction, private browsing, device loss or clearing site data can still lose work.

Clearing overwrites the recovery record with an empty revision marker containing no documents or page edits. This prevents a stale tab from recreating cleared content, including tabs opened before the first save.

All six required mascot assets are included and served locally. No ZIP extraction or Python restoration step is required.

## Hosting

The production target is [pdf.quackandhonk.com](https://pdf.quackandhonk.com), served by Cloudflare Workers Static Assets. `wrangler.jsonc` publishes only `dist/`: there is no Worker script, processing API, database or document storage. Browser PDF processing remains local. The `public/_headers` policy restricts scripts and network connections to local assets, permits browser-created previews, and disables framing.

Responses also set `Cache-Control: public, max-age=0, must-revalidate, no-transform` to prevent Cloudflare from automatically injecting its analytics beacon into this app, even when automatic Web Analytics is enabled for the parent zone. This follows [Cloudflare's documented `no-transform` behavior](https://developers.cloudflare.com/web-analytics/get-started/). Live network checks remain required because hosting settings can change independently of source code.

On Node.js 24, verify a clean install before an authorized deployment:

```bash
npm ci
npm test
npm run build
npm run test:browser
npm run test:hosting
```

`test:hosting` starts a local Cloudflare runtime and exercises the same synthetic document workflows plus HTTP security headers. It does not deploy. With an authenticated Cloudflare account that owns the domain, `npm run deploy` remains available for an explicitly authorized manual release.

Production CI/CD is defined in `.github/workflows/deploy.yml`. A successful `Verify` run for `main` triggers a serialized deployment from that exact verified commit. The job repeats unit/build checks, validates the Wrangler package with `deploy --dry-run`, publishes through the pinned Cloudflare Wrangler action using credentials scoped to the GitHub `production` environment, and then runs the Chromium/Cloudflare suite against `https://pdf.quackandhonk.com`. Manual dispatch uses the same guarded job. Pull requests cannot deploy and receive no production credentials.

To run the hosting checks against the live site explicitly, set `QH_PDF_BASE_URL=https://pdf.quackandhonk.com` in the shell before running `npm run test:hosting`, then unset it. These checks use generated documents and in-browser file inputs; no document upload endpoint is involved.

Static asset requests and storage are free under [Cloudflare's current pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Domain renewal is separate. Keep this deployment static when estimating costs; adding server-side code or other services changes the applicable quotas.

## Verification

The `Verify` GitHub Actions workflow runs `npm ci`, Vitest domain/export/security tests, a TypeScript/Vite production build, and Chromium workflows against both Vite preview and the local Cloudflare runtime. The hosting suite also checks HTTP security headers. The verification workflow has read-only repository permissions; production publication is a separate environment-gated workflow that runs only after successful verification on `main`.

The export tests create and reopen real PDFs. The browser tests use the production build to exercise real PDF.js thumbnails and focused previews, preview navigation/zoom/rotation/focus return, range and checkbox selection, multi-page edits, all-pages and selected-page downloads, PDF/image mixing, malformed-input recovery, mascot decoding, cancellable export progress, viewport-gated thumbnails for a 100-page document, and a 390-pixel-wide viewport. Selected-output checks cover reordered pages, rotations, duplicates, mixed sources, password protection, failure/retry, cancellation, and unchanged workspace selection. Additional tests cover rapid preview cancellation and retry, mouse/keyboard/touch reordering, password retries/cancellation, Unicode AES-256 export, encrypted-original persistence, reload recovery, cross-tab conflicts, and failed saving/clearing. PDF fixtures are synthetic, not user documents. Touch coverage is Chromium emulation, not a physical-device or Safari certification.

A request guard checks that the mixed PDF/PNG/JPEG/WebP workflow sends only same-origin, static GET requests without query strings or request bodies. This is evidence for that tested flow, not a complete security audit or a guarantee about every possible document or browser.

The latest status belongs to the commit's CI checks, not to this document. Historical design checklists are targets rather than evidence of completed implementation.

An explicitly authorized local stress test also exercised a 307,905,032-byte, 4,120-page real-world PDF without copying it into the repository or CI. A cold OneDrive/filesystem read took about 216 seconds; a warm import took about 1.2 seconds and the first thumbnail followed in about 0.37 seconds. Complex sampled thumbnails rendered at about 0.4 pages/second. After changing export from one `pdf-lib` `copyPages` call per page to one batch per source/rotation group, an edited full export completed in 21.4 seconds; the prior implementation did not finish within 40 minutes. Poppler reopened the 307,798,679-byte result with all 4,120 pages and the expected first-page rotation. The request guard observed no network violation. Chromium used roughly 2 GiB working set in the pre-fix run, and the final run still sampled a 633 ms maximum frame gap, so these measurements document a desktop stress case rather than a supported universal limit.

## Privacy and limitations

The application includes no account system, analytics, remote document storage or upload API. Imported data is kept in memory unless the user enables local recovery. Without recovery, refreshing or closing the tab loses the workspace. With recovery enabled, anyone using the same browser profile can restore unprotected files until the saved copy is cleared. Original PDF opening passwords remain required. Preview resources are destroyed after rendering and object URLs are released when cards unmount.

Password processing uses pinned `pdfstudio` 0.4.0 with QPDF 12.3.2, native QPDF cryptography, and same-origin WASM assets. A fresh module Worker processes each lock/unlock operation and is terminated on completion, failure, or a 60-second timeout. Password exports use AES-256 with full editing permissions; this is opening-password protection, not rights enforcement. Passwords cannot be recovered by this app. Dependency license notices are in `public/licenses/pdf-security/`.

This is still a prototype:

- PDF assembly and image embedding use a fresh module worker for each export. PDF pages are copied in batches per source and workspace rotation so shared resource graphs are not recopied page by page. Only referenced sources are sent, as transferable copies, so the original buffers remain available for retry, undo and recovery. Progress and cancellation cover assembly; optional password encryption remains isolated in its own cancellable QPDF worker. Copies and retained source buffers mean peak memory is still browser- and device-dependent, and worker isolation does not impose a memory ceiling or guarantee secure memory zeroization.
- Thumbnails use a two-job priority scheduler, a 600-pixel viewport margin and browser `content-visibility` containment. Off-screen cards remain in the DOM so drag, keyboard and arrow reorder targets stay stable; this is not true DOM windowing. PDF.js now loads on the first PDF operation, but import parsing and page-metadata enumeration still run through it in the UI-side engine and require further measurement for complex documents.
- Focused previews render only while the dialog is open. Their raster canvas is capped at 4 million pixels and 4096 pixels per dimension, and stale PDF.js loading/render tasks and object URLs are released on navigation, zoom, rotation and close. This bounds the output canvas allocation; it does not bound source-image decoding or whole-PDF parser memory.
- The synthetic Chromium benchmark completes 10, 50, 100, 300 and 500 blank-page fixtures and checks cancellation at the largest requested size. That evidence is a regression baseline, not a guarantee that arbitrary 500-page files will fit memory or perform similarly.
- OCR, Office conversion and full PDF text editing are not supported. Password support covers standard PDF passwords, not certificate-based or third-party DRM security handlers.
- The bundled QPDF version trails upstream releases. Worker timeouts limit parser hangs; hostile-document memory exhaustion remains a limitation. Further parser hardening and dependency upgrades require ongoing review.
- Editing creates a new PDF. Preservation of interactive forms, signatures, document-level bookmarks, accessibility tags and attachments is not guaranteed.
- Complex font/CMap and image-decoder cases, malformed-document fuzzing, large-file limits, Safari and Firefox require further validation.
- A failed dynamic PDF.js module request leaves the workspace usable and the application retries its loader call. Chromium 153 kept an HTTP 503 module fetch failed in the tab's native module cache, so a same-tab retry could not make a second request in that tested case. The visible error advises saving open work before manually reloading; the app does not reload automatically or evaluate cache-busted module copies.
- Mobile has focused page/crop/export previews, labeled additive-selection checkboxes, drag handles and non-drag controls. Thai UI and workspace shortcuts are available; dark mode and full brand typography remain planned work.
- CSS is currently used directly; the planned Tailwind migration has not been done.
- No security certification, compliance status or universal privacy guarantee is claimed.

The initial application chunk excludes PDF.js, fontkit, the decoration font and QPDF. These remain deferred assets loaded by the operations that need them. Chunk warning thresholds remain unchanged.

## Brand assets

The three restored poses (`quack-empty-state`, `quack-working`, `honk-error`) are faithful WebP derivatives of the supplied PNG artwork, resized proportionally to 192 pixels with optimized transparency. Existing `quack-hello`, `honk-happy` and `honk-worried-warning` derivatives remain included. Their checksums were validated during transfer; browser tests also decode all six files. Noto Sans Thai Looped Regular v2.000 is bundled for PDF decorations; [font provenance and OFL notice](public/licenses/fonts/README.md) record its source and checksum. It is embedded into exports and is not a remote UI font.

## Design references

- [Product and architecture design](docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md)
- [Original implementation plan](docs/superpowers/plans/2026-09-12-quack-honk-pdf-prototype.md)
- [Current document-finishing design](docs/superpowers/specs/2026-09-22-document-finishing-design.md)
- [Current execution record and deferred cross-browser/device plan](docs/superpowers/plans/2026-09-22-document-finishing.md)

These documents describe the target V1. The current scope and limitations above take precedence when describing this prototype's status.
