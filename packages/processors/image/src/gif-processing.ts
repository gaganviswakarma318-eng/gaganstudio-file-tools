import { applyPalette, GIFEncoder, quantize } from "gifenc";
import {
  decompressFrame,
  parseGIF,
  type ParsedFrame,
  type ParsedGif,
} from "gifuct-js";
import type {
  ImageConvertRequest,
  ImageFormat,
  ImageResizeRequest,
  ProcessingInput,
  ProcessingResult,
} from "@gsft/shared";
import { validateImageDimensions } from "@gsft/core";

export const MAX_GIF_FRAMES = 300;
export const MAX_GIF_CANVAS_PIXELS = 20_000_000;
export const MAX_GIF_DECODED_PATCH_PIXELS = 50_000_000;

const GIF_WARNING =
  "GIF uses an indexed palette of up to 256 colors per frame; color gradients may appear banded.";

type GifRequest = ImageResizeRequest | ImageConvertRequest;
type RawGifImageFrame = Extract<ParsedGif["frames"][number], { image: unknown }>;

function resizeDimensions(
  request: GifRequest,
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  if (request.operation !== "image.resize") {
    return { width: sourceWidth, height: sourceHeight };
  }

  const { width: targetWidth, height: targetHeight, fit, preventEnlargement } =
    request.options;
  validateImageDimensions(targetWidth, targetHeight);
  let width = targetWidth;
  let height = targetHeight;
  if (fit === "inside") {
    const ratio = Math.min(
      targetWidth / sourceWidth,
      targetHeight / sourceHeight,
      preventEnlargement ? 1 : Number.POSITIVE_INFINITY,
    );
    width = Math.max(1, Math.round(sourceWidth * ratio));
    height = Math.max(1, Math.round(sourceHeight * ratio));
  } else if (preventEnlargement && fit === "cover") {
    const targetRatio = targetWidth / targetHeight;
    const sourceRatio = sourceWidth / sourceHeight;
    const cropWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
    const cropHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
    const scale = Math.min(1, cropWidth / targetWidth, cropHeight / targetHeight);
    width = Math.max(1, Math.round(targetWidth * scale));
    height = Math.max(1, Math.round(targetHeight * scale));
  } else if (preventEnlargement) {
    width = Math.min(targetWidth, sourceWidth);
    height = Math.min(targetHeight, sourceHeight);
  }
  validateImageDimensions(width, height);
  return { width, height };
}

function drawResizedFrame(
  source: OffscreenCanvas,
  output: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  request: GifRequest,
): void {
  const { width, height } = output;
  context.clearRect(0, 0, width, height);
  if (request.operation === "image.resize" && request.options.fit === "cover") {
    const sourceRatio = source.width / source.height;
    const targetRatio = width / height;
    const cropWidth = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
    const cropHeight = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
    context.drawImage(
      source,
      (source.width - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height,
    );
  } else {
    context.drawImage(source, 0, 0, width, height);
  }
}

function parseLoopCount(gif: ReturnType<typeof parseGIF>): number {
  const extension = gif.frames.find(
    (frame) => "application" in frame && frame.application.id === "NETSCAPE2.0",
  );
  if (!extension || !("application" in extension)) return -1;
  const blocks = extension.application.blocks;
  if (blocks.length < 3 || blocks[0] !== 1) return -1;
  return blocks[1]! | (blocks[2]! << 8);
}

function quantizeFrame(
  rgba: Uint8ClampedArray,
  hasTransparency: boolean,
): { index: Uint8Array; palette: number[][]; transparentIndex: number } {
  let colors = rgba;
  if (hasTransparency) {
    colors = new Uint8ClampedArray(rgba.length + 4);
    colors.set(rgba);
    colors.set([0, 0, 0, 0], rgba.length);
  }
  const palette = quantize(colors, 256, {
    format: "rgba4444",
    oneBitAlpha: true,
    clearAlpha: false,
  });
  let transparentIndex = palette.findIndex((color) => (color[3] ?? 255) < 128);
  if (hasTransparency && transparentIndex < 0) {
    throw new Error("Could not preserve GIF frame transparency during encoding.");
  }
  if (transparentIndex > 0) {
    [palette[0], palette[transparentIndex]] = [palette[transparentIndex]!, palette[0]!];
    transparentIndex = 0;
  }
  return {
    index: applyPalette(rgba, palette, "rgba4444"),
    palette,
    transparentIndex,
  };
}

function writeGifFrame(
  encoder: ReturnType<typeof GIFEncoder>,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  hasTransparency: boolean,
  delay: number,
  repeat?: number,
): void {
  const { index, palette, transparentIndex } = quantizeFrame(rgba, hasTransparency);
  encoder.writeFrame(index, width, height, {
    palette,
    delay,
    repeat,
    transparent: hasTransparency,
    transparentIndex: hasTransparency ? transparentIndex : 0,
    dispose: hasTransparency ? 2 : 0,
  });
}

function validateAnimation(gif: ReturnType<typeof parseGIF>): RawGifImageFrame[] {
  const rawFrames = gif.frames.filter(
    (frame): frame is RawGifImageFrame => "image" in frame,
  );
  if (rawFrames.length === 0) throw new Error("This GIF does not contain any image frames.");
  if (rawFrames.length > MAX_GIF_FRAMES) {
    throw new Error(`GIFs are limited to ${MAX_GIF_FRAMES} frames.`);
  }

  const sourceWidth = gif.lsd.width;
  const sourceHeight = gif.lsd.height;
  validateImageDimensions(sourceWidth, sourceHeight);
  const canvasPixels = sourceWidth * sourceHeight;
  if (canvasPixels > MAX_GIF_CANVAS_PIXELS) {
    throw new Error("GIF dimensions exceed the 20-megapixel animation safety limit.");
  }

  const totalPatchPixels = rawFrames.reduce(
    (total, frame) => {
      const { left, top, width, height } = frame.image.descriptor;
      if (
        !Number.isInteger(left) ||
        !Number.isInteger(top) ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        left < 0 ||
        top < 0 ||
        width < 1 ||
        height < 1 ||
        left + width > sourceWidth ||
        top + height > sourceHeight
      ) {
        throw new Error("GIF contains a frame outside its declared canvas.");
      }
      return total + width * height;
    },
    0,
  );
  if (totalPatchPixels > MAX_GIF_DECODED_PATCH_PIXELS) {
    throw new Error("GIF frame data exceeds the animation decoding safety limit.");
  }
  return rawFrames;
}

export async function processGif(
  request: GifRequest,
  input: ProcessingInput,
  startedAt: number,
  inputFormat: ImageFormat | "bmp" | "avif" | "tiff",
): Promise<ProcessingResult> {
  if (request.options.format !== "gif") {
    if (inputFormat === "gif") {
      throw new Error(
        "Animated GIFs must be exported as GIF to preserve their animation. Choose GIF output.",
      );
    }
    throw new Error("GIF output was requested for an unsupported image operation.");
  }
  const encoder = GIFEncoder();
  let sourceWidth: number;
  let sourceHeight: number;
  let outputWidth: number;
  let outputHeight: number;
  let frameCount: number;
  let loopCount = -1;
  let hasTransparency = false;

  if (inputFormat === "gif") {
    const parsed = parseGIF(await input.data.arrayBuffer());
    const rawFrames = validateAnimation(parsed);
    sourceWidth = parsed.lsd.width;
    sourceHeight = parsed.lsd.height;
    const outputSize = resizeDimensions(request, sourceWidth, sourceHeight);
    outputWidth = outputSize.width;
    outputHeight = outputSize.height;
    frameCount = rawFrames.length;
    loopCount = parseLoopCount(parsed);
    hasTransparency = rawFrames.some(
      (frame) => Boolean(frame.gce?.extras.transparentColorGiven),
    );
    if (outputWidth * outputHeight * frameCount > 100_000_000) {
      throw new Error("Resized GIF frames exceed the 100-megapixel animation work limit.");
    }
    const sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
    const outputCanvas = new OffscreenCanvas(outputWidth, outputHeight);
    const outputContext = outputCanvas.getContext("2d", { alpha: true });
    if (!sourceContext || !outputContext) {
      throw new Error("This browser could not create an animated image processing canvas.");
    }
    const firstFrameHasTransparency = Boolean(
      rawFrames[0]?.gce?.extras.transparentColorGiven,
    );
    if (!firstFrameHasTransparency) {
      const background = parsed.gct[parsed.lsd.backgroundColorIndex];
      if (background) {
        sourceContext.fillStyle = `rgb(${background[0]} ${background[1]} ${background[2]})`;
        sourceContext.fillRect(0, 0, sourceWidth, sourceHeight);
      }
    }

    let previousFrame: ParsedFrame | undefined;
    let restoreBeforePrevious: ImageData | undefined;
    for (const [frameIndex, rawFrame] of rawFrames.entries()) {
      const frame = decompressFrame(rawFrame, parsed.gct, true);
      if (!frame) {
        throw new Error("Could not decode every frame in this GIF.");
      }
      if (previousFrame?.disposalType === 2) {
        const previousFrameHasTransparency = Boolean(
          rawFrames[frameIndex - 1]?.gce?.extras.transparentColorGiven,
        );
        if (previousFrameHasTransparency) {
          sourceContext.clearRect(
            previousFrame.dims.left,
            previousFrame.dims.top,
            previousFrame.dims.width,
            previousFrame.dims.height,
          );
        } else {
          const background = parsed.gct[parsed.lsd.backgroundColorIndex];
          if (background) {
            sourceContext.fillStyle = `rgb(${background[0]} ${background[1]} ${background[2]})`;
            sourceContext.fillRect(
              previousFrame.dims.left,
              previousFrame.dims.top,
              previousFrame.dims.width,
              previousFrame.dims.height,
            );
          } else {
            sourceContext.clearRect(
              previousFrame.dims.left,
              previousFrame.dims.top,
              previousFrame.dims.width,
              previousFrame.dims.height,
            );
          }
        }
      } else if (previousFrame?.disposalType === 3 && restoreBeforePrevious) {
        sourceContext.putImageData(restoreBeforePrevious, 0, 0);
      }

      const restoreBeforeCurrent =
        frame.disposalType === 3
          ? sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
          : undefined;
      const patchPixels = new Uint8ClampedArray(frame.patch.length);
      patchPixels.set(frame.patch);
      const patchCanvas = new OffscreenCanvas(frame.dims.width, frame.dims.height);
      const patchContext = patchCanvas.getContext("2d", { alpha: true });
      if (!patchContext) {
        throw new Error("This browser could not composite an animated GIF frame.");
      }
      patchContext.putImageData(
        new ImageData(patchPixels, frame.dims.width, frame.dims.height),
        0,
        0,
      );
      sourceContext.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
      drawResizedFrame(sourceCanvas, outputCanvas, outputContext, request);
      const pixels = outputContext.getImageData(0, 0, outputWidth, outputHeight);
      writeGifFrame(
        encoder,
        pixels.data,
        outputWidth,
        outputHeight,
        hasTransparency,
        rawFrame.gce ? rawFrame.gce.delay * 10 : 0,
        frameIndex === 0 ? loopCount : undefined,
      );
      previousFrame = frame;
      restoreBeforePrevious = restoreBeforeCurrent;
    }
  } else {
    const source = await createImageBitmap(input.data);
    try {
      sourceWidth = source.width;
      sourceHeight = source.height;
      validateImageDimensions(sourceWidth, sourceHeight);
      const outputSize = resizeDimensions(request, sourceWidth, sourceHeight);
      outputWidth = outputSize.width;
      outputHeight = outputSize.height;
      const sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
      const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
      const outputCanvas = new OffscreenCanvas(outputWidth, outputHeight);
      const outputContext = outputCanvas.getContext("2d", { alpha: true });
      if (!sourceContext || !outputContext) {
        throw new Error("This browser could not create an image processing canvas.");
      }
      sourceContext.drawImage(source, 0, 0);
      drawResizedFrame(sourceCanvas, outputCanvas, outputContext, request);
      const pixels = outputContext.getImageData(0, 0, outputWidth, outputHeight);
      hasTransparency = pixels.data.some((value, index) => index % 4 === 3 && value < 255);
      writeGifFrame(encoder, pixels.data, outputWidth, outputHeight, hasTransparency, 100, -1);
      frameCount = 1;
    } finally {
      source.close();
    }
  }

  encoder.finish();
  const bytes = encoder.bytes();
  if (bytes.byteLength > 250 * 1024 * 1024) {
    throw new Error("The generated GIF exceeds the 250 MB output limit.");
  }
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const output = new Blob([blobBytes.buffer], { type: "image/gif" });
  const baseName = input.name.replace(/\.[^.]+$/, "") || "image";
  const warnings = [GIF_WARNING];
  if (request.options.preserveMetadata) {
    warnings.push(
      "GIF metadata preservation is not supported; non-animation metadata was removed. Animation timing and loop settings were retained.",
    );
  }
  return {
    requestId: request.id,
    location: "browser",
    output: {
      data: output,
      name: `${baseName}-${request.operation === "image.resize" ? "resized" : "converted"}.gif`,
      mimeType: "image/gif",
    },
    metadata: {
      sourceWidth,
      sourceHeight,
      width: outputWidth,
      height: outputHeight,
      format: "gif",
      frameCount,
      loopCount,
    },
    statistics: {
      inputBytes: input.data.size,
      outputBytes: output.size,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
    warnings,
  };
}
