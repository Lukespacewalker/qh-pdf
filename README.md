# Quack & Honk PDF

Experimental local-first PDF workspace by Quack & Honk.

## Status: unverified prototype import

This is the source prototype supplied in the conversation, not a completed V1. Dependency installation could not be completed in the authoring environment. No successful build, automated test run, browser test or network-privacy test is claimed.

**Asset transfer is incomplete:** three mascot files could not be transferred intact through the connector. They are deliberately not replaced with corrupt or unrelated images. Restore them from the original prototype ZIP using the command below before reviewing the UI.

## Setup

Download `quack-honk-pdf-prototype.zip` from the conversation, then run:

```bash
python scripts/restore-mascots.py /path/to/quack-honk-pdf-prototype.zip
npm install
npm test
npm run build
npm run dev
```

On Windows, `py scripts/restore-mascots.py C:\path\to\quack-honk-pdf-prototype.zip` is also supported when the Python launcher is installed.

The restoration script uses only the Python standard library, validates SHA-256 hashes, and copies only the three explicitly named PNG entries. It performs no network requests. Commit the restored PNG files to this branch to finish the asset import.

## Source implementation

- PDF, JPEG, PNG and WebP import
- Page thumbnails and selection
- Rotate, duplicate, delete, move, undo and redo
- Mixing documents and images before PDF export

These are source-level capabilities awaiting runtime verification. No account, backend document processing, cloud sync, OCR or analytics is included.

## Assets

Three verified WebP derivatives are committed: `quack-hello`, `honk-happy`, and `honk-worried-warning`. They are derived from the supplied PNGs, with proportional resizing to 320 pixels maximum and optimized transparency. They are served locally, not from an external image host.

Three original PNGs still require restoration: `quack-empty-state.png`, `quack-working.png`, and `honk-error.png`. The component uses these exact paths so restoring the files requires no code changes. Until restored, some mascot images will not display.

No font files are included. Source code is preserved except for the mascot asset paths and repository-import documentation.

## Still to implement or verify

- PDF.js integration and WebP conversion
- Export correctness, including preserving source-page rotation
- Dedicated export worker, cancellation and progress
- Thumbnail cleanup, lazy scheduling and virtualization
- Drag-to-reorder, keyboard shortcuts and mobile multi-select
- End-to-end, accessibility and network-privacy tests
- Thai UI, dark mode and full brand typography

The current styling is CSS, not the planned Tailwind setup. Four workspace unit tests are included; they are not full PDF-engine or browser coverage.

## Design references

- [Product and architecture design](docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-12-quack-honk-pdf-prototype.md)

These documents describe the target. Their checklists do not establish implementation or verification status.
