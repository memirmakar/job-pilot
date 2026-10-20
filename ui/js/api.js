// Every call the UI makes to server.mjs. Screens import these instead of calling fetch directly.
async function call(url, body) {
  const r = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// The bulk reads never throw, as before: a failing route just yields its error object.
const read = (url) => fetch(url).then((r) => r.json());

// ----- reads -----
export const getState = (recheck = false) => call("/api/state" + (recheck ? "?recheck=1" : "")); // settings, profile, claude, schedule, run, tasks, resumes
export const getApplications = () => read("/api/applications"); // job records, newest first
export const getLog = () => read("/api/log");                   // applications.csv rows, newest first
export const getMeta = () => read("/api/meta");                 // minAtsScore, tailorTarget, dailyLimit, dailyJobs
export const getMarket = () => read("/api/market");             // { market, done, audit, stats }
export const getGithub = () => read("/api/github");             // { user, fetchedAt, repos[] with review }
export const getLibrary = () => read("/api/library");           // { entries, due }
export const getDoctor = () => read("/api/doctor");             // doctor reports
export const getRuns = () => read("/api/runs");                 // last 30 finished runs (no events)

// ----- runs and background tasks -----
export const startRun = (opts = {}) => call("/api/run", opts);  // { dryRun?, limit? }
export const stopRun = () => call("/api/run/stop", {});
export const startTask = (name) => call("/api/task", { name }); // library | review | github | selftest
export const askDoctor = (problem) => call("/api/doctor", { problem });
export const restoreDoctor = (id) => call("/api/doctor/restore", { id });

// ----- data changes -----
export const uploadResumes = (files) => call("/api/resumes", { files }); // [{ name, data (base64) }]
export const removeResume = (file) => call("/api/resumes/delete", { file });
export const saveProfile = (patch) => call("/api/profile", patch);
export const saveSettings = (patch) => call("/api/settings", patch);
export const setTodo = (title, done) => call("/api/todo", { title, done });
export const setArchived = (site, id, archived) => call("/api/archive", { site, id, archived });

// ----- onboarding and accounts -----
export const planSearch = (answers) => call("/api/onboarding/plan", answers);
export const finishOnboarding = (profile, settings) => call("/api/onboarding/save", { profile, settings });
export const loginLinkedin = () => call("/api/login/linkedin", {});
export const loginClaude = () => call("/api/login/claude", {});
export const quit = () => call("/api/quit", {});
