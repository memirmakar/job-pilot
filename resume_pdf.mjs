// Renders a tailored resume (structured JSON from Claude) to an ATS-friendly PDF.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import config from "./config.mjs";
import { photoFor, PHOTO_FILE } from "./resume_prefs.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Single column, real text, standard headings: what ATS parsers read best. The photo (Resumes > Your resume rules) sits at the
// top right of the header when the photo rule or the resume says so, as Turkish CVs usually have it.
export function resumeHtml(r) {
  const photo = photoFor(r) ? `<img class="photo" alt="" src="data:image/jpeg;base64,${fs.readFileSync(PHOTO_FILE).toString("base64")}">` : "";
  const section = (s) => `
    <h2>${esc(s.title)}</h2>
    ${s.items.map((it) => `
      <div class="item">
        <div class="row"><div><b>${esc(it.heading)}</b>${it.subheading ? ` · ${esc(it.subheading)}` : ""}</div><div class="meta">${esc(it.meta)}</div></div>
        ${it.bullets.length ? `<ul>${it.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>`).join("")}`;
  return `<!doctype html><html lang="${r.language}"><head><meta charset="utf-8"><title>${esc(r.name)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; color: #111; margin: 0; }
    h1 { font-size: 20pt; margin: 0; letter-spacing: .5px; }
    .headline { font-size: 11.5pt; color: #1f4e8c; margin-top: 2px; }
    .contact { font-size: 9.5pt; color: #333; margin-top: 4px; }
    h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .8px; color: #1f4e8c; border-bottom: 1px solid #1f4e8c; padding-bottom: 2px; margin: 14px 0 6px; }
    .summary { margin: 0; }
    .item { margin-bottom: 7px; page-break-inside: avoid; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .meta { color: #444; white-space: nowrap; font-size: 9.5pt; }
    ul { margin: 2px 0 0; padding-left: 16px; }
    li { margin: 1px 0; }
    .skills div { margin: 1px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .photo { width: 27mm; height: 36mm; object-fit: cover; border-radius: 2px; flex: none; }
  </style></head><body>
    <div class="head"><div>
    <h1>${esc(r.name)}</h1>
    <div class="headline">${esc(r.headline)}</div>
    <div class="contact">${r.contact.map(esc).join(" · ")}</div>
    </div>${photo}</div>
    <h2>${r.language === "tr" ? "Özet" : "Summary"}</h2>
    <p class="summary">${esc(r.summary)}</p>
    ${r.sections.map(section).join("")}
    ${r.skills.length ? `<h2>${r.language === "tr" ? "Yetkinlikler" : "Skills"}</h2>
      <div class="skills">${r.skills.map((g) => `<div><b>${esc(g.group)}:</b> ${g.items.map(esc).join(", ")}</div>`).join("")}</div>` : ""}
  </body></html>`;
}

let browser = null;
export async function renderResumePdf(resume, outPath) {
  browser ||= await chromium.launch({ channel: config.browserChannel || undefined, headless: true });
  const page = await browser.newPage();
  await page.setContent(resumeHtml(resume), { waitUntil: "load" });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await page.pdf({ path: outPath, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "15mm", right: "15mm" } });
  await page.close();
  return outPath;
}
export async function closePdfBrowser() { if (browser) { await browser.close(); browser = null; } }
