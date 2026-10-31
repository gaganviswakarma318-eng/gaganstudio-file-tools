import piexif from "piexifjs";

export const MAX_METADATA_PRESERVATION_BYTES = 32 * 1024 * 1024;

const IFD0_TAGS: Array<keyof typeof piexif.ImageIFD> = [
  "Make",
  "Model",
  "Software",
  "DateTime",
  "XResolution",
  "YResolution",
  "ResolutionUnit",
];

const EXIF_TAGS: Array<keyof typeof piexif.ExifIFD> = [
  "ExposureTime",
  "FNumber",
  "ExposureProgram",
  "ISOSpeedRatings",
  "DateTimeOriginal",
  "DateTimeDigitized",
  "ShutterSpeedValue",
  "ApertureValue",
  "ExposureBiasValue",
  "MaxApertureValue",
  "MeteringMode",
  "LightSource",
  "Flash",
  "FocalLength",
  "ColorSpace",
  "WhiteBalance",
  "FocalLengthIn35mmFilm",
  "LensMake",
  "LensModel",
  "PixelXDimension",
  "PixelYDimension",
];

function pickTags(
  source: Record<number, unknown> | undefined,
  tags: number[],
): Record<number, unknown> {
  const selected: Record<number, unknown> = {};
  for (const tag of tags) {
    if (source?.[tag] !== undefined) selected[tag] = source[tag];
  }
  return selected;
}

async function blobToBinaryString(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts: string[] = [];
  const chunkSize = 8_192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return parts.join("");
}

function binaryStringToBlob(binary: string): Blob {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "image/jpeg" });
}

export async function preserveJpegMetadata(
  input: Blob,
  output: Blob,
  width: number,
  height: number,
): Promise<{ output: Blob; preserved: boolean }> {
  if (input.size > MAX_METADATA_PRESERVATION_BYTES || output.size > MAX_METADATA_PRESERVATION_BYTES) {
    throw new Error("JPEG metadata preservation is limited to files up to 32 MB.");
  }

  const [inputBinary, outputBinary] = await Promise.all([
    blobToBinaryString(input),
    blobToBinaryString(output),
  ]);
  if (inputBinary.slice(0, 2) !== "\xff\xd8") {
    throw new Error("The source file is not a valid JPEG, so its metadata cannot be preserved.");
  }
  if (outputBinary.slice(0, 2) !== "\xff\xd8") {
    throw new Error("The JPEG encoder returned invalid output, so metadata cannot be preserved.");
  }
  let sourceExif: ReturnType<typeof piexif.load>;
  try {
    sourceExif = piexif.load(inputBinary);
  } catch (error) {
    throw new Error(
      `Could not read source JPEG metadata: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const zeroth = pickTags(
    sourceExif["0th"],
    IFD0_TAGS.map((tag) => piexif.ImageIFD[tag]),
  );
  const exif = pickTags(
    sourceExif.Exif,
    EXIF_TAGS.map((tag) => piexif.ExifIFD[tag]),
  );

  if (exif[piexif.ExifIFD.PixelXDimension] !== undefined) {
    exif[piexif.ExifIFD.PixelXDimension] = width;
  }
  if (exif[piexif.ExifIFD.PixelYDimension] !== undefined) {
    exif[piexif.ExifIFD.PixelYDimension] = height;
  }
  if (Object.keys(zeroth).length === 0 && Object.keys(exif).length === 0) {
    return { output, preserved: false };
  }

  const safeExif = piexif.dump({
    "0th": zeroth,
    "1st": {},
    Exif: exif,
    GPS: {},
    Interop: {},
  });
  const segmentLength = safeExif.length + 2;
  if (segmentLength > 65_535) {
    throw new Error("The selected JPEG metadata is too large to preserve.");
  }
  const exifSegment =
    "\xff\xe1" +
    String.fromCharCode((segmentLength >> 8) & 0xff, segmentLength & 0xff) +
    safeExif;
  const inserted = "\xff\xd8" + exifSegment + outputBinary.slice(2);
  return {
    output: binaryStringToBlob(inserted),
    preserved: true,
  };
}
