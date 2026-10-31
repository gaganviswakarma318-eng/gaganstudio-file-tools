import { describe, expect, it, vi } from "vitest";
import type {
  FileProcessor,
  ImageResizeRequest,
  PdfExtractPagesRequest,
  PdfProcessingRequest,
  ProcessingContext,
  ProcessingResult,
} from "@gsft/shared";
import { ProcessingRouter, ProcessorUnavailableError } from "./processing-router";

const request: ImageResizeRequest = {
  id: "request-1",
  category: "image",
  operation: "image.resize",
  input: { name: "photo.png", mimeType: "image/png", data: new Blob(["input"]) },
  options: {
    width: 100,
    height: 100,
    fit: "inside",
    format: "webp",
    quality: 85,
    preventEnlargement: true,
  },
};

const context: ProcessingContext = {
  signal: new AbortController().signal,
  reportProgress: vi.fn(),
};

function createProcessor(
  process: (request: ImageResizeRequest, context: ProcessingContext) => Promise<ProcessingResult>,
  available = true,
): FileProcessor<ImageResizeRequest> {
  return {
    capability: {
      id: "browser.image.resize",
      category: "image",
      operations: ["image.resize"],
      location: "browser",
      inputFormats: ["PNG"],
      outputFormats: ["WebP"],
      requirements: [],
      available,
      ...(available ? {} : { unavailableReason: "Web Workers are unavailable." }),
    },
    process,
  };
}

function result(requestId: string): ProcessingResult {
  const data = new Blob(["output"]);
  return {
    requestId,
    location: "browser",
    output: { data, name: "photo.webp", mimeType: "image/webp" },
    metadata: {},
    statistics: { inputBytes: 5, outputBytes: data.size, durationMs: 1 },
    warnings: [],
  };
}

describe("ProcessingRouter", () => {
  it("routes to an available compatible processor", async () => {
    const process = vi.fn(async (item: ImageResizeRequest) => result(item.id));
    const router = new ProcessingRouter([createProcessor(process)]);

    await expect(router.process(request, context)).resolves.toMatchObject({
      requestId: request.id,
      output: { name: "photo.webp" },
    });
    expect(process).toHaveBeenCalledOnce();
  });

  it("reports capability requirements when no compatible engine is available", async () => {
    const router = new ProcessingRouter([
      createProcessor(async (item) => result(item.id), false),
    ]);

    await expect(router.process(request, context)).rejects.toThrow(
      new ProcessorUnavailableError("Web Workers are unavailable."),
    );
  });

  it("rejects a result associated with a different request", async () => {
    const router = new ProcessingRouter([
      createProcessor(async () => result("different-request")),
    ]);

    await expect(router.process(request, context)).rejects.toThrow(
      "different request",
    );
  });

  it("rejects an empty processor output", async () => {
    const router = new ProcessingRouter([
      createProcessor(async (item) => ({
        ...result(item.id),
        output: { ...result(item.id).output, data: new Blob() },
        statistics: { ...result(item.id).statistics, outputBytes: 0 },
      })),
    ]);

    await expect(router.process(request, context)).rejects.toThrow("empty output");
  });

  it("rejects inaccurate input-size statistics", async () => {
    const router = new ProcessingRouter([
      createProcessor(async (item) => ({
        ...result(item.id),
        statistics: { ...result(item.id).statistics, inputBytes: 99 },
      })),
    ]);

    await expect(router.process(request, context)).rejects.toThrow(
      "inconsistent input size",
    );
  });

  it("routes PDF requests only to a browser PDF extraction processor", async () => {
    const pdfRequest: PdfExtractPagesRequest = {
      id: "pdf-request",
      category: "pdf",
      operation: "pdf.extract-pages",
      input: {
        name: "source.pdf",
        mimeType: "application/pdf",
        data: new Blob(["pdf"]),
      },
      options: { pageSelection: "1-2" },
      requestedLocation: "browser",
    };
    const process = vi.fn(async () => ({
      ...result(pdfRequest.id),
      statistics: {
        ...result(pdfRequest.id).statistics,
        inputBytes: pdfRequest.input.data.size,
      },
      output: {
        ...result(pdfRequest.id).output,
        mimeType: "application/pdf",
      },
    }));
    const processor: FileProcessor<PdfProcessingRequest> = {
      capability: {
        id: "browser.pdf",
        category: "pdf",
        operations: ["pdf.extract-pages", "pdf.merge", "pdf.compress"],
        location: "browser",
        inputFormats: ["PDF"],
        outputFormats: ["PDF"],
        requirements: ["Web Workers", "pdf-lib"],
        available: true,
      },
      process,
    };
    const router = new ProcessingRouter([processor]);

    await expect(router.process(pdfRequest, context)).resolves.toMatchObject({
      requestId: "pdf-request",
      location: "browser",
      output: { mimeType: "application/pdf" },
    });
    expect(process).toHaveBeenCalledOnce();
  });
});
