import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type {
  PdfCompressRequest,
  PdfExtractPagesRequest,
  PdfMergeRequest,
  PdfReorderPagesRequest,
  PdfRotatePagesRequest,
  PdfSplitRequest,
} from "@gsft/shared";
import { processPdf } from "./pdf-processing";

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

describe("processPdf", () => {
  it("extracts selected pages in the requested order and reports result metadata", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const result = await processPdf(request(input, "3, 1"), performance.now());
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
      processPdf(request(new Blob(["not a PDF"]), "1"), performance.now()),
    ).rejects.toThrow("valid PDF");
  });

  it("rejects page selections outside the source document", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    await expect(
      processPdf(request(input, "4"), performance.now()),
    ).rejects.toThrow("between 1 and 3");
  });

  it("splits PDFs into page groups and bundles named outputs in a ZIP", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const splitRequest: PdfSplitRequest = {
      id: "split-test",
      category: "pdf",
      operation: "pdf.split",
      input: { name: "source.pdf", mimeType: "application/pdf", data: input },
      options: { pagesPerFile: 2 },
    };

    const result = await processPdf(splitRequest, performance.now());
    const archive = unzipSync(new Uint8Array(await result.output.data.arrayBuffer()));
    const entries = Object.entries(archive).sort(([first], [second]) =>
      first.localeCompare(second),
    );
    const splitPages = await Promise.all(
      entries.map(async ([name, bytes]) => ({
        name,
        pageCount: (await PDFDocument.load(bytes)).getPageCount(),
      })),
    );

    expect(result.output).toMatchObject({
      name: "source-split.zip",
      mimeType: "application/zip",
    });
    expect(result.metadata).toMatchObject({
      pageCount: 3,
      sourcePageCount: 3,
      splitFileCount: 2,
      format: "zip",
    });
    expect(splitPages).toEqual([
      { name: "source-pages-00001-00002.pdf", pageCount: 2 },
      { name: "source-pages-00003-00003.pdf", pageCount: 1 },
    ]);
  });

  it("rejects split settings that would create too many output files", async () => {
    const document = await PDFDocument.create();
    for (let page = 0; page < 201; page += 1) document.addPage();
    const input = new Blob([Uint8Array.from(await document.save())], {
      type: "application/pdf",
    });
    const splitRequest: PdfSplitRequest = {
      id: "split-limit",
      category: "pdf",
      operation: "pdf.split",
      input: { name: "many-pages.pdf", mimeType: "application/pdf", data: input },
      options: { pagesPerFile: 1 },
    };

    await expect(processPdf(splitRequest, performance.now())).rejects.toThrow(
      "within the 200-file limit",
    );
  });

  it("reorders every page exactly as requested", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const reorderRequest: PdfReorderPagesRequest = {
      id: "reorder-test",
      category: "pdf",
      operation: "pdf.reorder-pages",
      input: { name: "source.pdf", mimeType: "application/pdf", data: input },
      options: { pageOrder: "3, 1, 2" },
    };

    const result = await processPdf(reorderRequest, performance.now());
    const output = await PDFDocument.load(await result.output.data.arrayBuffer());

    expect(output.getPageCount()).toBe(3);
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 300, height: 400 },
      { width: 100, height: 200 },
      { width: 200, height: 300 },
    ]);
    expect(result.output.name).toBe("source-reordered.pdf");
    expect(result.metadata.pageCount).toBe(3);
  });

  it("rejects incomplete page orders instead of silently dropping pages", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const reorderRequest: PdfReorderPagesRequest = {
      id: "reorder-incomplete",
      category: "pdf",
      operation: "pdf.reorder-pages",
      input: { name: "source.pdf", mimeType: "application/pdf", data: input },
      options: { pageOrder: "3, 1" },
    };

    await expect(processPdf(reorderRequest, performance.now())).rejects.toThrow(
      "Include every page exactly once",
    );
  });

  it("merges PDFs in input order and reports combined input size", async () => {
    const first = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const secondDocument = await PDFDocument.create();
    secondDocument.addPage([500, 600]);
    const second = new Blob([Uint8Array.from(await secondDocument.save())], {
      type: "application/pdf",
    });
    const mergeRequest: PdfMergeRequest = {
      id: "merge-test",
      category: "pdf",
      operation: "pdf.merge",
      input: { name: "first.pdf", mimeType: "application/pdf", data: first },
      options: {
        additionalInputs: [
          { name: "second.pdf", mimeType: "application/pdf", data: second },
        ],
      },
    };

    const result = await processPdf(mergeRequest, performance.now());
    const output = await PDFDocument.load(await result.output.data.arrayBuffer());

    expect(output.getPageCount()).toBe(4);
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 100, height: 200 },
      { width: 200, height: 300 },
      { width: 300, height: 400 },
      { width: 500, height: 600 },
    ]);
    expect(result.output.name).toBe("first-merged.pdf");
    expect(result.statistics.inputBytes).toBe(first.size + second.size);
  });

  it("requires at least two merge inputs", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const mergeRequest: PdfMergeRequest = {
      id: "merge-one",
      category: "pdf",
      operation: "pdf.merge",
      input: { name: "only.pdf", mimeType: "application/pdf", data: input },
      options: { additionalInputs: [] },
    };

    await expect(processPdf(mergeRequest, performance.now())).rejects.toThrow(
      "at least two PDFs",
    );
  });

  it("reserializes PDFs without claiming guaranteed size reduction", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const compressRequest: PdfCompressRequest = {
      id: "compress-test",
      category: "pdf",
      operation: "pdf.compress",
      input: { name: "source.pdf", mimeType: "application/pdf", data: input },
      options: {},
    };
    const result = await processPdf(compressRequest, performance.now());
    const output = await PDFDocument.load(await result.output.data.arrayBuffer());

    expect(output.getPageCount()).toBe(3);
    expect(result.output.name).toBe("source-optimized.pdf");
    expect(result.warnings.join(" ")).toContain("does not recompress embedded images");
  });

  it("rotates only selected pages by the requested clockwise amount", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const rotateRequest: PdfRotatePagesRequest = {
      id: "rotate-test",
      category: "pdf",
      operation: "pdf.rotate-pages",
      input: { name: "source.pdf", mimeType: "application/pdf", data: input },
      options: { pageSelection: "2-3", degrees: 90 },
    };

    const result = await processPdf(rotateRequest, performance.now());
    const output = await PDFDocument.load(await result.output.data.arrayBuffer());

    expect(output.getPages().map((page) => page.getRotation().angle)).toEqual([
      0, 90, 90,
    ]);
    expect(result.output.name).toBe("source-rotated.pdf");
    expect(result.metadata).toMatchObject({
      pageCount: 3,
      rotatedPageCount: 2,
      rotationDegrees: 90,
    });
  });

  it("rejects page ranges outside the source document when rotating", async () => {
    const input = new Blob([Uint8Array.from(await createPdf())], { type: "application/pdf" });
    const rotateRequest: PdfRotatePagesRequest = {
      id: "rotate-invalid",
      category: "pdf",
      operation: "pdf.rotate-pages",
      input: { name: "source.pdf", mimeType: "application/pdf", data: input },
      options: { pageSelection: "4", degrees: 180 },
    };

    await expect(processPdf(rotateRequest, performance.now())).rejects.toThrow(
      "between 1 and 3",
    );
  });
});
