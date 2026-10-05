import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

vi.mock('pdfstudio/qpdf.wasm?url', () => ({
  default: new URL('../../node_modules/pdfstudio/dist/wasm/qpdf.wasm', import.meta.url).href,
}));

import { compressPdfInProcess } from './compressionAdapter';

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(chunks: readonly Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function pngChunk(name: string, data: Uint8Array) {
  const type = new TextEncoder().encode(name);
  const output = new Uint8Array(12 + data.length);
  writeUint32(output, 0, data.length);
  output.set(type, 4);
  output.set(data, 8);
  writeUint32(output, 8 + data.length, crc32(concatenate([type, data])));
  return output;
}

function zlibStore(bytes: Uint8Array) {
  const blockCount = Math.ceil(bytes.length / 65_535);
  const output = new Uint8Array(2 + bytes.length + blockCount * 5 + 4);
  output.set([0x78, 0x01]);
  let inputOffset = 0;
  let outputOffset = 2;
  while (inputOffset < bytes.length) {
    const length = Math.min(65_535, bytes.length - inputOffset);
    const last = inputOffset + length === bytes.length;
    const complement = (~length) & 0xffff;
    output[outputOffset++] = last ? 1 : 0;
    output[outputOffset++] = length;
    output[outputOffset++] = length >>> 8;
    output[outputOffset++] = complement;
    output[outputOffset++] = complement >>> 8;
    output.set(bytes.subarray(inputOffset, inputOffset + length), outputOffset);
    inputOffset += length;
    outputOffset += length;
  }
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  writeUint32(output, outputOffset, ((b << 16) | a) >>> 0);
  return output;
}

function syntheticRgbPng(width: number, height: number) {
  const stride = width * 3 + 1;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    pixels[y * stride] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3;
      pixels[offset] = (x * 13 + y * 7 + (x * y) % 251) & 0xff;
      pixels[offset + 1] = (x * 3 + y * 17 + (x ^ y)) & 0xff;
      pixels[offset + 2] = (x * 19 + y * 5 + (x * y) % 137) & 0xff;
    }
  }
  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header[8] = 8;
  header[9] = 2;
  return concatenate([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlibStore(pixels)),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

async function createImagePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  page.setRotation(degrees(90));
  page.setCropBox(12, 23, 500, 700);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Selectable vector text 123', { x: 50, y: 680, size: 18, font, color: rgb(0, 0, 0) });
  const image = await pdf.embedPng(syntheticRgbPng(900, 700));
  page.drawImage(image, { x: 30, y: 100, width: 540, height: 420 });
  return Uint8Array.from(await pdf.save({ useObjectStreams: false }));
}

async function extractedText(bytes: Uint8Array) {
  const task = getDocument({ data: Uint8Array.from(bytes) });
  const pdf = await task.promise;
  try {
    const content = await (await pdf.getPage(1)).getTextContent();
    return content.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
  } finally {
    await task.destroy();
  }
}

let imagePdf: Uint8Array<ArrayBuffer>;
let outputs: Record<'lossless' | 'balanced' | 'small', Uint8Array<ArrayBuffer>>;

beforeAll(async () => {
  imagePdf = await createImagePdf();
  outputs = {
    lossless: await compressPdfInProcess(imagePdf, 'lossless'),
    balanced: await compressPdfInProcess(imagePdf, 'balanced'),
    small: await compressPdfInProcess(imagePdf, 'small'),
  };
});

describe('QPDF compression presets', () => {
  it('produces measurably distinct lossless, balanced, and small image outputs', () => {
    expect(outputs.lossless.length).toBeLessThan(imagePdf.length);
    expect(outputs.balanced.length).toBeLessThan(outputs.lossless.length * 0.5);
    expect(outputs.small.length).toBeLessThan(outputs.balanced.length * 0.8);
  });

  it.each(['lossless', 'balanced', 'small'] as const)(
    '%s preserves extracted text, page boxes, and rotation without flattening the page',
    async level => {
      expect(await extractedText(outputs[level])).toContain('Selectable vector text 123');
      const pdf = await PDFDocument.load(outputs[level]);
      const page = pdf.getPage(0);
      expect(page.getMediaBox()).toEqual({ x: 0, y: 0, width: 612, height: 792 });
      expect(page.getCropBox()).toEqual({ x: 12, y: 23, width: 500, height: 700 });
      expect(page.getRotation().angle).toBe(90);
    },
  );

  it('returns the original content when optimization would make an already compact PDF larger', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);
    const compact = Uint8Array.from(await pdf.save());

    for (const level of ['lossless', 'balanced', 'small'] as const) {
      const result = await compressPdfInProcess(compact, level);
      expect(result).not.toBe(compact);
      expect(result).toEqual(compact);
    }
  });

  it('maps invalid input to a generic error instead of exposing QPDF diagnostics', async () => {
    const invalid = new TextEncoder().encode('private document name: payroll.pdf');
    await expect(compressPdfInProcess(invalid, 'balanced')).rejects.toMatchObject({
      code: 'export-failed',
      message: 'PDF compression failed. Your workspace is still here.',
    });
  });
});
