// The Resumes list's menu: Rename (display name, and the file for originals and unsent files), Delete with Undo for the last one,
// and "Rename files to the new pattern". Deleted files go to data/trash/<ts>/ (originals to data/resumes_history/); data/trash.json
// lists what Undo puts back. A version that was sent is never renamed, moved or deleted.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA, loadProfile, saveProfile } from "./config.mjs";
import { LIB_DIR, readyVersions } from "./library.mjs";
import { loadMeta, saveMeta, archiveOriginal, tailoredVersions, sentVersion, isResumeFile } from "./resumes.mjs";
import { neutralName, revealing, loadSettings, saveResumePrefs } from "./resume_prefs.mjs";

const TRASH = path.join(DATA, "trash"), LOG = path.join(DATA, "trash.json");
const RECS = path.join(DATA, "applications");
const rel = (p) => path.relative(DIR, p).replace(/\\/g, "/");
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const recFile = (k) => path.join(RECS, `${path.basename(k)}.json`);
const saveRec = (k, r) => fs.writeFileSync(recFile(k), JSON.stringify(r, null, 2));
const metaFile = (s) => path.join(LIB_DIR, path.basename(s), "meta.json");
const toTrash = (abs, stamp) => { const d = path.join(TRASH, stamp); fs.mkdirSync(d, { recursive: true }); const to = path.join(d, path.basename(abs)); fs.renameSync(abs, to); return rel(to); };
const safeName = (n) => `${path.basename(String(n || "")).replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 80)}.pdf`;

export const lastDelete = () => { const l = readJson(LOG, []).filter((e) => !e.undoneAt); const e = l.at(-1); return e ? { at: e.at, id: e.id, kind: e.kind, label: e.label } : null; };
function logDelete(e) { const l = readJson(LOG, []); l.push({ ...e, at: new Date().toISOString() }); fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(l.slice(-50), null, 2)); }

// ---------- delete ----------
export function deleteResume(id, { rebuild = true } = {}) {
  const [kind, key] = [id[0], id.slice(2)], stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (kind === "o") {
    const file = path.basename(key), src = path.join(DIR, "resumes", file);
    if (!fs.existsSync(src)) throw new Error("That original is already gone.");
    const h = archiveOriginal(file, "Deleted by you");
    fs.rmSync(src);
    const meta = loadMeta(); meta[file] = { ...meta[file], deleted: { at: new Date().toISOString() } }; saveMeta(meta);
    logDelete({ id, kind, label: meta[file].name || file, undo: { file, history: h.path } });
    return { message: "Moved to your resume history. Ready resumes based on it are rebuilt on the next library update." };
  }
  if (kind === "r") {
    const e = readJson(metaFile(key), null);
    if (!e) throw new Error("That ready resume is already gone.");
    const dir = path.join(LIB_DIR, path.basename(key)), to = path.join(TRASH, stamp, path.basename(key));
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(dir, to);
    if (!rebuild) saveResumePrefs({ settings: { noRebuild: [...new Set([...(loadSettings().noRebuild || []), e.field])] } });
    logDelete({ id, kind, label: e.displayName || e.field, undo: { dir: rel(to), field: e.field, rebuild } });
    return { message: rebuild ? "Removed. It's written again on the next library update." : "Removed. It won't be rebuilt until you turn that back on." };
  }
  const r = readJson(recFile(key), null);
  if (!r?.tailored) throw new Error("That tailored resume is already gone.");
  const versions = tailoredVersions(r).map((v) => ({ ...v })), cur = versions.at(-1), sent = sentVersion(r);
  if (sent && sent.v === cur.v) throw new Error(`This version was sent to ${sent.company || r.company}; sent versions can't be deleted.`);
  const moved = fs.existsSync(path.join(DIR, cur.path)) ? toTrash(path.join(DIR, cur.path), stamp) : null;
  const before = JSON.parse(JSON.stringify(r.tailored));
  if (versions.length > 1) {
    const prev = versions.at(-2);
    r.tailored = { ...r.tailored, versions: versions.slice(0, -1), file: prev.file || path.basename(prev.path), path: prev.path, score: prev.score ?? r.tailored.score };
    r.chosenResume = r.tailored.used ? r.tailored.file : r.chosenResume;
  } else {
    r.tailored = { ...r.tailored, used: false, deleted: { at: new Date().toISOString() } };
    r.chosenResume = r.tailored.baseFile;
  }
  saveRec(key, r);
  logDelete({ id, kind, label: `${r.title} · ${r.company}`, undo: { key, tailored: before, chosenResume: before.used ? before.file : before.baseFile, moved, path: cur.path } });
  return { message: versions.length > 1 ? `Removed v${cur.v}; the job uses v${cur.v - 1} again.` : "Removed; the job uses your original again." };
}

export function undoDelete() {
  const l = readJson(LOG, []), e = [...l].reverse().find((x) => !x.undoneAt);
  if (!e) throw new Error("Nothing to undo.");
  const u = e.undo;
  if (e.kind === "o") {
    const dest = path.join(DIR, "resumes", u.file);
    if (fs.existsSync(dest)) throw new Error(`A file named ${u.file} is back in your resumes already.`);
    fs.copyFileSync(path.join(DIR, u.history), dest);
    const meta = loadMeta(), m = meta[u.file] || {};
    const h = (m.history || []).pop();
    if (h?.read) m.read = h.read;
    delete m.deleted; meta[u.file] = m; saveMeta(meta);
  } else if (e.kind === "r") {
    const dir = path.join(LIB_DIR, path.basename(u.dir));
    if (fs.existsSync(dir)) throw new Error("That field already has a new ready resume.");
    fs.renameSync(path.join(DIR, u.dir), dir);
    if (!u.rebuild) saveResumePrefs({ settings: { noRebuild: (loadSettings().noRebuild || []).filter((f) => f !== u.field) } });
  } else {
    const r = readJson(recFile(u.key), null);
    if (!r) throw new Error("That job is gone.");
    if (u.moved) { fs.mkdirSync(path.dirname(path.join(DIR, u.path)), { recursive: true }); fs.renameSync(path.join(DIR, u.moved), path.join(DIR, u.path)); }
    r.tailored = u.tailored; r.chosenResume = u.chosenResume;
    saveRec(u.key, r);
  }
  e.undoneAt = new Date().toISOString();
  fs.writeFileSync(LOG, JSON.stringify(l, null, 2));
  return { message: `${e.label} is back.` };
}

// ---------- rename ----------
// Moving an original's file renames every reference to it (jobs' scores and bases, search profiles)
function moveOriginalRefs(from, to) {
  for (const f of fs.readdirSync(RECS).filter((f) => f.endsWith(".json"))) {
    const r = readJson(path.join(RECS, f), null); if (!r) continue;
    let s = JSON.stringify(r);
    const before = s;
    if (r.ats?.best_file === from) r.ats.best_file = to;
    for (const x of r.ats?.resumes || []) if (x.file === from) x.file = to;
    if (r.tailored?.baseFile === from) { r.tailored.baseFile = to; r.tailored.basePath = `resumes/${to}`; }
    if (r.chosenResume === from) r.chosenResume = to;
    s = JSON.stringify(r);
    if (s !== before) fs.writeFileSync(path.join(RECS, f), JSON.stringify(r, null, 2));
  }
  const p = loadProfile();
  if (p?.targets?.some((t) => t.resume === `o:${from}`)) saveProfile({ ...p, targets: p.targets.map((t) => t.resume === `o:${from}` ? { ...t, resume: `o:${to}` } : t) });
}

export function renameResume(id, { name, file }) {
  const [kind, key] = [id[0], id.slice(2)], out = { id };
  const display = name !== undefined ? String(name).trim().slice(0, 80) : undefined;
  if (kind === "o") {
    const from = path.basename(key), meta = loadMeta();
    let cur = from;
    if (file && safeName(file) !== from) {
      const to = /\.(txt|md)$/i.test(from) ? safeName(file).replace(/\.pdf$/i, path.extname(from)) : safeName(file);
      if (!isResumeFile(to) || fs.existsSync(path.join(DIR, "resumes", to))) throw new Error(`There's already a resume named ${to}.`);
      fs.renameSync(path.join(DIR, "resumes", from), path.join(DIR, "resumes", to));
      meta[to] = meta[from] || {}; delete meta[from]; saveMeta(meta);
      moveOriginalRefs(from, to); cur = to; out.id = `o:${to}`;
      out.warning = revealing(to).length ? `The name shows ${revealing(to).join(" and ")}.` : "";
    }
    if (display !== undefined) { const m = loadMeta(); m[cur] = { ...(m[cur] || {}), name: display }; saveMeta(m); }
    return out;
  }
  if (kind === "r") {
    const e = readJson(metaFile(key), null); if (!e) throw new Error("That ready resume is gone.");
    if (display !== undefined) e.displayName = display || undefined;
    if (file) {
      const to = safeName(file), hits = revealing(to, { field: e.field });
      if (hits.length) throw new Error(`Employers would see ${hits.join(" and ")} in that name. Use your name and the language only.`);
      const abs = path.join(DIR, e.path), dest = path.join(path.dirname(abs), to);
      if (abs !== dest) { fs.renameSync(abs, dest); const vs = readyVersions(e).map((v) => v.path === e.path ? { ...v, file: to, path: rel(dest) } : v); e.file = to; e.path = rel(dest); if (e.versions) e.versions = vs; }
    }
    fs.writeFileSync(metaFile(key), JSON.stringify(e, null, 2));
    return out;
  }
  const r = readJson(recFile(key), null); if (!r?.tailored) throw new Error("That tailored resume is gone.");
  if (display !== undefined) r.tailored.displayName = display || undefined;
  if (file) {
    const versions = tailoredVersions(r).map((v) => ({ ...v })), cur = versions.at(-1), sent = sentVersion(r);
    if (sent?.v === cur.v) throw new Error("This version was sent; its file keeps the name it was sent under.");
    const to = safeName(file), hits = revealing(to, { company: r.company, title: r.title, field: r.field });
    if (hits.length) throw new Error(`Employers would see ${hits.join(" and ")} in that name. Use your name and the language only.`);
    const abs = path.join(DIR, cur.path), dest = path.join(path.dirname(abs), to);
    if (abs !== dest) {
      fs.renameSync(abs, dest); cur.file = to; cur.path = rel(dest);
      if (sent) r.tailored.sent = sent; // keeps the name it was sent under
      Object.assign(r.tailored, { versions, file: to, path: cur.path });
      if (r.tailored.used) r.chosenResume = to;
    }
  }
  saveRec(key, r);
  return out;
}

// Every unsent tailored and ready file whose name isn't the pattern's; sent files keep their names (recorded in tailored.sent.fileName)
export function renameAllToPattern() {
  let n = 0;
  const move = (abs, to) => { const dest = path.join(path.dirname(abs), to); if (abs === dest || !fs.existsSync(abs) || fs.existsSync(dest)) return null; fs.renameSync(abs, dest); n++; return dest; };
  for (const f of fs.readdirSync(RECS).filter((f) => f.endsWith(".json"))) {
    const r = readJson(path.join(RECS, f), null); if (!r?.tailored?.path) continue;
    const sent = sentVersion(r), versions = tailoredVersions(r).map((v) => ({ ...v }));
    let changed = !!sent && !r.tailored.sent?.fileName;
    for (const v of versions) {
      if (sent?.v === v.v) continue;
      const dest = move(path.join(DIR, v.path), neutralName(v.resume?.language || r.tailored.resume?.language));
      if (dest) { v.file = path.basename(dest); v.path = rel(dest); changed = true; }
    }
    if (!changed) continue;
    const cur = versions.at(-1);
    Object.assign(r.tailored, { versions, file: cur.file || path.basename(cur.path), path: cur.path, ...(sent ? { sent } : {}) });
    if (r.tailored.used) r.chosenResume = r.tailored.file;
    fs.writeFileSync(path.join(RECS, f), JSON.stringify(r, null, 2));
  }
  for (const d of fs.existsSync(LIB_DIR) ? fs.readdirSync(LIB_DIR) : []) {
    const e = readJson(metaFile(d), null); if (!e?.path) continue;
    const dest = move(path.join(DIR, e.path), neutralName(e.resume?.language)); if (!dest) continue;
    const vs = readyVersions(e).map((v) => v.path === e.path ? { ...v, file: path.basename(dest), path: rel(dest) } : v);
    Object.assign(e, { file: path.basename(dest), path: rel(dest) }); if (e.versions) e.versions = vs;
    fs.writeFileSync(metaFile(d), JSON.stringify(e, null, 2));
  }
  return { renamed: n };
}
