// Your resume photo (data/photo/photo.jpg): uploaded and cropped in Resumes > Your resume rules, or taken from an original PDF.
// Extraction reads the PDF's image objects directly: JPEG ones are copied as they are; Flate-compressed 8-bit RGB/gray ones
// (how Word saves photos) are rebuilt as PNG with Node's zlib. The UI crops the result before it's saved.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DIR } from "./config.mjs";
import { PHOTO_FILE, saveResumePrefs } from "./resume_prefs.mjs";

export function savePhoto(base64, source = "upload") {
  const buf = Buffer.from(String(base64), "base64");
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("The photo must be a JPEG (the crop step makes one).");
  if (buf.length > 3e6) throw new Error("That photo is too large.");
  fs.mkdirSync(path.dirname(PHOTO_FILE), { recursive: true });
  fs.writeFileSync(PHOTO_FILE, buf);
  return saveResumePrefs({ settings: { photo: { at: new Date().toISOString(), source } } });
}
export function removePhoto() {
  fs.rmSync(PHOTO_FILE, { force: true });
  return saveResumePrefs({ settings: { photo: null } });
}

function png(w, h, channels, rows) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

// Images in an original that could be a photo (at least 120 px, not a thin line or logo strip), largest first, as data URLs
export function photosInPdf(file) {
  const abs = path.join(DIR, "resumes", path.basename(String(file)));
  if (!/\.pdf$/i.test(abs) || !fs.existsSync(abs)) throw new Error("Pick one of your PDF originals.");
  const b = fs.readFileSync(abs), s = b.toString("latin1"), out = [];
  const re = /<<((?:(?!>>\s*stream)[\s\S]){0,2000}?\/Subtype\s*\/Image[\s\S]{0,2000}?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(s)) && out.length < 6) {
    const d = m[1], num = (k) => Number((d.match(new RegExp(`/${k}\\s+(\\d+)`)) || [])[1]);
    const w = num("Width"), h = num("Height"), len = num("Length"), bpc = num("BitsPerComponent") || 8;
    const filter = (d.match(/\/Filter\s*\[?\s*\/(\w+)/) || [])[1];
    if (!w || !h || !len || w < 120 || h < 120 || w / h > 2.5 || h / w > 2.5) continue;
    const raw = b.subarray(m.index + m[0].length, m.index + m[0].length + len);
    try {
      if (filter === "DCTDecode") { out.push({ w, h, url: `data:image/jpeg;base64,${raw.toString("base64")}` }); continue; }
      if (filter !== "FlateDecode" || bpc !== 8 || /\/SMask|\/Mask|\/Predictor\s+([2-9]|1\d)/.test(d)) continue;
      const px = zlib.inflateSync(raw), ch = px.length === w * h * 3 ? 3 : px.length === w * h ? 1 : 0;
      if (!ch) continue;
      const rows = Buffer.alloc((w * ch + 1) * h);
      for (let y = 0; y < h; y++) px.copy(rows, y * (w * ch + 1) + 1, y * w * ch, (y + 1) * w * ch);
      out.push({ w, h, url: `data:image/png;base64,${png(w, h, ch, rows).toString("base64")}` });
    } catch {}
  }
  return out.sort((a, b2) => b2.w * b2.h - a.w * a.h);
}
