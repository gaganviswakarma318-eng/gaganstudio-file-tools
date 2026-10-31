import type { PdfProcessingRequest, ProcessingResult } from "@gsft/shared";
import { processPdf } from "./pdf-processing";

self.onmessage = async (event: MessageEvent<PdfProcessingRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const result = await processPdf(request, startedAt);
    self.postMessage(result);
  } catch (error) {
    self.postMessage({
      requestId: request.id,
      error: error instanceof Error ? error.message : "PDF processing failed.",
    } satisfies { requestId: string; error: string });
  }
};

export type PdfWorkerResponse = ProcessingResult | { requestId: string; error: string };
