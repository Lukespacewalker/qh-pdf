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
- Recover after deleting the last page using the empty-state Undo control.
- Combine pages from multiple PDFs and pictures into one download.
- Preserve source PDF page rotation and add the requested workspace rotation.
- Reject empty or incomplete exports instead of silently dropping pages.

All six required mascot assets are included and served locally. No ZIP extraction or Python restoration step is required.

## Verification

The `Verify` GitHub Actions workflow runs `npm ci`, ten Vitest domain/export tests, a TypeScript/Vite production build and six Chromium browser tests. The workflow has read-only repository permissions and does not deploy the app.

The export tests create and reopen real PDFs. The browser tests use the production build to exercise real PDF.js previews, page editing, downloads, PDF/image mixing, malformed-input recovery, mascot decoding, and a 390-pixel-wide viewport. PDF fixtures are synthetic, not user documents.

A request guard checks that the mixed PDF/PNG/JPEG/WebP workflow sends only same-origin, static GET requests without query strings or request bodies. This is evidence for that tested flow, not a complete security audit or a guarantee about every possible document or browser.

The latest status belongs to the commit's CI checks, not to this document. Historical design checklists are targets rather than evidence of completed implementation.

## Privacy and limitations

The application includes no account system, analytics, remote document storage or upload API. Imported data is kept in memory; refreshing or closing the tab loses the workspace. Preview resources are destroyed after rendering and object URLs are released when cards unmount.

This is still a prototype:

- Export is not yet moved into a dedicated worker. Large files may block the interface or exceed browser memory limits.
- Thumbnails are not virtualized or managed by a bounded scheduling queue yet. Source bytes remain retained for undo/redo during the session.
- Password-protected PDFs, OCR, Office conversion and full PDF text editing are not supported.
- Editing creates a new PDF. Preservation of interactive forms, signatures, document-level bookmarks, accessibility tags and attachments is not guaranteed.
- Complex font/CMap and image-decoder cases, malformed-document fuzzing, large-file limits, Safari and Firefox require further validation.
- Mobile has basic non-drag controls, not first-class multi-page selection. Drag reordering, comprehensive keyboard shortcuts, Thai UI, dark mode and full brand typography remain planned work.
- CSS is currently used directly; the planned Tailwind migration has not been done.
- No security certification, compliance status or universal privacy guarantee is claimed.

The build currently emits a large-chunk warning for the PDF libraries. Do not hide that warning by raising the threshold; measure lazy loading and code splitting in the performance phase.

## Brand assets

The three restored poses (`quack-empty-state`, `quack-working`, `honk-error`) are faithful WebP derivatives of the supplied PNG artwork, resized proportionally to 192 pixels with optimized transparency. Existing `quack-hello`, `honk-happy` and `honk-worried-warning` derivatives remain included. Their checksums were validated during transfer; browser tests also decode all six files. No font files are included.

## Design references

- [Product and architecture design](docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md)
- [Original implementation plan](docs/superpowers/plans/2026-09-12-quack-honk-pdf-prototype.md)

These documents describe the target V1. The current scope and limitations above take precedence when describing this prototype's status.
