import { describe, expect, it } from "vitest";
import { detectImageFile } from "./file-detection";

describe("detectImageFile", () => {
  it("uses file signatures instead of trusting the extension or MIME type", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "fake.jpg", {
      type: "image/jpeg",
    });

    await expect(detectImageFile(file)).resolves.toEqual({
      format: "png",
      mimeType: "image/png",
    });
  });

  it("rejects unknown file contents", async () => {
    const file = new File(["not an image"], "photo.png");
    await expect(detectImageFile(file)).resolves.toBeNull();
  });

  it("recognizes WebP", async () => {
    const header = new Uint8Array(12);
    header.set(new TextEncoder().encode("RIFF"), 0);
    header.set(new TextEncoder().encode("WEBP"), 8);
    await expect(detectImageFile(new File([header], "photo.webp"))).resolves.toMatchObject({
      format: "webp",
    });
  });
});
