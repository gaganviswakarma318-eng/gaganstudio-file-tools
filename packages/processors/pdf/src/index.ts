import { detectPdfProcessingCapability } from "@gsft/core";
import type {
  FileProcessor,
  PdfExtractPagesRequest,
  ProcessingContext,
  ProcessingResult,
} from "@gsft/shared";
import type { PdfWorkerResponse } from "./pdf.worker";

export function createBrowserPdfProcessor(): FileProcessor<PdfExtractPagesRequest> {
  const capability = detectPdfProcessingCapability();
  return {
    capability,
    process(request: PdfExtractPagesRequest, context: ProcessingContext) {
      return new Promise<ProcessingResult>((resolve, reject) => {
        if (context.signal.aborted) {
          reject(new DOMException("Cancelled", "AbortError"));
          return;
        }

        const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
          type: "module",
        });
        let settled = false;
        const cleanup = () => {
          context.signal.removeEventListener("abort", onAbort);
          worker.terminate();
        };
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback();
        };
        const onAbort = () =>
          finish(() => reject(new DOMException("Cancelled", "AbortError")));

        context.signal.addEventListener("abort", onAbort, { once: true });
        worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== request.id) {
            finish(() => reject(new Error("The PDF worker returned a mismatched request ID.")));
            return;
          }
          if ("error" in response) {
            finish(() => reject(new Error(response.error)));
            return;
          }
          finish(() => resolve(response));
        };
        worker.onerror = (event) => {
          finish(() =>
            reject(new Error(event.message || "Background PDF processing failed.")),
          );
        };

        context.reportProgress({ stage: "reading-pages", percentage: null });
        try {
          worker.postMessage(request);
        } catch (error) {
          finish(() =>
            reject(
              error instanceof Error
                ? error
                : new Error("The PDF request could not be sent to the worker."),
            ),
          );
        }
      });
    },
  };
}

export { parsePageSelection } from "./page-selection";
