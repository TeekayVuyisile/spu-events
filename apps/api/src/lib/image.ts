const types = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export type ImageExt = keyof typeof types;

/**
 * Identifies an image by its first bytes (magic numbers) rather than trusting the
 * file name or the browser's Content-Type, both of which the uploader controls.
 */
export function detectImage(buf: Buffer): { ext: ImageExt; contentType: string } | null {
  const ext: ImageExt | null =
    buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
      ? 'jpg'
      : buf.length >= 8 &&
          buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ? 'png'
        : buf.length >= 12 &&
            buf.toString('ascii', 0, 4) === 'RIFF' &&
            buf.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : null;
  return ext ? { ext, contentType: types[ext] } : null;
}
