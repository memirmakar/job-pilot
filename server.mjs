// The Job Pilot app: a local web server (http://127.0.0.1:4510) for onboarding, settings, running and reviewing everything.
// Started by the desktop shortcut (launch.vbs). Long jobs (runs, library, doctor) run as separate processes.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DIR, DATA, loadSettings, loadProfile, isOnboarded, DEFAULT_SETTINGS } from "./config.mjs";
import { resumeRoutes } from "./resume_routes.mjs";
import { statusRoutes } from "./status_routes.mjs";
import { insightsRoutes } from "./insights_routes.mjs";
import { activityRoutes } from "./activity_routes.mjs";
import { coachRoutes } from "./coach_routes.mjs";
import { settingsRoutes, scheduleInfo, onboardingProgress } from "./settings_routes.mjs";
import { remoteInfo, startRemote } from "./remote_access.mjs";
import { stage } from "./reupload.mjs";
import { archiveOriginal } from "./resumes.mjs";

const PORT = Number(process.env.PORT) || 4510;
const RECORDS_DIR = path.join(DATA, "applications");
const RUNS_DIR = path.join(DATA, "runs");
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
      onboarded: isOnboarded(), settings: loadSettings(), defaults: DEFAULT_SETTINGS, profile: loadProfile(), onboarding: onboardingProgress(), dir: DIR,
      claude: claudeCache, linkedinProfile: fs.existsSync(path.join(DIR, "browser_profile")),
      schedule: await scheduleInfo(), remote: await remoteInfo(), run: runState(), tasks: taskStatus(), resumes: resumes(),
    });
  },
  "GET /api/applications": (req, res) => json(res, records()),
  "GET /api/log": (req, res) => json(res, logRows()),
  "GET /api/meta": (req, res) => { const s = loadSettings(); json(res, { minAtsScore: s.minAtsScore, tailorTarget: s.tailorTarget, dailyLimit: s.dailyApplyLimit, dailyJobs: s.dailyJobs, applyMode: s.applyMode, noReplyDays: s.noReplyDays }); },
  "GET /api/market": async (req, res) => {
    const { computeStats, loadRecords, loadAudit } = await fresh("market.mjs");
    json(res, {
      market: readJson(path.join(DATA, "market", "review.json")),
      audit: readJson(path.join(DATA, "market", "keyword_audit.json"), { entries: {} }).entries, stats: computeStats(loadRecords(), loadAudit()),
    });
  },
  "GET /api/github": (req, res) => {
    const repos = readJson(path.join(DATA, "github", "repos.json"));
    const reviews = readJson(path.join(DATA, "github", "review.json"), {});
    json(res, { user: repos?.user, fetchedAt: repos?.fetchedAt, repos: (repos?.repos || []).map(({ readme, files, ...r }) => ({ ...r, review: reviews[r.name] || null })) });
  },
  "GET /api/library": async (req, res) => { const L = await fresh("library.mjs"); json(res, { entries: L.libraryEntries(), due: L.libraryDue() }); },
  "GET /api/runs": (req, res) => json(res, fs.readdirSync(RUNS_DIR).filter((f) => /^\d{4}-.*\.json$/.test(f)).sort().reverse().slice(0, 30).map((f) => {
    const r = readJson(path.join(RUNS_DIR, f)); if (r) delete r.events; return r;
  }).filter(Boolean)),
  "GET /pdf": async (req, res, url) => {
    const file = path.resolve(DIR, url.searchParams.get("p") || "");
    const allowed = ["resumes", ...["tailored", "library", "resumes_history", "staging"].map((d) => path.join("data", d))].map((d) => path.join(DIR, d) + path.sep);
    if (!file.toLowerCase().endsWith(".pdf") || !allowed.some((a) => file.startsWith(a)) || !fs.existsSync(file)) return send(res, 404, "text/plain", "Not found");
    // Downloads get the neutral name employers see (Resumes > Your resume rules), whatever the file is called on disk
    const dl = url.searchParams.has("dl"), name = dl ? (await fresh("resumes.mjs")).downloadName(path.relative(DIR, file)) : path.basename(file);
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${name}"` });
    res.end(fs.readFileSync(file));
  },

  // ----- onboarding -----
  "POST /api/resumes": async (req, res) => {
    const { files = [], stage: staged } = await body(req);
    // stage: kept in data/staging until the Resumes screen's "Add original"
    if (staged) { try { return json(res, files.map((f) => stage(f.name, f.data))); } catch (e) { return json(res, { error: e.message }, 400); } }
    for (const f of files) {
      const name = path.basename(String(f.name)).replace(/[<>:"/\\|?*]/g, "_");
      if (!/\.(pdf|txt|md)$/i.test(name)) continue;
      archiveOriginal(name); // a same-name upload is a new version: the old file goes to the history first
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
    const map = { library: ["library"], review: ["review"], github: ["github", "--refresh"], selftest: ["selftest"], todo: ["todo"], retailor: ["retailor"] };
    if (!map[name]) return json(res, { error: "unknown task" }, 400);
    try { json(res, startTask(name, map[name])); } catch (e) { json(res, { error: e.message }, 409); }
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

Object.assign(routes, resumeRoutes({ body, json }), statusRoutes({ body, json, startTask, running: () => runState().running }), insightsRoutes({ body, json }),
  activityRoutes({ body, json, startTask, browserBusy: () => runState().running || !!(tasks.login && alive(tasks.login.pid)) }),
  coachRoutes({ body, json, running: () => runState().running }),
  settingsRoutes({ body, json, send, startTask, running: () => runState().running || Object.values(tasks).some((t) => alive(t.pid)) }));

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
  startRemote();
});
