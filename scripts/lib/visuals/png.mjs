// Minimal PNG reader/writer for one job: the Web Store wants screenshots and
// promo tiles as 24-bit PNG with no alpha, and browsers capture RGBA. This
// flattens a capture onto a background colour and writes it back as RGB.
// Decoding handles 8-bit, non-interlaced RGB/RGBA (what browsers produce);
// any other PNG can still be inspected with pngInfo().

import fs from "node:fs";
import zlib from "node:zlib";
import { crc32 } from "../zip.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunks(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  const list = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    list.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return list;
}

/** Size, colour type and whether the file carries alpha (colour type 4/6 or a tRNS chunk). */
export function pngInfo(file) {
  const buffer = fs.readFileSync(file);
  const list = chunks(buffer);
  const ihdr = list.find((chunk) => chunk.type === "IHDR").data;
  const colorType = ihdr[9];
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType,
    interlaced: ihdr[12] === 1,
    hasAlpha: colorType === 4 || colorType === 6 || list.some((chunk) => chunk.type === "tRNS"),
    bytes: buffer.length,
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(buffer) {
  const list = chunks(buffer);
  const ihdr = list.find((chunk) => chunk.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(list.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)));
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? pixels[target + x - bpp] : 0;
      const b = y ? pixels[target - stride + x] : 0;
      const c = x >= bpp && y ? pixels[target - stride + x - bpp] : 0;
      const value = raw[source + x];
      pixels[target + x] = (filter === 0 ? value
        : filter === 1 ? value + a
        : filter === 2 ? value + b
        : filter === 3 ? value + ((a + b) >> 1)
        : value + paeth(a, b, c)) & 0xff;
    }
  }
  return { width, height, bpp, pixels };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Encode 8-bit RGB pixels, choosing the cheapest filter per row. */
export function encodeRgb(width, height, rgb) {
  const stride = width * 3;
  const out = Buffer.alloc(height * (stride + 1));
  const candidates = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    let best = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter < 5; filter += 1) {
      const line = candidates[filter];
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const a = x >= 3 ? rgb[row + x - 3] : 0;
        const b = y ? rgb[row - stride + x] : 0;
        const c = x >= 3 && y ? rgb[row - stride + x - 3] : 0;
        const value = rgb[row + x];
        const residual = (filter === 0 ? value
          : filter === 1 ? value - a
          : filter === 2 ? value - b
          : filter === 3 ? value - ((a + b) >> 1)
          : value - paeth(a, b, c)) & 0xff;
        line[x] = residual;
        score += residual < 128 ? residual : 256 - residual;
      }
      if (score < bestScore) {
        bestScore = score;
        best = filter;
      }
    }
    out[y * (stride + 1)] = best;
    candidates[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

function parseHex(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
}

/** Composite an RGBA capture onto `background` and write it as 24-bit RGB (in place by default). */
export function flattenPng(file, { background = "#ffffff", out = file } = {}) {
  const { width, height, bpp, pixels } = decodePng(fs.readFileSync(file));
  const [br, bg, bb] = parseHex(background);
  const rgb = Buffer.alloc(width * height * 3);
  for (let source = 0, target = 0; source < pixels.length; source += bpp, target += 3) {
    const alpha = bpp === 4 ? pixels[source + 3] / 255 : 1;
    rgb[target] = Math.round(pixels[source] * alpha + br * (1 - alpha));
    rgb[target + 1] = Math.round(pixels[source + 1] * alpha + bg * (1 - alpha));
    rgb[target + 2] = Math.round(pixels[source + 2] * alpha + bb * (1 - alpha));
  }
  fs.writeFileSync(out, encodeRgb(width, height, rgb));
  return { width, height };
}
