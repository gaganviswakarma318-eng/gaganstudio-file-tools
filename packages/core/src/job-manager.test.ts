import { describe, expect, it, vi } from "vitest";
import type {
  FileProcessor,
  ImageResizeRequest,
  PdfExtractPagesRequest,
  ProcessingContext,
  ProcessingResult,
  ResizeOptions,
} from "@gsft/shared";
import { JobManager } from "./job-manager";
import { ProcessingRouter } from "./processing-router";

const imageFile = () =>
  new File([new Uint8Array([1])], "image.png", { type: "image/png" });

const options: ResizeOptions = {
  width: 640,
  height: 480,
  fit: "inside",
  format: "webp",
  quality: 85,
  preventEnlargement: true,
};

function createResult(request: ImageResizeRequest): ProcessingResult {
  const data = new Blob(["done"], { type: "image/webp" });
  return {
    requestId: request.id,
    location: "browser",
    output: { data, name: "image-resized.webp", mimeType: "image/webp" },
    metadata: { width: 320, height: 240, sourceWidth: 640, sourceHeight: 480 },
    statistics: { inputBytes: request.input.data.size, outputBytes: data.size, durationMs: 1 },
    warnings: [],
  };
}

function createProcessor(
  process: (request: ImageResizeRequest, context: ProcessingContext) => Promise<ProcessingResult>,
): FileProcessor<ImageResizeRequest> {
  return {
    capability: {
      id: "test.image.resize",
      category: "image",
      operations: ["image.resize"],
      location: "browser",
      inputFormats: ["PNG"],
      outputFormats: ["WebP"],
      requirements: [],
      available: true,
    },
    process,
  };
}

describe("JobManager", () => {
  it("processes queued files through the router and publishes completion", async () => {
    const process = vi.fn(async (request: ImageResizeRequest) => createResult(request));
    const router = new ProcessingRouter([createProcessor(process)]);
    const manager = new JobManager(router);
    manager.enqueue([imageFile()], options);

    await vi.waitFor(() => expect(manager.getJobs()[0]?.status).toBe("completed"));
    expect(process).toHaveBeenCalledOnce();
    expect(process.mock.calls[0]?.[0]).toMatchObject({
      category: "image",
      operation: "image.resize",
      options,
    });
    expect(manager.getJobs()[0]).toMatchObject({
      progress: 100,
      outputWidth: 320,
      outputHeight: 240,
      sourceWidth: 640,
      location: "browser",
    });
  });

  it("records processor failures without losing the error", async () => {
    const router = new ProcessingRouter([
      createProcessor(async () => {
        throw new Error("decode failed");
      }),
    ]);
    const manager = new JobManager(router);
    manager.enqueue([imageFile()], options);

    await vi.waitFor(() => expect(manager.getJobs()[0]?.status).toBe("failed"));
    expect(manager.getJobs()[0]?.error).toBe("decode failed");
  });

  it("cancels work waiting in the queue", () => {
    const router = new ProcessingRouter([
      createProcessor(async (request) => createResult(request)),
    ]);
    const manager = new JobManager(router);
    manager.pause();
    manager.enqueue([imageFile()], options);
    const job = manager.getJobs()[0];
    if (!job) throw new Error("Expected an enqueued job.");
    manager.cancel(job.id);
    expect(manager.getJobs()[0]?.status).toBe("cancelled");
    manager.resume();
  });

  it("restores interrupted jobs as retryable and retries with a new request ID", async () => {
    const process = vi.fn(async (request: ImageResizeRequest) => createResult(request));
    const manager = new JobManager(new ProcessingRouter([createProcessor(process)]));
    const file = imageFile();
    const request: ImageResizeRequest = {
      id: "interrupted-job",
      category: "image",
      operation: "image.resize",
      input: { name: file.name, mimeType: file.type, data: file },
      options,
    };

    manager.restore([{
      id: request.id,
      file,
      request,
      status: "processing",
      progress: 42,
      createdAt: 1,
    }]);

    expect(manager.getJobs()[0]).toMatchObject({
      status: "failed",
      progress: null,
      error: expect.stringContaining("interrupted"),
    });

    const retriedId = manager.retry(request.id);
    expect(retriedId).not.toBe(request.id);
    await vi.waitFor(() => expect(manager.getJobs().find((job) => job.id === retriedId)?.status).toBe("completed"));
    expect(process).toHaveBeenCalledOnce();
    expect(manager.getJobs()).toHaveLength(2);
  });

  it("removes only terminal jobs from history", () => {
    const manager = new JobManager(new ProcessingRouter([
      createProcessor(async (request) => createResult(request)),
    ]));
    const file = imageFile();
    const request: ImageResizeRequest = {
      id: "queued-job",
      category: "image",
      operation: "image.resize",
      input: { name: file.name, mimeType: file.type, data: file },
      options,
    };
    manager.pause();
    manager.enqueueRequest(request, file);
    manager.remove(request.id);
    expect(manager.getJobs()).toHaveLength(1);
    manager.cancel(request.id);
    manager.remove(request.id);
    expect(manager.getJobs()).toHaveLength(0);
    manager.resume();
  });

  it("runs PDF extraction as a cancellable queue job through the shared router", async () => {
    const pdfFile = new File(["pdf-input"], "source.pdf", { type: "application/pdf" });
    const request: PdfExtractPagesRequest = {
      id: "pdf-job",
      category: "pdf",
      operation: "pdf.extract-pages",
      input: { name: pdfFile.name, mimeType: pdfFile.type, data: pdfFile },
      options: { pageSelection: "1-2" },
      requestedLocation: "browser",
    };
    const data = new Blob(["pdf-output"], { type: "application/pdf" });
    const processor: FileProcessor<PdfExtractPagesRequest> = {
      capability: {
        id: "browser.pdf.extract-pages",
        category: "pdf",
        operations: ["pdf.extract-pages"],
        location: "browser",
        inputFormats: ["PDF"],
        outputFormats: ["PDF"],
        requirements: ["Web Workers", "pdf-lib"],
        available: true,
      },
      async process(item) {
        return {
          requestId: item.id,
          location: "browser",
          output: { data, name: "source-extracted.pdf", mimeType: "application/pdf" },
          metadata: { sourcePageCount: 3, pageCount: 2 },
          statistics: {
            inputBytes: item.input.data.size,
            outputBytes: data.size,
            durationMs: 1,
          },
          warnings: [],
        };
      },
    };
    const manager = new JobManager(new ProcessingRouter([processor]));

    expect(manager.enqueueRequest(request, pdfFile)).toBe("pdf-job");
    await vi.waitFor(() => expect(manager.getJobs()[0]?.status).toBe("completed"));
    expect(manager.getJobs()[0]).toMatchObject({
      request,
      outputName: "source-extracted.pdf",
      location: "browser",
      result: { metadata: { pageCount: 2 } },
    });
  });
});
