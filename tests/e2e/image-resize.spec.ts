import { expect, test } from "@playwright/test";

async function createPngFixture(page: import("@playwright/test").Page): Promise<Buffer> {
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
        context.fillRect(0, 0, 24, 32);
        context.fillStyle = "#327c68";
        context.fillRect(24, 0, 24, 32);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Could not create the PNG test fixture."));
            return;
          }
          resolve(Array.from(new Uint8Array(await blob.arrayBuffer())));
        }, "image/png");
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

test("explains and disables image processing when worker support is missing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "Worker", { value: undefined, configurable: true });
  });
  await page.reload();

  await expect(page.locator(".local-badge")).toHaveText("Image processing unavailable");
  await expect(page.getByRole("status")).toContainText("Web Workers");
  await expect(page.getByRole("button", { name: /Resize images/ })).toBeDisabled();
});
