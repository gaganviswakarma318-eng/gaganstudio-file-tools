import { degrees, PDFDocument, ParseSpeeds } from "pdf-lib";
import { zipSync } from "fflate";
import type {
  PdfProcessingRequest,
  ProcessingInput,
  ProcessingResult,
} from "@gsft/shared";
import { parsePageSelection } from "./page-selection";

export const MAX_PDF_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_MERGE_INPUTS = 50;
export const MAX_PDF_PAGES = 20_000;
export const MAX_SPLIT_FILES = 200;
export const MAX_SPLIT_OUTPUT_BYTES = 250 * 1024 * 1024;
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
  return outputDocument.save({ useObjectStreams: true }).then((saved) =>
    createResultFromData(
      request,
      new Blob([Uint8Array.from(saved)], { type: "application/pdf" }),
      `${outputBaseName(request.input.name)}-${outputSuffix}.pdf`,
      "application/pdf",
      startedAt,
      inputBytes,
      warnings,
      sourcePageCount,
      outputDocument.getPageCount(),
    ),
  );
}

function outputBaseName(name: string): string {
  const baseName = name.replace(/\.pdf$/i, "").trim() || "document";
  return baseName.replace(/[\\/:*?"<>|]/g, "_");
}

function createResultFromData(
  request: PdfProcessingRequest,
  data: Blob,
  name: string,
  mimeType: string,
  startedAt: number,
  inputBytes: number,
  warnings: string[],
  sourcePageCount: number,
  pageCount: number,
  splitFileCount?: number,
): ProcessingResult {
  return {
    requestId: request.id,
    location: "browser",
    output: { data, name, mimeType },
    metadata: {
      sourcePageCount,
      pageCount,
      format: mimeType === "application/zip" ? "zip" : "pdf",
      ...(splitFileCount === undefined ? {} : { splitFileCount }),
    },
    statistics: {
      inputBytes,
      outputBytes: data.size,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
    warnings: [...warnings],
  };
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

  if (request.operation === "pdf.split") {
    const pagesPerFile = request.options.pagesPerFile;
    if (!Number.isSafeInteger(pagesPerFile) || pagesPerFile < 1 || pagesPerFile > MAX_PDF_PAGES) {
      throw new Error(`Pages per file must be a whole number between 1 and ${MAX_PDF_PAGES.toLocaleString()}.`);
    }

    const source = await loadPdf(request.input);
    const sourcePageCount = source.getPageCount();
    const fileCount = Math.ceil(sourcePageCount / pagesPerFile);
    if (fileCount > MAX_SPLIT_FILES) {
      throw new Error(
        `This split would create ${fileCount.toLocaleString()} files. Choose more pages per file to stay within the ${MAX_SPLIT_FILES}-file limit.`,
      );
    }

    const baseName = outputBaseName(request.input.name);
    const entries: Record<string, Uint8Array> = {};
    let outputBytes = 0;
    for (let firstPage = 0; firstPage < sourcePageCount; firstPage += pagesPerFile) {
      const lastPage = Math.min(firstPage + pagesPerFile, sourcePageCount);
      const splitDocument = await PDFDocument.create();
      const pages = await splitDocument.copyPages(
        source,
        Array.from({ length: lastPage - firstPage }, (_, index) => firstPage + index),
      );
      for (const page of pages) splitDocument.addPage(page);
      const saved = Uint8Array.from(await splitDocument.save({ useObjectStreams: true }));
      outputBytes += saved.byteLength;
      if (outputBytes > MAX_SPLIT_OUTPUT_BYTES) {
        throw new Error("Split PDF outputs exceed the 250 MB total output limit.");
      }

      const pageStart = String(firstPage + 1).padStart(5, "0");
      const pageEnd = String(lastPage).padStart(5, "0");
      entries[`${baseName}-pages-${pageStart}-${pageEnd}.pdf`] = saved;
    }

    const archive = zipSync(entries, { level: 0 });
    if (archive.byteLength > MAX_SPLIT_OUTPUT_BYTES) {
      throw new Error("The split PDF ZIP exceeds the 250 MB total output limit.");
    }
    return createResultFromData(
      request,
      new Blob([archive], { type: "application/zip" }),
      `${baseName}-split.zip`,
      "application/zip",
      startedAt,
      request.input.data.size,
      [PDF_MERGE_WARNING],
      sourcePageCount,
      sourcePageCount,
      fileCount,
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

  if (request.operation === "pdf.rotate-pages") {
    const rotation = request.options.degrees;
    if (![90, 180, 270].includes(rotation)) {
      throw new Error("Choose a page rotation of 90, 180, or 270 degrees clockwise.");
    }
    const selectedPages = parsePageSelection(
      request.options.pageSelection,
      sourcePageCount,
    );
    for (const pageNumber of selectedPages) {
      const page = source.getPage(pageNumber - 1);
      page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
    }

    const result = await createResult(
      request,
      source,
      startedAt,
      request.input.data.size,
      "rotated",
      ["Page rotation changes the PDF page display orientation without altering page content."],
      sourcePageCount,
    );
    result.metadata.rotatedPageCount = selectedPages.length;
    result.metadata.rotationDegrees = rotation;
    return result;
  }

  if (request.operation === "pdf.reorder-pages") {
    const pageOrder = parsePageSelection(
      request.options.pageOrder,
      sourcePageCount,
      MAX_PDF_PAGES,
    );
    if (pageOrder.length !== sourcePageCount) {
      throw new Error(
        `Include every page exactly once to reorder this PDF (${sourcePageCount} pages).`,
      );
    }

    const outputDocument = await PDFDocument.create();
    const reorderedPages = await outputDocument.copyPages(
      source,
      pageOrder.map((page) => page - 1),
    );
    for (const page of reorderedPages) outputDocument.addPage(page);

    return createResult(
      request,
      outputDocument,
      startedAt,
      request.input.data.size,
      "reordered",
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
