import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { PdfExtractPagesRequest } from "@gsft/shared";
import { extractPdfPages } from "./pdf-processing";

async function createPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([100, 200]);
  document.addPage([200, 300]);
  document.addPage([300, 400]);
  return document.save();
}

function request(data: Blob, pageSelection: string): PdfExtractPagesRequest {
  return {
    id: "pdf-test",
    category: "pdf",
    operation: "pdf.extract-pages",
    input: { name: "source.pdf", mimeType: "application/pdf", data },
    options: { pageSelection },
  };
}

describe("extractPdfPages", () => {
  it("extracts selected pages in the requested order and reports result metadata", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const result = await extractPdfPages(request(input, "3, 1"), performance.now());
    const output = await PDFDocument.load(await result.output.data.arrayBuffer());

    expect(output.getPageCount()).toBe(2);
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 300, height: 400 },
      { width: 100, height: 200 },
    ]);
    expect(result).toMatchObject({
      requestId: "pdf-test",
      location: "browser",
      output: { name: "source-extracted.pdf", mimeType: "application/pdf" },
      metadata: { sourcePageCount: 3, pageCount: 2, format: "pdf" },
      statistics: { inputBytes: input.size, outputBytes: result.output.data.size },
    });
    expect(result.statistics.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects content without a PDF signature", async () => {
    await expect(
      extractPdfPages(request(new Blob(["not a PDF"]), "1"), performance.now()),
    ).rejects.toThrow("valid PDF");
  });

  it("rejects page selections outside the source document", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    await expect(
      extractPdfPages(request(input, "4"), performance.now()),
    ).rejects.toThrow("between 1 and 3");
  });
});
