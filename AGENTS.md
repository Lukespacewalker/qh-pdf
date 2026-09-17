# QH PDF development rules

Read README.md for current scope and docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md for the approved direction. The original plan is a roadmap, not a completion record.

- Keep document processing browser-local. Do not add an upload endpoint, analytics, session replay or remote document storage as a fallback.
- Never log document bytes, names, contents or metadata to an external service. Test fixtures must be synthetic or explicitly cleared for repository use.
- UI depends on PdfEngine and the workspace model, not direct pdf-lib calls.
- Preserve original source bytes. PDF.js may transfer its supplied buffer, so pass copies when those bytes are still needed for export.
- Workspace rotation is an additional rotation, not a replacement for the source page rotation.
- A missing source or invalid page must fail export visibly. Never skip requested output pages silently.
- Keep explicit non-drag controls. Use accessible labels for page selection and direction-sensitive actions.
- Use the supplied mascot artwork for matching UI states. Do not substitute poses, redraw mascots, cover controls or celebrate routine saves.
- Node.js 24 is the current CI baseline. Commit package-lock.json with dependency changes; normal CI uses npm ci and read-only repository permissions.
- Before describing work as verified, run npm test, npm run build and npm run test:browser against the same revision. Report which browser and fixture coverage was actually exercised.
- Do not suppress test failures, remove privacy assertions or raise warning thresholds merely to make CI green.
- Use a scoped branch and PR for changes. Do not deploy, change visibility or introduce credentials without explicit authorization.
