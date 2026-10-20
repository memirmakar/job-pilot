// /api/resumes/* and /api/answers: the Resumes screen's routes, merged into server.mjs's route table.
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
  };
}
