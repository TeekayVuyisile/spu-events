import { deflateSync } from 'node:zlib';

/**
 * Draws original abstract cover art as PNG, so the demo ships with no
 * third-party images: a diagonal gradient between two colours with soft light
 * circles and rings on top. Deterministic for a given seed.
 */
export function coverPng(from: string, to: string, seed: number, width = 960, height = 540) {
  const rand = mulberry32(seed);
  const a = hex(from);
  const b = hex(to);
  const circles = Array.from({ length: 4 }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: (0.15 + rand() * 0.35) * width,
    alpha: 0.08 + rand() * 0.14,
  }));

  // Each row starts with a filter byte (0 = none), then RGB triples.
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      let r = a[0] + (b[0] - a[0]) * t;
      let g = a[1] + (b[1] - a[1]) * t;
      let bl = a[2] + (b[2] - a[2]) * t;
      for (const c of circles) {
        const d = Math.hypot(x - c.x, y - c.y) / c.r;
        // A thin ring just inside each circle's rim, anti-aliased over ~1.5px.
        const ring = Math.max(0, 1 - Math.abs((d - 0.82) * c.r) / 1.5) * 0.3;
        if (d < 1 || ring > 0) {
          // Soft glow: full strength in the middle, fading out towards the rim.
          const k = Math.max(0, c.alpha * (1 - d * d)) + ring;
          r += (255 - r) * k;
          g += (255 - g) * k;
          bl += (255 - bl) * k;
        }
      }
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = bl;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Small seeded PRNG, so a seed run is repeatable. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(colour: string): [number, number, number] {
  const n = parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
