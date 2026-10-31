import { expect, test } from "@playwright/test";
import {
  ANIMATED_GIF_DELAYS,
  ANIMATED_GIF_LOOP_COUNT,
  createAnimatedGifFixture,
  createDisposalGifFixture,
  inspectGifPixel,
  inspectAnimatedGif,
} from "../../packages/processors/image/test-utils/animated-gif";
import {
  createJpegWithExifFixture,
  readJpegExif,
} from "../../packages/processors/image/test-utils/jpeg-metadata";
import { readFile } from "node:fs/promises";

async function createPngFixture(
  page: import("@playwright/test").Page,
  width = 48,
  height = 32,
): Promise<Buffer> {
  const bytes = await page.evaluate(
    ({ width, height }) =>
      new Promise<number[]>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas is unavailable in the test browser."));
          return;
        }

        context.fillStyle = "#cb5438";
        context.fillRect(0, 0, width / 2, height);
        context.fillStyle = "#327c68";
        context.fillRect(width / 2, 0, width / 2, height);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Could not create the PNG test fixture."));
            return;
          }
          resolve(Array.from(new Uint8Array(await blob.arrayBuffer())));
        }, "image/png");
      }),
    { width, height },
  );
  return Buffer.from(bytes);
}

async function createJpegFixture(
  page: import("@playwright/test").Page,
): Promise<Buffer> {
  const bytes = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 32;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas is unavailable in the test browser."));
          return;
        }
        context.fillStyle = "#cb5438";
        context.fillRect(0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Could not create the JPEG test fixture."));
            return;
          }
          resolve(Array.from(new Uint8Array(await blob.arrayBuffer())));
        }, "image/jpeg");
      }),
  );
  return Buffer.from(bytes);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("resizes an image in a worker, shows before/after previews, and downloads the result", async ({
  page,
}) => {
  await expect(page.locator(".local-badge")).toHaveText("Local processing");
  let workerStarted = false;
  page.on("worker", () => {
    workerStarted = true;
  });

  const fixture = await createPngFixture(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "two-colors.png",
    mimeType: "image/png",
    buffer: fixture,
  });
  await page.getByRole("spinbutton", { name: /WIDTH/ }).fill("24");
  await page.getByRole("spinbutton", { name: /HEIGHT/ }).fill("24");
  await page.getByRole("button", { name: "Resize 1 image" }).click();

  const comparison = page.getByRole("region", { name: "Before and after comparison" });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByRole("img", { name: "Original image preview" })).toHaveJSProperty(
    "naturalWidth",
    48,
  );
  await expect(comparison.getByRole("img", { name: "Resized image preview" })).toHaveJSProperty(
    "naturalWidth",
    24,
  );
  await expect(comparison).toContainText("48 × 32");
  await expect(comparison).toContainText("24 × 16");
  expect(workerStarted).toBe(true);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("two-colors-resized.webp");
});

test("reports invalid image contents instead of presenting a successful result", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-an-image.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is not an image"),
  });
  await page.getByRole("button", { name: "Resize 1 image" }).click();

  await expect(page.locator(".job-error")).toContainText(
    "does not appear to be a supported image",
  );
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
});

test("compresses an image in a worker while preserving its pixel dimensions", async ({ page }) => {
  const fixture = await createPngFixture(page, 512, 512);
  await page.getByRole("button", { name: /Image compressor/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "two-colors.png",
    mimeType: "image/png",
    buffer: fixture,
  });
  await expect(page.getByRole("heading", { name: "Compression settings" })).toBeVisible();
  await page.getByRole("slider", { name: "Output quality" }).fill("75");
  await page.getByRole("button", { name: "Compress 1 image" }).click();

  const comparison = page.getByRole("region", { name: "Before and after comparison" });
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("512 × 512");
  await expect(comparison.getByRole("img", { name: "Compressed image preview" })).toHaveJSProperty(
    "naturalWidth",
    512,
  );
  await expect(comparison).toContainText("512 × 512 ·");
  await expect(page.locator(".queue-file")).toContainText("% smaller");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("two-colors-compressed.webp");
});

test("warns when compression would increase a small image's file size", async ({ page }) => {
  const fixture = await createPngFixture(page);
  await page.getByRole("button", { name: /Image compressor/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: fixture,
  });
  await page.getByRole("button", { name: "Compress 1 image" }).click();

  await expect(page.getByRole("status")).toContainText(
    "compressed output is not smaller than the original",
  );
});

test("converts an image format in a worker while keeping its dimensions", async ({ page }) => {
  const fixture = await createPngFixture(page);
  await page.getByRole("button", { name: /Format converter/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "two-colors.png",
    mimeType: "image/png",
    buffer: fixture,
  });
  await page.getByLabel("Output format").selectOption("jpeg");
  await page.getByRole("button", { name: "Convert 1 image" }).click();

  const comparison = page.getByRole("region", { name: "Before and after comparison" });
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("48 × 32");
  await expect(comparison.getByRole("img", { name: "Converted image preview" })).toHaveJSProperty(
    "naturalWidth",
    48,
  );
  await expect(comparison).toContainText("48 × 32 ·");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("two-colors-converted.jpg");
});

test("strips image metadata by default", async ({ page }) => {
  const fixture = createJpegWithExifFixture(await createJpegFixture(page));
  await page.getByRole("button", { name: /Format converter/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "private-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(fixture),
  });
  await page.getByLabel("Output format").selectOption("jpeg");
  await expect(page.getByRole("checkbox", { name: "Preserve compatible JPEG metadata" }))
    .not.toBeChecked();
  await page.getByRole("button", { name: "Convert 1 image" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error("The browser did not save the JPEG download.");
  const metadata = readJpegExif(new Uint8Array(await readFile(outputPath)));
  expect(metadata.make).toBeUndefined();
  expect(metadata.hasGps).toBe(false);
  expect(metadata.orientation).toBeUndefined();
});

test("preserves safe JPEG camera metadata only when explicitly enabled", async ({ page }) => {
  const fixture = createJpegWithExifFixture(await createJpegFixture(page));
  expect(readJpegExif(fixture).make).toBe("GSFT Test Camera");
  await page.getByRole("button", { name: /Format converter/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "private-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(fixture),
  });
  await page.getByLabel("Output format").selectOption("jpeg");
  await page.getByRole("checkbox", { name: "Preserve compatible JPEG metadata" }).check();
  await page.getByRole("button", { name: "Convert 1 image" }).click();
  await expect(page.locator(".job-warning").first()).toContainText(
    "Safe JPEG camera metadata was retained",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error("The browser did not save the JPEG download.");
  const metadata = readJpegExif(new Uint8Array(await readFile(outputPath)));
  expect(metadata.make).toBe("GSFT Test Camera");
  expect(metadata.exposureTime).toEqual([1, 125]);
  expect(metadata.pixelWidth).toBe(32);
  expect(metadata.pixelHeight).toBe(48);
  expect(metadata.hasGps).toBe(false);
  expect(metadata.orientation).toBeUndefined();
  expect(metadata.artist).toBeUndefined();
  expect(metadata.hasDeviceSerial).toBe(false);
  expect(metadata.hasThumbnail).toBe(false);
});

test("warns when requested metadata preservation is unsupported for the format", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Format converter/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "plain.png",
    mimeType: "image/png",
    buffer: await createPngFixture(page),
  });
  await page.getByLabel("Output format").selectOption("jpeg");
  await page.getByRole("checkbox", { name: "Preserve compatible JPEG metadata" }).check();
  await page.getByRole("button", { name: "Convert 1 image" }).click();

  await expect(page.locator(".job-warning").first()).toContainText(
    "supported only for JPEG input and JPEG output",
  );
});

test("resizes animated GIFs without dropping frames, delays, or loop count", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "animated.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(createAnimatedGifFixture()),
  });
  await page.getByLabel("Output format").selectOption("gif");
  await page.getByRole("spinbutton", { name: /WIDTH/ }).fill("12");
  await page.getByRole("spinbutton", { name: /HEIGHT/ }).fill("8");
  await page.getByRole("button", { name: "Resize 1 image" }).click();

  await expect(page.locator(".queue-file")).toContainText("2 frames");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("animated-resized.gif");
  const outputPath = await download.path();
  if (!outputPath) throw new Error("The browser did not save the GIF download.");
  const output = inspectAnimatedGif(new Uint8Array(await readFile(outputPath)));
  expect(output.width).toBe(12);
  expect(output.height).toBe(8);
  expect(output.loopCount).toBe(ANIMATED_GIF_LOOP_COUNT);
  expect(output.frames.map((frame) => frame.delay)).toEqual([...ANIMATED_GIF_DELAYS]);
  expect(output.frames[0]?.firstPixel[0]).toBeGreaterThan(200);
  expect(output.frames[1]?.firstPixel[1]).toBeGreaterThan(200);
});

test("blocks exporting an animated GIF as a still format", async ({ page }) => {
  await page.getByRole("button", { name: /Format converter/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "animated.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(createAnimatedGifFixture()),
  });
  await page.getByLabel("Output format").selectOption("jpeg");
  await page.getByRole("button", { name: "Convert 1 image" }).click();

  await expect(page.locator(".job-error")).toContainText(
    "must be exported as GIF to preserve their animation",
  );
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
});

test("preserves GIF transparency and disposal-to-background behavior", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "disposal-two.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(createDisposalGifFixture(2)),
  });
  await page.getByLabel("Output format").selectOption("gif");
  await page.getByRole("button", { name: "Resize 1 image" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error("The browser did not save the GIF download.");
  const output = new Uint8Array(await readFile(outputPath));
  expect(inspectGifPixel(output, 2, 12, 8)[3]).toBe(0);
  expect(inspectGifPixel(output, 2, 1, 1)[3]).toBe(255);
});

test("preserves GIF restore-to-previous disposal when compositing frames", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "disposal-three.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(createDisposalGifFixture(3)),
  });
  await page.getByLabel("Output format").selectOption("gif");
  await page.getByRole("button", { name: "Resize 1 image" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error("The browser did not save the GIF download.");
  const output = new Uint8Array(await readFile(outputPath));
  const restoredBackgroundPixel = inspectGifPixel(output, 2, 12, 8);
  expect(restoredBackgroundPixel[0]).toBeGreaterThan(200);
  expect(restoredBackgroundPixel[1]).toBeLessThan(80);
  expect(restoredBackgroundPixel[3]).toBe(255);
  expect(inspectGifPixel(output, 2, 1, 1)[0]).toBeGreaterThan(200);
});

test("converts a static image to a single-frame GIF", async ({ page }) => {
  await page.getByRole("button", { name: /Format converter/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "still.png",
    mimeType: "image/png",
    buffer: await createPngFixture(page),
  });
  await page.getByLabel("Output format").selectOption("gif");
  await page.getByRole("button", { name: "Convert 1 image" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("still-converted.gif");
  const outputPath = await download.path();
  if (!outputPath) throw new Error("The browser did not save the GIF download.");
  const output = inspectAnimatedGif(new Uint8Array(await readFile(outputPath)));
  expect(output.width).toBe(48);
  expect(output.height).toBe(32);
  expect(output.frames).toHaveLength(1);
});

test("rejects GIFs that exceed the animation frame safety limit", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "many-frames.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(createAnimatedGifFixture(301)),
  });
  await page.getByLabel("Output format").selectOption("gif");
  await page.getByRole("button", { name: "Resize 1 image" }).click();

  await expect(page.locator(".job-error")).toContainText("limited to 300 frames");
});

test("explains and disables image processing when worker support is missing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "Worker", { value: undefined, configurable: true });
  });
  await page.reload();

  await expect(page.locator(".local-badge")).toHaveText("Image processing unavailable");
  await expect(page.getByRole("status")).toContainText("Web Workers");
  await expect(page.getByRole("button", { name: /Resize images/ })).toBeDisabled();
});
