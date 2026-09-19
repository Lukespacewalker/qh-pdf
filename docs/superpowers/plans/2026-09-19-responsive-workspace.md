# Responsive document workspace

Continue the approved prototype design, Tasks 10-11, and the owner's subsequent approval of full-page preview, better selection and Save selected. Execute inline on current main, not the old performance branch.

## Intent and constraints

Keep arranging ordinary documents simple and responsive, without uploading documents. Preserve drag/keyboard ordering, original encrypted bytes, Unicode password handling, opt-in IndexedDB recovery and multi-tab conflict protection. No new dependency, document-processing backend, telemetry, deployment or merge is authorized by this work.

## Sequence

- [ ] Acceptance tests before implementation.
- [ ] Dedicated assembly worker, progress phases, cancellation and strict lifecycle cleanup.
- [ ] Bounded preview queue, shared requests, cancellation and bounded Blob cache; render only nearby page images.
- [ ] Native-dialog full-page preview, navigation, zoom and focus restoration.
- [ ] Range selection, touch checkboxes, select/deselect all, selected-only export with existing password options.
- [ ] Lazy-load the PDF renderer and assembly engine; preserve source bytes and recovery behavior.
- [ ] Run unit, production browser, local hosting and synthetic large-document checks; review complete diff and report evidence.

## Implementation rulings

- Start at e38a7698eb219ff0c33b3c08ff06851885ef712b. The older performance branch predates password/recovery changes and will not be merged wholesale.
- Use a fresh assembly worker per export. Hard termination cancels synchronous parser/save operations, with no silent main-thread fallback. Keep the existing separate QPDF worker and extend it with abort support.
- Send immutable Blob snapshots of only referenced working sources. Do not transfer original or decrypted store buffers and do not include source filenames, recovery state or passwords in the assembly payload. Snapshot construction still costs memory/time on the UI thread; this is not zero-copy PDF processing.
- Progress reports assembling pages, serializing and optional encryption as distinct phases. Page completion is not presented as a completed download.
- Keep three active preview jobs, prioritize the focused preview, deduplicate concurrent requests, and bound the completed Blob cache. Offscreen card images are released. Full DOM virtualization is deferred because changing it without solving cross-window drag/keyboard ordering would regress existing controls; do not call lazy thumbnails virtualization.
- Keep image previews within a maximum edge rather than decoding/rasterizing full-resolution PDF pages. Arbitrary malicious/compressed inputs still require separate memory/fuzzing work.
- Add selection without changing persisted workspace schema. Exporting selected pages uses a temporary ordered snapshot, never deletes/reorders the open workspace or its recovery snapshot.
- Retain native dialog focus/escape behavior and non-drag controls. No visual rebrand or replacement mascot art.
- Container DNS access is unavailable. Use GitHub Actions for clean Node 24 install/build and real Chromium/local Cloudflare verification. Test-only local adapters may bypass Worker transport, never PDF assembly/encryption logic; browser tests exercise real workers.

## Evidence ledger

Baseline main Verify run 35414762202 succeeded. New browser acceptance cases and worker/queue specifications were committed first. Final evidence, coverage, limits and any subsequent rulings belong in the PR description. No green claim is implied by this checklist.
