// Your resume rules (profile.json): standing rules for every tailoring, the neutral file name pattern, and the photo.
// Read by tailoring, ready resumes, re-upload checks, "Ask Claude to change this resume" and the PDF renderer.
import fs from "node:fs";
import path from "node:path";
import { DATA, loadProfile, saveProfile, loadSettings as appSettings } from "./config.mjs";

export const PHOTO_FILE = path.join(DATA, "photo", "photo.jpg");
export const DEFAULT_PATTERN = "{First}_{Last}_CV_{LANG}";
const DEFAULTS = { namePattern: DEFAULT_PATTERN, photoTr: true, photoEn: null, photo: null, noRebuild: [] };

export const loadRules = () => (loadProfile()?.resumeRules || []).filter((r) => r?.text);
export const loadSettings = () => ({ ...DEFAULTS, ...(loadProfile()?.resumeSettings || {}) });
export function saveResumePrefs({ rules, settings }) {
  const p = loadProfile() || {};
  if (rules) p.resumeRules = rules.map((r) => ({ id: r.id || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: String(r.text).trim().slice(0, 300), at: r.at || new Date().toISOString() })).filter((r) => r.text);
  if (settings) p.resumeSettings = { ...loadSettings(), ...settings };
  saveProfile(p);
  return { rules: loadRules(), settings: loadSettings() };
}
export function addRule(text) { return saveResumePrefs({ rules: [...loadRules(), { text }] }); }

// ---------- photo ----------
export const hasPhoto = () => fs.existsSync(PHOTO_FILE);
// true = include, false = leave out, null = not decided yet (English: the app asks you)
export const photoRule = (lang) => !hasPhoto() ? false : lang === "tr" ? loadSettings().photoTr !== false : loadSettings().photoEn ?? null;
// Whether a structured resume shows the photo: the rule when it says include, else what the resume itself says
export const photoFor = (resume) => hasPhoto() && (photoRule(resume?.language) === true || resume?.photo === true);
// After Claude returns a resume: never drop the photo when the rule says include
export function enforcePhoto(resume) {
  if (photoRule(resume.language) === true) resume.photo = true;
  return resume;
}

// ---------- neutral file names ----------
const ascii = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i").replace(/İ/g, "I").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
const cap = (w) => w ? w[0].toLocaleUpperCase("en") + w.slice(1).toLocaleLowerCase("en") : "";
// "{First}_{Last}_CV_{LANG}" -> Emir_Akar_CV_TR.pdf. Only the name and the language: never the job, company, field or a version.
export function neutralName(language, pattern = loadSettings().namePattern, fullName = loadProfile()?.name || "Resume") {
  const words = String(fullName).trim().split(/\s+/).filter(Boolean);
  const first = cap(ascii(words[0] || "Resume")), last = cap(ascii(words.slice(1).join(" ")));
  const lang = (language || "en").toUpperCase();
  const base = String(pattern || DEFAULT_PATTERN).replace(/\{First\}/g, first).replace(/\{Last\}/g, last).replace(/\{Name\}/g, [first, last].filter(Boolean).join("_"))
    .replace(/\{LANG\}/g, lang).replace(/\{lang\}/g, lang.toLowerCase());
  return `${ascii(base).replace(/_+/g, "_") || "Resume"}.pdf`;
}
// Words an employer must not see in a file name; ctx = the job / field the resume was made for
export function revealing(name, ctx = {}) {
  const n = ascii(name).toLowerCase(), hits = [];
  if (/tailor|(^|_)pass_?\d|(^|_)v\d+(_|$)|version|draft|copy/.test(n)) hits.push("a tailoring or version word");
  for (const [what, v] of [["the company", ctx.company], ["the job title", ctx.title], ["the field", ctx.field]]) {
    const words = ascii(v).toLowerCase().split("_").filter((w) => w.length > 3);
    if (words.some((w) => n.split("_").includes(w))) hits.push(what);
  }
  return hits;
}
export const patternProblems = (pattern) => {
  const p = String(pattern || "");
  if (!/\{(First|Last|Name)\}/.test(p)) return ["Add {First} {Last} or {Name}"];
  return revealing(p.replace(/\{\w+\}/g, ""));
};

// ---------- prompt text ----------
export function rulesText() {
  const rules = loadRules(), s = loadSettings();
  const photo = hasPhoto() ? `Photo: the candidate has a photo. Set "photo" to ${s.photoTr !== false ? "true" : "false"} for Turkish resumes and ` +
    `${s.photoEn === true ? "true" : s.photoEn === false ? "false" : "false unless a rule or instruction asks for it"} for English ones.` : "Photo: none on file; set \"photo\" to false.";
  return [rules.length ? `The candidate's standing resume rules. Follow every one that applies; when a change follows a rule, put that rule's text in the change's "rule" field:\n${rules.map((r) => `- ${r.text}`).join("\n")}` : "",
    photo].filter(Boolean).join("\n");
}

// ---------- what the rules card shows ----------
const SKIP = new Set(["applied", "closed", "not_selected", "filtered", "skipped_by_user"]);
// Unsent tailored resumes the "Re-tailor with your rules" action would redo
export const retailorable = (tail) => tail.filter((t) => t.status !== "sent" && !t.job.archived && !SKIP.has(t.job.status));
// Claude's API-price estimate per tailoring call, from past runs (shown as an estimate, never a bill)
function costPerCall() {
  const dir = path.join(DATA, "runs");
  let cost = 0, calls = 0;
  try {
    for (const f of fs.readdirSync(dir).filter((f) => /^\d{4}-.*\.json$/.test(f))) {
      const u = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).usage?.tailor;
      if (u) { cost += u.costUsd || 0; calls += u.calls || 0; }
    }
  } catch {}
  return calls ? cost / calls : null;
}

export function prefsView(tail = [], readies = []) {
  const s = loadSettings(), lang = (x) => x.language || "en";
  // Unsent files whose name isn't the pattern's (sent ones keep the name they were sent under)
  const rename = [...tail.filter((t) => t.status !== "sent" && path.basename(t.path) !== neutralName(lang(t))), ...readies.filter((r) => path.basename(r.path) !== neutralName(lang(r)))];
  const redo = retailorable(tail), per = costPerCall(), passes = Math.max(1, Number(appSettings().tailorMaxPasses) || 2);
  return { rules: loadRules(), settings: { ...s, photo: undefined }, hasPhoto: hasPhoto(), photoAt: s.photo?.at || null, photoSource: s.photo?.source || null,
    preview: { tr: neutralName("tr"), en: neutralName("en") }, patternProblems: patternProblems(s.namePattern),
    renameCount: rename.length, retailor: { count: redo.length, ids: redo.map((t) => t.id), calls: redo.length * passes * 2, estimateUsd: per != null ? +(redo.length * passes * 2 * per).toFixed(2) : null } };
}
