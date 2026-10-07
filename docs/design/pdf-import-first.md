# PDF import and shared tool header

**Current decision, 2026-10-07:** The user requested the QH Image header style, direct copy, a full-width file import entry point, and explanations below it. This supersedes the split welcome composition, “Bring your pages together.” headline and header in the [Editorial Stone design](../superpowers/specs/2026-10-05-editorial-stone-ui-design.md). Its palette, local fonts, processing boundaries and workspace controls remain applicable.

The header follows `D:/qh-image` at commit `2cd362eb5180b3e7b2c5624eefb35c4ead093738`: serif QH wordmark with a brown dot, a short divided subtitle, EN / ไทย buttons, and a divided sibling-tool link. PDF uses “Merge & organize” and links to QH Image in a new tab. The wordmark stays plain text so clicking the identity cannot reload an unsaved PDF workspace. The header is static; the page editing toolbar remains sticky near the viewport top.

The welcome panel spans the content width, with the existing paired mascot, “Drop PDFs or images here”, Choose files, and supported formats. Its file-picker, drop, processing, error and history behavior is preserved. The title identifies both the action and accepted documents without a separate marketing headline. Below the panel, “Merge and organize PDFs” introduces a brief description, three steps, and the existing device-local/free-use reassurance. All new copy has Thai translations.

Header and content share a 1440px outer container and 60px desktop gutters, following QH Image. Gutters shrink at 1100, 600 and 360px; the header subtitle hides at 860px. The existing hero artwork retains its 320 × 160px desktop and 180 × 90px compact display boxes. No mascot files change.

Acceptance: the import fills the content width and precedes explanations; file picking and formats remain visible at 320, 390 and 768px; English/Thai switching, keyboard import, 200% content zoom and existing document workflows remain usable. Required checks are `npm test`, `npm run build` and `npm run test:browser` on Node.js 24, with actual rendered desktop/mobile inspection. This decision authorizes a scoped branch and PR; deployment remains a separate action.
