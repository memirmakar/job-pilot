// Records (one JSON per job), the activity log (CSV), run status for the app, usage tracking and notifications.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DIR, DATA } from "./config.mjs";

export const LOG_FILE = path.join(DIR, "applications.csv");
export const RECORDS_DIR = path.join(DATA, "applications");
export const RUNS_DIR = path.join(DATA, "runs");
export const STATUS_FILE = path.join(RUNS_DIR, "current.json");
fs.mkdirSync(RECORDS_DIR, { recursive: true });
fs.mkdirSync(RUNS_DIR, { recursive: true });

const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };

// ---------- records ----------
export const recordPath = (site, id) => path.join(RECORDS_DIR, `${site}-${id}.json`);
export const loadRecord = (site, id) => readJson(recordPath(site, id));
export function loadAllRecords() {
  return fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(RECORDS_DIR, f))).filter(Boolean);
}
export function saveRecord(rec) {
  rec.updatedAt = new Date().toISOString();
  fs.writeFileSync(recordPath(rec.site, rec.id), JSON.stringify(rec, null, 2));
}
export function finish(rec, status, reason) {
  rec.status = status;
  if (reason) rec.statusReason = reason;
  saveRecord(rec);
  writeLog({ ...rec, reason });
  return status;
}

// ---------- activity log ----------
export function readLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").slice(1).map((line) => {
    const [date, site, status, id, title, company, url, reason] = line.split("\t");
    return { date, site, status, id, title, company, url, reason };
  });
}
export function writeLog(row) {
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "date\tsite\tstatus\tid\ttitle\tcompany\turl\treason\n");
  const clean = (s) => String(s ?? "").replace(/[\t\n\r]+/g, " ").trim();
  fs.appendFileSync(LOG_FILE, [new Date().toISOString(), row.site, row.status, row.id, row.title, row.company, row.url, row.reason].map(clean).join("\t") + "\n");
  log(`  -> ${row.status.toUpperCase()}: ${row.title} @ ${row.company}${row.reason ? ` (${row.reason})` : ""}`);
}
const localDay = (d) => new Date(d).toDateString();
export const appliedToday = () => readLog().filter((r) => r.status === "applied" && localDay(r.date) === localDay(Date.now())).length;
// Jobs analyzed today (picked by Claude and processed), across runs
export const analyzedToday = () => loadAllRecords().filter((r) => r.createdAt && localDay(r.createdAt) === localDay(Date.now())).length;

// ---------- usage ----------
export function addUsage(rec, u) {
  if (!u) return;
  const t = (rec.usage ||= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 });
  t.costUsd += u.costUsd || 0;
  t.input += u.input_tokens || 0;
  t.output += u.output_tokens || 0;
  t.cacheRead += u.cache_read_input_tokens || 0;
  t.cacheWrite += u.cache_creation_input_tokens || 0;
}

// ---------- run status (read by the app while a run is going) ----------
let current = null;
export function startRun(kind, opts = {}) {
  current = { id: new Date().toISOString().replace(/[:.]/g, "-"), kind, opts, startedAt: new Date().toISOString(), phase: "starting", counts: {}, events: [], anomalies: [], pid: process.pid };
  writeStatus();
  return current;
}
export function setPhase(phase, detail = "") { if (!current) return; current.phase = phase; current.detail = detail; writeStatus(); }
export function count(key, n = 1) { if (!current) return; current.counts[key] = (current.counts[key] || 0) + n; writeStatus(); }
export function anomaly(kind, detail) { if (!current) return; current.anomalies.push({ kind, detail, at: new Date().toISOString() }); log(`  ! ${kind}: ${detail}`); writeStatus(); }
export function endRun(outcome) {
  if (!current) return null;
  Object.assign(current, { endedAt: new Date().toISOString(), phase: "done", outcome });
  fs.writeFileSync(path.join(RUNS_DIR, `${current.id}.json`), JSON.stringify(current, null, 2));
  writeStatus();
  const r = current; current = null; return r;
}
function writeStatus() { fs.writeFileSync(STATUS_FILE, JSON.stringify(current, null, 2)); }
export function log(line) {
  console.log(line);
  if (current) { current.events.push({ at: new Date().toISOString(), line: String(line).trim() }); current.events = current.events.slice(-200); writeStatus(); }
}

// ---------- notifications ----------
export function notify(title, text) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;` +
    `$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);` +
    `$x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode('${esc(title)}')) > $null; $x.Item(1).AppendChild($t.CreateTextNode('${esc(text)}')) > $null;` +
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
  spawn("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "ignore", windowsHide: true });
}
