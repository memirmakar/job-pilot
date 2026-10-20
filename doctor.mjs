// The doctor: when something goes wrong (no jobs found, LinkedIn layout changed, install failed...), Claude diagnoses it and may
// fix settings or the app's own code. Every app file is backed up first; if a fix breaks syntax it's rolled back automatically.
// Reports (what was wrong, what changed) are saved to data/doctor/ and shown in the app, with a one-click restore.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { DIR, DATA } from "./config.mjs";
import { ask } from "./llm.mjs";

const DOC_DIR = path.join(DATA, "doctor");
const BACKUPS = path.join(DOC_DIR, "backups");
// What the doctor may change (and what gets backed up). User data (records, resumes, tailored PDFs) is never touched.
const walkFiles = (d) => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkFiles(path.join(d, e.name)) : [path.join(d, e.name)]);
const UI_FILES = () => walkFiles(path.join(DIR, "ui")).map((f) => path.relative(DIR, f));
const APP_FILES = () => [
  ...fs.readdirSync(DIR).filter((f) => /\.(mjs|html|cmd|ps1|vbs|json)$/i.test(f) && !/^package-lock/.test(f)),
  ...UI_FILES(),
  "data/settings.json", "data/profile.json",
].filter((f) => fs.existsSync(path.join(DIR, f)));

const hash = (f) => { try { return crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex"); } catch { return null; } };

function backup(id) {
  const dest = path.join(BACKUPS, id);
  for (const f of APP_FILES()) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(path.join(DIR, f), path.join(dest, f));
  }
  return dest;
}
export function restoreBackup(id) {
  const src = path.join(BACKUPS, id);
  if (!fs.existsSync(src)) throw new Error(`No backup ${id}`);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(src)) fs.copyFileSync(f, path.join(DIR, path.relative(src, f)));
  return true;
}
const syntaxErrors = () => [...fs.readdirSync(DIR).filter((f) => f.endsWith(".mjs")), ...UI_FILES().filter((f) => f.endsWith(".js"))].flatMap((f) => {
  try { execFileSync(process.execPath, ["--check", path.join(DIR, f)], { stdio: "pipe" }); return []; }
  catch (e) { return [`${f}: ${String(e.stderr || e.message).split("\n").slice(0, 3).join(" ")}`]; }
});

const DoctorSchema = {
  type: "object", additionalProperties: false, required: ["diagnosis", "actions", "fixed", "needs_user", "retry_run"],
  properties: {
    diagnosis: { type: "string", description: "What went wrong and why, in plain language (2-5 short '- ' bullet lines)" },
    actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["file", "change"], properties: { file: { type: "string" }, change: { type: "string" } } } },
    fixed: { type: "boolean", description: "True only if you verified the fix (e.g. selftest passes)" },
    needs_user: { type: "string", description: "What the user must do themselves, if anything (e.g. 'Log in to LinkedIn from the app'). Empty if nothing." },
    retry_run: { type: "boolean", description: "Whether the app should retry today's run now" },
  },
};

const SYSTEM = `You are the maintenance engineer for "Job Pilot", a local Node.js app (Windows) that searches LinkedIn with Playwright,
uses the Claude Code CLI to analyze jobs and tailor resumes, and serves a dashboard. Something went wrong; find out why and fix it.

App map (all in the current directory):
- config.mjs (settings/profile loader; user data in data/settings.json and data/profile.json)
- linkedin.mjs (all LinkedIn DOM logic: search cards, job page, Easy Apply form, text patterns in LI)
- pipeline.mjs (daily run), store.mjs (records/log/run status), llm.mjs (Claude calls), library.mjs, market.mjs, github.mjs, resume_pdf.mjs
- easy_apply.mjs (Easy Apply form: submit, hold, send approved), linkedin_guard.mjs (signed-out / limit page checks), applied_sync.mjs (LinkedIn job tracker reader), approval.mjs + statuses.mjs (Waiting for your OK, status history)
- activity.mjs, doctor_checks.mjs, activity_routes.mjs (Activity and Doctor screen data, read only)
- server.mjs + ui/ (the app: ui/index.html, ui/js/**/*.js ES modules, ui/styles/*.css; see CLAUDE.md), apply.mjs (command line entry), Install.cmd / install.ps1 (installer)
- Logs: data/runs/current.json and data/runs/*.json (run status, events, anomalies), data/install.log, applications.csv

Rules:
- Make the smallest change that fixes the cause. Prefer settings (data/settings.json, data/profile.json search terms/locations) over code when that's the cause.
- When LinkedIn's layout or wording changed, update the selectors/patterns in linkedin.mjs; check the live page with a small node script using
  the existing helpers (e.g. node apply.mjs selftest) rather than guessing.
- Verify: run "node --check <file>" on every file you edit, then "node apply.mjs selftest".
- Never delete or modify job records, resumes, tailored PDFs or the browser profile. Never change the user's profile facts or goals.
- Never add anti-bot evasion, stealth plugins or CAPTCHA solving. If LinkedIn blocks the session, report it in needs_user.
- If the problem needs the user (e.g. LinkedIn or Claude login), say exactly what to click in needs_user.
Reply only with the structured result.`;

export async function runDoctor({ reason, context = "" }) {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(DOC_DIR, { recursive: true });
  const backupDir = backup(id);
  const before = Object.fromEntries(APP_FILES().map((f) => [f, hash(path.join(DIR, f))]));
  const report = { id, startedAt: new Date().toISOString(), reason, context: context.slice(0, 4000), backup: path.relative(DIR, backupDir) };
  try {
    const { data, usage } = await ask({
      system: SYSTEM,
      prompt: `Problem: ${reason}\n\nContext:\n${context || "(none)"}`,
      schema: DoctorSchema, weekly: true, timeoutMs: 20 * 60e3,
      tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash(node:*)", "Bash(npm.cmd:*)", "Bash(npm:*)"],
    });
    Object.assign(report, data, { usage: { costUsd: usage?.costUsd || 0 } });
  } catch (e) {
    Object.assign(report, { diagnosis: `- The doctor couldn't run: **${e.message}**`, actions: [], fixed: false, needs_user: "", retry_run: false, error: e.message });
  }
  report.changedFiles = APP_FILES().filter((f) => hash(path.join(DIR, f)) !== before[f]);
  const broken = syntaxErrors();
  if (broken.length) {
    restoreBackup(id);
    Object.assign(report, { fixed: false, retry_run: false, rolledBack: true, rollbackReason: `Syntax errors after the fix, so all changes were undone: ${broken.join(" | ")}` });
  }
  report.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(DOC_DIR, `${id}.json`), JSON.stringify(report, null, 2));
  return report;
}

export function doctorReports() {
  if (!fs.existsSync(DOC_DIR)) return [];
  return fs.readdirSync(DOC_DIR).filter((f) => f.endsWith(".json")).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DOC_DIR, f), "utf8")); } catch { return null; } })
    .filter((r) => r?.id).sort((a, b) => b.id.localeCompare(a.id));
}

// How many files the backup before a report holds (shown in the fix history)
export const backupCount = (id) => walkFiles(path.join(BACKUPS, path.basename(String(id)))).length;

// Undo one report's fix: put back only the files it changed, from the backup made before it (files the fix created are
// moved to backups/<id>-undone/, never deleted). Marks the report undone; a syntax error afterwards is reported, not hidden.
export function undoReport(id) {
  const f = path.join(DOC_DIR, `${path.basename(String(id))}.json`), rep = JSON.parse(fs.readFileSync(f, "utf8"));
  if (rep.undoneAt) throw new Error("These changes were already undone");
  if (rep.rolledBack || !rep.changedFiles?.length) throw new Error("This report changed no files");
  const src = path.join(BACKUPS, rep.id), aside = path.join(BACKUPS, `${rep.id}-undone`);
  if (!fs.existsSync(src)) throw new Error("The backup for this fix is missing");
  const done = [];
  for (const file of rep.changedFiles) {
    const from = path.join(src, file), to = path.resolve(DIR, file);
    if (!to.startsWith(DIR + path.sep)) continue;
    if (fs.existsSync(from)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); done.push(file); }
    else if (fs.existsSync(to)) { fs.mkdirSync(path.dirname(path.join(aside, file)), { recursive: true }); fs.renameSync(to, path.join(aside, file)); done.push(file); }
  }
  Object.assign(rep, { undoneAt: new Date().toISOString(), undoneFiles: done, undoErrors: syntaxErrors() });
  fs.writeFileSync(f, JSON.stringify(rep, null, 2));
  return rep;
}

// The automatic doctor runs at most once per day per problem kind, so a persistent issue doesn't burn usage.
export function shouldAutoRun(kind) {
  const today = new Date().toDateString();
  return !doctorReports().some((r) => new Date(r.startedAt).toDateString() === today && String(r.reason).startsWith(kind));
}
