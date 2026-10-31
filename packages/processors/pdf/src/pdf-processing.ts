import { PDFDocument, ParseSpeeds } from "pdf-lib";
import type {
  PdfProcessingRequest,
  ProcessingInput,
  ProcessingResult,
} from "@gsft/shared";
import { parsePageSelection } from "./page-selection";

export const MAX_PDF_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_MERGE_INPUTS = 50;
export const MAX_PDF_PAGES = 20_000;
const PDF_SIGNATURE = "%PDF-";
const PDF_MERGE_WARNING =
  "Interactive forms, document-level attachments, and cross-page navigation may not be preserved.";

async function loadPdf(input: ProcessingInput): Promise<PDFDocument> {
  if (input.data.size === 0) throw new Error(`${input.name} is empty.`);
  if (input.data.size > MAX_PDF_FILE_BYTES) {
    throw new Error(`${input.name} exceeds the 250 MB per-file limit.`);
  }

  const header = new Uint8Array(await input.data.slice(0, 5).arrayBuffer());
  if (new TextDecoder().decode(header) !== PDF_SIGNATURE) {
    throw new Error(`${input.name} does not appear to be a valid PDF.`);
  }

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(await input.data.arrayBuffer(), {
      parseSpeed: ParseSpeeds.Fastest,
      updateMetadata: false,
    });
  } catch (error) {
    throw new Error(
      `Could not read ${input.name}${error instanceof Error ? `: ${error.message}` : "."}`,
    );
  }
  if (document.getPageCount() > MAX_PDF_PAGES) {
    throw new Error(`${input.name} has more than 20,000 pages.`);
  }
  return document;
}

function createResult(
  request: PdfProcessingRequest,
  outputDocument: PDFDocument,
  startedAt: number,
  inputBytes: number,
  outputSuffix: string,
  warnings: string[],
  sourcePageCount: number,
): Promise<ProcessingResult> {
  return outputDocument.save({ useObjectStreams: true }).then((saved) => {
    const data = new Blob([Uint8Array.from(saved)], { type: "application/pdf" });
    const baseName = request.input.name.replace(/\.pdf$/i, "").trim() || "document";
    return {
      requestId: request.id,
      location: "browser",
      output: {
        data,
        name: `${baseName}-${outputSuffix}.pdf`,
        mimeType: "application/pdf",
      },
      metadata: {
        sourcePageCount,
        pageCount: outputDocument.getPageCount(),
        format: "pdf",
      },
      statistics: {
        inputBytes,
        outputBytes: data.size,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
      warnings,
    };
  });
}

export async function processPdf(
  request: PdfProcessingRequest,
  startedAt: number,
): Promise<ProcessingResult> {
  if (request.operation === "pdf.merge") {
    const inputs = [request.input, ...request.options.additionalInputs];
    if (inputs.length < 2) throw new Error("Choose at least two PDFs to merge.");
    if (inputs.length > MAX_MERGE_INPUTS) {
      throw new Error(`You can merge up to ${MAX_MERGE_INPUTS} PDFs at a time.`);
    }

    const inputBytes = inputs.reduce((total, input) => total + input.data.size, 0);
    if (inputBytes > MAX_PDF_FILE_BYTES) {
      throw new Error("The combined size of PDFs to merge must not exceed 250 MB.");
    }

    const sources = await Promise.all(inputs.map(loadPdf));
    const sourcePageCount = sources.reduce(
      (total, source) => total + source.getPageCount(),
      0,
    );
    if (sourcePageCount > MAX_PDF_PAGES) {
      throw new Error("Merged PDFs cannot contain more than 20,000 pages.");
    }

    const outputDocument = await PDFDocument.create();
    for (const source of sources) {
      const pages = await outputDocument.copyPages(
        source,
        source.getPageIndices(),
      );
      for (const page of pages) outputDocument.addPage(page);
    }

    return createResult(
      request,
      outputDocument,
      startedAt,
      inputBytes,
      "merged",
      [PDF_MERGE_WARNING],
      sourcePageCount,
    );
  }

  const source = await loadPdf(request.input);
  const sourcePageCount = source.getPageCount();
  if (request.operation === "pdf.extract-pages") {
    const selectedPages = parsePageSelection(
      request.options.pageSelection,
      sourcePageCount,
    );
    const outputDocument = await PDFDocument.create();
    const copiedPages = await outputDocument.copyPages(
      source,
      selectedPages.map((page) => page - 1),
    );
    for (const page of copiedPages) outputDocument.addPage(page);

    return createResult(
      request,
      outputDocument,
      startedAt,
      request.input.data.size,
      "extracted",
      [PDF_MERGE_WARNING],
      sourcePageCount,
    );
  }

  const output = await createResult(
    request,
    source,
    startedAt,
    request.input.data.size,
    "optimized",
    [
      "This lossless structural optimization does not recompress embedded images, so file-size reduction is not guaranteed.",
    ],
    sourcePageCount,
  );
  if (output.statistics.outputBytes >= output.statistics.inputBytes) {
    output.warnings.push("The optimized PDF is not smaller than the original.");
  }
  return output;
}
