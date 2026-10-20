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
export const getMarket = () => read("/api/market");             // { market, audit, stats }
export const getInsights = () => read("/api/insights");         // { fields, jobFields, notPicked, jobItems, todo{ items pending groupedAt }, market }
export const getGithub = () => read("/api/github");             // { user, fetchedAt, repos[] with review }
export const getLibrary = () => read("/api/library");           // { entries, due }
export const getDoctor = () => read("/api/doctor");             // doctor reports
export const getRuns = () => read("/api/runs");                 // last 30 finished runs (no events)
export const getResumes = () => read("/api/resumes/all");        // { originals, ready, tailored, answers, fields }
export const getConversation = (site, id) => call(`/api/conversation?site=${encodeURIComponent(site)}&id=${encodeURIComponent(id)}`); // { messages[] }

// ----- Ask Claude about a job -----
export const askAboutJob = (site, id, message) => call("/api/ask", { site, id, message }); // the whole conversation after Claude's reply

// ----- runs and background tasks -----
export const startRun = (opts = {}) => call("/api/run", opts);  // { dryRun?, limit? }
export const stopRun = () => call("/api/run/stop", {});
export const startTask = (name) => call("/api/task", { name }); // library | review | github | selftest
export const askDoctor = (problem) => call("/api/doctor", { problem });
export const restoreDoctor = (id) => call("/api/doctor/restore", { id });

// ----- data changes -----
export const uploadResumes = (files) => call("/api/resumes", { files }); // [{ name, data (base64) }]
export const removeResume = (file) => call("/api/resumes/delete", { file });
// ----- Resumes screen -----
export const stageResumes = (files) => call("/api/resumes", { files, stage: true }); // staged until addOriginal: [{ token, file, size }]
export const readOriginal = (token) => call("/api/resumes/read", { token });        // Claude reads it: { read{ roles skills languages … }, language }
export const readExisting = (file) => call("/api/resumes/read-existing", { file });  // Claude reads an original in resumes/ (before Export to edit)
export const addOriginal = (b) => call("/api/resumes/add", b);                       // { token, name, language, fields, defaultFor, replaces? }
export const discardUpload = (token) => call("/api/resumes/discard", { token });
export const setResumeMeta = (b) => call("/api/resumes/meta", b);                    // { file, name?, language?, fields?, defaultFor? }
export const checkReupload = (b) => call("/api/resumes/check", b);                   // { id, name, data }: Claude's check + new score
export const useReupload = (b) => call("/api/resumes/use", b);                       // { token, remove[], confirm[] }
export const saveAnswers = (answers) => call("/api/answers", { answers });           // { key: { tr, en } }
export const docxUrl = (id) => "/api/resumes/docx?id=" + encodeURIComponent(id);
export const saveProfile = (patch) => call("/api/profile", patch);
export const saveSettings = (patch) => call("/api/settings", patch);
export const setTodo = (id, done) => call("/api/todo", { id, done });        // -> { state, flagged }: done flags the jobs it lifts for re-scoring
export const addTodo = (ids, added = true) => call("/api/todo/add", { ids, added }); // "Add to my to-do list" on a job's card
export const setArchived = (site, id, archived) => call("/api/archive", { site, id, archived });
// ----- job statuses (status_routes.mjs) -----
export const setJobStatus = (site, id, status, date = null) => call("/api/status", { site, id, status, date }); // interview | offer | rejected | applied
export const approveJob = (site, id, answers) => call("/api/approve", { site, id, answers });                  // answers: [{ label, value }]
export const skipJob = (site, id) => call("/api/skip", { site, id });
export const sendNow = (site, id) => call("/api/send", { site, id });                                          // a real single-job run that submits

// ----- onboarding and accounts -----
export const planSearch = (answers) => call("/api/onboarding/plan", answers);
export const finishOnboarding = (profile, settings) => call("/api/onboarding/save", { profile, settings });
export const loginLinkedin = () => call("/api/login/linkedin", {});
export const loginClaude = () => call("/api/login/claude", {});
export const quit = () => call("/api/quit", {});
