# Quack & Honk PDF Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first browser prototype where users can import PDFs/images, visually arrange pages, rotate/delete/duplicate them, undo/redo changes, and export a new PDF without uploading document content.

**Architecture:** A React + TypeScript + Vite static application owns a library-agnostic workspace domain model. PDF.js handles parsing/rendering, pdf-lib handles output generation, and heavy work is routed through a worker boundary. UI depends on domain/application interfaces rather than PDF library APIs so a future WASM engine can be added without rebuilding the workspace.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Zustand, PDF.js, pdf-lib, Web Workers, Vitest, React Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md`

## Global Constraints

- Desktop-first, responsive/mobile-usable.
- Static/local-first architecture with no backend document processing.
- No user accounts, database, cloud document storage, OCR, AI, Office conversion, or workflow editor in V1.
- Supported V1 inputs: PDF, JPEG, PNG, WebP.
- UI components must not call `pdf-lib` directly.
- The workspace is the editable source of truth; exported PDFs are generated from a workspace snapshot.
- Document bytes, rendered content, extracted text, filenames, and document metadata must not be sent to analytics.
- Drag-and-drop must have non-drag alternatives.
- Mascots support real UI states and must not obscure controls or document content.
- Routine successful export uses Honk Happy, not Honk Celebrating.

---

## Planned File Structure

```text
quack-honk-pdf/
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-09-12-quack-honk-pdf-design.md
│       └── plans/
│           └── 2026-09-12-quack-honk-pdf-prototype.md
├── public/
│   └── mascots/
│       ├── quack-hello.png
│       ├── quack-working.png
│       ├── quack-empty-state.png
│       ├── honk-happy.png
│       ├── honk-worried-warning.png
│       └── honk-error.png
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── AppShell.tsx
│   │   └── routes.ts
│   ├── brand/
│   │   ├── brand.css
│   │   └── MascotState.tsx
│   ├── domain/
│   │   ├── workspace.ts
│   │   ├── workspaceCommands.ts
│   │   └── workspace.test.ts
│   ├── engine/
│   │   ├── PdfEngine.ts
│   │   ├── BrowserPdfEngine.ts
│   │   ├── browserPdfEngine.test.ts
│   │   ├── pdfWorker.ts
│   │   └── workerBridge.ts
│   ├── import/
│   │   ├── fileTypes.ts
│   │   ├── importFiles.ts
│   │   └── importFiles.test.ts
│   ├── workspace/
│   │   ├── useWorkspaceStore.ts
│   │   ├── WorkspaceScreen.tsx
│   │   ├── EmptyWorkspace.tsx
│   │   ├── PageGrid.tsx
│   │   ├── PageCard.tsx
│   │   ├── WorkspaceToolbar.tsx
│   │   ├── ExportPanel.tsx
│   │   └── workspace-ui.test.tsx
│   ├── errors/
│   │   ├── AppError.ts
│   │   └── ErrorNotice.tsx
│   ├── lib/
│   │   ├── ids.ts
│   │   └── downloadBlob.ts
│   ├── main.tsx
│   └── index.css
├── e2e/
│   ├── fixtures/
│   │   ├── three-pages.pdf
│   │   ├── second.pdf
│   │   └── sample.png
│   └── workspace.spec.ts
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── playwright.config.ts
└── vitest.config.ts
```

### File Responsibilities

- `domain/workspace.ts`: pure workspace types and state transitions.
- `domain/workspaceCommands.ts`: undoable command definitions and history handling.
- `engine/PdfEngine.ts`: stable application-facing PDF engine contract.
- `engine/BrowserPdfEngine.ts`: PDF.js + pdf-lib implementation behind the contract.
- `engine/pdfWorker.ts`: worker-side heavy PDF operations.
- `engine/workerBridge.ts`: typed main-thread worker RPC boundary.
- `import/*`: file validation and conversion into imported source-document descriptors.
- `workspace/useWorkspaceStore.ts`: Zustand adapter around the pure domain model.
- `workspace/*`: presentation and interaction only.
- `brand/*`: Quack & Honk tokens and semantic mascot states.
- `errors/*`: normalized user-facing errors.
- `e2e/*`: browser workflows and privacy assertions.

---

### Task 1: Scaffold the Application and Brand Foundation

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/index.css`
- Create: `src/app/App.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/brand/brand.css`
- Create: `src/brand/MascotState.tsx`
- Create: mascot assets under `public/mascots/`

**Interfaces:**
- Produces: `App`, `AppShell`, and `MascotState({ state, alt, className })`.
- Consumes: Quack & Honk brand tokens and supplied PNG mascot assets.

- [ ] **Step 1: Create package metadata and dependencies**

```json
{
  "name": "quack-honk-pdf",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^5.4.149",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "zustand": "^5.0.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@tailwindcss/vite": "^4.1.13",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.13",
    "@types/react-dom": "^19.1.9",
    "@vitejs/plugin-react": "^5.0.2",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4.1.13",
    "typescript": "^5.9.2",
    "vite": "^7.1.5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Add brand tokens**

Create `src/brand/brand.css` with semantic CSS variables:

```css
:root {
  --qh-background: #F7EFDF;
  --qh-surface: #FFFDFA;
  --qh-surface-muted: #F0E5D2;
  --qh-text-primary: #10271F;
  --qh-text-secondary: #435F56;
  --qh-border: #D8CDBA;
  --qh-brand-primary: #54796C;
  --qh-accent: #B94D30;
  --qh-success: #477A58;
  --qh-warning: #A65F00;
  --qh-error: #B94735;
}

[data-theme="dark"] {
  --qh-background: #10271F;
  --qh-surface: #17372D;
  --qh-surface-muted: #23473D;
  --qh-text-primary: #FFFDFA;
  --qh-text-secondary: #D9D1C3;
  --qh-border: #48655B;
  --qh-brand-primary: #79A393;
  --qh-accent: #F1C65D;
  --qh-success: #78B88D;
  --qh-warning: #F1C65D;
  --qh-error: #EE8170;
}
```

- [ ] **Step 3: Implement semantic mascot mapping**

```tsx
export type MascotUiState =
  | "empty"
  | "welcome"
  | "working"
  | "warning"
  | "error"
  | "success";

const mascotSources: Record<MascotUiState, string> = {
  empty: "/mascots/quack-empty-state.png",
  welcome: "/mascots/quack-hello.png",
  working: "/mascots/quack-working.png",
  warning: "/mascots/honk-worried-warning.png",
  error: "/mascots/honk-error.png",
  success: "/mascots/honk-happy.png"
};
```

- [ ] **Step 4: Run build**

Run:

```bash
npm install
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold quack honk pdf app"
```

---

### Task 2: Define the Pure Workspace Domain Model

**Files:**
- Create: `src/domain/workspace.ts`
- Create: `src/domain/workspace.test.ts`
- Create: `src/lib/ids.ts`

**Interfaces:**
- Produces:
  - `SourceDocument`
  - `WorkspacePage`
  - `WorkspaceState`
  - `createEmptyWorkspace()`
  - `appendPages()`
  - `movePages()`
  - `rotatePages()`
  - `deletePages()`
  - `duplicatePages()`
- Consumes: no UI or PDF-library code.

- [ ] **Step 1: Write failing tests for ordering, rotation, delete, and duplicate**

```ts
import { describe, expect, it } from "vitest";
import {
  createEmptyWorkspace,
  appendPages,
  movePages,
  rotatePages,
  deletePages,
  duplicatePages
} from "./workspace";

describe("workspace", () => {
  it("reorders selected pages without changing their relative order", () => {
    let state = createEmptyWorkspace();
    state = appendPages(state, [
      { id: "a", sourceDocumentId: "doc", sourcePageIndex: 0, rotation: 0 },
      { id: "b", sourceDocumentId: "doc", sourcePageIndex: 1, rotation: 0 },
      { id: "c", sourceDocumentId: "doc", sourcePageIndex: 2, rotation: 0 }
    ]);

    state = movePages(state, ["a", "b"], 3);

    expect(state.pages.map(p => p.id)).toEqual(["c", "a", "b"]);
  });

  it("rotates pages in 90 degree increments", () => {
    let state = appendPages(createEmptyWorkspace(), [
      { id: "a", sourceDocumentId: "doc", sourcePageIndex: 0, rotation: 0 }
    ]);

    state = rotatePages(state, ["a"], 90);

    expect(state.pages[0].rotation).toBe(90);
  });

  it("deletes selected pages", () => {
    let state = appendPages(createEmptyWorkspace(), [
      { id: "a", sourceDocumentId: "doc", sourcePageIndex: 0, rotation: 0 },
      { id: "b", sourceDocumentId: "doc", sourcePageIndex: 1, rotation: 0 }
    ]);

    state = deletePages(state, ["a"]);

    expect(state.pages.map(p => p.id)).toEqual(["b"]);
  });

  it("duplicates with a distinct workspace id", () => {
    let state = appendPages(createEmptyWorkspace(), [
      { id: "a", sourceDocumentId: "doc", sourcePageIndex: 0, rotation: 0 }
    ]);

    state = duplicatePages(state, ["a"], () => "a-copy");

    expect(state.pages.map(p => p.id)).toEqual(["a", "a-copy"]);
    expect(state.pages[1].sourcePageIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
npm test -- src/domain/workspace.test.ts
```

Expected: FAIL because workspace functions do not exist.

- [ ] **Step 3: Implement minimal immutable transitions**

Use a `WorkspaceState` with ordered `pages` and a `selectedPageIds` set represented as an array for serialization.

Normalize rotations to `0 | 90 | 180 | 270`.

- [ ] **Step 4: Re-run tests**

```bash
npm test -- src/domain/workspace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain src/lib/ids.ts
git commit -m "feat: add workspace domain model"
```

---

### Task 3: Add Undo/Redo as Domain Commands

**Files:**
- Create: `src/domain/workspaceCommands.ts`
- Modify: `src/domain/workspace.test.ts`

**Interfaces:**
- Produces:
  - `HistoryState`
  - `createHistory(initial)`
  - `execute(history, command)`
  - `undo(history)`
  - `redo(history)`
  - `WorkspaceCommand`
- Consumes: pure `WorkspaceState` transitions from Task 2.

- [ ] **Step 1: Add failing undo/redo tests**

```ts
it("undoes and redoes a rotation", () => {
  const initial = appendPages(createEmptyWorkspace(), [
    { id: "a", sourceDocumentId: "doc", sourcePageIndex: 0, rotation: 0 }
  ]);

  let history = createHistory(initial);
  history = execute(history, {
    type: "rotate",
    pageIds: ["a"],
    delta: 90
  });

  expect(history.present.pages[0].rotation).toBe(90);

  history = undo(history);
  expect(history.present.pages[0].rotation).toBe(0);

  history = redo(history);
  expect(history.present.pages[0].rotation).toBe(90);
});
```

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/domain/workspace.test.ts
```

- [ ] **Step 3: Implement bounded history**

Use:

```ts
export interface HistoryState {
  past: WorkspaceState[];
  present: WorkspaceState;
  future: WorkspaceState[];
}
```

Limit `past` to 100 entries.

- [ ] **Step 4: Verify tests pass**

```bash
npm test -- src/domain/workspace.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: add workspace undo redo"
```

---

### Task 4: Define PDF Engine and Import Contracts

**Files:**
- Create: `src/engine/PdfEngine.ts`
- Create: `src/import/fileTypes.ts`
- Create: `src/import/importFiles.ts`
- Create: `src/import/importFiles.test.ts`
- Create: `src/errors/AppError.ts`

**Interfaces:**
- Produces:

```ts
export interface ImportedPageDescriptor {
  sourcePageIndex: number;
  width: number;
  height: number;
}

export interface ImportedDocument {
  id: string;
  fileName: string;
  kind: "pdf" | "image";
  bytes: ArrayBuffer;
  pages: ImportedPageDescriptor[];
}

export interface PdfEngine {
  importFile(file: File): Promise<ImportedDocument>;
  renderThumbnail(
    document: ImportedDocument,
    pageIndex: number,
    maxWidth: number
  ): Promise<Blob>;
  exportWorkspace(
    documents: ReadonlyMap<string, ImportedDocument>,
    workspace: WorkspaceState,
    signal?: AbortSignal
  ): Promise<Blob>;
}
```

- [ ] **Step 1: Write failing validation tests**

Cover accepted MIME/extensions:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`

Reject unsupported types with `AppError(code: "unsupported-file")`.

- [ ] **Step 2: Run tests and verify failure**

```bash
npm test -- src/import/importFiles.test.ts
```

- [ ] **Step 3: Implement validation and normalized errors**

`AppError` must expose:

```ts
type AppErrorCode =
  | "unsupported-file"
  | "password-protected"
  | "invalid-pdf"
  | "import-failed"
  | "export-failed";
```

- [ ] **Step 4: Verify tests pass**

```bash
npm test -- src/import/importFiles.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/import src/engine/PdfEngine.ts src/errors/AppError.ts
git commit -m "feat: define pdf engine and import contracts"
```

---

### Task 5: Implement Browser PDF Import and Thumbnail Rendering

**Files:**
- Create: `src/engine/BrowserPdfEngine.ts`
- Create: `src/engine/browserPdfEngine.test.ts`

**Interfaces:**
- Implements `PdfEngine.importFile()` and `PdfEngine.renderThumbnail()`.
- Consumes `pdfjs-dist`.
- Produces `ImportedDocument` and thumbnail `Blob`s.

- [ ] **Step 1: Add fixture-based failing import test**

```ts
it("imports a three page pdf with dimensions", async () => {
  const file = await fixtureFile("three-pages.pdf", "application/pdf");
  const doc = await engine.importFile(file);

  expect(doc.kind).toBe("pdf");
  expect(doc.pages).toHaveLength(3);
  expect(doc.pages.every(p => p.width > 0 && p.height > 0)).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/engine/browserPdfEngine.test.ts
```

- [ ] **Step 3: Implement PDF.js parsing**

Configure the PDF.js worker URL for Vite. Disable any embedded PDF JavaScript execution path. Convert image imports to one-page `ImportedDocument` descriptors.

- [ ] **Step 4: Implement thumbnail rendering**

Render to an `OffscreenCanvas` when available; use regular canvas fallback in environments that require it.

- [ ] **Step 5: Verify engine tests**

```bash
npm test -- src/engine/browserPdfEngine.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine e2e/fixtures
git commit -m "feat: import pdfs and render thumbnails"
```

---

### Task 6: Build the Zustand Workspace Adapter

**Files:**
- Create: `src/workspace/useWorkspaceStore.ts`
- Create: `src/workspace/workspace-ui.test.tsx`

**Interfaces:**
- Produces:
  - `useWorkspaceStore()`
  - actions `addDocuments`, `selectPages`, `movePages`, `rotateSelected`, `deleteSelected`, `duplicateSelected`, `undo`, `redo`
- Consumes domain command/history APIs and `PdfEngine`.

- [ ] **Step 1: Write a failing store integration test**

Test that adding an imported document creates workspace pages in source order and that undo removes the import as one logical action.

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 3: Implement the store**

Store:
- imported document map
- history state
- operation status
- current error
- export state

Do not store raw PDF-library objects in Zustand.

- [ ] **Step 4: Verify test pass**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/workspace/useWorkspaceStore.ts src/workspace/workspace-ui.test.tsx
git commit -m "feat: connect workspace domain to app state"
```

---

### Task 7: Build Empty State and File Import UX

**Files:**
- Create: `src/workspace/WorkspaceScreen.tsx`
- Create: `src/workspace/EmptyWorkspace.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/workspace/workspace-ui.test.tsx`

**Interfaces:**
- Empty state accepts files by picker and drag/drop.
- Consumes `useWorkspaceStore().addDocuments`.

- [ ] **Step 1: Write failing UI tests**

Assert:
- “Drop PDFs or images here” is visible.
- “Choose files” opens a file input.
- Unsupported file results in visible error text.
- Drag/drop is not the only import path.

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 3: Implement empty-state UI**

Copy:

- Heading: `Put your pages in order.`
- Body: `Drop PDFs or images here. Your documents stay on this device.`
- Primary action: `Choose files`

Use Quack Hello or Empty State beside, not over, the drop area.

- [ ] **Step 4: Verify UI tests**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/app src/workspace
git commit -m "feat: add local file import experience"
```

---

### Task 8: Build the Visual Page Grid and Editing Controls

**Files:**
- Create: `src/workspace/PageGrid.tsx`
- Create: `src/workspace/PageCard.tsx`
- Create: `src/workspace/WorkspaceToolbar.tsx`
- Modify: `src/workspace/WorkspaceScreen.tsx`
- Modify: `src/workspace/workspace-ui.test.tsx`

**Interfaces:**
- `PageCard` receives page state and thumbnail.
- Grid emits selection and move commands.
- Toolbar executes rotate, duplicate, delete, undo, redo.

- [ ] **Step 1: Add failing interaction tests**

Test:
- select page
- multi-select with additive modifier
- rotate selected
- duplicate selected
- delete selected
- undo and redo buttons
- move selected pages using explicit “Move before/after” control

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 3: Implement the grid and controls**

Desktop:
- drag handles may be added
- explicit move controls must remain available

Mobile:
- no feature may require precision dragging

Each card must expose an accessible label such as `Page 3 from report.pdf`.

- [ ] **Step 4: Verify tests**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/workspace
git commit -m "feat: add visual page workspace"
```

---

### Task 9: Implement PDF Export with pdf-lib

**Files:**
- Modify: `src/engine/BrowserPdfEngine.ts`
- Modify: `src/engine/browserPdfEngine.test.ts`
- Create: `src/lib/downloadBlob.ts`

**Interfaces:**
- Implements `PdfEngine.exportWorkspace()`.
- Consumes imported document bytes and ordered workspace pages.
- Produces `Blob` with MIME `application/pdf`.

- [ ] **Step 1: Add failing export tests**

Verify:
- interleaved pages from two PDFs export in workspace order
- duplicated pages appear twice
- deleted pages are absent
- 90/180/270 rotation is applied
- image source pages export into the PDF

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/engine/browserPdfEngine.test.ts
```

- [ ] **Step 3: Implement pdf-lib export**

For PDF pages:
- load source via `PDFDocument.load`
- copy source page into destination
- apply workspace rotation

For images:
- embed JPEG or PNG
- convert WebP to PNG/JPEG browser-side before reaching pdf-lib if direct embedding is unavailable

- [ ] **Step 4: Reopen exported bytes in the test**

Use PDF.js or pdf-lib in tests to confirm page count/order-sensitive metadata.

- [ ] **Step 5: Verify tests**

```bash
npm test -- src/engine/browserPdfEngine.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/engine src/lib/downloadBlob.ts
git commit -m "feat: export workspace as pdf"
```

---

### Task 10: Add Worker Boundary and Progress UX

**Files:**
- Create: `src/engine/pdfWorker.ts`
- Create: `src/engine/workerBridge.ts`
- Modify: `src/engine/BrowserPdfEngine.ts`
- Create: `src/workspace/ExportPanel.tsx`
- Modify: `src/workspace/WorkspaceScreen.tsx`

**Interfaces:**
- `workerBridge.exportWorkspace(...)`
- `workerBridge.renderThumbnail(...)`
- progress messages:
  - `{ type: "progress"; jobId: string; completed: number; total: number }`
  - `{ type: "success"; jobId: string; payload: ArrayBuffer }`
  - `{ type: "error"; jobId: string; code: AppErrorCode; message: string }`

- [ ] **Step 1: Write bridge protocol tests**

Ensure stale job results are ignored and cancellation removes pending callbacks.

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/engine
```

- [ ] **Step 3: Implement typed worker bridge**

Transfer `ArrayBuffer`s rather than cloning where safe.

- [ ] **Step 4: Implement export status UI**

States:
- idle
- exporting
- success
- error

Normal success uses Honk Happy.

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/engine src/workspace
git commit -m "feat: move heavy pdf work behind worker bridge"
```

---

### Task 11: Add Large-Document Thumbnail Scheduling

**Files:**
- Create: `src/workspace/useThumbnailQueue.ts`
- Modify: `src/workspace/PageGrid.tsx`
- Modify: `src/workspace/PageCard.tsx`
- Create: `src/workspace/useThumbnailQueue.test.ts`

**Interfaces:**
- `useThumbnailQueue({ pages, visiblePageIds, engine, documents })`
- Limits concurrent thumbnail jobs to 3.
- Cancels/ignores stale jobs.

- [ ] **Step 1: Write failing queue tests**

Test that:
- visible pages are scheduled before off-screen pages
- no more than 3 jobs execute concurrently
- stale results do not overwrite newer ones

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/workspace/useThumbnailQueue.test.ts
```

- [ ] **Step 3: Implement queue**

Use `IntersectionObserver` in the UI layer to update visible page IDs.

- [ ] **Step 4: Verify tests**

```bash
npm test -- src/workspace/useThumbnailQueue.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/workspace
git commit -m "perf: prioritize visible pdf thumbnails"
```

---

### Task 12: Normalize User-Facing Errors

**Files:**
- Create: `src/errors/ErrorNotice.tsx`
- Modify: `src/engine/BrowserPdfEngine.ts`
- Modify: `src/workspace/WorkspaceScreen.tsx`
- Modify: `src/workspace/workspace-ui.test.tsx`

**Interfaces:**
- `ErrorNotice({ error, onDismiss, onRemoveProblemSource? })`
- Uses `AppErrorCode`.

- [ ] **Step 1: Add failing copy tests**

Exact V1 copy:

Password protected:

`This PDF is password-protected. Password-protected files are not supported yet.`

Unsupported:

`This file type is not supported yet.`

Export:

`We couldn’t create the PDF. Your workspace is still here.`

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 3: Implement normalized error display**

Warning/error mascots must match semantic state and never be decorative.

- [ ] **Step 4: Verify tests**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/errors src/workspace src/engine
git commit -m "feat: add recoverable pdf error states"
```

---

### Task 13: Keyboard, Mobile, and Accessibility Pass

**Files:**
- Modify: `src/app/AppShell.tsx`
- Modify: `src/workspace/PageGrid.tsx`
- Modify: `src/workspace/PageCard.tsx`
- Modify: `src/workspace/WorkspaceToolbar.tsx`
- Modify: `src/index.css`
- Modify: `src/workspace/workspace-ui.test.tsx`

**Interfaces:**
- Keyboard shortcuts:
  - `Ctrl/Cmd+Z`: undo
  - `Ctrl/Cmd+Shift+Z`: redo
  - `Delete/Backspace`: delete selected when focus context permits
  - `R`: rotate selected only when no text input has focus

- [ ] **Step 1: Add failing keyboard/accessibility tests**

Assert:
- controls have names
- page selection is keyboard reachable
- non-drag move control exists
- focus remains logical after deleting a selected page
- reduced-motion media query disables decorative transitions

- [ ] **Step 2: Verify failure**

```bash
npm test -- src/workspace/workspace-ui.test.tsx
```

- [ ] **Step 3: Implement keyboard and responsive behavior**

At small widths:
- toolbar wraps or moves into a bottom action area
- page cards remain tappable
- reorder controls remain explicit

- [ ] **Step 4: Verify tests**

```bash
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: improve mobile and keyboard accessibility"
```

---

### Task 14: Add End-to-End Workflows and Privacy Guard

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/workspace.spec.ts`
- Add fixture PDFs/images under `e2e/fixtures/`

**Interfaces:**
- Browser-level proof of critical user journeys.
- Network guard fails if document-sensitive POST/PUT requests occur.

- [ ] **Step 1: Write E2E flow for single-PDF editing**

```ts
test("import, reorder, rotate, export", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose files").setInputFiles("e2e/fixtures/three-pages.pdf");

  await expect(page.getByLabel(/Page 1 from three-pages.pdf/)).toBeVisible();

  // Select and rotate.
  await page.getByLabel(/Page 1 from three-pages.pdf/).click();
  await page.getByRole("button", { name: "Rotate right" }).click();

  await page.getByRole("button", { name: "Save PDF" }).click();
  await expect(page.getByText("Your PDF is ready.")).toBeVisible();
});
```

- [ ] **Step 2: Add mixed-document E2E flow**

Import:
- `three-pages.pdf`
- `second.pdf`
- `sample.png`

Reorder and export.

- [ ] **Step 3: Add privacy network assertion**

Register request listener. Fail if any non-static outbound request contains:
- multipart/form-data
- application/pdf
- image payload
- source filename in query/body

Allow only same-origin static asset requests required to load the application.

- [ ] **Step 4: Run E2E**

```bash
npx playwright install chromium
npm run e2e
```

Expected: all critical flows pass.

- [ ] **Step 5: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: cover local pdf workflows end to end"
```

---

### Task 15: Final Verification and Static Deployment Readiness

**Files:**
- Modify: `README.md`
- Modify: `vite.config.ts` only if deployment base-path configuration is required.

**Interfaces:**
- Produces a static `dist/` build.
- Documents local development, privacy posture, and V1 limitations.

- [ ] **Step 1: Run complete verification**

```bash
npm test
npm run build
npm run e2e
```

Expected:
- unit/component tests PASS
- TypeScript build PASS
- Vite production build PASS
- Playwright flows PASS

- [ ] **Step 2: Inspect production output**

Run:

```bash
npm run build
du -sh dist
find dist -maxdepth 2 -type f | sort
```

Confirm no source PDF fixtures or user data are present in `dist`.

- [ ] **Step 3: Manually verify network privacy**

Run development server, import a real local PDF, edit, export, and inspect browser Network panel.

Expected:
- no document payload uploads
- no filename leakage to external requests
- no third-party analytics in workspace

- [ ] **Step 4: Document V1 limitations**

README must state:
- browser/local processing
- supported formats
- password-protected PDFs not supported yet
- no OCR
- no cloud sync
- no claim of “100% secure”

- [ ] **Step 5: Commit**

```bash
git add README.md vite.config.ts
git commit -m "docs: document prototype usage and privacy"
```

---

## Self-Review

### Spec Coverage

Covered:
- static/local-first architecture
- supported import formats
- workspace page model
- reorder/rotate/delete/duplicate
- undo/redo
- PDF.js rendering
- pdf-lib export
- worker boundary
- large-document thumbnail scheduling
- useful error states
- responsive/mobile controls
- keyboard accessibility
- Quack & Honk semantic mascot use
- privacy/network verification
- automated tests
- static deployment readiness
- no forced donation/payment flow

Explicitly deferred per spec:
- OCR
- Office conversion
- PDF text editing
- certificate signatures
- advanced compression
- PDF/A
- advanced repair
- sanitization
- cloud storage
- accounts
- AI
- workflow editor
- desktop wrappers
- PWA requirement

### Placeholder Scan

No implementation steps depend on TBD/TODO placeholders.

### Type Consistency

The plan consistently uses:
- `SourceDocument` / `ImportedDocument` only at their defined boundaries
- `WorkspacePage`
- `WorkspaceState`
- `PdfEngine`
- `AppError`
- `HistoryState`
- the same worker job/result vocabulary
