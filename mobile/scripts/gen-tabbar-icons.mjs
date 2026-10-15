// 生成 uni-app 底部导航栏的普通态与选中态 PNG 图标，使用 Node.js 内置模块绘制和编码。
// 用法：在 mobile 目录执行 node scripts/gen-tabbar-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const WIDTH = 81;
const HEIGHT = 81;
const SUPERSAMPLE = 6;
const SAMPLE_COUNT = SUPERSAMPLE * SUPERSAMPLE;
const STROKE = 5.8;
const NORMAL_COLOR = '#8f959e';
const ACTIVE_COLOR = '#2f6bff';
const MAX_FILE_SIZE = 40 * 1024;
const OUTPUT_DIR = path.resolve(import.meta.dirname, '..', 'static', 'tabbar');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  crcTable[n] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return chunk;
}

function makePng(pixelRgba) {
  const scanlines = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowOffset = y * (1 + WIDTH * 4);
    pixelRgba.copy(scanlines, rowOffset + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function line(x1, y1, x2, y2, width = STROKE) {
  return { type: 'line', x1, y1, x2, y2, width };
}

function circle(cx, cy, radius, width = STROKE) {
  return { type: 'circle', cx, cy, radius, width };
}

function roundRect(x, y, width, height, radius, strokeWidth = STROKE) {
  return { type: 'roundRect', x, y, width, height, radius, strokeWidth };
}

function ellipseArc(cx, cy, rx, ry, startAngle, endAngle, steps = 36) {
  const segments = [];
  let previousX = cx + rx * Math.cos(startAngle);
  let previousY = cy + ry * Math.sin(startAngle);
  for (let step = 1; step <= steps; step += 1) {
    const angle = startAngle + ((endAngle - startAngle) * step) / steps;
    const nextX = cx + rx * Math.cos(angle);
    const nextY = cy + ry * Math.sin(angle);
    segments.push(line(previousX, previousY, nextX, nextY));
    previousX = nextX;
    previousY = nextY;
  }
  return segments;
}

function iconShapes() {
  return {
    home: [
      line(15, 37, 40.5, 14),
      line(40.5, 14, 66, 37),
      line(21, 32, 21, 66),
      line(60, 32, 60, 66),
      line(21, 66, 34, 66),
      line(47, 66, 60, 66),
      line(34, 66, 34, 49),
      line(34, 49, 47, 49),
      line(47, 49, 47, 66),
    ],
    apply: [
      roundRect(15, 15, 51, 51, 12, STROKE),
      line(40.5, 29, 40.5, 52),
      line(29, 40.5, 52, 40.5),
    ],
    task: [
      roundRect(18, 20, 45, 49, 6, STROKE),
      line(32, 20, 32, 18),
      ...ellipseArc(40.5, 18, 8.5, 6, Math.PI, 2 * Math.PI, 18),
      line(49, 18, 49, 20),
      line(32, 39, 38, 45),
      line(38, 45, 49, 34),
      line(29, 58, 52, 58),
    ],
    notice: [
      line(40.5, 15, 40.5, 20),
      ...ellipseArc(40.5, 37, 16, 17, Math.PI, 2 * Math.PI, 36),
      line(24.5, 37, 24.5, 53),
      line(56.5, 37, 56.5, 53),
      line(24.5, 53, 20, 56),
      line(56.5, 53, 61, 56),
      line(20, 56, 61, 56),
      circle(40.5, 66, 2.2, 4.4),
    ],
    me: [
      circle(40.5, 25, 9.6),
      ...ellipseArc(40.5, 66, 26.5, 20.5, Math.PI, 2 * Math.PI, 48),
    ],
  };
}

function contains(primitive, x, y) {
  const half = primitive.width / 2;
  if (primitive.type === 'line') {
    const dx = primitive.x2 - primitive.x1;
    const dy = primitive.y2 - primitive.y1;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - primitive.x1) * dx + (y - primitive.y1) * dy) / lengthSquared));
    const nearestX = primitive.x1 + projection * dx;
    const nearestY = primitive.y1 + projection * dy;
    return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= half * half;
  }

  if (primitive.type === 'circle') {
    return Math.abs(Math.hypot(x - primitive.cx, y - primitive.cy) - primitive.radius) <= half;
  }

  if (primitive.type === 'roundRect') {
    const qx = Math.abs(x - (primitive.x + primitive.width / 2)) - (primitive.width / 2 - primitive.radius);
    const qy = Math.abs(y - (primitive.y + primitive.height / 2)) - (primitive.height / 2 - primitive.radius);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inside = Math.min(Math.max(qx, qy), 0);
    const signedDistance = outside + inside - primitive.radius;
    return Math.abs(signedDistance) <= primitive.strokeWidth / 2;
  }

  throw new Error(`Unknown shape primitive: ${primitive.type}`);
}

function rasterize(primitives) {
  const alpha = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let covered = 0;
      for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX += 1) {
          const pointX = x + (sampleX + 0.5) / SUPERSAMPLE;
          const pointY = y + (sampleY + 0.5) / SUPERSAMPLE;
          for (let index = 0; index < primitives.length; index += 1) {
            if (contains(primitives[index], pointX, pointY)) {
              covered += 1;
              break;
            }
          }
        }
      }
      alpha[y * WIDTH + x] = Math.round((covered * 255) / SAMPLE_COUNT);
    }
  }
  return alpha;
}

function hexToRgb(hex) {
  const value = hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function colorize(alpha, hex) {
  const [red, green, blue] = hexToRgb(hex);
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * 4;
    if (alpha[pixel] !== 0) {
      rgba[offset] = red;
      rgba[offset + 1] = green;
      rgba[offset + 2] = blue;
      rgba[offset + 3] = alpha[pixel];
    }
  }
  return rgba;
}

function verifyPng(filePath) {
  const png = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) throw new Error(`${filePath}: invalid PNG signature`);
  if (png.length >= MAX_FILE_SIZE) throw new Error(`${filePath}: file must be smaller than 40 KB`);

  let offset = 8;
  let header = null;
  let firstChunk = true;
  let sawEnd = false;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > png.length) throw new Error(`${filePath}: truncated ${type} chunk`);
    const data = png.subarray(dataStart, dataEnd);
    if (firstChunk && (type !== 'IHDR' || length !== 13)) {
      throw new Error(`${filePath}: IHDR must be the first chunk and have length 13`);
    }
    firstChunk = false;
    const storedCrc = png.readUInt32BE(dataEnd);
    const actualCrc = crc32(png.subarray(offset + 4, dataEnd));
    if (storedCrc !== actualCrc) throw new Error(`${filePath}: bad CRC in ${type} chunk`);

    if (type === 'IHDR') header = { data, length };
    if (type === 'IDAT') compressed.push(data);
    if (type === 'IEND') {
      sawEnd = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
  }

  if (!sawEnd || offset !== png.length) throw new Error(`${filePath}: missing IEND or has trailing bytes`);
  if (!header || header.length !== 13) throw new Error(`${filePath}: missing valid IHDR`);
  if (header.data.readUInt32BE(0) !== WIDTH || header.data.readUInt32BE(4) !== HEIGHT
      || header.data[8] !== 8 || header.data[9] !== 6
      || header.data[10] !== 0 || header.data[11] !== 0 || header.data[12] !== 0) {
    throw new Error(`${filePath}: expected 81x81, 8-bit RGBA IHDR`);
  }

  const pixels = inflateSync(Buffer.concat(compressed));
  const expectedLength = HEIGHT * (1 + WIDTH * 4);
  if (pixels.length !== expectedLength) throw new Error(`${filePath}: unexpected decoded pixel buffer length ${pixels.length}`);
  let transparent = false;
  let nonTransparent = false;
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowStart = y * (1 + WIDTH * 4);
    if (pixels[rowStart] !== 0) throw new Error(`${filePath}: expected filter 0 on row ${y}`);
    for (let x = 0; x < WIDTH; x += 1) {
      const alpha = pixels[rowStart + 1 + x * 4 + 3];
      if (alpha === 0) transparent = true;
      else nonTransparent = true;
    }
  }
  if (!transparent || !nonTransparent) throw new Error(`${filePath}: expected both transparent and visible pixels`);
  return { size: png.length, pixels };
}

function asciiPreview(pixels) {
  const rows = [];
  for (let sampleY = 0; sampleY < 27; sampleY += 1) {
    let row = '';
    for (let sampleX = 0; sampleX < 27; sampleX += 1) {
      const x = sampleX * 3 + 1;
      const y = sampleY * 3 + 1;
      const alpha = pixels[y * (1 + WIDTH * 4) + 1 + x * 4 + 3];
      row += alpha >= 128 ? '#' : alpha > 0 ? '+' : ' ';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const shapes = iconShapes();
  const files = [];

  for (const [name, primitives] of Object.entries(shapes)) {
    const alpha = rasterize(primitives);
    for (const [suffix, color] of [['', NORMAL_COLOR], ['-active', ACTIVE_COLOR]]) {
      const fileName = `${name}${suffix}.png`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      fs.writeFileSync(filePath, makePng(colorize(alpha, color)));
      const verified = verifyPng(filePath);
      files.push({ fileName, ...verified });
    }
  }

  console.log('Verified PNG files (81x81 RGBA, CRC32, decompressed pixels, transparency):');
  for (const file of files) console.log(`  ${file.fileName}: ${file.size} bytes`);
  console.log('\nASCII previews (27x27; # opaque, + antialiased edge):');
  for (const file of files) {
    console.log(`\n${file.fileName}`);
    console.log(asciiPreview(file.pixels));
  }
}

main();
