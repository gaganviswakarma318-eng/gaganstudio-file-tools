import { detectImageFile } from "./file-detection";

export const MAX_IMAGE_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 80_000_000;

export async function validateImageFile(file: File): Promise<void> {
  if (file.size === 0) {
    throw new Error("This file is empty.");
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error("Images must be smaller than 250 MB.");
  }
  if (!(await detectImageFile(file))) {
    throw new Error("This file does not appear to be a supported image.");
  }
}

export function validateImageDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error("Enter a width and height greater than zero.");
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error("The requested output exceeds the 80-megapixel safety limit.");
  }
}
