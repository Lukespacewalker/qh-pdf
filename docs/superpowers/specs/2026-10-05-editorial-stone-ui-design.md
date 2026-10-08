# Editorial Stone UI

**Status:** User-approved visual direction; implementation and deployment authorized on 2026-10-05.

> **Welcome and header superseded, 2026-10-07:** The user requested the QH Image header style, a full-width file import, direct PDF task copy and explanations below the entry point. Follow the [current PDF import decision](../../design/pdf-import-first.md) for this composition and header. Earlier welcome directions below remain as history; the palette, fonts and workspace principles still apply. The earlier deployment authorization belongs to the 2026-10-05 change.

> **Current welcome proportions, 2026-10-05:** After comparison with the concept, the user authorized a larger desktop welcome canvas, headline, supporting copy and file picker. The existing paired hero displays at 320 × 160px on desktop and 180 × 90px at widths up to 860px. Recovery shows a concise storage/shared-browser warning at all times; a keyboard-accessible native disclosure holds the full explanation. Opt-in, status, errors and pending Restore/Clear actions remain visible, with persistence behavior unchanged. This supersedes the retained-height sizing in the earlier artwork update below.

> **Earlier welcome artwork update, 2026-10-05:** The user's request for a hero introducing both Quack and Honk through a shared PDF task superseded the original empty-state artwork requirement below. The welcome panel uses the transparent [Quack & Honk PDF hero](../../design/quack-honk-pdf-hero.md); the six supplied poses remain unchanged. The initial hero widened while retaining the previous image height. That sizing is superseded by the current proportions decision above; the original decision below is preserved as history.

## Direction

Use the selected second homepage concept: Editorial Modern typography with mineral-white stone, espresso text and earth-brown actions. The selected ImageGen reference is [the homepage concept](../../design/editorial-stone-home.png). This direction supersedes the visual palette, typography and layout in the [original design](2026-09-12-quack-honk-pdf-design.md); its product, accessibility and local-processing boundaries remain in force.

The homepage has an editorial headline on the left and a prominent import panel on the right. The headline reads “Bring your pages together.” The import panel uses the original empty-state Quack artwork, a visible Choose files action, and supported formats. Three numbered steps explain adding, arranging and saving. Brand discovery and recovery remain lower-emphasis supporting content.

The active workspace uses the same palette and typography, a persistent labeled toolbar, a dominant page grid and a distinct save section. The page grid adapts to available width, with two columns on mobile. Selection checkboxes, preview and non-drag arrows stay visible. Password, preview, progress, cancellation, error and recovery states share the new styling.

The document-finishing delivery merged into main during this redesign remains supported: crop, numbering, watermark, compression, export preview, shortcuts and English/Thai preferences. New editorial copy is translated. Thai headings use available system Thai typefaces; the Noto export font remains deferred to PDF decoration. The mobile toolbar keeps four rows with Duplicate, Delete and Crop sharing the final row.

## Design tokens

- Background: mineral white `#F3F0EC`; surface: chalk `#FFFDFA`.
- Text: espresso `#382F29`; supporting text: deep taupe `#6B5E54`.
- Primary actions: earth brown `#805A45`, white text.
- Borders: limestone `#D9D1C8`; selection and control outlines use darker taupe for visibility.
- Display face: self-hosted DM Serif Display; controls and body: self-hosted DM Sans. Use bundled Latin WOFF2 assets with their OFL licenses; no font CDN requests.
- Fine rules, restrained 6–12px corners, subtle shadows. Original mascot artwork remains unchanged.

## Acceptance

- The rendered desktop homepage follows the selected composition and warm palette; Choose files is the primary action.
- At 320px and 390px, file picking and supported formats are visible on the initial screen; no horizontal overflow. Tablet and desktop layouts remain usable, including 200% desktop zoom.
- Editing, preview, password and recovery behavior is preserved. Mobile controls are at least 42px high, focus remains visible below the sticky toolbar, and non-drag page actions remain available.
- Fonts and every app asset are same-origin static resources. No document uploads, analytics, external fonts, new accounts or backend are introduced.
- Required validation: Node.js 24, `npm test`, `npm run build`, `npm run test:browser`, plus `npm run test:hosting` for deployment. Exercise synthetic PDF/JPEG/PNG/WebP, encrypted PDFs, selection, edit/undo, drag, preview, export/cancellation/retry, local recovery and mobile flows.
- Independent review uses a frozen commit; actual renders and executed interactions are distinguished from source inspection.
- Publish through a scoped branch and PR, merge after checks and review, then verify the deployed revision and live site.
