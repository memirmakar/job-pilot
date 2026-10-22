// /api/resumes/* and /api/answers: the Resumes screen's routes, merged into server.mjs's route table.
import fs from "node:fs";
import path from "node:path";
import { DIR, loadProfile, saveProfile } from "./config.mjs";
import { resumesView, currentStructured, setOriginalMeta } from "./resumes.mjs";
import { stage, discard, readStagedOriginal, addOriginal, checkStaged, useStaged } from "./reupload.mjs";
import { ANSWER_KEYS } from "./answers.mjs";
import { writeDocx } from "./docx.mjs";

const clean = (s, n = 400) => String(s ?? "").trim().slice(0, n);
const list = (a, n = 120) => (Array.isArray(a) ? a : []).map((x) => clean(x, n)).filter(Boolean);

export function resumeRoutes({ body, json }) {
  const run = (fn) => async (req, res, url) => { try { json(res, await fn(req.method === "POST" ? await body(req) : {}, url)); } catch (e) { json(res, { error: e.message }, 400); } };
  return {
    "GET /api/resumes/all": run(() => resumesView()),
    // Claude reads a staged new original: roles, skills, languages
    "POST /api/resumes/read": run((b) => readStagedOriginal(b.token)),
    // Claude reads an original already in resumes/ (needed once before Export to edit)
    "POST /api/resumes/read-existing": run(async (b) => {
      const file = path.basename(String(b.file));
      const { readOriginal } = await import("./resume_read.mjs");
      const { usage, ...read } = await readOriginal(path.join(DIR, "resumes", file));
      return setOriginalMeta(file, { read });
    }),
    "POST /api/resumes/add": run((b) => ({ file: addOriginal(b.token, {
      name: clean(b.name, 80), language: b.language === "tr" ? "tr" : "en", fields: list(b.fields), defaultFor: list(b.defaultFor),
      replaces: b.replaces ? path.basename(String(b.replaces)) : null }) })),
    "POST /api/resumes/discard": run((b) => { discard(b.token); return { ok: true }; }),
    "POST /api/resumes/meta": run((b) => {
      const patch = {};
      if (b.name !== undefined) patch.name = clean(b.name, 80);
      if (b.language !== undefined) patch.language = b.language === "tr" ? "tr" : "en";
      if (b.fields !== undefined) patch.fields = list(b.fields);
      if (b.defaultFor !== undefined) patch.defaultFor = list(b.defaultFor);
      return setOriginalMeta(path.basename(String(b.file)), patch);
    }),
    // Re-upload of a tailored or ready resume: stage, Claude checks and re-scores, then Use this version
    "POST /api/resumes/check": run(async (b) => { const p = stage(b.name, b.data); return checkStaged(p.token, String(b.id)); }),
    "POST /api/resumes/use": run((b) => useStaged(b.token, { remove: list(b.remove, 2000), confirm: list(b.confirm, 2000) })),
    "GET /api/resumes/docx": async (req, res, url) => {
      const cur = currentStructured(String(url.searchParams.get("id") || ""));
      if (!cur) return json(res, { error: "Claude needs to read this resume first" }, 409);
      const name = `${cur.base.replace(/[^\w.-]+/g, "_")}.docx`;
      res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}"` });
      res.end(writeDocx(cur.resume));
    },
    "POST /api/answers": run((b) => {
      const prof = loadProfile() || {}, answers = { ...(prof.answers || {}) };
      for (const k of Object.keys(ANSWER_KEYS)) if (b.answers?.[k]) answers[k] = { tr: clean(b.answers[k].tr), en: clean(b.answers[k].en) };
      return saveProfile({ ...prof, answers }).answers;
    }),

    // ----- Ask Claude to change this resume: staged like a re-upload, then /api/resumes/use -----
    "POST /api/resumes/instruct": run(async (b) => (await import("./resume_instruct.mjs")).instructStaged(String(b.id), b.instruction)),
    // ----- Your resume rules: standing rules, file name pattern, photo -----
    "POST /api/resumes/rules": run(async (b) => {
      const P = await import("./resume_prefs.mjs"), s = {};
      if (b.settings?.namePattern !== undefined) {
        const bad = P.patternProblems(b.settings.namePattern);
        if (bad.length) throw new Error(bad[0].startsWith("Add") ? bad[0] : `Employers would see ${bad.join(" and ")} in that name.`);
        s.namePattern = clean(b.settings.namePattern, 80);
      }
      for (const k of ["photoTr", "photoEn"]) if (b.settings?.[k] !== undefined) s[k] = b.settings[k] === null ? null : !!b.settings[k];
      return P.saveResumePrefs({ ...(Array.isArray(b.rules) ? { rules: b.rules } : {}), ...(Object.keys(s).length ? { settings: s } : {}) });
    }),
    "POST /api/resumes/rule": run(async (b) => (await import("./resume_prefs.mjs")).addRule(clean(b.text, 300))),
    "GET /api/resumes/photo": async (req, res) => {
      const { PHOTO_FILE } = await import("./resume_prefs.mjs");
      if (!fs.existsSync(PHOTO_FILE)) return json(res, { error: "No photo" }, 404);
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }); res.end(fs.readFileSync(PHOTO_FILE));
    },
    "POST /api/resumes/photo": run(async (b) => (await import("./resume_photo.mjs")).savePhoto(b.data, b.source === "original" ? "original" : "upload")),
    "POST /api/resumes/photo/remove": run(async () => (await import("./resume_photo.mjs")).removePhoto()),
    "POST /api/resumes/photo/from": run(async (b) => ({ images: (await import("./resume_photo.mjs")).photosInPdf(b.file) })),
    // ----- GitHub projects for your resume -----
    "POST /api/resumes/project": run(async (b) => (await import("./github_projects.mjs")).setProject(String(b.repo), b)),
    "POST /api/resumes/projects/suggest": run(async () => {
      const prof = loadProfile() || {};
      return { projects: await (await import("./github_projects.mjs")).suggestProjects((prof.targets || []).map((t) => t.field).join(", ")) };
    }),
    // ----- the list's menu: rename, delete + undo, rename every file to the pattern -----
    "POST /api/resumes/rename": run(async (b) => (await import("./resume_manage.mjs")).renameResume(String(b.id), { name: b.name, file: b.file ? clean(b.file, 90) : undefined })),
    "POST /api/resumes/delete": run(async (b) => (await import("./resume_manage.mjs")).deleteResume(String(b.id), { rebuild: b.rebuild !== false })),
    "POST /api/resumes/undo": run(async () => (await import("./resume_manage.mjs")).undoDelete()),
    "POST /api/resumes/rename-all": run(async () => (await import("./resume_manage.mjs")).renameAllToPattern()),
  };
}
