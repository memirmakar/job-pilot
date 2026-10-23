// Draws the app icon (the top bar's mark: a Mauve rounded square with a check) as PNGs for the web app manifest. Node built-ins only.
// Run `node tools/gen-icons.mjs` after changing the mark; writes ui/icons/icon-192.png, icon-512.png and maskable-512.png.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "ui", "icons");
const MAUVE = [203, 166, 247], CRUST = [17, 17, 27]; // Catppuccin Mocha --accent and --on-accent
const CHECK = [[5, 12], [10, 17], [19, 7]];          // util.js icon("check"), in a 24-unit box

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// full: the square fills the canvas (maskable icons get cropped to a circle, so no rounded corners and a smaller check)
function draw(size, { full = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4), S = 4, pad = full ? 0 : size * 0.04, side = size - 2 * pad, r = full ? 0 : side * 7 / 24;
  const checkScale = (full ? 0.55 : 0.8) * side / 24, cOff = pad + side / 2 - 12 * checkScale, half = 1.1 * checkScale;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let inBox = 0, onCheck = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
      const qx = Math.max(Math.abs(px - size / 2) - (side / 2 - r), 0), qy = Math.max(Math.abs(py - size / 2) - (side / 2 - r), 0);
      if (Math.hypot(qx, qy) > r) continue;
      inBox++;
      const cx = (px - cOff) / checkScale, cy = (py - cOff) / checkScale;
      if (Math.min(segDist(cx, cy, CHECK[0], CHECK[1]), segDist(cx, cy, CHECK[1], CHECK[2])) * checkScale <= half) onCheck++;
    }
    const a = inBox / (S * S), k = inBox ? onCheck / inBox : 0, i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(MAUVE[c] * (1 - k) + CRUST[c] * k);
    rgba[i + 3] = Math.round(a * 255);
  }
  return png(size, rgba);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "icon-192.png"), draw(192));
fs.writeFileSync(path.join(OUT, "icon-512.png"), draw(512));
fs.writeFileSync(path.join(OUT, "maskable-512.png"), draw(512, { full: true }));
console.log("Wrote ui/icons/icon-192.png, icon-512.png, maskable-512.png");
