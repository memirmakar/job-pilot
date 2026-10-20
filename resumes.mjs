// Resumes screen data: originals (resumes/ + data/resumes.json), ready resumes (data/library) and tailored ones (job records),
// each with its versions. Nothing is overwritten: an original's old file goes to data/resumes_history/<file>/ first.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA, loadProfile } from "./config.mjs";
import { libraryEntries, readyVersions, LIB_DIR, slug } from "./library.mjs";
import { answersView } from "./answers.mjs";

const RES_DIR = path.join(DIR, "resumes");
const META_FILE = path.join(DATA, "resumes.json");
const HIST_DIR = path.join(DATA, "resumes_history");
const RECORDS_DIR = path.join(DATA, "applications");
const rel = (p) => path.relative(DIR, p).replace(/\\/g, "/");
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const mtimeIso = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };
export const isResumeFile = (f) => /\.(pdf|txt|md)$/i.test(f);

// ---------- original metadata: { "<file>": { name language fields defaultFor uploadedAt read history[] } } ----------
export const loadMeta = () => readJson(META_FILE, {});
export function saveMeta(m) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2)); return m; }
export const guessLang = (f) => /(^|[_\-\s.])tr([_\-\s.]|$)|türk|turk/i.test(f) ? "tr" : /(^|[_\-\s.])en([_\-\s.]|$)|english/i.test(f) ? "en" : "";
const prettyName = (f) => f.replace(/(\.docx)?\.(pdf|txt|md)$/i, "").replace(/[_]+/g, " ").trim();

// Moves the current file to the history (a new version comes next); returns the history entry
export function archiveOriginal(file, note = "") {
  const src = path.join(RES_DIR, file);
  if (!fs.existsSync(src)) return null;
  const meta = loadMeta(), m = meta[file] ||= {};
  m.history ||= [];
  const v = m.history.length + 1, dest = path.join(HIST_DIR, file, `v${v}-${file}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const entry = { v, at: m.uploadedAt || mtimeIso(src), path: rel(dest), note: note || (v === 1 ? "First upload" : "Earlier version") };
  // What Claude read belongs to this file: it moves with it, and the new file is read again
  if (m.read) { entry.read = m.read; delete m.read; }
  m.history.push(entry);
  saveMeta(meta);
  return entry;
}

// One default original per field
export function setOriginalMeta(file, patch) {
  const meta = loadMeta();
  if (patch.defaultFor) for (const [f, m] of Object.entries(meta)) if (f !== file && m.defaultFor) m.defaultFor = m.defaultFor.filter((d) => !patch.defaultFor.includes(d));
  meta[file] = { ...(meta[file] || {}), ...patch };
  return saveMeta(meta)[file];
}

// ---------- listings ----------
const records = () => !fs.existsSync(RECORDS_DIR) ? [] : fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json"))
  .map((f) => readJson(path.join(RECORDS_DIR, f), null)).filter(Boolean);
const job = (r) => ({ k: `${r.site}-${r.id}`, title: r.title, company: r.company, location: r.location, status: r.status, logoUrl: r.logoUrl, archived: !!r.archived });

// Versions of a tailored resume, oldest first; the last one is current. Old records get v1 from tailored{}.
export const tailoredVersions = (r) => r.tailored.versions?.length ? r.tailored.versions
  : [{ v: 1, by: "claude", file: r.tailored.file, path: r.tailored.path, score: r.tailored.score, at: r.createdAt, note: `Tailored for ${r.company}` }];
// The version that went to the employer: stored once sent; older applied records with an uploaded tailored PDF sent v1
export const sentVersion = (r) => r.tailored?.sent || (r.status === "applied" && r.tailored?.uploaded === true
  ? { v: 1, at: r.submittedAt || r.createdAt, company: r.company } : null);

function originals(recs) {
  const meta = loadMeta();
  return fs.readdirSync(RES_DIR).filter(isResumeFile).sort().map((file) => {
    const m = meta[file] || {}, p = path.join(RES_DIR, file), hist = m.history || [];
    const uploadedAt = m.uploadedAt || mtimeIso(p);
    const versions = [...hist.map(({ read, ...h }) => ({ ...h, by: "you" })), { v: hist.length + 1, by: "you", at: uploadedAt, path: `resumes/${file}`, note: hist.length ? "Edited version you uploaded" : "First upload" }];
    const jobs = recs.filter((r) => r.ats?.best_file === file || r.tailored?.baseFile === file).map((r) => ({ ...job(r),
      from: Math.round(r.tailored?.baseScore ?? r.ats?.best_score ?? 0), score: r.tailored ? Math.round(r.tailored.score) : null, tailored: r.tailored ? `t:${r.site}-${r.id}` : null }));
    return { id: `o:${file}`, kind: "original", file, path: `resumes/${file}`, name: m.name || prettyName(file), language: m.language || m.read?.resume?.language || guessLang(file),
      fields: m.fields || [], defaultFor: m.defaultFor || [], uploadedAt, read: m.read || null, versions, jobs };
  });
}

function ready(recs, origs) {
  return libraryEntries().map((e) => {
    const id = slug(e.field);
    // Originals for this field (or every original when none has fields) changed after it was written
    const mine = origs.filter((o) => o.fields.includes(e.field));
    const changed = (mine.length ? mine : origs).filter((o) => Date.parse(o.uploadedAt) > Date.parse(e.generatedAt)).map((o) => o.name);
    const jobs = recs.filter((r) => r.tailored?.basePath === e.path || r.tailored?.baseFile === e.file).map((r) => ({ ...job(r),
      from: Math.round(r.tailored.baseScore ?? 0), score: Math.round(r.tailored.score), tailored: `t:${r.site}-${r.id}` }));
    return { id: `r:${id}`, kind: "ready", field: e.field, file: e.file, path: e.path, name: e.field, language: e.resume?.language || "",
      generatedAt: e.generatedAt, basedOnJobs: e.basedOnJobs, resume: e.resume, versions: readyVersions(e), stale: changed, jobs,
      defaultOriginal: origs.find((o) => o.defaultFor.includes(e.field))?.name || null };
  });
}

function tailored(recs, origs, readies) {
  return recs.filter((r) => r.tailored?.path).map((r) => {
    const t = r.tailored, sent = sentVersion(r);
    const parent = readies.find((x) => x.path === t.basePath || x.file === t.baseFile) || origs.find((o) => o.file === t.baseFile);
    const status = sent ? "sent" : t.used ? "ready" : "unused";
    return { id: `t:${r.site}-${r.id}`, kind: "tailored", job: job(r), file: t.file, path: t.path, name: r.title, language: t.resume?.language || "",
      score: Math.round(t.score), baseScore: Math.round(t.baseScore ?? 0), baseFile: t.baseFile, parent: parent?.id || null, parentName: parent?.name || t.baseFile,
      used: !!t.used, status, sent, at: r.createdAt, versions: tailoredVersions(r),
      resume: { changes: t.resume?.changes || [], not_added: t.resume?.not_added || [], github_added: t.resume?.github_added || [] } };
  });
}

export function resumesView() {
  const recs = records(), origs = originals(recs), readies = ready(recs, origs);
  const profile = loadProfile() || {};
  return { originals: origs, ready: readies, tailored: tailored(recs, origs, readies), answers: answersView(profile, recs),
    fields: (profile.targets || []).map((t) => t.field) };
}

// The structured resume of the current version (for Export to edit), and a file name for it
export function currentStructured(id) {
  const [kind, key] = [id.slice(0, 1), id.slice(2)];
  if (kind === "o") { const m = loadMeta()[key]; return m?.read?.resume ? { resume: m.read.resume, base: prettyName(key) } : null; }
  if (kind === "r") {
    const e = readJson(path.join(LIB_DIR, path.basename(key), "meta.json"), null);
    return e ? { resume: readyVersions(e).at(-1).resume || e.resume, base: e.file.replace(/\.pdf$/i, "") } : null;
  }
  const r = readJson(path.join(RECORDS_DIR, `${path.basename(key)}.json`), null);
  return r?.tailored ? { resume: tailoredVersions(r).at(-1).resume || r.tailored.resume, base: r.tailored.file.replace(/\.pdf$/i, "") } : null;
}
