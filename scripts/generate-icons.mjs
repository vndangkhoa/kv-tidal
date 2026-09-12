import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const sharpPath = path.join(rootDir, "frontend", "node_modules", "sharp");
const sharp = require(sharpPath);

const iconSvgPath = path.join(rootDir, "frontend", "public", "icon.svg");
const maskableSvgPath = path.join(rootDir, "frontend", "public", "icon-maskable.svg");
const faviconSvgPath = path.join(rootDir, "frontend", "public", "favicon.svg");

const iconSvg = fs.readFileSync(iconSvgPath);
const maskableSvg = fs.readFileSync(maskableSvgPath);
const faviconSvg = fs.readFileSync(faviconSvgPath);

console.log("🎨 Starting icon generation for KV-Tidal...");

// 1. Web & Mobile PWA PNGs + Synology DSM Package Icons
const pwaTargets = [
  { input: iconSvg, file: path.join(rootDir, "frontend", "public", "icon-512.png"), size: 512 },
  { input: iconSvg, file: path.join(rootDir, "frontend", "public", "icon-192.png"), size: 192 },
  { input: iconSvg, file: path.join(rootDir, "frontend", "public", "apple-touch-icon.png"), size: 180 },
  { input: maskableSvg, file: path.join(rootDir, "frontend", "public", "icon-maskable-512.png"), size: 512 },
  // Synology DSM Package Center
  { input: iconSvg, file: path.join(rootDir, "spk", "PACKAGE_ICON_256.PNG"), size: 256 },
  { input: iconSvg, file: path.join(rootDir, "spk", "PACKAGE_ICON.PNG"), size: 72 },
];

for (const target of pwaTargets) {
  const dir = path.dirname(target.file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await sharp(target.input)
    .resize(target.size, target.size)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(target.file);

  console.log(`  ✓ Generated ${path.relative(rootDir, target.file)} (${target.size}x${target.size})`);
}

// 2. Generate multi-resolution favicon.ico (16x16, 32x32, 48x48)
console.log("  Generating multi-resolution favicon.ico...");
const icoSizes = [16, 32, 48];
const pngBuffers = [];

for (const size of icoSizes) {
  const buf = await sharp(faviconSvg)
    .resize(size, size)
    .png()
    .toBuffer();
  pngBuffers.push({ size, buffer: buf });
}

// Construct standard ICO header and directory
const count = pngBuffers.length;
const headerSize = 6;
const dirEntrySize = 16;
let dataOffset = headerSize + count * dirEntrySize;

const icoHeader = Buffer.alloc(headerSize);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
icoHeader.writeUInt16LE(count, 4); // Number of images

const dirBuffers = [];
for (const item of pngBuffers) {
  const entry = Buffer.alloc(dirEntrySize);
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 0); // Width
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 1); // Height
  entry.writeUInt8(0, 2); // Color palette count
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(item.buffer.length, 8); // Size of image data
  entry.writeUInt32LE(dataOffset, 12); // Offset to image data
  dataOffset += item.buffer.length;
  dirBuffers.push(entry);
}

const faviconIco = Buffer.concat([
  icoHeader,
  ...dirBuffers,
  ...pngBuffers.map((b) => b.buffer),
]);

fs.writeFileSync(path.join(rootDir, "frontend", "public", "favicon.ico"), faviconIco);
console.log("  ✓ Generated frontend/public/favicon.ico (16, 32, 48 px)");

console.log("🎉 All icons generated successfully!");
