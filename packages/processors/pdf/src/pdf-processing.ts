import { PDFDocument, ParseSpeeds } from "pdf-lib";
import type { PdfExtractPagesRequest, ProcessingResult } from "@gsft/shared";
import { parsePageSelection } from "./page-selection";

export const MAX_PDF_FILE_BYTES = 250 * 1024 * 1024;
const PDF_SIGNATURE = "%PDF-";

export async function extractPdfPages(
  request: PdfExtractPagesRequest,
  startedAt: number,
): Promise<ProcessingResult> {
  if (request.input.data.size === 0) {
    throw new Error("This PDF is empty.");
  }
  if (request.input.data.size > MAX_PDF_FILE_BYTES) {
    throw new Error("PDF files must be smaller than 250 MB.");
  }

  const header = new Uint8Array(await request.input.data.slice(0, 5).arrayBuffer());
  if (new TextDecoder().decode(header) !== PDF_SIGNATURE) {
    throw new Error("This file does not appear to be a valid PDF.");
  }

  let source: PDFDocument;
  try {
    source = await PDFDocument.load(await request.input.data.arrayBuffer(), {
      parseSpeed: ParseSpeeds.Fastest,
      updateMetadata: false,
    });
  } catch (error) {
    throw new Error(
      `Could not read this PDF${error instanceof Error ? `: ${error.message}` : "."}`,
    );
  }

  const sourcePageCount = source.getPageCount();
  if (sourcePageCount > 20_000) {
    throw new Error("PDF files with more than 20,000 pages are not supported.");
  }
  const selectedPages = parsePageSelection(request.options.pageSelection, sourcePageCount);
  const outputDocument = await PDFDocument.create();
  const copiedPages = await outputDocument.copyPages(
    source,
    selectedPages.map((page) => page - 1),
  );
  for (const page of copiedPages) outputDocument.addPage(page);

  const saved = await outputDocument.save({ useObjectStreams: true });
  const data = new Blob([Uint8Array.from(saved)], { type: "application/pdf" });
  const baseName = request.input.name.replace(/\.pdf$/i, "").trim() || "document";
  const outputName = `${baseName}-extracted.pdf`;

  return {
    requestId: request.id,
    location: "browser",
    output: { data, name: outputName, mimeType: "application/pdf" },
    metadata: {
      sourcePageCount,
      pageCount: copiedPages.length,
      format: "pdf",
    },
    statistics: {
      inputBytes: request.input.data.size,
      outputBytes: data.size,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
    warnings: [
      "Page extraction may not preserve interactive forms, document-level attachments, or cross-page navigation.",
    ],
  };
}
