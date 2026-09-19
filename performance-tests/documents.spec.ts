import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

// Synthetic vector/text pages, not a large-image, malformed-input or memory-safety benchmark.
for (const count of [10, 50, 100, 300, 500]) {
  test(`synthetic ${count}-page import and worker export`, async ({ page }, info) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < count; i++) {
      const p = pdf.addPage([612 + i / 1000, 792]);
      p.drawText(`Synthetic document, page ${i + 1}`, { x: 40, y: 740, size: 16, font });
      for (let line = 0; line < 20; line++) p.drawText(`Test content row ${line + 1}. Local document processing.`, { x: 40, y: 700 - line * 24, size: 10, font });
      p.drawRectangle({ x: 40, y: 80, width: 240, height: 80 });
    }
    const bytes = Buffer.from(await pdf.save());
    await page.goto('/');
    const start = performance.now();
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-performance.pdf', mimeType: 'application/pdf', buffer: bytes });
    await expect(page.locator('article.card')).toHaveCount(count);
    const importMs = performance.now() - start;
    await expect(page.locator('article.card').first().locator('.preview img')).toBeVisible();
    const firstThumbnailMs = performance.now() - start;
    const residentThumbnails = await page.locator('article.card .preview img').count();
    if (count >= 50) expect(residentThumbnails).toBeLessThan(40);
    await page.evaluate(() => {
      const state = { frames: 0, maxGapMs: 0, previous: performance.now(), active: true };
      (window as unknown as { qhBenchmark: typeof state }).qhBenchmark = state;
      const tick = (time: number) => {
        state.frames++; state.maxGapMs = Math.max(state.maxGapMs, time - state.previous); state.previous = time;
        if (state.active) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const pending = page.waitForEvent('download');
    const exportStart = performance.now();
    await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const exportMs = performance.now() - exportStart;
    const rendering = await page.evaluate(() => {
      const state = (window as unknown as { qhBenchmark: { active: boolean; frames: number; maxGapMs: number } }).qhBenchmark;
      state.active = false;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return { framesDuringExport: state.frames, maxFrameGapMs: state.maxGapMs, mainThreadHeapBytesAtEnd: memory?.usedJSHeapSize ?? null };
    });
    const output = await PDFDocument.load(await readFile((await download.path())!));
    expect(output.getPageCount()).toBe(count);
    expect(output.getPage(0).getWidth()).toBeCloseTo(612, 5);
    expect(output.getPage(count - 1).getWidth()).toBeCloseTo(612 + (count - 1) / 1000, 5);
    const result = { pages: count, fixtureBytes: bytes.length, importMs: Math.round(importMs), firstThumbnailMs: Math.round(firstThumbnailMs), exportMs: Math.round(exportMs), residentThumbnails, ...rendering,
      scope: 'Single CI sample of synthetic vector/text PDF. Heap endpoint excludes Worker/WASM/native allocations and is NOT peak memory. Timing includes browser automation; not a speed guarantee.' };
    console.log(`QH_PDF_BENCHMARK ${JSON.stringify(result)}`);
    await info.attach('measurements.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  });
}
