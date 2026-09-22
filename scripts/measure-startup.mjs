import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { build as viteBuild } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheDir = fileURLToPath(new URL('../node_modules/.cache/qh-bundle-startup-qa/', import.meta.url));
const resultPath = resolve(process.env.QH_STARTUP_RESULT ?? `${cacheDir}startup-measurement.json`);
const fixturePath = `${cacheDir}bundle-startup-fixture.pdf`;
const baseURL = 'http://127.0.0.1:4175';
const sampleCount = Number(process.env.QH_STARTUP_SAMPLES ?? 5);

if (!Number.isInteger(sampleCount) || sampleCount < 3) {
  throw new Error('QH_STARTUP_SAMPLES must be an integer of at least 3');
}

await mkdir(cacheDir, { recursive: true });

async function createFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = [
    { size: [420, 594], title: 'PAGE 1 - PORTRAIT', rotation: 0, color: rgb(0.94, 0.88, 0.72) },
    { size: [594, 420], title: 'PAGE 2 - LANDSCAPE', rotation: 0, color: rgb(0.76, 0.89, 0.83) },
    { size: [420, 594], title: 'PAGE 3 - SOURCE ROTATED', rotation: 90, color: rgb(0.86, 0.80, 0.91) },
  ];
  for (const item of pages) {
    const page = pdf.addPage(item.size);
    page.setRotation(degrees(item.rotation));
    page.drawRectangle({ x: 0, y: 0, width: item.size[0], height: item.size[1], color: item.color });
    page.drawText(item.title, { x: 34, y: item.size[1] - 58, size: 18, font, color: rgb(0.08, 0.22, 0.17) });
    page.drawText('Synthetic local QA fixture - no user data', {
      x: 34, y: item.size[1] - 88, size: 10, font, color: rgb(0.18, 0.32, 0.27),
    });
    page.drawRectangle({ x: 34, y: 38, width: 72, height: 32, color: rgb(0.75, 0.27, 0.16) });
  }
  await writeFile(fixturePath, await pdf.save());
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function assetInventory() {
  const html = await readFile(`${root}/dist/index.html`, 'utf8');
  const initialPaths = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]);
  const names = (await readdir(`${root}/dist/assets`)).filter(name => /\.(?:js|mjs|wasm)$/.test(name));
  const assets = [];
  for (const name of names) {
    const path = `${root}/dist/assets/${name}`;
    const bytes = await readFile(path);
    assets.push({
      name,
      rawBytes: (await stat(path)).size,
      gzipBytes: gzipSync(bytes).byteLength,
      brotliBytes: brotliCompressSync(bytes).byteLength,
      initial: initialPaths.some(initialPath => initialPath.endsWith(`/${name}`)),
    });
  }
  return { initialPaths, assets };
}

function normalizeModuleId(id) {
  if (id.startsWith('\0')) return id;
  const workspacePath = relative(root, id).replaceAll('\\', '/');
  return workspacePath.startsWith('../') ? id.replaceAll('\\', '/') : workspacePath;
}

async function inspectModuleGraph() {
  const buildResult = await viteBuild({
    root,
    logLevel: 'silent',
    build: { write: false, emptyOutDir: false },
  });
  const outputs = (Array.isArray(buildResult) ? buildResult : [buildResult])
    .flatMap(result => result.output)
    .filter(output => output.type === 'chunk');
  const chunks = outputs.map(chunk => ({
    fileName: chunk.fileName,
    isEntry: chunk.isEntry,
    isDynamicEntry: chunk.isDynamicEntry,
    imports: chunk.imports,
    dynamicImports: chunk.dynamicImports,
    modules: Object.keys(chunk.modules).map(normalizeModuleId).sort(),
  }));
  const byFileName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const initialFiles = [];
  const pending = chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.fileName);
  while (pending.length > 0) {
    const fileName = pending.pop();
    if (!fileName || initialFiles.includes(fileName)) continue;
    initialFiles.push(fileName);
    pending.push(...(byFileName.get(fileName)?.imports ?? []));
  }
  const initialModules = initialFiles.flatMap(fileName => byFileName.get(fileName)?.modules ?? []);
  const forbiddenInitialPatterns = ['node_modules/pdfjs-dist/', 'node_modules/pdf-lib/', 'node_modules/pdfstudio/'];
  const forbiddenInitialModules = initialModules.filter(moduleId => forbiddenInitialPatterns.some(pattern => moduleId.includes(pattern)));
  if (forbiddenInitialModules.length > 0) {
    throw new Error(`Initial module graph includes deferred document code: ${forbiddenInitialModules.join(', ')}`);
  }
  const pdfJsRuntime = chunks.find(chunk => chunk.modules.some(moduleId => moduleId.includes('node_modules/pdfjs-dist/')));
  if (!pdfJsRuntime?.isDynamicEntry) {
    throw new Error('PDF.js was not found in a dynamic entry chunk');
  }
  return {
    method: 'Vite build API with write:false; initial files follow static imports only',
    initialFiles: initialFiles.sort(),
    initialModules,
    forbiddenInitialPatterns,
    forbiddenInitialModules,
    pdfJsRuntimeFile: pdfJsRuntime.fileName,
    chunks,
  };
}

async function waitForServer(server, expectedScript, isChildReady) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite preview exited before it was ready (${server.exitCode})`);
    let response;
    try {
      response = await fetch(baseURL);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    const html = await response.text();
    if (response.ok && html.includes(expectedScript) && isChildReady()) return;
    if (response.ok && !html.includes(expectedScript)) {
      throw new Error(`Port 4175 served a different build; expected ${expectedScript}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Vite preview');
}

function summarizeResources(resources) {
  const local = resources.filter(resource => resource.name.startsWith(baseURL));
  return {
    entries: local.map(resource => ({
      path: new URL(resource.name).pathname,
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
    })),
    transferSize: local.reduce((sum, resource) => sum + resource.transferSize, 0),
    encodedBodySize: local.reduce((sum, resource) => sum + resource.encodedBodySize, 0),
    decodedBodySize: local.reduce((sum, resource) => sum + resource.decodedBodySize, 0),
  };
}

async function resourceSnapshot(page) {
  return summarizeResources(await page.evaluate(() => performance.getEntriesByType('resource').map(entry => {
    const resource = entry;
    return {
      name: resource.name,
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
    };
  })));
}

async function waitForDecodedThumbnails(page, count) {
  await page.locator('article .page-thumbnail img').nth(count - 1).waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForFunction(expected => {
    const images = [...document.querySelectorAll('article .page-thumbnail img')];
    return images.length >= expected && images.slice(0, expected).every(image => image.complete && image.naturalWidth > 0);
  }, count, { timeout: 15_000 });
}

async function waitForReadyWorkspace(page) {
  const chooseFiles = page.getByRole('button', { name: 'Choose files', exact: true });
  await chooseFiles.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent?.trim() === 'Choose files');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
}

async function waitForArticleCount(page, count) {
  await page.waitForFunction(expected => document.querySelectorAll('article').length === expected, count, { timeout: 15_000 });
}

async function waitForFirstDecodedThumbnail(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('article .page-thumbnail img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, undefined, { timeout: 15_000 });
}

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
let serverReady = false;
server.stdout.on('data', chunk => {
  serverOutput += chunk;
  if (chunk.toString().includes('Local:')) serverReady = true;
});
server.stderr.on('data', chunk => { serverOutput += chunk; });

try {
  await createFixture();
  const builtHtml = await readFile(`${root}/dist/index.html`, 'utf8');
  const expectedScript = builtHtml.match(/src="([^"]+\.js)"/)?.[1];
  if (!expectedScript) throw new Error('Could not identify the current build entry script');
  await waitForServer(server, expectedScript, () => serverReady);
  const browser = await chromium.launch({ headless: true });
  const browserVersion = await browser.version();
  const samples = [];
  try {
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const phaseRequests = { cold: [], warm: [], firstPdf: [], subsequentPdf: [] };
      let phase = 'cold';
      page.on('response', response => {
        const url = response.url();
        if (url.startsWith(baseURL)) phaseRequests[phase].push(new URL(url).pathname);
      });

      let started = performance.now();
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await waitForReadyWorkspace(page);
      const coldReadyMs = performance.now() - started;
      await page.waitForLoadState('networkidle');
      const coldResources = await resourceSnapshot(page);

      phase = 'warm';
      started = performance.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForReadyWorkspace(page);
      const warmReadyMs = performance.now() - started;
      await page.waitForLoadState('networkidle');
      const warmResources = await resourceSnapshot(page);

      phase = 'firstPdf';
      await page.evaluate(() => performance.clearResourceTimings());
      started = performance.now();
      await page.locator('input[type=file]').setInputFiles(fixturePath);
      await waitForArticleCount(page, 3);
      const firstPdfImportMs = performance.now() - started;
      await waitForFirstDecodedThumbnail(page);
      const firstThumbnailMs = performance.now() - started;
      await waitForDecodedThumbnails(page, 3);
      const firstPdfAllThumbnailsMs = performance.now() - started;
      await page.waitForLoadState('networkidle');
      const firstPdfResources = await resourceSnapshot(page);

      phase = 'subsequentPdf';
      await page.evaluate(() => performance.clearResourceTimings());
      started = performance.now();
      await page.locator('input[type=file]').setInputFiles(fixturePath);
      await waitForArticleCount(page, 6);
      const subsequentPdfImportMs = performance.now() - started;
      await waitForDecodedThumbnails(page, 6);
      const subsequentPdfAllThumbnailsMs = performance.now() - started;
      await page.waitForLoadState('networkidle');
      const subsequentPdfResources = await resourceSnapshot(page);

      samples.push({
        sample,
        coldReadyMs,
        warmReadyMs,
        firstPdfImportMs,
        firstThumbnailMs,
        firstPdfAllThumbnailsMs,
        subsequentPdfImportMs,
        subsequentPdfAllThumbnailsMs,
        resources: { cold: coldResources, warm: warmResources, firstPdf: firstPdfResources, subsequentPdf: subsequentPdfResources },
        requests: Object.fromEntries(Object.entries(phaseRequests).map(([key, paths]) => [key, [...new Set(paths)]])),
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const inventory = await assetInventory();
  const moduleGraph = await inspectModuleGraph();
  const result = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      browser: browserVersion,
      server: 'Vite preview on 127.0.0.1:4175',
      sampleCount,
      coldCache: 'fresh browser context per sample',
      warmCache: 'reload and subsequent import in the same context; no route interception',
      timing: 'Node performance.now around browser actions; descriptive, not an assertion',
      resourceSizes: 'PerformanceResourceTiming transferSize/encodedBodySize/decodedBodySize; decoded bytes are not V8 parse time',
    },
    fixture: { path: fixturePath, pages: 3, synthetic: true },
    medians: {
      coldReadyMs: median(samples.map(sample => sample.coldReadyMs)),
      warmReadyMs: median(samples.map(sample => sample.warmReadyMs)),
      firstPdfImportMs: median(samples.map(sample => sample.firstPdfImportMs)),
      firstThumbnailMs: median(samples.map(sample => sample.firstThumbnailMs)),
      firstPdfAllThumbnailsMs: median(samples.map(sample => sample.firstPdfAllThumbnailsMs)),
      subsequentPdfImportMs: median(samples.map(sample => sample.subsequentPdfImportMs)),
      subsequentPdfAllThumbnailsMs: median(samples.map(sample => sample.subsequentPdfAllThumbnailsMs)),
    },
    inventory,
    moduleGraph,
    samples,
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ resultPath, medians: result.medians, initialPaths: inventory.initialPaths }, null, 2));
} catch (error) {
  if (serverOutput) process.stderr.write(serverOutput);
  throw error;
} finally {
  server.kill();
}
