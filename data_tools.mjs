// Settings > Data and privacy: export everything Job Pilot stored as one ZIP (docx.mjs zip, Node zlib only), and
// "Delete my data", which writes that ZIP to backups/ first. The LinkedIn browser profile is never exported (it's a
// signed-in session); deleting removes it, which signs Job Pilot out of LinkedIn.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA } from "./config.mjs";
import { zip } from "./docx.mjs";

const BACKUPS = path.join(DIR, "backups");
// What "my data" is, relative to the app folder
const PARTS = ["data", "resumes", "applications.csv"];

function walk(abs, rel, out) {
  if (!fs.existsSync(abs)) return out;
  if (fs.statSync(abs).isFile()) { out[rel] = fs.readFileSync(abs); return out; }
  for (const f of fs.readdirSync(abs)) walk(path.join(abs, f), `${rel}/${f}`, out);
  return out;
}
export const exportZip = () => zip(PARTS.reduce((o, p) => walk(path.join(DIR, p), p, o), {}));
export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

// Backup first; anything that can't be removed (e.g. Edge still open on the LinkedIn profile) is listed, not hidden
export function deleteAll() {
  fs.mkdirSync(BACKUPS, { recursive: true });
  const backup = path.join(BACKUPS, `job-pilot-${stamp()}.zip`);
  fs.writeFileSync(backup, exportZip());
  const failed = [];
  const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { failed.push(path.relative(DIR, p)); } };
  for (const f of fs.existsSync(DATA) ? fs.readdirSync(DATA) : []) rm(path.join(DATA, f));
  for (const f of fs.existsSync(path.join(DIR, "resumes")) ? fs.readdirSync(path.join(DIR, "resumes")) : []) rm(path.join(DIR, "resumes", f));
  rm(path.join(DIR, "applications.csv"));
  rm(path.join(DIR, "browser_profile"));
  fs.mkdirSync(path.join(DATA, "runs"), { recursive: true });
  return { backup: path.relative(DIR, backup), failed };
}
