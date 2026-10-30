import { describe, expect, it } from "vitest";
import { validateImageDimensions, validateImageFile } from "./validation";

describe("image validation", () => {
  it("rejects empty and unrecognized files", async () => {
    await expect(validateImageFile(new File([], "empty.png"))).rejects.toThrow("empty");
    await expect(validateImageFile(new File(["text"], "notes.txt"))).rejects.toThrow("supported image");
  });

  it("rejects unsafe output dimensions", () => {
    expect(() => validateImageDimensions(0, 1)).toThrow("greater than zero");
    expect(() => validateImageDimensions(10_000, 10_000)).toThrow("80-megapixel");
  });
});
