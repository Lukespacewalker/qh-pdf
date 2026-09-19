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

## Current prototype

- Import PDF, JPEG, PNG and WebP through the file picker. The empty workspace also accepts file drops.
- Preview pages, select a page, and use Ctrl/Cmd-click for additive selection.
- Rotate, duplicate, delete, move left/right, undo and redo.
- Reorder with a visible drag handle using a mouse, touch, or keyboard; arrow buttons remain available.
- Recover after deleting the last page using the empty-state Undo control.
- Combine pages from multiple PDFs and pictures into one download.
- Preserve source PDF page rotation and add the requested workspace rotation.
- Reject empty or incomplete exports instead of silently dropping pages.
- Open password-protected PDFs with the supplied password and optionally require a new password on exported PDFs (AES-256).
- Keep an optional recovery copy in this browser using IndexedDB, then restore it after reopening the page. Recovery is off by default; clearing the copy also turns it off without closing the open workspace.

The welcome screen describes the supported tasks and file types. Page editing controls are separate from the download/password section below the pages. To reorder with the keyboard, focus a page's Drag handle, press Space, use the arrow keys, then press Space to drop or Escape to cancel.

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

`test:hosting` starts a local Cloudflare runtime and exercises the same synthetic document workflows plus HTTP security headers. It does not deploy. With an authenticated Cloudflare account that owns the domain, `npm run deploy` builds and publishes the static app and configures its custom domain. Deployment is manual; the GitHub verification workflow has read-only permissions and does not publish.

To run the hosting checks against the live site explicitly, set `QH_PDF_BASE_URL=https://pdf.quackandhonk.com` in the shell before running `npm run test:hosting`, then unset it. These checks use generated documents and in-browser file inputs; no document upload endpoint is involved.

Static asset requests and storage are free under [Cloudflare's current pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Domain renewal is separate. Keep this deployment static when estimating costs; adding server-side code or other services changes the applicable quotas.

## Verification

The `Verify` GitHub Actions workflow runs `npm ci`, Vitest domain/export/security tests, a TypeScript/Vite production build, and Chromium workflows against both Vite preview and the local Cloudflare runtime. The hosting suite also checks HTTP security headers. The workflow has read-only repository permissions and does not deploy the app.

The export tests create and reopen real PDFs. The browser tests use the production build to exercise real PDF.js previews, page editing, downloads, PDF/image mixing, malformed-input recovery, mascot decoding, and a 390-pixel-wide viewport. Additional tests cover mouse/keyboard/touch reordering, password retries/cancellation, Unicode AES-256 export, encrypted-original persistence, reload recovery, cross-tab conflicts, and failed saving/clearing. PDF fixtures are synthetic, not user documents. Touch coverage is Chromium emulation, not a physical-device or Safari certification.

A request guard checks that the mixed PDF/PNG/JPEG/WebP workflow sends only same-origin, static GET requests without query strings or request bodies. This is evidence for that tested flow, not a complete security audit or a guarantee about every possible document or browser.

The latest status belongs to the commit's CI checks, not to this document. Historical design checklists are targets rather than evidence of completed implementation.

## Privacy and limitations

The application includes no account system, analytics, remote document storage or upload API. Imported data is kept in memory unless the user enables local recovery. Without recovery, refreshing or closing the tab loses the workspace. With recovery enabled, anyone using the same browser profile can restore unprotected files until the saved copy is cleared. Original PDF opening passwords remain required. Preview resources are destroyed after rendering and object URLs are released when cards unmount.

Password processing uses pinned `pdfstudio` 0.4.0 with QPDF 12.3.2, native QPDF cryptography, and same-origin WASM assets. A fresh module Worker processes each lock/unlock operation and is terminated on completion, failure, or a 60-second timeout. Password exports use AES-256 with full editing permissions; this is opening-password protection, not rights enforcement. Passwords cannot be recovered by this app. Dependency license notices are in `public/licenses/pdf-security/`.

This is still a prototype:

- PDF assembly via pdf-lib is not yet moved into a dedicated worker. Large files may block the interface or exceed browser memory limits. QPDF password operations are worker-isolated, but that does not impose a browser memory ceiling or guarantee secure memory zeroization.
- Thumbnails are not virtualized or managed by a bounded scheduling queue yet. Source bytes remain retained for undo/redo during the session.
- OCR, Office conversion and full PDF text editing are not supported. Password support covers standard PDF passwords, not certificate-based or third-party DRM security handlers.
- The bundled QPDF version trails upstream releases. Worker timeouts limit parser hangs; hostile-document memory exhaustion remains a limitation. Further parser hardening and dependency upgrades require ongoing review.
- Editing creates a new PDF. Preservation of interactive forms, signatures, document-level bookmarks, accessibility tags and attachments is not guaranteed.
- Complex font/CMap and image-decoder cases, malformed-document fuzzing, large-file limits, Safari and Firefox require further validation.
- Mobile has drag handles and non-drag controls, not first-class multi-page selection. Comprehensive keyboard shortcuts, Thai UI, dark mode and full brand typography remain planned work.
- CSS is currently used directly; the planned Tailwind migration has not been done.
- No security certification, compliance status or universal privacy guarantee is claimed.

The build currently emits a large-chunk warning for the PDF libraries. Do not hide that warning by raising the threshold; measure lazy loading and code splitting in the performance phase.

## Brand assets

The three restored poses (`quack-empty-state`, `quack-working`, `honk-error`) are faithful WebP derivatives of the supplied PNG artwork, resized proportionally to 192 pixels with optimized transparency. Existing `quack-hello`, `honk-happy` and `honk-worried-warning` derivatives remain included. Their checksums were validated during transfer; browser tests also decode all six files. No font files are included.

## Design references

- [Product and architecture design](docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md)
- [Original implementation plan](docs/superpowers/plans/2026-09-12-quack-honk-pdf-prototype.md)

These documents describe the target V1. The current scope and limitations above take precedence when describing this prototype's status.
