// Every call the UI makes to server.mjs. Screens import these instead of calling fetch directly.
// signal: an AbortSignal (Guidance's Cancel); an aborted call throws an error with .cancelled
async function call(url, body, signal) {
  let r;
  try { r = await fetch(url, body === undefined ? { signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); }
  catch (e) { if (e.name === "AbortError") throw Object.assign(new Error("Cancelled"), { cancelled: true }); throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { cancelled: !!j.cancelled });
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
export const getActivity = () => read("/api/activity");         // every run with its jobs (activity.mjs)
export const getChecks = () => read("/api/doctor/checks");      // doctor health checks (doctor_checks.mjs)
export const getResumes = () => read("/api/resumes/all");        // { originals, ready, tailored, answers, fields }
export const getConversation = (site, id) => call(`/api/conversation?site=${encodeURIComponent(site)}&id=${encodeURIComponent(id)}`); // { messages[] }

// ----- Ask Claude about a job -----
export const askAboutJob = (site, id, message) => call("/api/ask", { site, id, message }); // the whole conversation after Claude's reply

// ----- Guidance (coach_routes.mjs) -----
export const getCoach = () => call("/api/coach");                                          // { list[], pending{ cid: { what at } } }
export const getCoachConv = (cid) => call("/api/coach/conv?cid=" + encodeURIComponent(cid)); // conversation + shownJobs[]
export const coachNew = (title) => call("/api/coach/new", { title });
export const coachSend = (cid, text, weekly, signal) => call("/api/coach/send", { cid, text, weekly }, signal); // the conversation after Claude's reply
export const coachCancel = (cid) => call("/api/coach/cancel", { cid });
export const coachRename = (cid, title) => call("/api/coach/rename", { cid, title });
export const coachDelete = (cid) => call("/api/coach/delete", { cid });
export const coachContext = (cid, patch) => call("/api/coach/context", { cid, patch });     // switches: { goals resumes github jobs market off[] }
export const coachCheckin = (signal) => call("/api/coach/checkin", {}, signal);
export const coachResumeEdit = (b) => call("/api/coach/resume-edit", b);                   // { id, find, replace } -> Resumes' check result
export const coachInterview = (b, signal) => call("/api/coach/interview", b, signal);      // { cid, op: start|answer|skip|lang|end, lang?, text? }
export const addTodoItems = (items) => call("/api/todo/add", { items });                   // new steps from Guidance -> { state, ids }

// ----- runs and background tasks -----
export const startRun = (opts = {}) => call("/api/run", opts);  // { dryRun?, limit? }
export const stopRun = () => call("/api/run/stop", {});
export const startTask = (name) => call("/api/task", { name }); // library | review | github | selftest
export const askDoctor = (problem) => call("/api/doctor", { problem });
export const undoDoctor = (id) => call("/api/doctor/undo", { id }); // puts back the files one fix changed
export const checkLinkedin = () => call("/api/doctor/linkedin", {}); // one LinkedIn page in a hidden window: { loggedIn limited error }

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
export const instructResume = (id, instruction) => call("/api/resumes/instruct", { id, instruction }); // staged like checkReupload; then useReupload
export const saveResumeRules = (b) => call("/api/resumes/rules", b);                 // { rules?[{id text}], settings?{ namePattern photoTr photoEn } }
export const addResumeRule = (text) => call("/api/resumes/rule", { text });
export const savePhoto = (data, source) => call("/api/resumes/photo", { data, source }); // JPEG base64 from the crop step
export const removePhoto = () => call("/api/resumes/photo/remove", {});
export const photosFrom = (file) => call("/api/resumes/photo/from", { file });       // { images[{ w h url }] } found in an original PDF
export const photoUrl = () => "/api/resumes/photo?t=" + Date.now();
export const setProject = (repo, patch) => call("/api/resumes/project", { repo, ...patch }); // { state? use|never|unreviewed, resumeName?, resumeLine? }
export const suggestProjects = () => call("/api/resumes/projects/suggest", {});
export const renameResume = (id, b) => call("/api/resumes/rename", { id, ...b });   // { name?, file? }
export const deleteResume = (id, rebuild = true) => call("/api/resumes/delete", { id, rebuild });
export const undoDelete = () => call("/api/resumes/undo", {});
export const renameAllResumes = () => call("/api/resumes/rename-all", {});
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

// ----- settings (settings_routes.mjs) -----
export const getUsage = () => call("/api/usage");                      // { days runs[{ at jobs costUsd kinds dryRun stopKind }] kinds[{ id n costUsd split }] totalUsd }
export const getNever = () => call("/api/settings/never");             // { companies{ word: skipped }, titles{ word: skipped } }
export const testNotify = () => call("/api/notify/test", {});
export const exportUrl = "/api/export";                                 // a ZIP of data/, resumes/ and the log
export const deleteData = () => call("/api/data/delete", { confirm: "DELETE" }); // backup first: { backup, failed[] }

// ----- onboarding and accounts -----
export const planSearch = (answers) => call("/api/onboarding/plan", answers);
export const saveProgress = (p) => call("/api/onboarding/progress", p);
export const checkGithub = (user) => call("/api/github/check", { user }); // { ok user name repos }
export const finishOnboarding = (profile, settings) => call("/api/onboarding/save", { profile, settings });
export const loginLinkedin = () => call("/api/login/linkedin", {});
export const loginClaude = () => call("/api/login/claude", {});
export const quit = () => call("/api/quit", {});
