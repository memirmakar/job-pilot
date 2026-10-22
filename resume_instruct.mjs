// "Ask Claude to change this resume": Claude applies your instruction to the structured resume, then the result goes through the
// same check as a re-upload (what changed, unsupported lines to remove or confirm, a new score for tailored ones) and waits in
// data/staging/<token>/ until Use this version (reupload.mjs useStaged). Originals get a new version too; the old file goes to the history.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DIR, DATA } from "./config.mjs";
import { loadMeta, archiveOriginal, setOriginalMeta } from "./resumes.mjs";
import { neutralName, rulesText, photoRule } from "./resume_prefs.mjs";

const STAGE = path.join(DATA, "staging");
const rel = (p) => path.relative(DIR, p).replace(/\\/g, "/");

// ---------- Claude applies the instruction ----------
async function applyInstruction({ current = null, filePath = null, instruction }) {
  const { ask, PROFILE } = await import("./llm.mjs");
  const { Structured, CheckSchema, sources, cachedGithub } = await import("./resume_read.mjs");
  const schema = { type: "object", additionalProperties: false, required: ["resume", "changes", "unsupported", "sounds_like_rule", "rule_text", "done"],
    properties: { resume: Structured, changes: CheckSchema.properties.changes, unsupported: CheckSchema.properties.unsupported,
      sounds_like_rule: { type: "boolean", description: "true when the instruction reads like something for every resume (e.g. 'always…', a title to use, the photo)" },
      rule_text: { type: "string", description: "If it sounds like a rule: the rule in one short sentence, in the candidate's words; else empty" },
      done: { type: "string", description: "One sentence: what you did, or why you couldn't" } } };
  const prompt = [
    current ? `The resume to change (structured):\n${JSON.stringify(current)}` : `The resume to change: read ${filePath} and copy it into the structured resume first.`,
    `The candidate's instruction: ${instruction}`,
    `The candidate's original resumes, the only sources of facts besides the profile and GitHub (read them when the instruction needs facts):\n${sources().map((r) => `- ${r.file}: ${r.path}`).join("\n")}`,
    PROFILE(), rulesText(), cachedGithub(),
  ].filter(Boolean).join("\n\n");
  const system = `You change one resume exactly as the candidate asks and nothing else: keep every other line word for word.
Never invent experience: a new skill, tool, employer, title, date, number, project or responsibility must come from the sources; if the instruction
needs one that isn't there, still write it as asked but list the line under "unsupported". Lines the profile lists as "Confirmed by me" count as supported.
"photo": true when the instruction asks for the photo or the photo rule says include; false only when the instruction removes it.
Follow the standing rules too. List every change. Use the Read tool to open the files. Reply only with the structured result.`;
  const { data, usage } = await ask({ system, prompt, schema, timeoutMs: 6 * 60e3 });
  // The photo rule wins unless the instruction itself was about the photo
  if (photoRule(data.resume.language) === true && !/photo|foto|fotoğraf|resim/i.test(instruction)) data.resume.photo = true;
  return { ...data, usage };
}

export async function instructStaged(id, instruction) {
  const text = String(instruction || "").trim().slice(0, 1500);
  if (!text) throw new Error("Write what Claude should change first.");
  const [kind, key] = [id[0], id.slice(2)];
  const { removeLines } = await import("./resume_read.mjs");
  const { renderResumePdf } = await import("./resume_pdf.mjs");
  let current = null, filePath = null, fileName, from = null, v, rec = null;
  if (kind === "o") {
    const file = path.basename(key), src = path.join(DIR, "resumes", file);
    if (!fs.existsSync(src)) throw new Error("That original isn't in your resumes any more.");
    const m = loadMeta()[file] || {};
    current = m.read?.resume || null; filePath = src;
    fileName = /\.pdf$/i.test(file) ? file : file.replace(/\.\w+$/, ".pdf");
    v = (m.history?.length || 0) + 2;
  } else {
    const { reuploadTarget } = await import("./reupload.mjs");
    const t = reuploadTarget(kind, key);
    current = t.versions.at(-1).resume || t.base; rec = t.r || null;
    from = t.versions.at(-1).score ?? null; v = t.versions.at(-1).v + 1;
  }
  const res = await applyInstruction({ current, filePath: current ? null : filePath, instruction: text });
  if (kind !== "o") fileName = neutralName(res.resume.language);
  const token = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, dir = path.join(STAGE, token);
  fs.mkdirSync(dir, { recursive: true });
  const preview = await renderResumePdf(res.resume, path.join(dir, "preview", fileName));
  let score = null;
  if (kind === "t") {
    // Lines Claude can't verify don't count: the score is for the version without them
    const verified = res.unsupported.length ? await renderResumePdf(removeLines(res.resume, res.unsupported.map((u) => u.text)), path.join(dir, "scored", fileName)) : preview;
    const { scoreResumes } = await import("./llm.mjs");
    score = Math.round((await scoreResumes(rec, [{ file: fileName, path: verified }])).resumes[0]?.ats_score ?? 0);
  }
  const p = { token, id, kind, instruction: text, file: "", resume: res.resume, changes: res.changes, unsupported: res.unsupported, preview: rel(preview), fileName,
    from: from != null ? Math.round(from) : null, score, v, done: res.done, soundsLikeRule: !!res.sounds_like_rule, ruleText: res.rule_text || "",
    costUsd: res.usage?.costUsd || 0, at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, "pending.json"), JSON.stringify(p, null, 2));
  return p;
}

// Use this version on an original: the current file moves to the history, the new PDF takes its place
export async function commitOriginal(p, resume, out) {
  const file = path.basename(p.id.slice(2)), target = p.fileName;
  archiveOriginal(file, "Before Claude changed it");
  if (target !== file) { fs.rmSync(path.join(DIR, "resumes", file), { force: true }); }
  fs.copyFileSync(out, path.join(DIR, "resumes", target));
  const meta = loadMeta(), old = meta[file] || {};
  if (target !== file) { meta[target] = old; delete meta[file]; fs.writeFileSync(path.join(DATA, "resumes.json"), JSON.stringify(meta, null, 2)); }
  setOriginalMeta(target, { read: { ...(old.read || {}), resume }, uploadedAt: new Date().toISOString(), currentBy: "claude", currentNote: `Changed by Claude: "${p.instruction}"` });
  return { v: p.v, by: "claude", file: target, path: `resumes/${target}`, at: new Date().toISOString(), note: `Changed by Claude: "${p.instruction}"` };
}
