// Resume library: one ready resume per target field, kept current with the job market and GitHub.
// Rebuilt every `libraryEveryDays`, or sooner when resumes, GitHub reviews or target fields change.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA } from "./config.mjs";
import config, { loadConfig } from "./config.mjs";
import { libraryResume, loadResumes } from "./llm.mjs";
import { renderResumePdf } from "./resume_pdf.mjs";
import { computeStats, loadRecords, loadAudit } from "./market.mjs";

export const LIB_DIR = path.join(DATA, "library");
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
const ascii = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

export function libraryEntries() {
  if (!fs.existsSync(LIB_DIR)) return [];
  return fs.readdirSync(LIB_DIR).map((d) => { try { return JSON.parse(fs.readFileSync(path.join(LIB_DIR, d, "meta.json"), "utf8")); } catch { return null; } })
    .filter(Boolean).filter((e) => fs.existsSync(path.join(DIR, e.path)));
}
// Library PDFs in the shape scoring expects: [{ file, path }]
export const libraryFiles = () => libraryEntries().map((e) => ({ file: e.file, path: path.join(DIR, e.path), library: e.field }));

// Why the library needs rebuilding (empty string = up to date)
export function libraryDue() {
  const entries = libraryEntries();
  const fields = (loadConfig().targets || []).map((t) => t.field);
  if (!fields.length) return "";
  if (!entries.length) return "no library yet";
  const missing = fields.filter((f) => !entries.some((e) => e.field === f));
  if (missing.length) return `new target field(s): ${missing.join(", ")}`;
  const oldest = Math.min(...entries.map((e) => Date.parse(e.generatedAt)));
  if (Date.now() - oldest > (loadConfig().library?.everyDays ?? 7) * 864e5) return "weekly refresh";
  const resumesChanged = Math.max(0, ...fs.readdirSync(path.join(DIR, "resumes")).map((f) => mtime(path.join(DIR, "resumes", f)))) > oldest;
  if (resumesChanged) return "your uploaded resumes changed";
  if (mtime(path.join(DATA, "github", "review.json")) > oldest) return "your GitHub changed";
  return "";
}

export async function buildLibrary(githubBrief = "", log = console.log) {
  const stats = computeStats(loadRecords(), loadAudit());
  loadResumes(); // throws early if there are no resumes
  const built = [];
  for (const field of config.targets || []) {
    log(`  Library: writing the ${field.field} resume...`);
    const seg = stats.segments.find((s) => s.segment === field.field);
    const requirements = seg ? [
      `Jobs analyzed in this field: ${seg.jobs} (average best score ${seg.averageScore}).`,
      `Most often missing: ${seg.topMissing.map((k) => `${k.keyword} (${k.count}x)`).join(", ") || "n/a"}`,
      `Most often matched: ${seg.topMatched.map((k) => `${k.keyword} (${k.count}x)`).join(", ") || "n/a"}`,
    ].join("\n") : "";
    const { resume, usage } = await libraryResume({ field, requirements, github: githubBrief });
    const dir = path.join(LIB_DIR, slug(field.field));
    const file = `${ascii(resume.name)}_${ascii(field.field)}_CV.pdf`;
    // keep the previous version for comparison
    const prevMeta = path.join(dir, "meta.json");
    if (fs.existsSync(prevMeta)) fs.copyFileSync(prevMeta, path.join(dir, "meta.previous.json"));
    const out = await renderResumePdf(resume, path.join(dir, file));
    const meta = {
      field: field.field, file, path: path.relative(DIR, out).replace(/\\/g, "/"), generatedAt: new Date().toISOString(),
      basedOnJobs: seg?.jobs || 0, resume, usage: { costUsd: usage?.costUsd || 0 },
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    built.push(meta);
  }
  return built;
}
