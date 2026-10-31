import { detectProcessingCapabilities } from "@gsft/core";
import type {
  FileProcessor,
  ImageProcessingRequest,
  ProcessingContext,
  ProcessingResult,
} from "@gsft/shared";

type WorkerResponse = ProcessingResult | { requestId: string; error: string };

export function createBrowserImageProcessor(): FileProcessor<ImageProcessingRequest> {
  const capability = detectProcessingCapabilities()[0];
  if (!capability) {
    throw new Error("Browser image resize capability detection returned no result.");
  }

  return {
    capability,
    process(request: ImageProcessingRequest, context: ProcessingContext) {
      return new Promise<ProcessingResult>((resolve, reject) => {
        if (context.signal.aborted) {
          reject(new DOMException("Cancelled", "AbortError"));
          return;
        }

        const worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
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
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== request.id) {
            finish(() => reject(new Error("The image worker returned a mismatched request ID.")));
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
            reject(new Error(event.message || "Background image processing failed.")),
          );
        };

        try {
          worker.postMessage(request);
        } catch (error) {
          finish(() =>
            reject(
              error instanceof Error
                ? error
                : new Error("The image request could not be sent to the worker."),
            ),
          );
        }
      });
    },
  };
}
