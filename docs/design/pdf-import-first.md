# PDF import and shared tool header

## Welcome page order, 2026-11-22

The full-width drop zone comes first on desktop and mobile. The marketing title, tagline and privacy reassurance follow it as a separate section. This supersedes the split layout below.

## Welcome and compression redesign, 2026-11-21

The header carries the static PDF identity and language switch. The welcome screen mirrors the QH Image redesign with a two-part headline, a short description, and a file picker beside the paired mascot. On narrow screens the introduction sits above the picker. Two compact cards near the footer introduce QH Image and the Quack & Honk studio. The cards appear only in the empty workspace.

After import, the Compression settings link beside Add files takes keyboard and pointer users directly to the level selector. Choosing a level changes both save labels to indicate compression for all pages or the selected subset. The default is Off. The save panel reports progress, failures and the measured result beside the action.

This decision supersedes the earlier full-width desktop picker, literal headline, numbered steps and outbound header link. Earlier decisions below document their original scope.

**Header and footer update, 2026-11-21:** Follow the current [Quack & Honk Image Optimizer](https://image.quackandhonk.com/) header and footer. The header uses the PDF icon, the company wordmark and a PDF descriptor. Keep the wordmark static so it cannot reload an open workspace. At compact widths the QH Image link moves to the footer. The semantic footer pairs the studio credit with a Formats & privacy dialog covering PDF-specific formats and local recovery. This supersedes the QH PDF wordmark, divided subtitle and bottom brand banner described below.

**Current decision, 2026-10-07:** The user requested the QH Image header style, direct copy, a full-width file import entry point, and explanations below it. This supersedes the split welcome composition, “Bring your pages together.” headline and header in the [Editorial Stone design](../superpowers/specs/2026-10-05-editorial-stone-ui-design.md). Its palette, local fonts, processing boundaries and workspace controls remain applicable.

**Copy and release update, 2026-10-08:** The user requested concise, literal copy and completion through deployment. The entry title is now “Add PDFs or images”, with a direct drag/picker instruction. The explanation repeats no introductory paragraph: Add files, Arrange pages and Save PDF each have one short description. The footer uses “By” and “Visit Quack & Honk”; the save panel uses “Save PDF”. These replace the earlier wording below. English and Thai retain the existing privacy, recovery and password qualifications. Merge and production deployment are authorized for this change after the required checks and review.

The header follows `D:/qh-image` at commit `2cd362eb5180b3e7b2c5624eefb35c4ead093738`: serif QH wordmark with a brown dot, a short divided subtitle, EN / ไทย buttons, and a divided sibling-tool link. PDF uses “Merge & organize” and links to QH Image in a new tab. The wordmark stays plain text so clicking the identity cannot reload an unsaved PDF workspace. The header is static; the page editing toolbar remains sticky near the viewport top.

The welcome panel spans the content width, with the existing paired mascot, a direct PDF/image import title, Choose files, and supported formats. Its file-picker, drop, processing, error and history behavior is preserved. The title identifies both the action and accepted documents without a separate marketing headline. Below the panel, “Merge and organize PDFs” introduces three concise steps and the existing device-local/free-use reassurance. The original 2026-10-07 entry title was “Drop PDFs or images here”; the copy update above supersedes it. All new copy has Thai translations.

Header and content share a 1440px outer container and 60px desktop gutters, following QH Image. Gutters shrink at 1100, 600 and 360px; the header subtitle hides at 860px. The existing hero artwork retains its 320 × 160px desktop and 180 × 90px compact display boxes. No mascot files change.

Acceptance: the import fills the content width and precedes explanations; file picking and formats remain visible at 320, 390 and 768px; English/Thai switching, keyboard import, 200% content zoom and existing document workflows remain usable. Required checks are `npm test`, `npm run build` and `npm run test:browser` on Node.js 24, with actual rendered desktop/mobile inspection. Deployment also requires `npm run test:hosting`, a verified PR merge and successful production workflow/live checks.
