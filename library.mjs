// Resume library: one ready resume per target field, kept current with the job market and GitHub.
// Rebuilt every `libraryEveryDays`, or sooner when resumes, GitHub reviews or target fields change.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA } from "./config.mjs";
import config, { loadConfig } from "./config.mjs";
import { libraryResume, loadResumes } from "./llm.mjs";
import { renderResumePdf } from "./resume_pdf.mjs";
import { computeStats, loadRecords, loadAudit } from "./market.mjs";
import { neutralName, enforcePhoto, loadSettings as resumeSettings } from "./resume_prefs.mjs";

export const LIB_DIR = path.join(DATA, "library");
export const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
// Versions of a ready resume, oldest first (the last is current); older entries have only v1
export const readyVersions = (e) => e.versions?.length ? e.versions
  : [{ v: 1, by: "claude", file: e.file, path: e.path, at: e.generatedAt, note: `Written for ${e.field}` }];
// Original metadata written by the Resumes screen (resumes.mjs)
const loadMeta = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA, "resumes.json"), "utf8")); } catch { return {}; } };
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
  // fields whose ready resume you deleted with "rebuild" off are skipped (resume_prefs noRebuild)
  const off = resumeSettings().noRebuild || [];
  const fields = (loadConfig().targets || []).map((t) => t.field).filter((f) => !off.includes(f));
  if (!fields.length) return "";
  if (!entries.length) return "no library yet";
  const missing = fields.filter((f) => !entries.some((e) => e.field === f));
  if (missing.length) return `new target field(s): ${missing.join(", ")}`;
  const oldest = Math.min(...entries.map((e) => Date.parse(e.generatedAt)));
  if (Date.now() - oldest > (loadConfig().library?.everyDays ?? 7) * 864e5) return "weekly refresh";
  const resumesChanged = Math.max(0, ...fs.readdirSync(path.join(DIR, "resumes")).map((f) => mtime(path.join(DIR, "resumes", f)))) > oldest;
  if (resumesChanged) return "your uploaded resumes changed";
  if (Object.values(loadMeta()).some((m) => Date.parse(m.deleted?.at || 0) > oldest)) return "you deleted an original";
  if (mtime(path.join(DATA, "github", "review.json")) > oldest) return "your GitHub changed";
  return "";
}

export async function buildLibrary(githubBrief = "", log = console.log) {
  const stats = computeStats(loadRecords(), loadAudit());
  loadResumes(); // throws early if there are no resumes
  const built = [];
  const off = resumeSettings().noRebuild || [];
  for (const field of (config.targets || []).filter((t) => !off.includes(t.field))) {
    log(`  Library: writing the ${field.field} resume...`);
    const seg = stats.segments.find((s) => s.segment === field.field);
    const requirements = seg ? [
      `Jobs analyzed in this field: ${seg.jobs} (average best score ${seg.averageScore}).`,
      `Most often missing: ${seg.topMissing.map((k) => `${k.keyword} (${k.count}x)`).join(", ") || "n/a"}`,
      `Most often matched: ${seg.topMatched.map((k) => `${k.keyword} (${k.count}x)`).join(", ") || "n/a"}`,
    ].join("\n") : "";
    // The original the user set as the default for this field (Resumes screen, data/resumes.json)
    const def = Object.entries(loadMeta()).find(([f, m]) => m.defaultFor?.includes(field.field) && fs.existsSync(path.join(DIR, "resumes", f)))?.[0];
    const hint = def ? `\nThe candidate set ${def} as the default resume for this field: start from it.` : "";
    const { resume, usage } = await libraryResume({ field, requirements: requirements + hint, github: githubBrief });
    const dir = path.join(LIB_DIR, slug(field.field));
    enforcePhoto(resume);
    const file = neutralName(resume.language); // the name employers see: never the field
    // keep the previous version for comparison, and its PDF in versions/ so the history still opens it
    const prevMeta = path.join(dir, "meta.json");
    const prev = fs.existsSync(prevMeta) ? JSON.parse(fs.readFileSync(prevMeta, "utf8")) : null;
    if (prev) fs.copyFileSync(prevMeta, path.join(dir, "meta.previous.json"));
    const versions = prev ? readyVersions(prev).map((v) => ({ ...v })) : [];
    for (const v of versions) {
      const p = path.join(DIR, v.path);
      if (path.dirname(p) === dir && fs.existsSync(p)) {
        const moved = path.join(dir, "versions", `v${v.v}-${path.basename(p)}`);
        fs.mkdirSync(path.dirname(moved), { recursive: true }); fs.renameSync(p, moved);
        v.path = path.relative(DIR, moved).replace(/\\/g, "/");
      }
    }
    const out = await renderResumePdf(resume, path.join(dir, file));
    const meta = {
      field: field.field, file, path: path.relative(DIR, out).replace(/\\/g, "/"), generatedAt: new Date().toISOString(),
      basedOnJobs: seg?.jobs || 0, resume, usage: { costUsd: usage?.costUsd || 0 }, ...(prev?.displayName ? { displayName: prev.displayName } : {}),
    };
    if (versions.length) meta.versions = [...versions, { v: versions.at(-1).v + 1, by: "claude", file, path: meta.path, at: meta.generatedAt, note: `Rewritten for ${field.field}` }];
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    built.push(meta);
  }
  return built;
}
