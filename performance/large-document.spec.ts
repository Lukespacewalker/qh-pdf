import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';

interface BenchmarkResult {
  pages: number;
  importMs: number;
  firstThumbnailMs: number;
  thumbnailCount: number;
  thumbnailsPerSecond: number;
  exportMs: number;
  maxMainThreadGapMs: number;
  approxPeakJsHeapBytes: number | null;
  cancelMs: number | null;
  cancelSupported: boolean;
  heapMeasurement: 'chromium-performance-memory' | 'unavailable';
}

interface BenchmarkWindow extends Window {
  __qhBenchmark?: {
    thumbnailPages: Set<string>;
    firstThumbnailAt: number | null;
    maxMainThreadGapMs: number;
    peakJsHeapBytes: number | null;
    lastFrameAt: number;
  };
}

const requestedCounts = (process.env.QH_PDF_BENCH_PAGES ?? '10,50,100,300,500')
  .split(',')
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isInteger(value) && value > 0);

if (requestedCounts.length === 0) {
  throw new Error('QH_PDF_BENCH_PAGES must include at least one positive integer.');
}

const results: BenchmarkResult[] = [];

async function syntheticPdf(pageCount: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([200 + (index % 100), 400]);
  }
  return {
    name: 'synthetic-large-document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  };
}

async function installSampler(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const target = window as BenchmarkWindow;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const state = {
      thumbnailPages: new Set<string>(),
      firstThumbnailAt: null as number | null,
      maxMainThreadGapMs: 0,
      peakJsHeapBytes: memory.memory?.usedJSHeapSize ?? null,
      lastFrameAt: performance.now(),
    };
    target.__qhBenchmark = state;

    const recordDecodedThumbnails = () => {
      for (const image of document.querySelectorAll<HTMLImageElement>('article .page-thumbnail img')) {
        const pageLabel = image.closest('article')?.getAttribute('aria-label');
        if (!pageLabel || !image.complete || image.naturalWidth === 0) continue;
        state.thumbnailPages.add(pageLabel);
        state.firstThumbnailAt ??= performance.now();
      }
    };
    const observeThumbnails = new MutationObserver(recordDecodedThumbnails);
    observeThumbnails.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.addEventListener('load', recordDecodedThumbnails, true);

    const sample = (now: number) => {
      state.maxMainThreadGapMs = Math.max(state.maxMainThreadGapMs, now - state.lastFrameAt);
      state.lastFrameAt = now;
      if (memory.memory) {
        state.peakJsHeapBytes = Math.max(state.peakJsHeapBytes ?? 0, memory.memory.usedJSHeapSize);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function renderEveryThumbnail(page: import('@playwright/test').Page, pageCount: number) {
  const cards = page.locator('article');
  for (let index = 0; index < pageCount; index += 1) {
    await cards.nth(index).scrollIntoViewIfNeeded();
    await page.waitForFunction(label => {
      return (window as BenchmarkWindow).__qhBenchmark?.thumbnailPages.has(label);
    }, `Page ${index + 1} from synthetic-large-document.pdf`);
  }
}

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/large-document-benchmark.json', `${JSON.stringify(results, null, 2)}\n`, 'utf8');
});

for (const pageCount of requestedCounts) {
  test(`${pageCount} synthetic pages`, async ({ page }, testInfo) => {
    await page.goto('/');
    await installSampler(page);
    const input = await syntheticPdf(pageCount);
    const importStartedBrowser = await page.evaluate(() => performance.now());
    const importStarted = performance.now();
    await page.locator('input[type=file]').setInputFiles(input);
    await expect(page.getByRole('heading', { name: 'Your document' })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(pageCount);
    const importMs = performance.now() - importStarted;

    await page.waitForFunction(() => (window as BenchmarkWindow).__qhBenchmark?.firstThumbnailAt !== null);
    const firstThumbnailAt = await page.evaluate(() => (window as BenchmarkWindow).__qhBenchmark!.firstThumbnailAt!);
    const firstThumbnailMs = firstThumbnailAt - importStartedBrowser;
    const thumbnailStarted = performance.now();
    await renderEveryThumbnail(page, pageCount);
    const thumbnailSeconds = Math.max((performance.now() - thumbnailStarted) / 1000, 0.001);

    await page.evaluate(() => {
      const state = (window as BenchmarkWindow).__qhBenchmark!;
      state.maxMainThreadGapMs = 0;
      state.lastFrameAt = performance.now();
    });
    const exportStarted = performance.now();
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
    const download = await pendingDownload;
    expect(await download.failure()).toBeNull();
    const exportMs = performance.now() - exportStarted;

    let cancelMs: number | null = null;
    let cancelSupported = false;
    if (pageCount === Math.max(...requestedCounts)) {
      await page.route(/\/assets\/PdfExport\.worker-.*\.js$/, async route => {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        await route.continue();
      });
      let cancelledDownload = false;
      const recordDownload = () => { cancelledDownload = true; };
      page.on('download', recordDownload);
      const cancelStarted = performance.now();
      await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Cancel export' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel export' }).click();
      await expect(page.getByText('Export cancelled. Your workspace is still here.', { exact: true })).toBeVisible();
      await expect(page.locator('article')).toHaveCount(pageCount);
      await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled();
      cancelMs = performance.now() - cancelStarted;
      cancelSupported = true;
      await page.waitForTimeout(1_100);
      expect(cancelledDownload).toBe(false);
      page.off('download', recordDownload);
    }

    const sampled = await page.evaluate(() => {
      const state = (window as BenchmarkWindow).__qhBenchmark!;
      return {
        thumbnailCount: state.thumbnailPages.size,
        maxMainThreadGapMs: state.maxMainThreadGapMs,
        approxPeakJsHeapBytes: state.peakJsHeapBytes,
      };
    });
    const result: BenchmarkResult = {
      pages: pageCount,
      importMs,
      firstThumbnailMs: Math.max(0, firstThumbnailMs),
      thumbnailCount: sampled.thumbnailCount,
      thumbnailsPerSecond: pageCount / thumbnailSeconds,
      exportMs,
      maxMainThreadGapMs: sampled.maxMainThreadGapMs,
      approxPeakJsHeapBytes: sampled.approxPeakJsHeapBytes,
      cancelMs,
      cancelSupported,
      heapMeasurement: sampled.approxPeakJsHeapBytes === null ? 'unavailable' : 'chromium-performance-memory',
    };
    results.push(result);
    await testInfo.attach(`large-document-${pageCount}.json`, {
      body: Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
      contentType: 'application/json',
    });
    console.log(JSON.stringify(result));
  });
}
