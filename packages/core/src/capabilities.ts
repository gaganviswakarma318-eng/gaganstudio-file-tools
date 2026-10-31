import type { ProcessorCapability } from "@gsft/shared";

export interface BrowserProcessingFeatures {
  worker: boolean;
  imageBitmap: boolean;
  offscreenCanvas: boolean;
  offscreenCanvasEncoding: boolean;
}

export function probeBrowserProcessingFeatures(): BrowserProcessingFeatures {
  const OffscreenCanvasConstructor = globalThis.OffscreenCanvas;
  return {
    worker: typeof globalThis.Worker === "function",
    imageBitmap: typeof globalThis.createImageBitmap === "function",
    offscreenCanvas: typeof OffscreenCanvasConstructor === "function",
    offscreenCanvasEncoding:
      typeof OffscreenCanvasConstructor === "function" &&
      typeof OffscreenCanvasConstructor.prototype.convertToBlob === "function",
  };
}

export function detectProcessingCapabilities(
  features: BrowserProcessingFeatures = probeBrowserProcessingFeatures(),
): ProcessorCapability[] {
  const requirements = [
    { key: "worker", label: "Web Workers" },
    { key: "imageBitmap", label: "createImageBitmap" },
    { key: "offscreenCanvas", label: "OffscreenCanvas" },
    { key: "offscreenCanvasEncoding", label: "OffscreenCanvas image encoding" },
  ] as const;
  const missing = requirements
    .filter(({ key }) => !features[key])
    .map(({ label }) => label);

  return [
    {
      id: "browser.image",
      category: "image",
      operations: ["image.resize", "image.compress", "image.convert"],
      location: "browser",
      inputFormats: ["JPEG", "PNG", "WebP", "GIF"],
      outputFormats: ["JPEG", "PNG", "WebP", "GIF"],
      requirements: requirements.map(({ label }) => label),
      available: missing.length === 0,
      ...(missing.length > 0
        ? { unavailableReason: `Image processing requires ${missing.join(", ")}.` }
        : {}),
    },
  ];
}

export function detectPdfProcessingCapability(
  workerAvailable = typeof globalThis.Worker === "function",
): ProcessorCapability {
  return {
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
    inputFormats: ["PDF"],
    outputFormats: ["PDF", "ZIP"],
    requirements: ["Web Workers", "pdf-lib", "fflate"],
    available: workerAvailable,
    ...(workerAvailable
      ? {}
      : {
          unavailableReason: "PDF processing requires Web Workers in this browser.",
        }),
  };
}
