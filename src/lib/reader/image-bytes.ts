const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasPngIend(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false;
  const end = bytes.length;
  return (
    bytes[end - 8] === 0x49 &&
    bytes[end - 7] === 0x45 &&
    bytes[end - 6] === 0x4e &&
    bytes[end - 5] === 0x44
  );
}

function hasJpegEoi(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const start = Math.max(2, bytes.length - 64);
  for (let index = bytes.length - 2; index >= start; index -= 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) return true;
  }
  return false;
}

/** True when the buffer is a finished PNG/JPEG/GIF/WebP, not a truncated MD@Home payload. */
export function isCompleteImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false;

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return hasPngIend(bytes);
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return hasJpegEoi(bytes);
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return bytes[bytes.length - 1] === 0x3b;
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(4, true);
    return size + 8 <= bytes.length && bytes.length - (size + 8) < 32;
  }

  return false;
}

export function sniffImageContentType(
  bytes: Uint8Array,
  fallback: string,
): string {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (fallback.toLowerCase().startsWith("image/")) return fallback;
  return "image/jpeg";
}
