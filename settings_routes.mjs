// Settings and onboarding routes, merged into server.mjs's route table: settings/profile saving, the Windows scheduled task,
// onboarding (plan, progress, finish), GitHub check, test notification, never-apply counts, Claude usage, export and delete.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { DIR, DATA, loadSettings, loadProfile, saveSettings, saveProfile } from "./config.mjs";

const TASK_NAME = "Job Pilot daily run";
const PROGRESS = path.join(DATA, "onboarding.json");
const fresh = (m) => import(`./${m}?t=${Date.now()}`);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SCHEDULE_KEYS = ["scheduleEnabled", "scheduleTime", "scheduleDays"];
// A test copy of the app (JP_TEST_COPY=1) never touches Windows' scheduled task and starts no Claude work on finishing setup
const TEST_COPY = !!process.env.JP_TEST_COPY;

// ---------- Windows scheduled task (the only place the schedule is installed) ----------
function ps(script) {
  return new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true },
    (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()))));
}
export async function applySchedule({ scheduleEnabled, scheduleTime, scheduleDays }) {
  if (TEST_COPY) return "skipped (test copy)";
  await ps(`Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'Job Auto-Apply (LinkedIn)' -Confirm:$false -ErrorAction SilentlyContinue`);
  if (!scheduleEnabled) return "disabled";
  const days = (scheduleDays || ALL_DAYS).filter((d) => ALL_DAYS.includes(d));
  if (!days.length) return "disabled";
  const full = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  const trigger = days.length === 7 ? `New-ScheduledTaskTrigger -Daily -At '${scheduleTime}'` : `New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${days.map((d) => full[d]).join(",")} -At '${scheduleTime}'`;
  const vbs = path.join(DIR, "launch.vbs");
  await ps(`$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '"${vbs}" run' -WorkingDirectory '${DIR}';` +
    `$t = ${trigger};` +
    `$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3);` +
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $a -Trigger $t -Settings $s -Description 'Job Pilot: daily job search, analysis and applications' | Out-Null`);
  return "enabled";
}
export async function scheduleInfo() {
  try {
    const out = await ps(`$t = Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction Stop; $i = $t | Get-ScheduledTaskInfo; "$($t.State)|$(if ($i.NextRunTime) { $i.NextRunTime.ToString('o') })|$(if ($i.LastRunTime) { $i.LastRunTime.ToString('o') })"`);
    const [state, next, last] = out.split("|");
    return { exists: true, state, next, last };
  } catch { return { exists: false }; }
}
const unschedule = () => TEST_COPY ? null : ps(`Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`).catch(() => {});
export const onboardingProgress = () => readJson(PROGRESS);

// How many listings each never-apply entry skipped: the run logs the word it matched (pipeline.mjs titleExcluded);
// older rows only said "excluded title/company word", so those are matched by company or title.
function neverCounts() {
  const p = loadProfile() || {}, f = path.join(DIR, "applications.csv");
  const rows = fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").slice(1).map((l) => l.split("\t")).filter((r) => r[2] === "filtered") : [];
  const low = (s) => String(s || "").replace(/[İIı]/g, "i").toLowerCase();
  const count = (word, col, kind) => rows.filter((r) => { const m = (r[7] || "").match(/excluded (company|title word) "(.+)"/); return m ? m[1] === kind && m[2] === word : low(r[col]).includes(low(word)); }).length;
  return { companies: Object.fromEntries((p.companyExclude || []).map((w) => [w, count(w, 5, "company")])), titles: Object.fromEntries((p.titleExclude || []).map((w) => [w, count(w, 4, "title word")])) };
}

export function settingsRoutes({ body, json, send, startTask, running }) {
  return {
    "POST /api/profile": async (req, res) => { const b = await body(req); json(res, saveProfile({ ...(loadProfile() || {}), ...b })); },
    "POST /api/settings": async (req, res) => {
      const { reapplySchedule, ...b } = await body(req);
      const before = loadSettings(), s = saveSettings(b);
      let schedule = null;
      if (SCHEDULE_KEYS.some((k) => JSON.stringify(s[k]) !== JSON.stringify(before[k])) || reapplySchedule) {
        try { schedule = await applySchedule(s); } catch (e) { schedule = `failed: ${e.message}`; }
      }
      json(res, { settings: s, schedule });
    },
    "GET /api/settings/never": (req, res) => json(res, neverCounts()),
    "GET /api/usage": async (req, res) => json(res, (await fresh("usage.mjs")).usageReport()),
    "POST /api/notify/test": async (req, res) => { (await fresh("store.mjs")).notify("Job Pilot", "Notifications work. This is how they'll look.", "test"); json(res, { ok: true }); },

    // ----- onboarding -----
    "POST /api/onboarding/plan": async (req, res) => {
      const b = await body(req);
      const { planTargets, loadResumes } = await fresh("llm.mjs");
      try { json(res, await planTargets({ goals: b.goals, locations: b.locations || [], workplace: b.workplace || [], seniority: b.seniority, extra: b.extra, resumes: loadResumes() })); }
      catch (e) { json(res, { error: e.message }, 500); }
    },
    // Progress is saved after every step, so the flow resumes where it was left
    "POST /api/onboarding/progress": async (req, res) => { const b = await body(req); fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(PROGRESS, JSON.stringify({ ...b, at: new Date().toISOString() }, null, 2)); json(res, { ok: true }); },
    "POST /api/onboarding/save": async (req, res) => {
      const b = await body(req);
      const prev = loadProfile() || {};
      saveProfile({ ...prev, ...b.profile, onboardedAt: prev.onboardedAt || new Date().toISOString() });
      const s = saveSettings(b.settings || {});
      let schedule = "";
      try { schedule = await applySchedule(s); } catch (e) { schedule = `failed: ${e.message}`; }
      if (!TEST_COPY) try { startTask("library", ["library"]); } catch {}
      json(res, { ok: true, schedule });
    },
    // A public GitHub account: { ok, user, name, repos } (no token, nothing saved here)
    "POST /api/github/check": async (req, res) => {
      const user = String((await body(req)).user || "").trim();
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user)) return json(res, { error: "That isn't a GitHub username." }, 400);
      try {
        const r = await fetch(`https://api.github.com/users/${user}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "job-pilot" } });
        if (r.status === 404) return json(res, { error: `There's no GitHub account called ${user}.` }, 404);
        if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") {
          const at = new Date(Number(r.headers.get("x-ratelimit-reset")) * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          return json(res, { error: `GitHub limits checks from this computer to 60 an hour, and they're used up until ${at}. Try again then, or use the name without checking.` }, 429);
        }
        if (!r.ok) return json(res, { error: `GitHub answered ${r.status}. Try again in a minute, or use the name without checking.` }, 502);
        const d = await r.json();
        json(res, { ok: true, user: d.login, name: d.name || "", repos: d.public_repos || 0 });
      } catch (e) { json(res, { error: `Couldn't reach GitHub: ${e.message}` }, 502); }
    },

    // ----- data and privacy -----
    "GET /api/export": async (req, res) => {
      const T = await fresh("data_tools.mjs");
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="job-pilot-${T.stamp()}.zip"`, "Cache-Control": "no-store" });
      res.end(T.exportZip());
    },
    "POST /api/data/delete": async (req, res) => {
      if ((await body(req)).confirm !== "DELETE") return json(res, { error: "Type DELETE to confirm." }, 400);
      if (running()) return json(res, { error: "A run or task is working. Stop it first, then delete." }, 409);
      const r = (await fresh("data_tools.mjs")).deleteAll();
      await unschedule();
      json(res, r);
    },
  };
}
