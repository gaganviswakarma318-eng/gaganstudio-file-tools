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
      id: "browser.image",
      category: "image",
      operations: ["image.resize", "image.compress", "image.convert"],
      location: "browser",
      inputFormats: ["JPEG", "PNG", "WebP", "GIF"],
      outputFormats: ["JPEG", "PNG", "WebP", "GIF"],
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

  it("reports PDF operations availability independently from canvas APIs", () => {
    expect(detectPdfProcessingCapability(true)).toMatchObject({
      id: "browser.pdf",
      category: "pdf",
      operations: [
        "pdf.extract-pages",
        "pdf.merge",
        "pdf.compress",
        "pdf.rotate-pages",
        "pdf.reorder-pages",
        "pdf.split",
      ],
      location: "browser",
      outputFormats: ["PDF", "ZIP"],
      available: true,
    });
    expect(detectPdfProcessingCapability(false).unavailableReason).toContain("Web Workers");
  });
});
