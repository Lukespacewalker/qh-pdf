# Document finishing design

Status: implementation authorized by the user's feature request, subsequent numbering decisions, and “โอเค ทำได้ จนเสร็จ”. This records the current decision; routine implementation choices do not require another approval round.

## Outcome and boundaries

Add page numbering, crop selected pages, watermark, selectable compression, Thai UI and keyboard shortcuts to the existing browser-local workspace. Keep one workspace and the existing import/edit/preview/save flow. Cross-browser and physical-device work is planned only: do not install or run Firefox/WebKit for this milestone. No deployment is included in this implementation authorization.

Keep original bytes, copied worker buffers, additive source/workspace rotation, explicit non-drag actions, strict source/page validation, local static assets, unchanged privacy assertions and warning thresholds. No upload endpoint, analytics, remote font request, cloud storage, OCR or whole-page rasterization. Use the supplied mascots.

## Page numbers: accepted decisions

- Off by default; configured at Save time, without workspace undo or recovery persistence. An export snapshot freezes the settings.
- Simple mode: starting output page, starting numeric value and numbering system. Advanced mode: add/remove contiguous inclusive output-page ranges, each with its own start value and numbering system. Reject overlap, reversed/invalid ranges and ranges beyond the chosen output; pages outside sections are unnumbered.
- Output means the final exported order: Save selected counts only the selected pages, renumbered from output page 1. Explain this next to range controls and name the preview target explicitly.
- Systems: decimal, lower/upper Roman, lower/upper Latin letters and Thai letters. Latin rolls z -> aa, Z -> AA; Thai rolls ฮ -> กก. Thai document enumeration uses กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ (excluding obsolete ฃ/ฅ to match the agreed ก ข ค example). Starts are positive safe integers; reject overflow. Roman is supported from 1 through 3999 with a visible validation error outside that range.
- One common style for every section: six header/footer positions, color, font size and inset. Defaults: bottom center, black, 12 pt, 24 pt inset. Numeric values display a live formatted example.
- Formats: number only, Page {number}, and {number} / {total}; total is the actual exported page count. A real output preview must use the same assembly and font layout as export.
- Bundle Noto Sans Thai Looped Regular with provenance, checksum and OFL notice. Embed the required glyphs; do not depend on the reader's installed fonts. The font and fontkit must not enter empty startup.

## Crop

- Crop is a non-destructive page edit in workspace history and optional recovery. Provide a focused dialog for the selected page(s), readable preview and explicit numeric top/right/bottom/left percentage controls plus Reset. A rectangular overlay shows the kept area. Apply the same relative margins to every selected page; mixed sizes remain proportional.
- Store optional normalized margins on each workspace page relative to its displayed orientation. Rotating a cropped page rotates the margins with its content. Duplicate, reorder, undo/redo, selected export and recovery retain the crop.
- Bounds must be finite, nonnegative and leave positive width/height; never silently discard an invalid crop. Old recovery records without crop remain valid; reject malformed new crop fields. No data-destructive migration or source replacement.
- Thumbnail, full preview and exported CropBox agree for images, source rotations, workspace rotations, nonzero page-box origins and mixed sizes. Export retains underlying PDF text/vector content. Explain that crop changes the visible area and does not erase hidden content.

## Watermark

- Save-time opt-in text watermark, supporting Thai and Latin with the same bundled font. Defaults: DRAFT, gray, 20% opacity, diagonal center. Controls: text, color, opacity, size and horizontal/diagonal orientation. Applied to every page of the chosen export target after cropping; numbering remains readable above the watermark.
- Show the actual combined watermark/numbering output in Save preview. Validate empty/unsupported text and values before export. A failed font load leaves workspace/settings intact and permits retry.

## Compression

- Save-time choice: Off (default), Lossless, Balanced, Smaller file. Presets are explicit levels, not promised byte targets or misleading fixed-size toggles. Show actual final size and whether optimization made it smaller; some inputs cannot shrink.
- Use the existing local QPDF WASM capability where supported, with structural lossless optimization and image recompression for the lossy levels. Measure/probe the pinned implementation before selecting exact settings; record them in the execution plan. Preserve selectable text/vector objects and page geometry. Never flatten whole pages to bitmaps.
- Run optimization in a cancellable dedicated worker before optional password encryption. Keep the smaller of assembled and optimized bytes when optimization succeeds but does not help. An optimization failure must surface visibly, not silently pretend compression succeeded. No passwords or document metadata in diagnostic output.

## Thai UI and shortcuts

- English/ไทย language switch, default English for existing behavior; persist only the UI language preference. Translate visible controls, accessible labels, loading/error/recovery/password/export text and help, including new tools. Set document language. Keep original document filenames unchanged.
- Shortcuts in workspace: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo, Ctrl/Cmd+A select all, Escape clear selection, Delete/Backspace delete selected pages, Ctrl/Cmd+D duplicate, Ctrl/Cmd+S save. Provide a discoverable help panel with localized descriptions.
- Ignore composition, editable controls, modal dialogs, active drag and locked/import/export/recovery states. Suppress browser defaults only when a supported workspace action is actually handled. Keep native text editing and existing drag/preview keys intact. Undo must restore keyboard deletion.

## Acceptance

On the final revision run Node 24 unit tests, build, Chromium browser and local-Cloudflare hosting tests. Add real synthetic exported PDFs and inspect page counts, sequence, crop geometry, text extraction/fonts, number resets/alphabets, watermark placement, mixed rotated sources, compression size/quality behavior, protected output, failure/cancel and source-byte preservation. Actually render representative exports and exercise desktop/mobile layouts and keyboard focus. Freeze the final revision for independent review of crop/recovery, export correctness, worker lifecycle and keyboard deletion safeguards. Create scoped PR(s) and wait for final CI. Record cross-browser/device evidence as unrun.
