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
npm run test:hosting
```

Playwright starts Vite preview on `127.0.0.1:4173`, or the local Cloudflare runtime on `127.0.0.1:8787`, and stops it after the suite. On a new Linux machine use `npx playwright install --with-deps chromium` when system dependencies are missing. Browser, hosting and performance outputs have separate directories under `test-results/`.

## Current prototype

- Import PDF, JPEG, PNG and WebP through the file picker. The empty workspace also accepts file drops.
- View nearby page thumbnails, or open **Preview** for a larger page view with navigation, zoom and rotation.
- Select/deselect all pages, Ctrl/Cmd-click to toggle, Shift-click for a range, or use individual checkboxes on touch devices.
- Rotate, duplicate, delete, move left/right, undo and redo.
- Reorder with a visible drag handle using a mouse, touch, or keyboard; arrow buttons remain available.
- Recover after deleting the last page using the empty-state Undo control.
- Save the whole document, or **Save selected pages** in workspace order without removing any pages from the open workspace.
- Assemble exports in a dedicated Worker, with page progress, separate writing/password stages and a Cancel export button.
- Preserve source PDF page rotation and add the requested workspace rotation. Reject empty or incomplete exports instead of silently dropping pages.
- Open password-protected PDFs with the supplied password and optionally require a new password on either full or selected-page exports (AES-256).
- Keep an optional recovery copy in this browser using IndexedDB, then restore it after reopening the page. Recovery is off by default; clearing the copy also turns it off without closing the open workspace.

The welcome screen describes supported tasks and formats. Page editing controls are separate from the download/password section. To reorder with the keyboard, focus a page's Drag handle, press Space, use the arrow keys, then press Space to drop or Escape to cancel. Outside text fields and dialogs, Ctrl/Cmd+A selects all, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, Escape clears selection, Delete removes selected pages and R rotates them (Shift+R rotates left). All operations have visible controls.

Recovery stores original source files and current page edits atomically, not undo history. It retains encrypted originals and asks for their opening password again when restoring; decrypted working bytes and passwords are never persisted. A saved-status indicator reports pending and failed writes. Conflicting writes from another tab are rejected rather than silently replacing that tab's copy. Browser storage is not a backup: unsaved changes, storage eviction, private browsing, device loss or clearing site data can still lose work.

Clearing overwrites the recovery record with an empty revision marker containing no documents or page edits. This prevents a stale tab from recreating cleared content, including tabs opened before the first save. Exporting a selection creates a temporary composition; it does not replace the editable or persisted workspace.

All six required mascot assets are included and served locally. No ZIP extraction or Python restoration step is required.

## Processing and resource boundaries

The welcome screen does not load PDF.js, the assembly Worker or QPDF. PDF.js and its worker are loaded when a PDF first needs importing or rendering. The pdf-lib assembly code is bundled into a separate Worker, loaded on export. QPDF remains lazy and runs in its separate password Worker when needed.

Each export creates a fresh assembly Worker. It receives immutable Blob snapshots of only referenced working sources and an ordered page composition, without source filenames, passwords or recovery metadata. Original and decrypted store buffers are not transferred or detached. Creating those snapshots still costs time and memory on the main thread; this is not a zero-copy pipeline. A result, failure, cancellation or 120-second timeout terminates the Worker. There is no silent main-thread or server fallback. Password protection follows assembly and remains cancellable; a cancelled job never intentionally downloads a partial file.

Progress distinguishes preparing pages, writing the PDF and optional password protection. Finishing the page counter is not presented as a completed download.

A preview queue allows at most three active renders, prioritizes an opened page preview over waiting thumbnails, shares duplicate requests and cancels work with no remaining subscribers. Completed preview Blobs have an LRU budget of 16 MiB and 64 entries. Cards release image URLs outside a nearby viewport region. Thumbnail canvases use a 260-pixel maximum edge; larger previews use 1400 pixels and visual zoom. These are preview-cache/raster limits, not whole-browser memory limits.

The full card DOM remains mounted to preserve current drag and keyboard ordering. Lazy thumbnail images are **not DOM virtualization**. PDF.js still opens source documents for individual uncached renders; parsed-document reuse and true virtualized drag ordering remain future optimization work.

## Hosting

The production target is [pdf.quackandhonk.com](https://pdf.quackandhonk.com), served by Cloudflare Workers Static Assets. `wrangler.jsonc` publishes only `dist/`: there is no server Worker script, processing API, database or document storage. The browser Workers described above run on the user's device, not Cloudflare. The `public/_headers` policy restricts scripts and network connections to local assets, permits browser-created previews, and disables framing.

Responses set `Cache-Control: public, max-age=0, must-revalidate, no-transform` to prevent automatic Cloudflare analytics-beacon injection, following [Cloudflare's documented behavior](https://developers.cloudflare.com/web-analytics/get-started/). Live network checks remain necessary because hosting settings can change independently of source code.

On Node.js 24, verify a clean install before an authorized deployment:

```bash
npm ci
npm test
npm run build
npm run test:browser
npm run test:hosting
npx playwright test --config playwright.performance.config.ts
```

`test:hosting` starts a local Cloudflare runtime and exercises synthetic document workflows plus HTTP security headers. It does not deploy. With an authenticated Cloudflare account that owns the domain, `npm run deploy` builds and publishes the static app and configures its custom domain. Deployment is manual; GitHub verification has read-only repository permissions and does not publish.

To run the hosting checks against the live site explicitly, set `QH_PDF_BASE_URL=https://pdf.quackandhonk.com` in the shell before `npm run test:hosting`, then unset it. These checks use generated documents and in-browser file inputs; no document upload endpoint is involved. A branch passing local checks is not evidence that the branch has been deployed.

Static asset billing details are documented in [Cloudflare's pricing and limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Domain renewal is separate. Keep deployment static when estimating costs; adding server-side code or services changes applicable quotas.

## Verification and measurements

The `Verify` GitHub Actions workflow runs `npm ci`, Vitest domain/export/security/queue tests, TypeScript/Vite build, Chromium workflows on Vite and local Cloudflare, then a synthetic performance suite. Synthetic screenshots, traces and measurement reports are retained as a short-lived CI artifact. No user documents are used.

Export unit tests create and reopen real PDFs with the same assembly function used by the production Worker. An explicitly injected Node-only test runner isolates Worker transport, not PDF assembly. Password fixtures use real local QPDF. Browser tests exercise actual built Workers, previews, downloads, PDF/image mixing, errors, selection, full-page preview, focus restoration, cancellation and a 390-pixel-wide viewport. Existing password retry/Unicode encryption, original-byte persistence, reload recovery, cross-tab conflicts and failed saving/clearing coverage remains in place.

Context-level request observation also checks Worker traffic during selected encrypted export: only same-origin static GET requests without query strings, request bodies or fixture filenames are allowed. Existing mixed-format guards and hosting headers remain tested. This is bounded regression evidence, not a complete security audit.

The performance suite generates 10, 50, 100, 300 and 500 vector/text pages, reopens each output to check page count/order markers, and logs import, first-thumbnail and export elapsed times, resident thumbnail count, animation-frame observations and a Chromium main-thread JS-heap endpoint. Results include automation overhead and depend on the runner. The heap endpoint excludes Worker/WASM/native allocations and is **not peak memory**. These fixtures do not establish support for arbitrary scanned, malformed or hostile PDFs. Do not turn single-run timings into universal speed claims.

The latest status belongs to the commit's CI checks, not this document. Historical design checklists describe targets rather than completed implementation. Touch testing is Chromium emulation, not physical-device or Safari certification.

## Privacy and limitations

The application includes no account system, analytics, remote document storage or upload API. Imported data is kept in memory unless the user enables recovery. Without recovery, refreshing or closing the tab loses the workspace. With recovery enabled, anyone using the same browser profile can restore unprotected files until the saved copy is cleared. Original PDF opening passwords remain required.

Password processing uses pinned `pdfstudio` 0.4.0 with QPDF 12.3.2, native QPDF cryptography and same-origin WASM assets. A fresh module Worker processes each lock/unlock operation and is terminated on completion, failure or a 60-second timeout. Password exports use AES-256 with full editing permissions: opening-password protection is not rights enforcement. Passwords cannot be recovered by this app. Dependency license notices remain in `public/licenses/pdf-security/`.

This remains a prototype:

- Worker isolation and cancellation do not impose a whole-browser memory ceiling or guarantee secure memory zeroization. Large original files, decoded images, Blob snapshots and retained undo/recovery sources can still exceed available memory.
- Canvas rendering, import coordination and card DOM updates still use the main thread. Only assembly/serialization and the existing password operations are isolated as described above.
- True DOM virtualization, parsed-document reuse, broader file/page-size limits and hostile-document fuzzing remain future work.
- OCR, Office conversion and full PDF text editing are not supported. Password support covers standard PDF passwords, not certificate-based or third-party DRM security handlers.
- Bundled QPDF trails upstream releases. Worker timeouts limit hangs, not hostile-document memory exhaustion. Parser hardening and dependency upgrades require ongoing review.
- Editing creates a new PDF. Preservation of interactive forms, signatures, document-level bookmarks, accessibility tags and attachments is not guaranteed.
- Complex fonts/CMaps and codecs, Safari, Firefox and physical mobile devices require further validation. Modern Worker, canvas and image-decoding APIs are required; unsupported cases fail rather than upload files elsewhere.
- Full-page previews are bounded raster views, not a selectable-text or accessibility-tagged PDF reader. Thai UI, dark mode and full brand typography remain planned.
- Styling remains CSS directly; the earlier Tailwind migration has not been done.
- No security certification, compliance status or universal privacy guarantee is claimed.

Large lazy PDF/QPDF bundles and any browser-externalized Node-only dependency warning remain visible. Code splitting reduces initial loading, not total engine size. Do not hide bundle warnings by increasing thresholds.

## Brand assets

The restored poses (`quack-empty-state`, `quack-working`, `honk-error`) are proportional 192-pixel WebP derivatives of supplied artwork. Existing `quack-hello`, `honk-happy` and `honk-worried-warning` derivatives remain included. Transfer checksums were validated and browser tests decode all six. No font files are included.

## Design references

- [Product and architecture design](docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md)
- [Original implementation plan](docs/superpowers/plans/2026-09-12-quack-honk-pdf-prototype.md)
- [Responsive workspace scope and implementation rulings](docs/superpowers/plans/2026-09-19-responsive-workspace.md)

These documents describe the intended product. Current scope, limitations and commit-specific verification take precedence when describing this prototype.
