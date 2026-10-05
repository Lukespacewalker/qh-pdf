# Locally served typography

DM Serif Display (400) and DM Sans (400, 600) Latin WOFF2 files were copied unchanged from `@fontsource/dm-serif-display@5.3.0` and `@fontsource/dm-sans@5.3.0` npm distributions. Both families are licensed under the SIL Open Font License 1.1; the original license files are shipped in [public/licenses/fonts](../../../public/licenses/fonts).

Sources:
- https://www.npmjs.com/package/@fontsource/dm-serif-display/v/5.3.0
- https://www.npmjs.com/package/@fontsource/dm-sans/v/5.3.0
- https://github.com/google/fonts/tree/main/ofl/dmserifdisplay
- https://github.com/google/fonts/tree/main/ofl/dmsans

CSS imports these files through Vite so deployed font requests remain same-origin `/assets/` GETs. No external font service is used. Non-Latin characters retain readable system fallbacks.
