import piexif from "piexifjs";

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8_192)));
  }
  return chunks.join("");
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createJpegWithExifFixture(bytes: Uint8Array): Uint8Array {
  const exif = piexif.dump({
    "0th": {
      [piexif.ImageIFD.Make]: "GSFT Test Camera",
      [piexif.ImageIFD.Model]: "Test Model",
      [piexif.ImageIFD.Orientation]: 6,
      [piexif.ImageIFD.Artist]: "Private Person",
    },
    Exif: {
      [piexif.ExifIFD.ExposureTime]: [1, 125],
      [piexif.ExifIFD.PixelXDimension]: 48,
      [piexif.ExifIFD.PixelYDimension]: 32,
      [piexif.ExifIFD.BodySerialNumber]: "DEVICE-SECRET-123",
    },
    GPS: {
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [[37, 1], [46, 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: "W",
      [piexif.GPSIFD.GPSLongitude]: [[122, 1], [25, 1], [0, 1]],
    },
  });
  return binaryStringToBytes(piexif.insert(exif, bytesToBinaryString(bytes)));
}

export function readJpegExif(bytes: Uint8Array) {
  const exif = piexif.load(bytesToBinaryString(bytes));
  return {
    make: exif["0th"]?.[piexif.ImageIFD.Make],
    orientation: exif["0th"]?.[piexif.ImageIFD.Orientation],
    artist: exif["0th"]?.[piexif.ImageIFD.Artist],
    hasGps: Object.keys(exif.GPS ?? {}).length > 0,
    exposureTime: exif.Exif?.[piexif.ExifIFD.ExposureTime],
    pixelWidth: exif.Exif?.[piexif.ExifIFD.PixelXDimension],
    pixelHeight: exif.Exif?.[piexif.ExifIFD.PixelYDimension],
    hasDeviceSerial: exif.Exif?.[piexif.ExifIFD.BodySerialNumber] !== undefined,
    hasThumbnail: Boolean(exif.thumbnail),
  };
}
