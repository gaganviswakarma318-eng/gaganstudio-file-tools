import type { PdfExtractPagesRequest, ProcessingResult } from "@gsft/shared";
import { extractPdfPages } from "./pdf-processing";

self.onmessage = async (event: MessageEvent<PdfExtractPagesRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const result = await extractPdfPages(request, startedAt);
    self.postMessage(result);
  } catch (error) {
    self.postMessage({
      requestId: request.id,
      error: error instanceof Error ? error.message : "PDF page extraction failed.",
    } satisfies { requestId: string; error: string });
  }
};

export type PdfWorkerResponse = ProcessingResult | { requestId: string; error: string };
