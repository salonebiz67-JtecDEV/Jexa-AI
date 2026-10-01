import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Ensure public directory exists
const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Minimal PNG encoder using Node.js built-in zlib
function createPNG(width, height, getPixelRGBA) {
  // 1. Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA (6)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // 3. IDAT Chunk (Raw scanlines: 1 filter byte (0) + width * 4 bytes RGBA)
  const rawScanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(rawScanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rawScanlineLength;
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixelRGBA(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);

  // 4. IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Standard CRC32 table & function
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Pixel generator for JEXA dark glowing emblem
function generateJexaPixel(x, y, width, height, isMaskable = false) {
  // Normalize coordinates to -1.0 .. 1.0
  const nx = (x / width) * 2 - 1;
  const ny = (y / height) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Safe scale for maskable icons (centered within 75% safe area)
  const scale = isMaskable ? 0.72 : 0.85;
  const sx = nx / scale;
  const sy = ny / scale;
  const sdist = Math.sqrt(sx * sx + sy * sy);

  // Base background: Deep Obsidian #07090e
  let r = 7;
  let g = 9;
  let b = 14;
  let a = 255;

  // Subtle radial ambient glow in center
  if (dist < 1.0) {
    const ambient = Math.pow(Math.max(0, 1 - dist), 2.2);
    r += Math.round(16 * ambient);
    g += Math.round(185 * ambient * 0.35);
    b += Math.round(129 * ambient * 0.3);
  }

  // JEXA Central Nexus Emblem: Stylized 4-point diamond star / faceted core
  // Diamond equation: |sx| + |sy| <= 0.65
  const diamond = Math.abs(sx) + Math.abs(sy);
  // Secondary cross: |sx| * 0.5 + |sy| <= 0.5
  const innerRing = Math.abs(sdist - 0.48);

  // Outer subtle glowing resonance ring
  if (innerRing < 0.04) {
    const ringIntensity = 1 - innerRing / 0.04;
    r = Math.min(255, r + Math.round(20 * ringIntensity));
    g = Math.min(255, g + Math.round(210 * ringIntensity * 0.6));
    b = Math.min(255, b + Math.round(180 * ringIntensity * 0.7));
  }

  // Core Diamond Emblem
  if (diamond <= 0.55) {
    const depth = 1 - diamond / 0.55;
    // Gradient from bright mint/cyan (#34d399 / #22d3ee) to emerald (#10b981)
    const emeraldR = 16 + Math.round((52 - 16) * depth);
    const emeraldG = 185 + Math.round((240 - 185) * depth);
    const emeraldB = 129 + Math.round((210 - 129) * depth);

    // Inner bevel / faceted core
    const specular = Math.pow(Math.max(0, 1 - sdist / 0.32), 1.8);
    r = Math.min(255, emeraldR + Math.round(180 * specular));
    g = Math.min(255, emeraldG + Math.round(100 * specular));
    b = Math.min(255, emeraldB + Math.round(120 * specular));
  }

  // Center sparkling core
  if (sdist < 0.12) {
    const coreGlow = Math.pow(1 - sdist / 0.12, 2);
    r = Math.min(255, Math.round(r + 240 * coreGlow));
    g = Math.min(255, Math.round(g + 255 * coreGlow));
    b = Math.min(255, Math.round(b + 250 * coreGlow));
  }

  return [r, g, b, a];
}

// Generate PWA Icon Files
console.log('Generating production PWA icons...');

// 1. pwa-192x192.png
const png192 = createPNG(192, 192, (x, y, w, h) => generateJexaPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);
console.log('✓ Created public/pwa-192x192.png (192x192)');

// 2. pwa-512x512.png
const png512 = createPNG(512, 512, (x, y, w, h) => generateJexaPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);
console.log('✓ Created public/pwa-512x512.png (512x512)');

// 3. pwa-maskable-512x512.png (padded safe zone)
const pngMaskable = createPNG(512, 512, (x, y, w, h) => generateJexaPixel(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable);
console.log('✓ Created public/pwa-maskable-512x512.png (512x512 maskable)');

// 4. apple-touch-icon.png (180x180 for iOS Safari)
const pngApple = createPNG(180, 180, (x, y, w, h) => generateJexaPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngApple);
console.log('✓ Created public/apple-touch-icon.png (180x180)');

// 5. favicon.svg
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="128" fill="#07090e"/>
  <circle cx="256" cy="256" r="190" stroke="rgba(16, 185, 129, 0.25)" stroke-width="3"/>
  <circle cx="256" cy="256" r="140" stroke="rgba(52, 211, 153, 0.4)" stroke-width="2"/>
  <path d="M256 96 L320 256 L256 416 L192 256 Z" fill="url(#jexaGrad)"/>
  <circle cx="256" cy="256" r="32" fill="#ffffff" filter="drop-shadow(0 0 16px rgba(52, 211, 153, 0.9))"/>
  <defs>
    <linearGradient id="jexaGrad" x1="192" y1="96" x2="320" y2="416" gradientUnits="userSpaceOnUse">
      <stop stop-color="#34d399"/>
      <stop offset="0.5" stop-color="#10b981"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgIcon);
console.log('✓ Created public/icon.svg & public/favicon.svg');

console.log('All PWA icon assets generated successfully.');
