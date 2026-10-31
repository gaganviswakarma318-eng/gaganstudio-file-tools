import { describe, expect, it } from "vitest";
import { detectProcessingCapabilities } from "./capabilities";

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
});
