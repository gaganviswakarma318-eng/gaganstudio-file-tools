import { detectImageFile, validateImageDimensions, validateImageFile } from "@gsft/core";
import type { ImageProcessingRequest, ProcessingResult } from "@gsft/shared";
import { processGif } from "./gif-processing";

const MIME_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
} as const;

self.onmessage = async (event: MessageEvent<ImageProcessingRequest>) => {
  const request = event.data;
  const { input, options } = request;
  let source: ImageBitmap | undefined;
  const startedAt = performance.now();
  try {
    await validateImageFile(input.data);
    const detected = await detectImageFile(input.data);
    if (!detected) {
      throw new Error("This file does not appear to be a supported image.");
    }
    if (detected.format === "gif" || options.format === "gif") {
      if (request.operation === "image.compress") {
        throw new Error("GIF output is not available for compression; use resize or conversion.");
      }
      const result = await processGif(request, input, startedAt, detected.format);
      self.postMessage(result);
      return;
    }
    if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
      throw new Error("Quality must be between 1 and 100.");
    }

    source = await createImageBitmap(input.data);
    validateImageDimensions(source.width, source.height);
    const resizeOptions = request.operation === "image.resize" ? request.options : undefined;
    if (resizeOptions) validateImageDimensions(resizeOptions.width, resizeOptions.height);
    let width = source.width;
    let height = source.height;
    if (resizeOptions?.fit === "inside") {
      const ratio = Math.min(resizeOptions.width / source.width, resizeOptions.height / source.height,
        resizeOptions.preventEnlargement ? 1 : Number.POSITIVE_INFINITY);
      width = Math.max(1, Math.round(source.width * ratio));
      height = Math.max(1, Math.round(source.height * ratio));
    } else if (resizeOptions?.preventEnlargement && resizeOptions.fit === "cover") {
      const targetRatio = resizeOptions.width / resizeOptions.height;
      const sourceRatio = source.width / source.height;
      const cropWidth = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
      const cropHeight = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
      const scale = Math.min(1, cropWidth / resizeOptions.width, cropHeight / resizeOptions.height);
      width = Math.max(1, Math.round(resizeOptions.width * scale));
      height = Math.max(1, Math.round(resizeOptions.height * scale));
    } else if (resizeOptions?.preventEnlargement) {
      width = Math.min(resizeOptions.width, source.width);
      height = Math.min(resizeOptions.height, source.height);
    }
    validateImageDimensions(width, height);

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: options.format !== "jpeg" });
    if (!context) throw new Error("This browser could not create an image processing canvas.");
    if (options.format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    if (resizeOptions?.fit === "cover") {
      const sourceRatio = source.width / source.height;
      const targetRatio = width / height;
      const cropWidth = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
      const cropHeight = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
      context.drawImage(source, (source.width - cropWidth) / 2, (source.height - cropHeight) / 2,
        cropWidth, cropHeight, 0, 0, width, height);
    } else {
      context.drawImage(source, 0, 0, width, height);
    }

    const output = await canvas.convertToBlob({
      type: MIME_TYPES[options.format],
      ...(options.format === "png" ? {} : { quality: options.quality / 100 }),
    });
    if (output.type !== MIME_TYPES[options.format]) {
      throw new Error(`${options.format.toUpperCase()} export is not supported by this browser.`);
    }
    const result: ProcessingResult = {
      requestId: request.id,
      location: "browser",
      output: {
        data: output,
        name: `${input.name.replace(/\.[^.]+$/, "") || "image"}-${request.operation === "image.resize" ? "resized" : request.operation === "image.compress" ? "compressed" : "converted"}.${options.format === "jpeg" ? "jpg" : options.format}`,
        mimeType: MIME_TYPES[options.format],
      },
      metadata: {
        sourceWidth: source.width,
        sourceHeight: source.height,
        width,
        height,
        format: options.format,
      },
      statistics: {
        inputBytes: input.data.size,
        outputBytes: output.size,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
      warnings:
        request.operation !== "image.resize" && output.size >= input.data.size
          ? [`The ${request.operation === "image.compress" ? "compressed" : "converted"} output is not smaller than the original.`]
          : [],
    };
    self.postMessage(result);
  } catch (error) {
    self.postMessage({
      requestId: request.id,
      error: error instanceof Error ? error.message : "Image processing failed.",
    });
  } finally {
    source?.close();
  }
};
