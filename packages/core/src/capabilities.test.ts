import { describe, expect, it } from "vitest";
import {
  detectPdfProcessingCapability,
  detectProcessingCapabilities,
} from "./capabilities";

describe("detectProcessingCapabilities", () => {
  it("reports image resize as available when all required browser APIs exist", () => {
    const [capability] = detectProcessingCapabilities({
      worker: true,
      imageBitmap: true,
      offscreenCanvas: true,
      offscreenCanvasEncoding: true,
    });

    expect(capability).toMatchObject({
      id: "browser.image.resize",
      category: "image",
      operations: ["image.resize"],
      location: "browser",
      available: true,
    });
    expect(capability?.unavailableReason).toBeUndefined();
  });

  it("explains which browser API is missing", () => {
    const [capability] = detectProcessingCapabilities({
      worker: false,
      imageBitmap: true,
      offscreenCanvas: false,
      offscreenCanvasEncoding: false,
    });

    expect(capability?.available).toBe(false);
    expect(capability?.unavailableReason).toContain("Web Workers");
    expect(capability?.unavailableReason).toContain("OffscreenCanvas");
  });

  it("reports PDF page extraction availability independently from canvas APIs", () => {
    expect(detectPdfProcessingCapability(true)).toMatchObject({
      id: "browser.pdf.extract-pages",
      category: "pdf",
      operations: ["pdf.extract-pages"],
      location: "browser",
      available: true,
    });
    expect(detectPdfProcessingCapability(false).unavailableReason).toContain("Web Workers");
  });
});
