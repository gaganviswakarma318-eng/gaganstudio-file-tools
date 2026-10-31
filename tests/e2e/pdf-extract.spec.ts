import { expect, test } from "@playwright/test";

function createPdfFixture(pageCount: number): Buffer {
  const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
  ];

  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = 3 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${300 + index * 100} 400] /Resources << >> /Contents ${pageObject + 1} 0 R >>`,
      "<< /Length 0 >>\nstream\n\nendstream",
    );
  }

  let document = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, "ascii");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PDF tools" }).click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("PDF tools");
});

test("extracts selected PDF pages locally and downloads a new PDF", async ({ page }) => {
  let workerStarted = false;
  page.on("worker", () => {
    workerStarted = true;
  });

  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "three-pages.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(3),
  });
  await expect(page.getByText("three-pages.pdf")).toBeVisible();
  await page.getByRole("textbox", { name: "Pages to extract" }).fill("3, 1");
  await page.getByRole("button", { name: "Extract pages" }).click();

  await expect(page.locator(".queue-file strong")).toHaveText("three-pages-extracted.pdf");
  await expect(page.getByText(/2 pages ·/)).toBeVisible();
  expect(workerStarted).toBe(true);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("three-pages-extracted.pdf");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The generated PDF download did not expose a stream.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 5).toString("ascii")).toBe("%PDF-");

  await expect.poll(async () => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("gsft-processing-history", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const count = request.result.transaction("jobs", "readonly").objectStore("jobs").count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    };
  }))).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "PDF tools" }).click();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.locator(".queue-file strong")).toHaveText("three-pages-extracted.pdf");
});

test("reports invalid PDFs and out-of-range page selections", async ({ page }) => {
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "not-a-pdf.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not actually a PDF"),
  });
  await page.getByRole("button", { name: "Extract pages" }).click();
  await expect(page.locator(".notice")).toContainText("valid PDF");

  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "two-pages.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(2),
  });
  await page.getByRole("textbox", { name: "Pages to extract" }).fill("3");
  await page.getByRole("button", { name: "Extract pages" }).click();
  await expect(page.locator(".notice")).toContainText("between 1 and 2");
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
});

test("merges selected PDFs in order through the local processing queue", async ({ page }) => {
  await page.getByLabel("PDF operation").selectOption("pdf.merge");
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles([
    {
      name: "first.pdf",
      mimeType: "application/pdf",
      buffer: createPdfFixture(2),
    },
    {
      name: "second.pdf",
      mimeType: "application/pdf",
      buffer: createPdfFixture(1),
    },
  ]);
  await expect(page.getByText("2 PDFs selected")).toBeVisible();
  await page.getByRole("button", { name: "Merge PDFs" }).click();

  await expect(page.locator(".queue-file strong")).toHaveText("first-merged.pdf");
  await expect(page.getByText(/3 pages ·/)).toBeVisible();
});

test("losslessly optimizes a PDF and discloses compression limitations", async ({ page }) => {
  await page.getByLabel("PDF operation").selectOption("pdf.compress");
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "source.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(2),
  });
  await expect(page.getByText(/images are not recompressed/i)).toBeVisible();
  await page.getByRole("button", { name: "Compress PDF" }).click();

  await expect(page.locator(".queue-file strong")).toHaveText("source-optimized.pdf");
  await expect(page.locator(".pdf-warning")).toContainText("size reduction is not guaranteed");
});

test("rotates selected pages locally and offers a new PDF", async ({ page }) => {
  await page.getByLabel("PDF operation").selectOption("pdf.rotate-pages");
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "three-pages.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(3),
  });
  await page.getByRole("textbox", { name: "Pages to rotate" }).fill("2-3");
  await page.getByLabel("Clockwise rotation").selectOption("180");
  await page.getByRole("button", { name: "Rotate pages" }).click();

  await expect(page.locator(".queue-file strong")).toHaveText("three-pages-rotated.pdf");
  await expect(page.getByText(/3 pages ·/)).toBeVisible();
  await expect(page.locator(".pdf-warning")).toContainText("display orientation");
});

test("reorders all PDF pages and rejects incomplete page orders", async ({ page }) => {
  await page.getByLabel("PDF operation").selectOption("pdf.reorder-pages");
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "three-pages.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(3),
  });
  await page.getByRole("textbox", { name: "New page order" }).fill("3, 1, 2");
  await page.getByRole("button", { name: "Reorder pages" }).click();

  await expect(page.locator(".queue-file strong")).toHaveText("three-pages-reordered.pdf");
  await expect(page.getByText(/3 pages ·/)).toBeVisible();

  await page.getByRole("textbox", { name: "New page order" }).fill("2, 1");
  await page.getByRole("button", { name: "Reorder pages" }).click();
  await expect(page.locator(".notice")).toContainText("Include every page exactly once");
});

test("splits a PDF into page groups and downloads a ZIP", async ({ page }) => {
  await page.getByLabel("PDF operation").selectOption("pdf.split");
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles({
    name: "three-pages.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(3),
  });
  await page.getByRole("spinbutton", { name: "Pages per file" }).fill("2");
  await page.getByRole("button", { name: "Split PDF" }).click();

  await expect(page.locator(".queue-file strong")).toHaveText("three-pages-split.zip");
  await expect(page.locator(".queue-file")).toContainText("2 PDFs · 3 pages");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("three-pages-split.zip");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The generated split ZIP did not expose a stream.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 4).toString("ascii")).toBe("PK\u0003\u0004");
});

test("explains and disables PDF extraction when worker support is missing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "Worker", { value: undefined, configurable: true });
  });
  await page.reload();
  await page.getByRole("button", { name: "PDF tools" }).click();

  await expect(page.locator(".local-badge")).toHaveText("PDF processing unavailable");
  await expect(page.getByRole("status")).toContainText("Web Workers");
  await expect(page.getByRole("button", { name: "Extract pages" })).toBeDisabled();
});
