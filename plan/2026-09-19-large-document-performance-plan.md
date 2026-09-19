# Large-document performance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep QH PDF responsive while importing, previewing, exporting, and cancelling synthetic documents from 10 through 500 pages, without moving document processing off-device or weakening export correctness.

**Architecture:** Preserve `PdfEngine` as the UI boundary. Move `pdf-lib` assembly into a fresh module worker per export, transfer copies of only the referenced source buffers, report per-page progress, and terminate the worker on cancellation. Keep thumbnail rendering behind a bounded scheduler and an intersection-observer gate; use browser-native rendering containment for the first virtualization step so drag, keyboard, and arrow reordering continue to see every page.

**Tech stack:** React 19, TypeScript 5.9, Vite 7 module workers, PDF.js 6, pdf-lib 1.17, Vitest 4, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-09-12-quack-honk-pdf-design.md`

## Global constraints

- All document processing remains browser-local. No upload endpoint, telemetry, analytics, session replay, or remote storage may be added.
- The UI depends on `PdfEngine` and the workspace model; UI modules never import `pdf-lib`.
- Original source buffers, encrypted originals, filenames, and password handling keep their current privacy semantics. Worker transfers use copies so retained source bytes are never detached.
- Source rotation plus workspace rotation remains additive. Missing sources and invalid requested pages fail the entire export visibly.
- Cancellation leaves the workspace and original bytes intact, produces no download, and is not presented as an error.
- Thumbnail work is bounded to two concurrent jobs, visible/near-visible pages are scheduled before distant pages, and queued work is cancelled when its card leaves the observation margin.
- Drag handles, keyboard drag, and explicit left/right buttons remain available. Browser-native rendering containment must not remove off-screen pages from accessibility or reorder semantics.
- Synthetic fixtures only. Benchmark artifacts must not contain source filenames or document data.
- Node.js 24 is the verification baseline. Do not raise Vite warning thresholds, suppress failures, or remove privacy assertions.
- Required final checks are `npm test`, `npm run build`, and `npm run test:browser` on the same revision, plus the dedicated large-document benchmark.

## Review focus

- A source document reused by many workspace pages: transfer one copied buffer per source and preserve every requested duplicate and rotation.
- Cancellation racing with worker completion or QPDF encryption: settle once, terminate active workers, create no download, and permit an immediate retry.
- Worker construction, message deserialization, or worker runtime failure: return the existing safe export error without leaking parser diagnostics.
- Fast scrolling across hundreds of cards: cap active thumbnail work, revoke stale object URLs, and render thumbnails again when cards re-enter the observation margin.
- Browsers without `IntersectionObserver` or `content-visibility`: fall back to rendering thumbnails and retain all editing controls.

---

### Task 1: Mechanism-based header copy and benchmark harness

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `e2e/workspace.spec.ts`
- Modify: `package.json`
- Create: `playwright.performance.config.ts`
- Create: `performance/large-document.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing visible workspace and Save PDF controls.
- Produces: `npm run bench:large-documents`; one JSON attachment per page count containing `importMs`, `firstThumbnailMs`, `thumbnailCount`, `thumbnailsPerSecond`, `exportMs`, `maxMainThreadGapMs`, `approxPeakJsHeapBytes`, and `cancelMs`.

- [ ] **Step 1: Pin the header behavior with a failing browser assertion**

  Add to the existing empty-state test in `e2e/workspace.spec.ts`:

  ```ts
  await expect(page.getByText('Runs in your browser', { exact: true })).toBeVisible();
  await expect(page.getByText('Private · Browser-based', { exact: true })).toHaveCount(0);
  ```

- [ ] **Step 2: Run the focused test and observe RED**

  Run: `volta run --node 24 npm run build && volta run --node 24 npx playwright test e2e/workspace.spec.ts --grep "all six"`

  Expected: FAIL because the old header still says `Private · Browser-based`.

- [ ] **Step 3: Change the header to the mechanism claim**

  Format `src/app/App.tsx` readably and replace the header subtitle with:

  ```tsx
  <div className="sub">Runs in your browser</div>
  ```

- [ ] **Step 4: Run the focused browser test and observe GREEN**

  Run: `volta run --node 24 npm run build && volta run --node 24 npx playwright test e2e/workspace.spec.ts --grep "all six"`

  Expected: PASS.

- [ ] **Step 5: Add an opt-in Playwright benchmark without changing product behavior**

  Create `playwright.performance.config.ts` from the regular Playwright configuration, with `testDir: './performance'`, one Chromium worker, a 15-minute test timeout, production preview on port 4174, and `trace: 'off'`. Add:

  ```json
  "bench:large-documents": "npm run build && playwright test --config=playwright.performance.config.ts"
  ```

  The benchmark must:

  - generate synthetic, blank PDFs with literal widths that identify page order;
  - default to page counts `10,50,100,300,500`, overridable through `QH_PDF_BENCH_PAGES`;
  - measure import-to-workspace, first visible thumbnail, thumbnail throughput while scrolling, export-to-download, maximum browser timer gap during export, and approximate Chromium JS heap peak;
  - cancel a second export at the largest requested count and assert the full workspace remains editable with no download;
  - attach JSON via `test.info().attach` and write only measurements—not bytes or filenames—to `test-results/large-document-benchmark.json`;
  - explicitly label heap data as an approximation when `performance.memory` is unavailable.

  Add `test-results/` coverage already present in `.gitignore`; add `performance-results/` only if the implementation uses that separate directory.

- [ ] **Step 6: Run a 10-page harness smoke check**

  Run: `$env:QH_PDF_BENCH_PAGES='10'; volta run --node 24 npm run bench:large-documents; Remove-Item Env:QH_PDF_BENCH_PAGES`

  Expected before later tasks: measurement fields are emitted; the cancellation assertion may be marked expected-to-fail until Task 3, but the harness itself must load the production build and produce the other timings.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/App.tsx e2e/workspace.spec.ts package.json playwright.performance.config.ts performance/large-document.spec.ts .gitignore plan
  git commit -m "test: add large document benchmark plan"
  ```

### Task 2: Export assembly worker and source-byte safety

**Files:**
- Create: `src/engine/PdfExportProtocol.ts`
- Create: `src/engine/assemblePdf.ts`
- Create: `src/engine/PdfExport.worker.ts`
- Create: `src/engine/PdfExport.ts`
- Create: `src/engine/PdfExport.test.ts`
- Modify: `src/engine/BrowserPdfEngine.ts`
- Modify: `src/engine/BrowserPdfEngine.test.ts`
- Modify: `src/engine/BrowserPdfEngine.password.test.ts`

**Interfaces:**
- Consumes: `ImportedDocument`, `WorkspaceState`, and the existing `lockPdf` password worker.
- Produces:

  ```ts
  export interface ExportProgress {
    phase: 'assembling' | 'protecting';
    completed: number;
    total: number;
  }

  export interface PdfExportOptions extends PdfPasswordOptions {
    signal?: AbortSignal;
    onProgress?: (progress: ExportProgress) => void;
  }

  export function runPdfExport(
    documents: ReadonlyMap<string, ImportedDocument>,
    workspace: WorkspaceState,
    options?: PdfExportOptions,
  ): Promise<ArrayBuffer>;
  ```

- [ ] **Step 1: Write failing worker-bridge lifecycle tests**

  In `PdfExport.test.ts`, install a complete fake `Worker` and cover these observable contracts:

  1. one copied buffer per referenced document is posted as a transferable and original buffers retain their bytes;
  2. duplicate workspace pages do not duplicate the source payload;
  3. progress messages reach `onProgress` in order;
  4. a result terminates the worker and resolves the returned bytes;
  5. abort terminates the worker, rejects with `AbortError`, and ignores a later result;
  6. worker construction, `error`, and `messageerror` reject with `AppError('export-failed', ...)`;
  7. a missing document and invalid page are rejected before a worker is started.

- [ ] **Step 2: Run the worker tests and observe RED**

  Run: `volta run --node 24 npx vitest run src/engine/PdfExport.test.ts`

  Expected: FAIL because `runPdfExport` does not exist.

- [ ] **Step 3: Implement the protocol, pure assembler, worker, and bridge**

  `PdfExportProtocol.ts` contains serializable document/page payloads and these responses:

  ```ts
  export type PdfExportResponse =
    | { type: 'progress'; progress: ExportProgress }
    | { type: 'result'; bytes: ArrayBuffer }
    | { type: 'error'; message: string };
  ```

  `PdfExport.ts` must validate all page references before worker creation, include only referenced documents, omit filenames, choose `unlockedBytes ?? bytes`, create `.slice(0)` copies, and transfer those copies. It settles exactly once and always terminates its worker.

  `assemblePdf.ts` owns all `pdf-lib` imports. It reconstructs requested PDF pages, JPEG/PNG image pages, and WebP pages converted with `createImageBitmap` plus `OffscreenCanvas.convertToBlob`. It preserves additive rotation and throws on every invalid source/page. It calls progress after each output page.

  `PdfExport.worker.ts` calls `assemblePdf`, posts progress, returns the final buffer as a transferable, and maps all errors to the fixed message `We couldn’t create the PDF. Your workspace is still here.`

  Remove the static `pdf-lib` import and assembly loop from `BrowserPdfEngine.ts`; call `runPdfExport`, then optionally call `lockPdf`, and return the result as an `application/pdf` Blob.

- [ ] **Step 4: Run worker and real-output tests and observe GREEN**

  Run: `volta run --node 24 npx vitest run src/engine/PdfExport.test.ts src/engine/BrowserPdfEngine.test.ts src/engine/BrowserPdfEngine.password.test.ts`

  Expected: all worker lifecycle, real PDF order/rotation, password, repeated-export, missing-source, and invalid-page tests pass.

- [ ] **Step 5: Confirm the worker chunk owns pdf-lib**

  Run: `volta run --node 24 npm run build`

  Expected: build succeeds; the generated export-worker chunk contains pdf-lib assembly code and the main application chunk no longer statically contains the `PDFDocument` export path. Record actual chunk sizes in the execution ledger; do not change Vite warning thresholds.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/engine
  git commit -m "feat: assemble exports in a dedicated worker"
  ```

### Task 3: Export progress and cancellation UI

**Files:**
- Modify: `src/engine/PdfEngine.ts`
- Modify: `src/engine/PdfExport.ts`
- Modify: `src/engine/PdfSecurity.ts`
- Modify: `src/engine/PdfSecurity.test.ts`
- Modify: `src/engine/BrowserPdfEngine.ts`
- Modify: `src/workspace/WorkspaceScreen.tsx`
- Modify: `src/workspace/SavePanel.tsx`
- Modify: `src/index.css`
- Modify: `e2e/workspace.spec.ts`
- Modify: `performance/large-document.spec.ts`

**Interfaces:**
- Consumes: `PdfExportOptions`, progress emitted by Task 2, and the existing password worker.
- Produces: accessible progress text/progressbar and a `Cancel export` button backed by one `AbortController` per save attempt.

- [ ] **Step 1: Write failing cancellation and progress tests**

  Extend `PdfSecurity.test.ts` with a lock operation that aborts before response and asserts worker termination plus `AbortError`. Extend `e2e/workspace.spec.ts` with a synthetic multi-page export that asserts:

  ```ts
  await expect(page.getByRole('progressbar', { name: 'Creating PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel export' }).click();
  await expect(page.getByText('Export cancelled. Your workspace is still here.')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(pageCount);
  await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled();
  ```

  Use a test-only `PdfEngine` component test only if the real worker completes too quickly for deterministic Playwright cancellation; do not add test delays or debug hooks to production.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `volta run --node 24 npx vitest run src/engine/PdfSecurity.test.ts && volta run --node 24 npm run build && volta run --node 24 npx playwright test e2e/workspace.spec.ts --grep "cancel"`

  Expected: FAIL because export cannot yet be cancelled and no progressbar exists.

- [ ] **Step 3: Thread progress and AbortSignal through the engine**

  Change `PdfEngine.exportWorkspace` to accept `PdfExportOptions`. `BrowserPdfEngine` forwards `signal` and assembly progress to `runPdfExport`; before QPDF locking it emits `{ phase: 'protecting', completed: total, total }` and passes the same signal into `lockPdf`.

  Extend `PdfSecurity.runJob` to attach one abort listener, terminate the QPDF worker on abort, remove the listener on every settle path, and reject with `DOMException('Export cancelled', 'AbortError')`. Import unlock remains unchanged unless a signal is explicitly supplied later.

- [ ] **Step 4: Add accessible UI state**

  `WorkspaceScreen` owns the active `AbortController` and progress value. During export:

  - editing/import/recovery stays locked;
  - SavePanel shows `Cancel export` instead of a disabled Save button;
  - progress is exposed through a native `<progress>` or `role="progressbar"` with page-based values;
  - assembly text is `Creating page N of M…` and password phase text is `Protecting your PDF…`;
  - cancellation clears progress, shows `Export cancelled. Your workspace is still here.`, does not set the error alert, and does not download;
  - unmount aborts active work;
  - retry creates a fresh controller.

- [ ] **Step 5: Run focused tests and observe GREEN**

  Run: `volta run --node 24 npx vitest run src/engine/PdfSecurity.test.ts src/engine/PdfExport.test.ts && volta run --node 24 npm run build && volta run --node 24 npx playwright test e2e/workspace.spec.ts --grep "cancel|real PDF previews"`

  Expected: progress/cancel, retry, normal download, rotation, and source-byte assertions pass.

- [ ] **Step 6: Run the 10-page benchmark smoke check without expected failures**

  Run: `$env:QH_PDF_BENCH_PAGES='10'; volta run --node 24 npm run bench:large-documents; Remove-Item Env:QH_PDF_BENCH_PAGES`

  Expected: the cancellation measurement is present and passes; no download is created by the cancelled attempt.

- [ ] **Step 7: Commit**

  ```powershell
  git add src e2e performance
  git commit -m "feat: report and cancel PDF export"
  ```

### Task 4: Bounded, viewport-driven thumbnails

**Files:**
- Create: `src/engine/ThumbnailScheduler.ts`
- Create: `src/engine/ThumbnailScheduler.test.ts`
- Modify: `src/workspace/WorkspaceScreen.tsx`
- Modify: `src/workspace/PageCard.tsx`
- Modify: `src/index.css`
- Modify: `e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: `PdfEngine.renderThumbnail` and page-card mount/visibility lifecycle.
- Produces:

  ```ts
  export interface ScheduledThumbnail<T> {
    promise: Promise<T>;
    cancel(): void;
  }

  export class ThumbnailScheduler {
    constructor(concurrency?: number);
    schedule<T>(run: () => Promise<T>, priority?: number): ScheduledThumbnail<T>;
  }
  ```

- [ ] **Step 1: Write failing scheduler tests**

  Cover real promise behavior rather than mock call existence:

  1. no more than two deferred jobs are active;
  2. a later high-priority queued job resolves before earlier low-priority queued work;
  3. cancelling queued work rejects that promise with `AbortError` and never calls its run function;
  4. cancelling active work rejects the consumer promise, ignores its later completion, and lets the next job start;
  5. one job failure does not stall the queue.

- [ ] **Step 2: Run scheduler tests and observe RED**

  Run: `volta run --node 24 npx vitest run src/engine/ThumbnailScheduler.test.ts`

  Expected: FAIL because `ThumbnailScheduler` does not exist.

- [ ] **Step 3: Implement the minimal scheduler**

  Use an in-memory priority queue with FIFO sequence as its tie-breaker, a default concurrency of two, one settlement path per job, and no global cache. Cancellation must be idempotent.

- [ ] **Step 4: Run scheduler tests and observe GREEN**

  Run: `volta run --node 24 npx vitest run src/engine/ThumbnailScheduler.test.ts`

  Expected: all queue, priority, failure, and cancellation tests pass.

- [ ] **Step 5: Add viewport gating and rendering containment**

  Create one scheduler in `WorkspaceScreen` and pass it to every `PageCard`. Each card observes its article with `rootMargin: '600px 0px'`:

  - when near-visible, schedule `engine.renderThumbnail` with visible cards at priority 100 and margin-only cards at priority 10;
  - when outside the margin, cancel queued work, revoke its object URL, and return to a lightweight placeholder;
  - when `IntersectionObserver` is unavailable, render immediately through the same scheduler;
  - every cleanup revokes the owned URL exactly once;
  - keep card selection, sortable registration, accessible labels, arrows, and keyboard drag intact.

  Add `.card { content-visibility: auto; contain-intrinsic-size: 360px 260px; }` as browser-native rendering containment. Do not claim this removes cards from the DOM; true windowing remains conditional on benchmark evidence because dnd-kit requires stable reorder targets.

- [ ] **Step 6: Add a browser regression for non-eager thumbnails**

  Import a synthetic 100-page PDF at desktop viewport. Assert all 100 page articles and controls exist, substantially fewer than 100 thumbnail images appear before scrolling, the last page receives a thumbnail after scrolling into view, and explicit move/selection controls still work. The assertion must allow observer timing but must fail if all 100 thumbnails render eagerly.

- [ ] **Step 7: Run focused and full browser tests**

  Run: `volta run --node 24 npm test && volta run --node 24 npm run build && volta run --node 24 npm run test:browser`

  Expected: all unit and Chromium workflows pass, including the privacy request guard and 390px mobile workflow.

- [ ] **Step 8: Commit**

  ```powershell
  git add src e2e
  git commit -m "feat: bound and defer thumbnail rendering"
  ```

### Task 5: Measure the complete milestone and document verified limits

**Files:**
- Modify: `README.md`
- Modify: `plan/2026-09-19-product-roadmap-checklist.md`

**Interfaces:**
- Consumes: benchmark JSON from Tasks 1–4 and final built asset manifest.
- Produces: documented verification scope and a checked milestone ledger without unsupported numeric product claims.

- [ ] **Step 1: Run the full 10/50/100/300/500 benchmark on Node 24**

  Run: `Remove-Item Env:QH_PDF_BENCH_PAGES -ErrorAction SilentlyContinue; volta run --node 24 npm run bench:large-documents`

  Expected: all five synthetic sizes complete, cancellation passes at 500 pages, progress reaches the requested total, and JSON measurements are attached. If the host cannot complete a size, record that exact size and failure instead of dropping it.

- [ ] **Step 2: Update README facts**

  Replace the limitations that say assembly is on the main thread and thumbnails are eager. State exactly:

  - export assembly uses a fresh browser worker with transferable copies and cancellable progress;
  - password encryption remains a separate bounded QPDF worker;
  - thumbnails use a two-job scheduler, viewport gating, and browser rendering containment;
  - source bytes remain retained for undo/recovery and copied for worker transfer, so peak memory is still browser/device dependent;
  - the benchmark is synthetic Chromium evidence, not a universal 500-page guarantee;
  - true DOM windowing, import parsing off-main-thread, Safari/Firefox, and physical mobile remain future work unless separately verified.

- [ ] **Step 3: Update the roadmap checklist with evidence**

  Check only items demonstrated by final tests/measurements. Link the benchmark command and final revision. Leave unavailable browsers and physical-device work unchecked.

- [ ] **Step 4: Run required final verification on one revision**

  Run:

  ```powershell
  volta run --node 24 npm test
  volta run --node 24 npm run build
  volta run --node 24 npm run test:browser
  volta run --node 24 npm run test:hosting
  git status --short
  ```

  Expected: all commands exit 0; only intentional plan/source/test/README changes remain before the final commit.

- [ ] **Step 5: Commit**

  ```powershell
  git add README.md plan
  git commit -m "docs: record large document performance coverage"
  ```

- [ ] **Step 6: Freeze and review**

  Review the complete branch against this plan and the approved design, with special attention to the five Review focus cases. Fix Critical/Important findings with a failing regression test first. Record Minor findings in the execution ledger.

- [ ] **Step 7: Prepare but do not deploy** *(superseded)*

  Push the scoped branch and open a PR only after final verification. Attach the PR to this task. Deployment and live-production tests require separate explicit authorization.

  Superseded on 2026-09-19 when the repository owner explicitly authorized testing the supplied local 293.6 MiB real-world PDF, merging this PR to `main`, configuring CI/CD, and deploying to `pdf.quackandhonk.com`. The document must remain local and must not be copied into the repository, CI artifacts, or any external service.

### Task 6: Brand discovery and authorized production release

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/index.css`
- Modify: `e2e/workspace.spec.ts`
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md`
- Modify: `plan/2026-09-19-product-roadmap-checklist.md`

**Release constraints:**
- The supplied real-world PDF is local-only test input. Report only aggregate timings, page count, output size, responsiveness, and pass/fail state; never commit, upload, or retain the document or exported copy.
- Keep the primary document task visually dominant. Brand discovery uses the existing header wordmark as a clear external link rather than adding a tall promotional banner.
- The link opens `https://quackandhonk.com` in a new tab with an accessible external-link label and `noopener noreferrer`.
- CI deploys only after the required verification workflow succeeds on `main`, uses least-privilege repository permissions, a scoped Cloudflare token stored as a GitHub environment secret, serialized production deployments, and a pinned deployment action.
- Deployment must be followed by the existing live-production Chromium/Cloudflare suite and a direct header/network check.

- [x] **Step 1: Add a failing browser assertion for the brand link**

  Assert the header exposes one visible link to `https://quackandhonk.com`, communicates that it opens a new tab, and remains visible without horizontal overflow at 390 px.

- [x] **Step 2: Implement the restrained linked wordmark**

  Preserve the current product name and mechanism statement. Add only the external-link affordance and focused/hover styling; do not add remote assets or requests.

- [x] **Step 3: Exercise the supplied local document**

  Use a temporary ignored Playwright harness against the production build. Guard all requests so import/edit/export remains same-origin static GET traffic, measure import/first-thumbnail/responsiveness, exercise selection/rotation/duplicate/undo/redo, cancel one export, then complete and validate one full export locally. Delete the temporary export after validation.

- [ ] **Step 4: Add and dry-run production deployment automation**

  Add a `Deploy production` workflow triggered by successful completion of `Verify` on `main` plus manual dispatch. Rebuild in the deployment job, run `wrangler deploy --dry-run`, then publish with the pinned Cloudflare Wrangler action. Configure the Cloudflare account id and scoped API token as GitHub `production` environment secrets; never commit credentials.

- [ ] **Step 5: Re-run final checks on the release revision**

  Run Node 24 `npm test`, `npm run build`, `npm run test:browser`, `npm run test:hosting`, and the full large-document benchmark. Confirm the PR check succeeds after the new commit.

- [ ] **Step 6: Merge, observe CI/CD, and verify production**

  Merge PR #10 into `main`, wait for both verification and production deployment to succeed, then run `QH_PDF_BASE_URL=https://pdf.quackandhonk.com npm run test:hosting`. Confirm the live revision exposes the brand link, required security headers, and no unexpected document/network path.
