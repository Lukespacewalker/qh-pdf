# Quack & Honk PDF — Product & Architecture Design

**Status:** Approved direction, written specification for implementation review  
**Working title:** `quack-honk-pdf`  
**Date:** 2026-09-12

## 1. Product Goal

Build a free, privacy-first browser PDF workspace by Quack & Honk.

The product should help ordinary users finish document tasks without needing to understand PDF terminology such as “merge”, “extract”, or “organize”.

Core promise:

> Drop your PDFs and images in one place, arrange the pages visually, and save the result. Your documents stay on your device.

The product is also intended to introduce more people to Quack & Honk through a genuinely useful tool rather than through advertising.

## 2. Product Principles

1. **The work is the hero.** The document workspace should dominate the interface. Mascots support clarity, reassurance, warnings, and success states.
2. **Local-first by default.** Document contents must not be uploaded to a server for normal processing.
3. **No account required.** Version 1 requires no login, database, sync, or cloud storage.
4. **Task language, not PDF jargon.** Users should manipulate pages directly instead of choosing from a large toolbox of named PDF operations.
5. **Progressive engine complexity.** Use browser-native JavaScript libraries first. Add WebAssembly only when a validated feature requires it.
6. **Desktop-first, responsive/mobile-usable.** Version 1 is optimized for desktop and tablet document manipulation. Mobile must remain functional but does not need feature parity for complex drag-and-drop interactions.

## 3. Version 1 Scope

### Import

Supported inputs:

- PDF
- JPEG
- PNG
- WebP

### Workspace

The user can:

- See page thumbnails
- Mix pages from multiple source documents
- Select one or multiple pages
- Reorder pages
- Rotate pages
- Delete pages
- Duplicate pages
- Undo and redo changes
- Add more documents or images at any time

### Export

The user can:

- Export the current workspace as a new PDF
- Choose the output filename
- See progress during generation
- Cancel long-running work when technically possible

### User Feedback

The UI should provide:

- Useful loading/processing states
- Recoverable error messages
- Password-protected document messaging
- Unsupported-file messaging
- Empty state guidance
- Clear completion state

## 4. Explicitly Out of Scope for V1

Do not implement in the initial release:

- User accounts
- Backend document processing
- Database
- Cloud document storage
- AI features
- OCR
- Office-to-PDF conversion
- PDF-to-Word conversion
- Full PDF text editing
- Certificate-based digital signatures
- PDF/A conversion
- Advanced sanitization
- Advanced repair
- Aggressive PDF compression
- Workflow editor
- Plugins
- Electron
- Tauri
- Payment processing
- Patreon integration
- PWA installation requirement

These may be evaluated only after the document workspace proves useful.

## 5. Technical Stack

### Application

- React
- TypeScript
- Vite

### Styling

- Tailwind CSS
- Quack & Honk semantic design tokens
- Small reusable component layer built around accessible primitives where useful

### State

- Zustand for workspace state
- Explicit command/history model for undo and redo

### PDF Rendering

- PDF.js

Responsibilities:

- Parse source PDFs for display
- Render thumbnails
- Render larger page previews
- Read page dimensions and display metadata

### PDF Manipulation

- pdf-lib

Responsibilities for V1:

- Copy pages between documents
- Reorder pages
- Rotate pages
- Duplicate pages
- Remove pages from exported output
- Embed JPEG/PNG/WebP-derived imagery where supported by the import pipeline
- Generate final PDF

### Background Processing

Use Web Workers for operations that can block the main thread.

The UI thread must not own heavy PDF processing.

### Testing

- Vitest for domain logic and state
- React Testing Library for component behavior where appropriate
- Playwright for critical browser workflows

## 6. Engine Boundary

UI components must not call `pdf-lib` directly.

Create a domain-facing PDF engine interface.

Illustrative shape:

```ts
interface PdfEngine {
  importDocument(file: File): Promise<ImportedDocument>;
  renderThumbnail(page: PageRef, options?: RenderOptions): Promise<Blob>;
  exportWorkspace(workspace: WorkspaceSnapshot): Promise<Blob>;
}
```

The concrete V1 implementation may use PDF.js for rendering and pdf-lib for document generation/manipulation. The rest of the product should depend on application/domain interfaces rather than those libraries.

This allows future replacement or augmentation by a WebAssembly engine without rebuilding the UI.

## 7. Domain Model

The workspace is not a PDF file. It is an editable logical composition.

### SourceDocument

Represents an imported PDF or image source.

Contains:

- Stable ID
- Original filename
- Source type
- Original bytes or browser reference
- Page descriptors
- Import status
- Error state

### WorkspacePage

Represents one page in the output composition.

Contains:

- Stable workspace-page ID
- Source-document ID
- Source-page index or image reference
- Rotation
- Duplicate provenance when relevant

A duplicated page receives its own workspace-page ID.

### Workspace

Contains:

- Ordered list of `WorkspacePage`
- Selection state
- Revision/history information

The exported PDF is generated from the current workspace snapshot.

## 8. Undo / Redo

Use command-based or snapshot-delta history for meaningful document operations.

Undoable actions include:

- Reorder
- Delete
- Rotate
- Duplicate
- Multi-page move
- Multi-page delete

Importing a file should be treated as a logical action and may be undoable if implementation remains reliable.

Do not store exported PDF blobs in history.

## 9. Worker Architecture

High-level flow:

```text
React UI
   |
   | user commands
   v
Workspace / application state
   |
   | PDF jobs
   v
Worker bridge
   |
   +--> PDF.js rendering
   |
   +--> pdf-lib export/manipulation
```

Guidelines:

- Keep UI updates on the main thread.
- Perform heavy parsing/rendering/export work in workers where feasible.
- Use transferable `ArrayBuffer` objects where appropriate to avoid needless copies.
- Bound concurrency when rendering thumbnails.
- Cancel stale thumbnail jobs when pages leave the visible region.

## 10. Thumbnail Strategy

Do not render every page at full resolution.

Use:

- Low-resolution thumbnails for the workspace
- Lazy rendering for off-screen pages
- Virtualized page grids for large documents
- Higher-resolution rendering only for focused preview

The interface should remain usable with large documents even if full export takes time.

## 11. Desktop and Mobile Behavior

### Desktop

Primary V1 experience.

Support:

- Drag-and-drop file import
- Drag page reordering
- Multi-select
- Keyboard shortcuts
- Contextual page actions
- Larger preview

### Mobile

Must remain usable.

Support:

- File picker import
- Tap selection
- Explicit move controls when drag precision is poor
- Rotate
- Delete
- Duplicate
- Export

Do not require drag-and-drop as the only way to reorder pages.

## 12. Accessibility

Minimum requirements:

- All operations usable without a mouse
- Visible focus states
- Semantic buttons
- Descriptive labels
- Keyboard shortcuts must have discoverable alternatives
- Drag-and-drop must have non-drag alternatives
- Reduced-motion support
- Errors must include text, not only color or mascot expression

## 13. Quack & Honk Brand Integration

Follow the existing Quack & Honk brand and mascot guidelines.

### General rule

Mascots support real UI meaning. They do not cover document controls, content, legal copy, or data.

### Suggested mapping

- **Empty / onboarding:** Quack Hello or Empty State
- **Processing:** Quack Working
- **Analysis / preparation:** Quack Thinking when genuinely appropriate
- **Recoverable warning:** Honk Worried / Warning
- **Error:** Honk Error
- **Successful completion:** Honk Happy for normal successful export
- **Meaningful milestone:** Honk Celebrating, not every routine save

### Visual System

Use the established Quack & Honk semantic color tokens.

Light mode baseline:

- Background `#F7EFDF`
- Surface `#FFFDFA`
- Text `#10271F`
- Brand primary `#54796C`
- Accent `#B94D30`

Dark mode baseline:

- Background `#10271F`
- Surface `#17372D`
- Text `#FFFDFA`
- Accent `#F1C65D`

Maintain the existing contrast rules, especially for dark-mode accent foregrounds.

## 14. Primary UI Structure

### Application Shell

Minimal top bar:

- Product working name / Quack & Honk identity
- Add files
- Undo
- Redo
- Theme
- Help/about

Avoid a large navigation menu in V1.

### Empty Workspace

Primary action:

> Drop PDFs or images here

Secondary action:

> Choose files

Privacy reassurance:

> Your documents stay on this device.

### Active Workspace

Main area:

- Virtualized page grid
- Clear selection state
- Source-document indicators only when helpful
- Drag handles where appropriate

Contextual actions:

- Rotate
- Duplicate
- Delete

Primary completion action:

> Save PDF

### Export State

Show:

- Current progress
- Cancellation where supported
- Result filename
- Download action

No donation prompt may block export or download.

## 15. Privacy Requirements

The product must not send document bytes, rendered page content, extracted text, filenames, or document metadata to analytics.

If analytics are added later, limit them to coarse product events such as:

- Workspace opened
- Import succeeded
- Export succeeded
- Export failed
- Approximate page-count bucket

No document-sensitive payloads.

Before claiming “your files never leave your device”, verify network behavior with automated and manual tests.

## 16. Performance Requirements

Initial targets, subject to measurement:

- UI remains interactive while thumbnails are generated.
- First visible thumbnails are prioritized.
- Large documents do not cause all pages to render eagerly.
- Export does not freeze the main UI thread.
- Memory associated with removed documents/pages is released when no longer needed.

Avoid unsupported numeric speed claims in marketing.

## 17. Error Handling

Errors should use plain language and a useful next action.

### Password protected

> This PDF is password-protected. Password-protected files are not supported yet.

Action: Remove file

### Unsupported input

> This file type is not supported yet.

Action: Choose another file

### Export failure

> We couldn’t create the PDF. Your workspace is still here.

Actions:

- Try again
- Remove problematic page
- Report problem

Technical diagnostics may be available behind a secondary details action.

## 18. Testing Strategy

### Domain tests

Test:

- Page ordering
- Rotation state
- Duplication
- Deletion
- Multi-selection operations
- Undo/redo invariants

### PDF engine tests

Use fixture files covering:

- Single-page PDF
- Multi-page PDF
- Mixed page sizes
- Rotated pages
- PDF plus images
- Duplicate pages
- Large page count
- Malformed/unsupported input
- Password-protected input

Verify outputs can be reopened and page count/order/rotation are correct.

### Browser tests

Critical Playwright flows:

1. Import one PDF -> reorder -> export
2. Import two PDFs -> interleave pages -> export
3. Import images + PDF -> export
4. Rotate/delete/duplicate -> undo/redo -> export
5. Keyboard-only basic workflow
6. Mobile-size viewport basic workflow
7. Processing does not block core UI feedback

## 19. Security Considerations

- Treat imported PDFs as untrusted data.
- Keep dependencies current.
- Avoid executing embedded JavaScript from PDFs.
- Use strict CSP compatible with required workers/WASM.
- Avoid exposing file contents to third-party scripts.
- Prefer self-hosted static assets for the application workspace.
- Review PDF.js security guidance and dependency advisories before release.

## 20. Deployment

The application should build to static assets.

Supported deployment options may include:

- Cloudflare Pages
- GitHub Pages
- Amazon S3 + CloudFront
- Other static hosts

The architecture must not depend on server-side rendering.

## 21. Future Engine Expansion

Only after V1 proves the workspace model:

Potential future features:

- Better compression
- Sanitization
- PDF repair
- Rasterization
- PDF/A
- OCR
- Additional formats

At that stage, evaluate WebAssembly engines based on:

- Functional correctness
- Browser performance
- Bundle size
- Memory behavior
- License compatibility
- Maintenance quality

Do not choose a WebAssembly engine merely to market the product as “WASM-powered”.

## 22. Donation / Support Model

Not part of the document processing architecture.

Initial approach:

- Product remains usable without payment.
- No donation modal before export.
- Small optional support callout after successful completion or in About.
- Prefer a simple external Ko-fi link initially.
- Do not embed unnecessary third-party payment scripts inside the document workspace.

## 23. Success Criteria for the Prototype

The prototype is successful when:

1. A non-technical user can import multiple PDFs/images.
2. They can understand how to arrange the resulting pages without learning PDF terminology.
3. They can export the intended document successfully.
4. They can recover from common mistakes using undo/redo.
5. The app remains responsive during normal processing.
6. No document content is transmitted to a backend.
7. The Quack & Honk brand is recognizable without distracting from document work.

## 24. Recommended Implementation Sequence

This section gives sequence only. The detailed implementation plan should be written separately after this design is reviewed.

1. Application shell and brand tokens
2. Domain model
3. File import pipeline
4. PDF.js thumbnails
5. Workspace page grid
6. Reorder/select/delete/rotate/duplicate
7. Undo/redo
8. pdf-lib export engine
9. Worker boundary
10. Large-document virtualization/performance
11. Error states
12. Responsive/mobile controls
13. Accessibility pass
14. Playwright end-to-end coverage
15. Privacy/network verification
16. Deployment configuration

## 25. Non-Goals That Must Not Sneak Into V1

During implementation, reject scope creep that introduces:

- “80+ tools” parity with competitors
- A separate route for every PDF verb
- Server-side processing because one feature is inconvenient locally
- Accounts before there is a proven need
- AI for naming or ordering pages
- Advanced editor chrome that obscures the page grid
- Mascot animation that competes with user documents

The V1 product is one excellent visual document workspace, not a PDF Swiss Army knife.
