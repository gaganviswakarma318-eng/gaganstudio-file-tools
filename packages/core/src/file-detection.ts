export type DetectedImageFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "bmp"
  | "avif"
  | "tiff";

export interface DetectedFile {
  format: DetectedImageFormat;
  mimeType: string;
}

const signatureMatches = (bytes: Uint8Array, offset: number, expected: number[]) =>
  expected.every((value, index) => bytes[offset + index] === value);

export async function detectImageFile(file: File): Promise<DetectedFile | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (signatureMatches(bytes, 0, [0xff, 0xd8, 0xff])) {
    return { format: "jpeg", mimeType: "image/jpeg" };
  }
  if (signatureMatches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { format: "png", mimeType: "image/png" };
  }
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { format: "webp", mimeType: "image/webp" };
  }
  if (String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/)) {
    return { format: "gif", mimeType: "image/gif" };
  }
  if (String.fromCharCode(...bytes.slice(0, 2)) === "BM") {
    return { format: "bmp", mimeType: "image/bmp" };
  }
  if (
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))
  ) {
    return { format: "avif", mimeType: "image/avif" };
  }
  if (
    signatureMatches(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    signatureMatches(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return { format: "tiff", mimeType: "image/tiff" };
  }

  return null;
}
