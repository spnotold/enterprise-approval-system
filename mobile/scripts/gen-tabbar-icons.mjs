// 生成 uni-app 底部导航栏的普通态与选中态 PNG 图标（套色）：实心几何图形，不用线框。
// 普通态一块灰墨；选中态是藏青墨压在一块错开的芥黄上（「错版」，docs/ui_design.md 第 4 节）。
// 只用 Node.js 内置模块绘制和编码。用法：在 mobile 目录执行 node scripts/gen-tabbar-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const WIDTH = 81;
const HEIGHT = 81;
const SUPERSAMPLE = 6;
const SAMPLE_COUNT = SUPERSAMPLE * SUPERSAMPLE;
const NORMAL_COLOR = '#7d8389';
const ACTIVE_INK = '#22313f';
const ACTIVE_MARK = '#d9a441';
// 选中态两层墨的错开量（px）：藏青往左上、芥黄往右下各挪一半
const MARK_OFFSET = 5;
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

// 图形：add 填上，cut 挖掉，按顺序叠
const add = (shape) => ({ op: 'add', shape });
const cut = (shape) => ({ op: 'cut', shape });
const circle = (cx, cy, r) => ({ type: 'circle', cx, cy, r });
const roundRect = (x, y, w, h, r) => ({ type: 'roundRect', x, y, w, h, r });
// 上半个椭圆（底边平）：钟身、肩膀
const dome = (cx, cy, rx, ry) => ({ type: 'dome', cx, cy, rx, ry });
// 圆头粗线：勾、加号
const capsule = (x1, y1, x2, y2, width) => ({ type: 'capsule', x1, y1, x2, y2, width });
const polygon = (points) => ({ type: 'polygon', points });

function iconShapes() {
  return {
    home: [
      add(polygon([[11, 39], [40.5, 12], [70, 39]])),
      add(roundRect(19, 33, 43, 35, 4)),
      cut(roundRect(34, 46, 13, 30, 6.5)),
    ],
    apply: [
      add(roundRect(13, 13, 55, 55, 16)),
      cut(capsule(40.5, 28, 40.5, 53, 7)),
      cut(capsule(28, 40.5, 53, 40.5, 7)),
    ],
    task: [
      add(roundRect(16, 18, 49, 52, 8)),
      cut(roundRect(27, 13, 27, 12, 6)),
      add(roundRect(30, 10, 21, 12, 6)),
      cut(capsule(28, 44, 36, 52, 7)),
      cut(capsule(36, 52, 53, 35, 7)),
    ],
    notice: [
      add(circle(40.5, 17, 4.5)),
      add(dome(40.5, 38, 18, 19)),
      add(roundRect(22.5, 37, 36, 15, 0)),
      add(roundRect(14, 50, 53, 8, 4)),
      add(circle(40.5, 64, 6)),
    ],
    me: [
      add(circle(40.5, 25, 13)),
      add(dome(40.5, 70, 28, 24)),
    ],
  };
}

function contains(shape, x, y) {
  switch (shape.type) {
    case 'circle':
      return (x - shape.cx) ** 2 + (y - shape.cy) ** 2 <= shape.r ** 2;
    case 'roundRect': {
      const qx = Math.abs(x - (shape.x + shape.w / 2)) - (shape.w / 2 - shape.r);
      const qy = Math.abs(y - (shape.y + shape.h / 2)) - (shape.h / 2 - shape.r);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= shape.r;
    }
    case 'dome':
      return y <= shape.cy && ((x - shape.cx) / shape.rx) ** 2 + ((y - shape.cy) / shape.ry) ** 2 <= 1;
    case 'capsule': {
      const dx = shape.x2 - shape.x1;
      const dy = shape.y2 - shape.y1;
      const t = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / (dx * dx + dy * dy || 1)));
      return (x - shape.x1 - t * dx) ** 2 + (y - shape.y1 - t * dy) ** 2 <= (shape.width / 2) ** 2;
    }
    case 'polygon': {
      let inside = false;
      const pts = shape.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    default:
      throw new Error(`Unknown shape: ${shape.type}`);
  }
}

function covers(ops, x, y) {
  let inside = false;
  for (const { op, shape } of ops) {
    if (contains(shape, x, y)) inside = op === 'add';
  }
  return inside;
}

/** 覆盖率（0–255），整体平移 (dx, dy) */
function rasterize(ops, dx = 0, dy = 0) {
  const alpha = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          if (covers(ops, x + (sx + 0.5) / SUPERSAMPLE - dx, y + (sy + 0.5) / SUPERSAMPLE - dy)) covered += 1;
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

/** 把若干层（覆盖率 + 颜色）由下往上叠成 RGBA */
function compose(layers) {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  const colors = layers.map(([, hex]) => hexToRgb(hex));
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    let a = 0;
    const rgb = [0, 0, 0];
    layers.forEach(([alpha], index) => {
      const top = alpha[pixel] / 255;
      if (top === 0) return;
      const below = a * (1 - top);
      const out = top + below;
      for (let k = 0; k < 3; k += 1) rgb[k] = (colors[index][k] * top + rgb[k] * below) / out;
      a = out;
    });
    const offset = pixel * 4;
    if (a > 0) {
      rgba[offset] = Math.round(rgb[0]);
      rgba[offset + 1] = Math.round(rgb[1]);
      rgba[offset + 2] = Math.round(rgb[2]);
      rgba[offset + 3] = Math.round(a * 255);
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
  const files = [];
  const half = MARK_OFFSET / 2;

  for (const [name, ops] of Object.entries(iconShapes())) {
    const variants = [
      ['', [[rasterize(ops), NORMAL_COLOR]]],
      ['-active', [[rasterize(ops, half, half), ACTIVE_MARK], [rasterize(ops, -half, -half), ACTIVE_INK]]],
    ];
    for (const [suffix, layers] of variants) {
      const fileName = `${name}${suffix}.png`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      fs.writeFileSync(filePath, makePng(compose(layers)));
      files.push({ fileName, ...verifyPng(filePath) });
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
