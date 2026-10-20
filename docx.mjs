// Export to edit: a structured resume as a real .docx (a ZIP written with Node's own zlib, no packages),
// and the text of an edited .docx read back for the re-upload check.
import zlib from "node:zlib";

const x = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- writing ----------
const run = (text, { b = false, size = 0, color = "" } = {}) =>
  `<w:r><w:rPr>${b ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}${size ? `<w:sz w:val="${size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
const para = (runs, pPr = "") => `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
const space = (before, after) => `<w:spacing w:before="${before}" w:after="${after}"/>`;
// Section heading: small caps-style uppercase with a rule under it, like the PDF
const heading = (t) => para(run(String(t).toUpperCase(), { b: true, size: 22, color: "1F4E8C" }),
  `${space(240, 80)}<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1F4E8C"/></w:pBdr>`);
const bullet = (t) => para(run("•\t") + run(t), `${space(0, 20)}<w:tabs><w:tab w:val="left" w:pos="284"/></w:tabs><w:ind w:left="284" w:hanging="284"/>`);

function documentXml(r) {
  const tr = r.language === "tr";
  const body = [
    para(run(r.name, { b: true, size: 40 }), space(0, 0)),
    para(run(r.headline, { size: 23, color: "1F4E8C" }), space(40, 40)),
    para(run((r.contact || []).join(" · "), { size: 19 }), space(0, 0)),
    heading(tr ? "Özet" : "Summary"), para(run(r.summary)),
  ];
  for (const s of r.sections || []) {
    body.push(heading(s.title));
    for (const it of s.items || []) {
      // Role line: "Heading · Subheading" with the dates right-aligned on a tab stop
      body.push(para(run(it.heading, { b: true }) + (it.subheading ? run(` · ${it.subheading}`) : "") + (it.meta ? run("\t") + run(it.meta, { size: 19 }) : ""),
        `${space(100, 20)}<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>`));
      for (const b of it.bullets || []) body.push(bullet(b));
    }
  }
  if (r.skills?.length) {
    body.push(heading(tr ? "Yetkinlikler" : "Skills"));
    for (const g of r.skills) body.push(para(run(`${g.group}: `, { b: true }) + run(g.items.join(", ")), space(0, 20)));
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="794" w:right="850" w:bottom="794" w:left="850" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="21"/><w:color w:val="111111"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;

const PARTS = (r) => ({
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  "word/document.xml": documentXml(r),
  "word/styles.xml": STYLES,
});

// A ZIP archive: local headers + deflated data, then the central directory
function zip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8"), data = zlib.deflateRawSync(raw), fname = Buffer.from(name, "utf8");
    const crc = zlib.crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(fname.length, 26); head.writeUInt16LE(0, 28);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(0, 12); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(fname.length, 28); dir.writeUInt32LE(offset, 42);
    locals.push(head, fname, data); central.push(dir, fname);
    offset += head.length + fname.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  const n = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export const writeDocx = (resume) => zip(PARTS(resume));

// ---------- reading ----------
// One file out of a ZIP (stored or deflated), found through the central directory
function unzipEntry(buf, wanted) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a .docx file");
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0, n = buf.readUInt16LE(eocd + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extra + comment;
  }
  throw new Error(`${wanted} not found in the .docx`);
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// The document's text, one paragraph per line (tabs and line breaks kept)
export function docxText(buf) {
  const xml = unzipEntry(buf, "word/document.xml").toString("utf8");
  let out = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g))
    out += m[1] !== undefined ? m[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]) : m[0] === "<w:tab/>" ? "\t" : "\n";
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
