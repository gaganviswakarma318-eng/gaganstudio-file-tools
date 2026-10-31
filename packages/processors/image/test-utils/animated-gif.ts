import gifenc from "gifenc";
import { decompressFrames, parseGIF } from "gifuct-js";

const { applyPalette, GIFEncoder, quantize } = gifenc;

export const ANIMATED_GIF_WIDTH = 24;
export const ANIMATED_GIF_HEIGHT = 16;
export const ANIMATED_GIF_DELAYS = [80, 160] as const;
export const ANIMATED_GIF_LOOP_COUNT = 3;

function createFrame(
  width: number,
  height: number,
  color: [number, number, number, number],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba.set(color, offset);
  }
  return rgba;
}

export function createAnimatedGifFixture(frameCount = 2): Uint8Array {
  const width = ANIMATED_GIF_WIDTH;
  const height = ANIMATED_GIF_HEIGHT;
  const encoder = GIFEncoder();
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const color: [number, number, number, number] =
      frameIndex % 2 === 0 ? [240, 32, 24, 255] : [24, 232, 48, 255];
    const rgba = createFrame(width, height, color);
    const palette = quantize(rgba, 256, { format: "rgb565" });
    encoder.writeFrame(applyPalette(rgba, palette, "rgb565"), width, height, {
      palette,
      delay: ANIMATED_GIF_DELAYS[frameIndex] ?? 100,
      repeat: frameIndex === 0 ? ANIMATED_GIF_LOOP_COUNT : undefined,
      dispose: 0,
    });
  }
  encoder.finish();
  const bytes = encoder.bytes();
  const fixture = new Uint8Array(bytes.byteLength);
  fixture.set(bytes);
  return fixture;
}

export function createDisposalGifFixture(disposalType: 2 | 3): Uint8Array {
  const width = ANIMATED_GIF_WIDTH;
  const height = ANIMATED_GIF_HEIGHT;
  const encoder = GIFEncoder();
  const opaquePalette = [[0, 0, 0], [240, 32, 24]];
  const transparentPalette = [[0, 0, 0], [32, 64, 240]];
  const finalPalette = [[0, 0, 0], [240, 220, 32]];
  const firstFrame = new Uint8Array(width * height).fill(1);
  const secondFrame = new Uint8Array(width * height);
  const finalFrame = new Uint8Array(width * height);
  for (let y = 5; y < 11; y += 1) {
    for (let x = 9; x < 15; x += 1) {
      secondFrame[y * width + x] = 1;
    }
  }
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      finalFrame[y * width + x] = 1;
    }
  }
  encoder.writeFrame(firstFrame, width, height, {
    palette: opaquePalette,
    delay: 100,
    repeat: 0,
    dispose: 0,
  });
  encoder.writeFrame(secondFrame, width, height, {
    palette: transparentPalette,
    delay: 100,
    transparent: true,
    transparentIndex: 0,
    dispose: disposalType,
  });
  encoder.writeFrame(finalFrame, width, height, {
    palette: finalPalette,
    delay: 100,
    transparent: true,
    transparentIndex: 0,
    dispose: 0,
  });
  encoder.finish();
  const bytes = encoder.bytes();
  const fixture = new Uint8Array(bytes.byteLength);
  fixture.set(bytes);
  return fixture;
}

export function inspectAnimatedGif(bytes: Uint8Array): {
  width: number;
  height: number;
  loopCount: number;
  frames: Array<{ delay: number; firstPixel: number[] }>;
} {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const gif = parseGIF(buffer);
  const loopExtension = gif.frames.find(
    (frame) => "application" in frame && frame.application.id === "NETSCAPE2.0",
  );
  const loopBlocks =
    loopExtension && "application" in loopExtension
      ? loopExtension.application.blocks
      : [];
  const decodedFrames = decompressFrames(gif, true);

  return {
    width: gif.lsd.width,
    height: gif.lsd.height,
    loopCount:
      loopBlocks.length >= 3 && loopBlocks[0] === 1
        ? loopBlocks[1]! | (loopBlocks[2]! << 8)
        : -1,
    frames: decodedFrames.map((frame) => ({
      delay: frame.delay,
      firstPixel: Array.from(frame.patch.slice(0, 4)),
    })),
  };
}

export function inspectGifPixel(
  bytes: Uint8Array,
  frameIndex: number,
  x: number,
  y: number,
): number[] {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const gif = parseGIF(buffer);
  const frame = decompressFrames(gif, true)[frameIndex];
  if (!frame || x < 0 || y < 0 || x >= frame.dims.width || y >= frame.dims.height) {
    throw new Error("The requested pixel is outside the GIF frame.");
  }
  const offset = (y * frame.dims.width + x) * 4;
  return Array.from(frame.patch.slice(offset, offset + 4));
}
