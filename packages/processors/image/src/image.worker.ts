import { detectImageFile, validateImageDimensions, validateImageFile } from "@gsft/core";
import type { ResizeOptions } from "@gsft/shared";

const MIME_TYPES = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

self.onmessage = async (event: MessageEvent<{ file: File; options: ResizeOptions }>) => {
  const { file, options } = event.data;
  let source: ImageBitmap | undefined;
  try {
    await validateImageFile(file);
    const detected = await detectImageFile(file);
    if (detected?.format === "gif") {
      throw new Error("GIF resizing is unavailable because exporting would remove animation.");
    }
    validateImageDimensions(options.width, options.height);
    if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
      throw new Error("Quality must be between 1 and 100.");
    }

    source = await createImageBitmap(file);
    validateImageDimensions(source.width, source.height);
    let width = options.width;
    let height = options.height;
    if (options.fit === "inside") {
      const ratio = Math.min(options.width / source.width, options.height / source.height,
        options.preventEnlargement ? 1 : Number.POSITIVE_INFINITY);
      width = Math.max(1, Math.round(source.width * ratio));
      height = Math.max(1, Math.round(source.height * ratio));
    } else if (options.preventEnlargement && options.fit === "cover") {
      const targetRatio = options.width / options.height;
      const sourceRatio = source.width / source.height;
      const cropWidth = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
      const cropHeight = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
      const scale = Math.min(1, cropWidth / options.width, cropHeight / options.height);
      width = Math.max(1, Math.round(options.width * scale));
      height = Math.max(1, Math.round(options.height * scale));
    } else if (options.preventEnlargement) {
      width = Math.min(options.width, source.width);
      height = Math.min(options.height, source.height);
    }
    validateImageDimensions(width, height);

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: options.format !== "jpeg" });
    if (!context) throw new Error("This browser could not create an image processing canvas.");
    if (options.format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    if (options.fit === "cover") {
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
    self.postMessage({ output, width, height, sourceWidth: source.width, sourceHeight: source.height });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Image processing failed." });
  } finally {
    source?.close();
  }
};
