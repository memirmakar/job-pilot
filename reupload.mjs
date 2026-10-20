// Uploads that wait for the user's OK: files are staged in data/staging/<token>/ until "Add original" or "Use this version".
// A new version never overwrites: originals' old files go to the history, tailored and ready resumes get a v<N>/ folder.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DIR, DATA, loadProfile, saveProfile } from "./config.mjs";
import { LIB_DIR, readyVersions, slug } from "./library.mjs";
import { archiveOriginal, setOriginalMeta, loadMeta, saveMeta, isResumeFile, tailoredVersions, sentVersion, guessLang } from "./resumes.mjs";
import { docxText } from "./docx.mjs";

const STAGE = path.join(DATA, "staging");
const rel = (p) => path.relative(DIR, p).replace(/\\/g, "/");
const safe = (n) => path.basename(String(n)).replace(/[<>:"/\\|?*]/g, "_");
const pend = (token) => path.join(STAGE, path.basename(String(token)), "pending.json");
export const loadPending = (token) => { try { return JSON.parse(fs.readFileSync(pend(token), "utf8")); } catch { throw new Error("That upload expired. Upload the file again."); } };
const savePending = (p) => fs.writeFileSync(pend(p.token), JSON.stringify(p, null, 2));

// Saves an uploaded file; .docx also gets its text, which is what Claude reads
export function stage(name, base64, extra = {}) {
  const file = safe(name);
  if (!/\.(pdf|txt|md|docx)$/i.test(file)) throw new Error("Use a PDF, DOCX or TXT file.");
  const token = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, dir = path.join(STAGE, token);
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(base64, "base64"), saved = path.join(dir, file);
  fs.writeFileSync(saved, buf);
  let readPath = saved;
  if (/\.docx$/i.test(file)) { readPath = path.join(dir, file.replace(/\.docx$/i, ".txt")); fs.writeFileSync(readPath, docxText(buf)); }
  const p = { token, file, saved: rel(saved), readPath: rel(readPath), size: buf.length, at: new Date().toISOString(), ...extra };
  savePending(p);
  return p;
}
export function discard(token) { fs.rmSync(path.dirname(pend(token)), { recursive: true, force: true }); }

// ---------- originals ----------
export async function readStagedOriginal(token) {
  const p = loadPending(token);
  const { readOriginal } = await import("./resume_read.mjs");
  const read = await readOriginal(path.join(DIR, p.readPath));
  p.read = read; savePending(p);
  return { ...p, language: read.resume.language || guessLang(p.file) };
}

// replaces: the original this is a new version of (Upload new version); a same-name upload is a new version too
export function addOriginal(token, { name, language, fields = [], defaultFor = [], replaces = null }) {
  const p = loadPending(token);
  if (!isResumeFile(p.file)) throw new Error("Originals are PDF, TXT or MD. Save the DOCX as PDF in Word, then upload it.");
  const target = replaces && path.extname(replaces).toLowerCase() === path.extname(p.file).toLowerCase() ? replaces : p.file;
  archiveOriginal(target);
  if (replaces && replaces !== target && fs.existsSync(path.join(DIR, "resumes", replaces))) {
    archiveOriginal(replaces, "Replaced by a new file");
    const meta = loadMeta(); meta[target] = { ...meta[replaces], ...(meta[target] || {}), history: [...(meta[replaces].history || []), ...(meta[target]?.history || [])] };
    delete meta[replaces]; saveMeta(meta);
    fs.rmSync(path.join(DIR, "resumes", replaces)); // its copy is in the history
  }
  fs.copyFileSync(path.join(DIR, p.saved), path.join(DIR, "resumes", target));
  const { usage, ...read } = p.read || {};
  setOriginalMeta(target, { name, language, fields, defaultFor, uploadedAt: new Date().toISOString(), ...(p.read ? { read } : {}) });
  discard(token);
  return target;
}

// ---------- edited tailored / ready resumes ----------
const recFile = (k) => path.join(DATA, "applications", `${path.basename(k)}.json`);
function target(kind, key) {
  if (kind === "t") {
    const r = JSON.parse(fs.readFileSync(recFile(key), "utf8"));
    if (!r.tailored) throw new Error("This job has no tailored resume.");
    return { r, versions: tailoredVersions(r), base: r.tailored.resume, dir: path.join(DATA, "tailored", key) };
  }
  const dir = path.join(LIB_DIR, slug(key)), e = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  return { e, versions: readyVersions(e), base: e.resume, dir };
}

export async function checkStaged(token, id) {
  const p = loadPending(token), [kind, key] = [id[0], id.slice(2)], t = target(kind, key);
  const { checkEdited, removeLines } = await import("./resume_read.mjs");
  const { renderResumePdf } = await import("./resume_pdf.mjs");
  const current = t.versions.at(-1).resume || t.base;
  const res = await checkEdited({ filePath: path.join(DIR, p.readPath), current });
  const fileName = path.basename(t.versions.at(-1).file || t.versions.at(-1).path);
  const preview = await renderResumePdf(res.resume, path.join(STAGE, p.token, "preview", fileName));
  let from = t.versions.at(-1).score ?? null, score = null;
  if (kind === "t") {
    // Lines Claude can't verify don't count: the score is for the version without them
    const verified = res.unsupported.length ? await renderResumePdf(removeLines(res.resume, res.unsupported.map((u) => u.text)),
      path.join(STAGE, p.token, "scored", fileName)) : preview;
    const { scoreResumes } = await import("./llm.mjs");
    const sc = await scoreResumes(t.r, [{ file: fileName, path: verified }]);
    score = Math.round(sc.resumes[0]?.ats_score ?? 0);
  }
  Object.assign(p, { id, kind, resume: res.resume, changes: res.changes, unsupported: res.unsupported, preview: rel(preview), fileName,
    from: from != null ? Math.round(from) : null, score, v: t.versions.at(-1).v + 1, costUsd: (res.usage?.costUsd || 0) });
  savePending(p);
  return p;
}

// remove: unsupported lines to drop; confirm: lines the user says are true (added to profile facts so later checks know them)
export async function useStaged(token, { remove = [], confirm = [] }) {
  const p = loadPending(token), [kind, key] = [p.id[0], p.id.slice(2)], t = target(kind, key);
  const left = (p.unsupported || []).filter((u) => !remove.includes(u.text) && !confirm.includes(u.text));
  if (left.length) throw new Error("Remove or confirm every line Claude couldn't find in your originals first.");
  const { removeLines } = await import("./resume_read.mjs");
  const { renderResumePdf } = await import("./resume_pdf.mjs");
  const resume = removeLines(p.resume, remove);
  const v = t.versions.at(-1).v + 1, out = await renderResumePdf(resume, path.join(t.dir, `v${v}`, p.fileName));
  const changes = p.changes.filter((c) => !remove.includes(c.text));
  const entry = { v, by: "you", file: p.fileName, path: rel(out), score: p.score, at: new Date().toISOString(), note: "Edited version you uploaded", changes, resume, confirmed: confirm };
  if (confirm.length) {
    const prof = loadProfile();
    saveProfile({ ...prof, facts: [prof.facts, ...confirm.map((l) => `Confirmed by me: ${l}`)].filter(Boolean).join("\n") });
  }
  if (kind === "t") {
    const r = t.r, sent = sentVersion(r);
    // From now on this version is the one used (and sent); a version already sent stays as it was
    r.tailored = { ...r.tailored, versions: [...t.versions, entry], file: entry.file, path: entry.path, score: p.score ?? r.tailored.score, used: true, ...(sent ? { sent } : {}) };
    r.chosenResume = entry.file;
    fs.writeFileSync(recFile(key), JSON.stringify(r, null, 2));
  } else {
    const e = t.e;
    Object.assign(e, { versions: [...t.versions, entry], path: entry.path });
    fs.writeFileSync(path.join(t.dir, "meta.json"), JSON.stringify(e, null, 2));
  }
  discard(token);
  return entry;
}
