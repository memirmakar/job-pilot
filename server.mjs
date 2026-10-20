// The Job Pilot app: a local web server (http://127.0.0.1:4510) for onboarding, settings, running and reviewing everything.
// Started by the desktop shortcut (launch.vbs). Long jobs (runs, library, doctor) run as separate processes.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { DIR, DATA, loadSettings, loadProfile, saveSettings, saveProfile, isOnboarded, DEFAULT_SETTINGS } from "./config.mjs";

const PORT = Number(process.env.PORT) || 4510;
const RECORDS_DIR = path.join(DATA, "applications");
const RUNS_DIR = path.join(DATA, "runs");
const TASK_NAME = "Job Pilot daily run";
fs.mkdirSync(RUNS_DIR, { recursive: true });
fs.mkdirSync(path.join(DIR, "resumes"), { recursive: true });

const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Fresh imports each time, so settings/profile changes made in the app are picked up without a restart
const fresh = (m) => import(`./${m}?t=${Date.now()}`);

// ---------- background tasks (run, library, review, doctor, login) ----------
const tasks = {}; // name -> { pid, startedAt, log }
function startTask(name, args) {
  if (tasks[name] && alive(tasks[name].pid)) throw new Error(`${name} is already running`);
  const logFile = path.join(RUNS_DIR, `${name}-${Date.now()}.log`);
  const out = fs.openSync(logFile, "a");
  const p = spawn(process.execPath, [path.join(DIR, "apply.mjs"), ...args], { cwd: DIR, stdio: ["ignore", out, out], windowsHide: true, detached: true });
  p.unref();
  tasks[name] = { pid: p.pid, startedAt: new Date().toISOString(), log: path.relative(DIR, logFile) };
  return tasks[name];
}
function taskStatus() {
  const s = {};
  for (const [k, t] of Object.entries(tasks)) s[k] = { ...t, running: alive(t.pid), tail: tail(path.join(DIR, t.log)) };
  return s;
}
const tail = (f, n = 25) => { try { return fs.readFileSync(f, "utf8").split("\n").slice(-n).join("\n"); } catch { return ""; } };
function runState() {
  const cur = readJson(path.join(RUNS_DIR, "current.json"));
  const running = !!cur && cur.phase !== "done" && alive(cur.pid);
  return { running, current: cur };
}

// ---------- Windows scheduled task ----------
function ps(script) {
  return new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true },
    (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()))));
}
async function applySchedule({ scheduleEnabled, scheduleTime }) {
  await ps(`Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'Job Auto-Apply (LinkedIn)' -Confirm:$false -ErrorAction SilentlyContinue`);
  if (!scheduleEnabled) return "disabled";
  const vbs = path.join(DIR, "launch.vbs");
  await ps(`$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '"${vbs}" run' -WorkingDirectory '${DIR}';` +
    `$t = New-ScheduledTaskTrigger -Daily -At '${scheduleTime}';` +
    `$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3);` +
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $a -Trigger $t -Settings $s -Description 'Job Pilot: daily job search, analysis and applications' | Out-Null`);
  return "enabled";
}
async function scheduleInfo() {
  try {
    const out = await ps(`$t = Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction Stop; $i = $t | Get-ScheduledTaskInfo; "$($t.State)|$($i.NextRunTime)|$($i.LastRunTime)"`);
    const [state, next, last] = out.split("|");
    return { exists: true, state, next, last };
  } catch { return { exists: false }; }
}

// ---------- Claude CLI ----------
async function claudeInfo() {
  const { findClaude } = await fresh("llm.mjs");
  const p = findClaude();
  if (!p) return { found: false };
  return new Promise((resolve) => {
    const c = spawn(p, ["-p", "Reply with OK", "--output-format", "json", "--no-session-persistence", "--model", "haiku", "--tools", ""], { windowsHide: true });
    let out = ""; c.stdout.on("data", (d) => (out += d));
    const timer = setTimeout(() => { c.kill(); resolve({ found: true, path: p, loggedIn: null, note: "check timed out" }); }, 60e3);
    c.on("close", () => {
      clearTimeout(timer);
      try { const r = JSON.parse(out); resolve({ found: true, path: p, loggedIn: !r.is_error, note: r.is_error ? String(r.result).slice(0, 120) : "" }); }
      catch { resolve({ found: true, path: p, loggedIn: false, note: out.slice(0, 120) }); }
    });
    c.stdin?.end();
  });
}
let claudeCache = null;

// ---------- data for the UI ----------
function records() {
  if (!fs.existsSync(RECORDS_DIR)) return [];
  return fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(RECORDS_DIR, f))).filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
function logRows() {
  const f = path.join(DIR, "applications.csv");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").slice(1).map((l) => {
    const [date, site, status, id, title, company, url, reason] = l.split("\t");
    return { date, site, status, id, title, company, url, reason: reason || "" };
  }).reverse();
}
const resumes = () => fs.readdirSync(path.join(DIR, "resumes")).filter((f) => /\.(pdf|txt|md)$/i.test(f))
  .map((f) => ({ file: f, size: fs.statSync(path.join(DIR, "resumes", f)).size, path: `resumes/${f}` }));

// ---------- HTTP ----------
const send = (res, code, type, body) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };
const json = (res, data, code = 200) => send(res, code, "application/json", JSON.stringify(data));
const body = (req) => new Promise((resolve, reject) => {
  let b = ""; req.on("data", (d) => { b += d; if (b.length > 40e6) req.destroy(); });
  req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
});

// The UI: plain files under ui/ (native ES modules, no build step)
const UI_DIR = path.join(DIR, "ui");
const MIME = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
function uiFile(res, pathname) {
  let file; try { file = path.resolve(UI_DIR, "." + decodeURIComponent(pathname)); } catch { return false; }
  if (!file.startsWith(UI_DIR + path.sep) || !MIME[path.extname(file)] || !fs.existsSync(file)) return false;
  send(res, 200, MIME[path.extname(file)], fs.readFileSync(file));
  return true;
}

const routes = {
  "GET /": (req, res) => send(res, 200, "text/html; charset=utf-8", fs.readFileSync(path.join(UI_DIR, "index.html"))),
  "GET /api/state": async (req, res, url) => {
    if (!claudeCache || url.searchParams.has("recheck")) claudeCache = await claudeInfo();
    json(res, {
      onboarded: isOnboarded(), settings: loadSettings(), defaults: DEFAULT_SETTINGS, profile: loadProfile(),
      claude: claudeCache, linkedinProfile: fs.existsSync(path.join(DIR, "browser_profile")),
      schedule: await scheduleInfo(), run: runState(), tasks: taskStatus(), resumes: resumes(),
    });
  },
  "GET /api/applications": (req, res) => json(res, records()),
  "GET /api/log": (req, res) => json(res, logRows()),
  "GET /api/meta": (req, res) => { const s = loadSettings(); json(res, { minAtsScore: s.minAtsScore, tailorTarget: s.tailorTarget, dailyLimit: s.dailyApplyLimit, dailyJobs: s.dailyJobs }); },
  "GET /api/market": async (req, res) => {
    const { computeStats, loadRecords, loadAudit } = await fresh("market.mjs");
    json(res, {
      market: readJson(path.join(DATA, "market", "review.json")), done: readJson(path.join(DATA, "market", "todo_state.json"), {}),
      audit: readJson(path.join(DATA, "market", "keyword_audit.json"), { entries: {} }).entries, stats: computeStats(loadRecords(), loadAudit()),
    });
  },
  "GET /api/github": (req, res) => {
    const repos = readJson(path.join(DATA, "github", "repos.json"));
    const reviews = readJson(path.join(DATA, "github", "review.json"), {});
    json(res, { user: repos?.user, fetchedAt: repos?.fetchedAt, repos: (repos?.repos || []).map(({ readme, files, ...r }) => ({ ...r, review: reviews[r.name] || null })) });
  },
  "GET /api/library": async (req, res) => { const L = await fresh("library.mjs"); json(res, { entries: L.libraryEntries(), due: L.libraryDue() }); },
  "GET /api/doctor": async (req, res) => { const D = await fresh("doctor.mjs"); json(res, D.doctorReports()); },
  "GET /api/runs": (req, res) => json(res, fs.readdirSync(RUNS_DIR).filter((f) => /^\d{4}-.*\.json$/.test(f)).sort().reverse().slice(0, 30).map((f) => {
    const r = readJson(path.join(RUNS_DIR, f)); if (r) delete r.events; return r;
  }).filter(Boolean)),
  "GET /pdf": (req, res, url) => {
    const file = path.resolve(DIR, url.searchParams.get("p") || "");
    const allowed = ["resumes", path.join("data", "tailored"), path.join("data", "library")].map((d) => path.join(DIR, d) + path.sep);
    if (!file.toLowerCase().endsWith(".pdf") || !allowed.some((a) => file.startsWith(a)) || !fs.existsSync(file)) return send(res, 404, "text/plain", "Not found");
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `${url.searchParams.has("dl") ? "attachment" : "inline"}; filename="${path.basename(file)}"` });
    res.end(fs.readFileSync(file));
  },

  // ----- onboarding -----
  "POST /api/resumes": async (req, res) => {
    const { files = [] } = await body(req);
    for (const f of files) {
      const name = path.basename(String(f.name)).replace(/[<>:"/\\|?*]/g, "_");
      if (!/\.(pdf|txt|md)$/i.test(name)) continue;
      fs.writeFileSync(path.join(DIR, "resumes", name), Buffer.from(f.data, "base64"));
    }
    json(res, resumes());
  },
  "POST /api/resumes/delete": async (req, res) => {
    const { file } = await body(req);
    const p = path.join(DIR, "resumes", path.basename(String(file)));
    if (fs.existsSync(p)) fs.renameSync(p, path.join(DATA, `removed-${Date.now()}-${path.basename(p)}`)); // kept, not deleted
    json(res, resumes());
  },
  "POST /api/onboarding/plan": async (req, res) => {
    const b = await body(req);
    const { planTargets, loadResumes } = await fresh("llm.mjs");
    try { json(res, await planTargets({ goals: b.goals, locations: b.locations || [], workplace: b.workplace || [], seniority: b.seniority, extra: b.extra, resumes: loadResumes() })); }
    catch (e) { json(res, { error: e.message }, 500); }
  },
  "POST /api/onboarding/save": async (req, res) => {
    const b = await body(req);
    const prev = loadProfile() || {};
    saveProfile({ ...prev, ...b.profile, onboardedAt: prev.onboardedAt || new Date().toISOString() });
    const s = saveSettings(b.settings || {});
    let schedule = "";
    try { schedule = await applySchedule(s); } catch (e) { schedule = `failed: ${e.message}`; }
    try { startTask("library", ["library"]); } catch {}
    json(res, { ok: true, schedule });
  },
  "POST /api/profile": async (req, res) => { const b = await body(req); json(res, saveProfile({ ...(loadProfile() || {}), ...b })); },
  "POST /api/settings": async (req, res) => {
    const b = await body(req);
    const before = loadSettings();
    const s = saveSettings(b);
    let schedule = null;
    if (s.scheduleEnabled !== before.scheduleEnabled || s.scheduleTime !== before.scheduleTime || b.reapplySchedule) {
      try { schedule = await applySchedule(s); } catch (e) { schedule = `failed: ${e.message}`; }
    }
    json(res, { settings: s, schedule });
  },

  // ----- actions -----
  "POST /api/run": async (req, res) => {
    const b = await body(req);
    if (runState().running) return json(res, { error: "A run is already in progress" }, 409);
    try { json(res, startTask("run", ["run", ...(b.dryRun ? ["--dry-run"] : []), ...(b.limit ? ["--limit", String(b.limit)] : [])])); }
    catch (e) { json(res, { error: e.message }, 409); }
  },
  "POST /api/run/stop": (req, res) => {
    const { current } = runState();
    for (const pid of [current?.pid, tasks.run?.pid].filter(Boolean)) { try { process.kill(pid); } catch {} }
    json(res, { ok: true });
  },
  "POST /api/task": async (req, res) => {
    const { name } = await body(req);
    const map = { library: ["library"], review: ["review"], github: ["github", "--refresh"], selftest: ["selftest"] };
    if (!map[name]) return json(res, { error: "unknown task" }, 400);
    try { json(res, startTask(name, map[name])); } catch (e) { json(res, { error: e.message }, 409); }
  },
  "POST /api/doctor": async (req, res) => {
    const { problem } = await body(req);
    try { json(res, startTask("doctor", ["doctor", problem || "The user asked for a check-up from the app"])); } catch (e) { json(res, { error: e.message }, 409); }
  },
  "POST /api/doctor/restore": async (req, res) => {
    const { id } = await body(req);
    const D = await fresh("doctor.mjs");
    try { D.restoreBackup(id); json(res, { ok: true }); } catch (e) { json(res, { error: e.message }, 400); }
  },
  "POST /api/login/linkedin": (req, res) => { try { json(res, startTask("login", ["login"])); } catch (e) { json(res, { error: e.message }, 409); } },
  "POST /api/login/claude": async (req, res) => {
    const { findClaude } = await fresh("llm.mjs");
    const p = findClaude();
    if (!p) return json(res, { error: "Claude Code CLI not found" }, 404);
    // A terminal window is the only way to do Claude's interactive login; the user types /login there.
    spawn("cmd.exe", ["/c", "start", "Claude login", "cmd", "/k", `echo Type /login and follow the steps, then close this window. & "${p}"`], { detached: true, stdio: "ignore" }).unref();
    claudeCache = null;
    json(res, { ok: true });
  },
  "POST /api/todo": async (req, res) => {
    const { title, done } = await body(req);
    const f = path.join(DATA, "market", "todo_state.json");
    const state = readJson(f, {});
    if (done) state[title] = new Date().toISOString(); else delete state[title];
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(state, null, 2));
    json(res, state);
  },
  "POST /api/archive": async (req, res) => {
    // Manually archive/unarchive a job (nothing is deleted)
    const { site, id, archived } = await body(req);
    const f = path.join(RECORDS_DIR, `${site}-${id}.json`);
    const r = readJson(f);
    if (!r) return json(res, { error: "not found" }, 404);
    r.archived = archived ? { at: new Date().toISOString(), reason: "Archived by you" } : undefined;
    fs.writeFileSync(f, JSON.stringify(r, null, 2));
    json(res, { ok: true });
  },
  // ----- Ask Claude about a job (conversations.mjs) -----
  "GET /api/conversation": async (req, res, url) => {
    const C = await fresh("conversations.mjs");
    json(res, C.loadConversation(url.searchParams.get("site"), url.searchParams.get("id")));
  },
  "POST /api/ask": async (req, res) => {
    const { site, id, message } = await body(req);
    const rec = readJson(path.join(RECORDS_DIR, `${path.basename(String(site))}-${path.basename(String(id))}.json`));
    if (!rec) return json(res, { error: "Job not found" }, 404);
    if (!String(message || "").trim()) return json(res, { error: "Type a question first" }, 400);
    const C = await fresh("conversations.mjs");
    json(res, await C.askAboutJob(rec, String(message).trim().slice(0, 4000)));
  },
  "POST /api/quit":(req, res) => { json(res, { ok: true }); setTimeout(() => process.exit(0), 300); },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const h = routes[`${req.method} ${url.pathname}`];
  if (!h) return (req.method === "GET" && uiFile(res, url.pathname)) || send(res, 404, "text/plain", "Not found");
  try { await h(req, res, url); } catch (e) { json(res, { error: e.message }, 500); }
});
server.on("error", (e) => {
  // Already running: just open it
  if (e.code === "EADDRINUSE") { if (!process.argv.includes("--no-open")) open(); setTimeout(() => process.exit(0), 500); }
  else throw e;
});
const open = () => spawn("cmd", ["/c", "start", "", `http://127.0.0.1:${PORT}`], { stdio: "ignore", detached: true }).unref();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Job Pilot running at http://127.0.0.1:${PORT}`);
  if (!process.argv.includes("--no-open")) open();
});
