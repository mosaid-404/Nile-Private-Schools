import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height, isMaskable = false) {
  // Simple solid rounded rectangle generator in PNG format
  const rows = [];
  const primaryR = 0x1F, primaryG = 0x4E, primaryB = 0x8C;
  const darkR = 0x16, darkG = 0x3A, darkB = 0x6B;
  const goldR = 0xF4, goldG = 0xC1, goldB = 0x52;
  const whiteR = 0xFF, whiteG = 0xFF, whiteB = 0xFF;

  const radius = isMaskable ? 0 : width * 0.22;
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      let r = primaryR, g = primaryG, b = primaryB, a = 255;
      
      // Gradient background
      const grad = y / height;
      r = Math.round(primaryR * (1 - grad) + darkR * grad);
      g = Math.round(primaryG * (1 - grad) + darkG * grad);
      b = Math.round(primaryB * (1 - grad) + darkB * grad);

      // Check distance from center for gold crest circle
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ringRadius = width * 0.38;

      if (dist >= ringRadius - 3 && dist <= ringRadius + 3) {
        r = goldR; g = goldG; b = goldB;
      } else if (dist < ringRadius - 3) {
        // Center emblem area
        // Draw scholar cap triangle
        const capY = cy - height * 0.12;
        const capDy = Math.abs(y - capY);
        const capDx = Math.abs(x - cx);
        if (y >= capY - height * 0.08 && y <= capY + height * 0.06 && capDx * 0.6 + capDy < width * 0.16) {
          r = goldR; g = goldG; b = goldB;
        }
        // Draw white book / wings shape
        const bookY = cy + height * 0.08;
        if (y >= bookY && y <= bookY + height * 0.14 && Math.abs(dx) <= width * 0.22) {
          if (Math.abs(dx) > width * 0.02) {
            r = whiteR; g = whiteG; b = whiteB;
          }
        }
      }

      // Rounded corners if not maskable
      if (!isMaskable) {
        const cornerX = x < radius ? radius - x : (x >= width - radius ? x - (width - radius) : 0);
        const cornerY = y < radius ? radius - y : (y >= height - radius ? y - (height - radius) : 0);
        if (cornerX > 0 && cornerY > 0) {
          const cornerDist = Math.sqrt(cornerX * cornerX + cornerY * cornerY);
          if (cornerDist > radius) {
            a = 0;
          }
        }
      }

      const offset = 1 + x * 4;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
      row[offset + 3] = a;
    }
    rows.push(row);
  }

  const rawData = Buffer.concat(rows);
  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT Chunk
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'icon-192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), createPng(512, 512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), createPng(180, 180, false));

console.log('PWA icons created successfully in public/icons/');
