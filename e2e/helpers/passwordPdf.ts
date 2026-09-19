import { PDFDocument, degrees } from 'pdf-lib';
import { createPdfToolkit } from 'pdfstudio';

let toolkit: ReturnType<typeof createPdfToolkit> | undefined;

/** Synthetic fixtures only. Runs local WASM in the test process. */
export async function passwordPdf({
  name = 'synthetic-private.pdf', password = 'fixture-secret', ownerPassword,
  widths = [111, 222], rotation = 90, keyLength = 256,
}: {
  name?: string; password?: string; ownerPassword?: string;
  widths?: number[]; rotation?: number; keyLength?: 128 | 256;
} = {}) {
  const pdf = await PDFDocument.create();
  for (const width of widths) {
    const page = pdf.addPage([width, 400]);
    page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 10, y: 20, width: 40, height: 60 });
    page.drawText(`Synthetic page ${width}`, { x: 10, y: 100, size: 10 });
  }
  toolkit ??= createPdfToolkit();
  const encrypted = await (await toolkit).lock(await pdf.save(), {
    userPassword: password, ownerPassword, keyLength,
  });
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(encrypted) };
}
