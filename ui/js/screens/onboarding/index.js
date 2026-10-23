// Onboarding (boards Onboarding, Onboarding-Profile): a dialog over the empty app, shown until onboarded. Seven steps in
// order; any step reached can be revisited from the list, progress is saved after each one (data/onboarding.json), and a
// step that fails says what to do. Finish saves the profile and settings, installs the schedule and builds ready resumes.
import { S, app, loadState } from "../../state.js";
import * as api from "../../api.js";
import { $, esc, icon, rows, toast } from "../../util.js";
import { openUpload } from "../resumes/upload.js";
import { callout } from "../../components/card.js";
import { claudeStep, resumesStep, githubStep, goalsStep, planStep, linkedinStep, scheduleStep } from "./steps.js";

// [id, label, sub (to do), title, lead, foot]
const STEPS = [
  ["claude", "Claude", "Check Claude Code and sign in", "Connect Claude", "Job Pilot runs on your own Claude Code subscription: every score, resume and answer comes from it.", "Required"],
  ["resumes", "Upload resumes", "Claude starts every application here", "Upload your resumes", "Claude scores every job against them and tailors a copy for each application. Nothing is invented.", "Add more later in Resumes"],
  ["github", "Connect GitHub", "Optional, for project evidence", "Connect GitHub", "Your public projects show skills your resume only lists.", "Optional"],
  ["goals", "Write your goals", "What you want next", "Write your goals", "What kind of job, where, and what you don't want.", "Change them any time in Guidance"],
  ["plan", "Your plan", "Claude creates your search profiles", "Your first search profiles", "A profile tells Claude what to search for. Claude wrote these from your goals and resumes.", "Every detail is in Settings later"],
  ["linkedin", "Sign in to LinkedIn", "So Claude can search and apply", "Sign in to LinkedIn", "Claude searches for jobs and sends Easy Apply applications from your account.", "Required"],
  ["schedule", "Schedule and apply mode", "When it runs, how much it does alone", "When should it run?", "Pick a time, a daily amount and how much Claude does on its own.", "Change anything in Settings"],
];
const BODY = { claude: claudeStep, resumes: resumesStep, github: githubStep, goals: goalsStep, plan: planStep, linkedin: linkedinStep, schedule: scheduleStep };

const fresh = () => ({ step: 0, reached: 0, goals: "", locations: "", workplace: ["onsite", "hybrid", "remote"], seniority: "", extra: "", github: "", ghInfo: null, ghError: "",
  plan: null, planFor: "", busy: false, error: "", li: {}, linkedinDone: false, sched: { time: "10:00", jobs: 15, mode: "ask_below_target", models: "balanced" }, restored: false });
export const OB = fresh();
// After Delete my data: start again from step 1
export const resetOnboarding = () => { for (const k of Object.keys(OB)) delete OB[k]; Object.assign(OB, fresh()); };
const SAVED = ["step", "reached", "goals", "locations", "workplace", "seniority", "extra", "github", "ghInfo", "plan", "planFor", "linkedinDone", "sched"];

const id = () => STEPS[OB.step][0];
const done = {
  claude: () => !!S.STATE.claude?.found && S.STATE.claude.loggedIn !== false, resumes: () => !!S.RES?.originals?.length,
  github: () => OB.reached > 2, goals: () => !!OB.goals.trim(), plan: () => !!OB.plan?.targets?.length, linkedin: () => OB.linkedinDone, schedule: () => false,
};
const DONE_SUB = { claude: () => "Signed in", resumes: () => `${S.RES.originals.length} ${S.RES.originals.length === 1 ? "resume" : "resumes"}`,
  github: () => OB.ghInfo ? `@${OB.ghInfo.user}` : "Skipped", goals: () => "Written", plan: () => `${OB.plan.targets.length} profiles`, linkedin: () => "Signed in" };
const sub = (k, i) => i < OB.reached && done[k]() && DONE_SUB[k] ? DONE_SUB[k]() : STEPS[i][2];

// Restore saved progress once; load the resumes list (Resumes' upload sheet reads S.RES)
async function restore() {
  OB.restored = true;
  const p = S.STATE.onboarding;
  if (p) for (const k of SAVED) if (p[k] !== undefined) OB[k] = p[k];
  if (!p?.sched?.time && S.STATE.settings?.scheduleTime) OB.sched.time = S.STATE.settings.scheduleTime;
  try { S.RES = await api.getResumes(); } catch {}
  renderOnboarding();
}
const save = () => api.saveProgress(Object.fromEntries(SAVED.map((k) => [k, OB[k]]))).catch(() => {});

export function renderOnboarding() {
  if (!OB.restored) { restore(); return; }
  const [k, , , title, lead, foot] = STEPS[OB.step], n = OB.step + 1, last = OB.step === STEPS.length - 1;
  const canNext = { claude: done.claude, resumes: done.resumes, plan: () => done.plan() && !OB.busy, linkedin: done.linkedin }[k]?.() ?? true;
  const cta = last ? "Finish and start" : k === "goals" ? "Let Claude plan my search" : k === "github" && !OB.ghInfo ? "Continue without GitHub" : "Continue";
  $("#runbar").innerHTML = `<span class="txt">Setting up · step <span class="jp-num" style="color:var(--text)">${n}</span> of <span class="jp-num">${STEPS.length}</span></span>`;
  $("#view").innerHTML = `<div class="ob-scrim"><div class="ob" role="dialog" aria-modal="true" aria-labelledby="ob-title">
    <nav class="ob-nav" aria-label="Setup steps"><div class="ob-brand"><span class="jp-bar__mark" aria-hidden="true"></span>Set up Job Pilot</div>
      <ol class="ob-steps">${STEPS.map(([sk, label], i) => { const ok = i < OB.reached && done[sk](), now = i === OB.step;
        return `<li><button class="ob-stepbtn" type="button" data-action="ob-go" data-i="${i}"${now ? ' aria-current="step"' : ""}${i > OB.reached ? " disabled" : ""}>
          <span class="ob-dot${ok ? " ob-dot--done" : now ? " ob-dot--now" : ""}" aria-hidden="true">${ok ? icon("check", "ico ico--14") : i + 1}</span>
          <span class="ob-stepbtn__text"><span class="ob-stepbtn__label">${label}</span><span class="foot">${esc(sub(sk, i))}</span></span></button></li>`; }).join("")}</ol>
      <p class="foot ob-nav__foot">About 10 minutes. You can change everything later in Settings and Resumes.</p></nav>
    <div class="ob-main"><div class="ob-head"><p class="cap">Step <span class="jp-num">${n}</span> of <span class="jp-num">${STEPS.length}</span></p>
        <h2 id="ob-title" class="t-title1">${title}</h2><p class="meta">${lead}</p></div>
      <div class="ob-body" id="ob-body">${S.STATE?.remote?.phone ? callout("Set up Job Pilot at your PC. Some steps open windows there, like signing in to Claude and LinkedIn.", "warning") : ""}${BODY[k]()}</div>
      <div class="ob-foot"><span class="foot ob-foot__note">${k === "schedule" ? `First run ${esc(OB.sched.time)} after you finish, or press Run now` : foot}</span>
        ${OB.step ? `<button class="jp-btn" type="button" data-action="ob-back">Back</button>` : ""}
        <button class="jp-btn jp-btn--primary" type="button" data-action="ob-next"${canNext ? "" : " disabled"}>${cta}</button></div></div>
  </div></div>`;
}

// The Claude step follows the status check (main.js tick); other steps aren't re-rendered under the user
export function onboardingTick() { if (OB.restored && id() === "claude") renderOnboarding(); }

// Reads the open step's inputs into OB
function capture() {
  const v = (s) => document.querySelector(s)?.value;
  if (id() === "github" && v("#ob-gh") !== undefined) { const u = v("#ob-gh").trim(); if (u !== OB.github) { OB.github = u; OB.ghInfo = null; OB.ghError = ""; } }
  if (id() === "goals" && v("#ob-goals") !== undefined) Object.assign(OB, { goals: v("#ob-goals"), locations: v("#ob-loc"), seniority: v("#ob-sen"), extra: v("#ob-extra") });
  if (id() === "plan" && OB.plan && !OB.busy && $("#ob-ploc")) {
    OB.plan.targets = [...document.querySelectorAll("[data-pi]")].map((el, i) => ({ ...OB.plan.targets[i],
      field: el.querySelector('[data-k="field"]').value.trim(), searchTerms: rows(el.querySelector('[data-k="searchTerms"]').value) }));
    Object.assign(OB.plan, { locations: rows(v("#ob-ploc")), titleExclude: rows(v("#ob-pex")), facts: v("#ob-pfacts") });
  }
  if (id() === "schedule" && v("#ob-time") !== undefined) Object.assign(OB.sched, { time: v("#ob-time") || "10:00", jobs: Math.max(1, Math.min(60, Number(v("#ob-jobs")) || 15)) });
}
const goTo = (i) => { OB.step = i; OB.reached = Math.max(OB.reached, i); save(); renderOnboarding(); $("#ob-title")?.focus?.(); };

async function plan() {
  Object.assign(OB, { busy: true, error: "", plan: null }); renderOnboarding();
  try { OB.plan = await api.planSearch({ goals: OB.goals, locations: rows(OB.locations), workplace: OB.workplace, seniority: OB.seniority, extra: OB.extra }); OB.planFor = OB.goals; }
  catch (e) { OB.error = e.message; }
  OB.busy = false; save();
  if (id() === "plan") renderOnboarding();
}

async function finish() {
  const p = OB.plan, models = { balanced: ["sonnet", "opus"], best: ["opus", "opus"], light: ["sonnet", "sonnet"] }[OB.sched.models];
  const targets = p.targets.filter((t) => t.field && t.searchTerms.length);
  if (!targets.length) { goTo(4); return toast("Keep at least one profile with a job title to search."); }
  await api.finishOnboarding(
    { name: p.name, goalsText: OB.goals, preferences: p.preferences || OB.goals, locations: p.locations, workplace: OB.workplace, seniority: p.seniority || OB.seniority,
      targets, titleExclude: p.titleExclude || [], companyExclude: [], facts: p.facts, githubUser: OB.ghInfo?.user || null },
    { scheduleEnabled: true, scheduleTime: OB.sched.time, dailyJobs: OB.sched.jobs, applyMode: OB.sched.mode, modelDaily: models[0], modelWeekly: models[1] });
  toast("All set. Claude is writing your ready resumes now; your first run starts on schedule, or press Run now.", 9000);
  S.view = "jobs"; history.replaceState(null, "", "#jobs");
  await app.load();
}

export const OB_ACTIONS = {
  "ob-go": (el) => { capture(); goTo(Number(el.dataset.i)); },
  "ob-back": () => { capture(); goTo(Math.max(0, OB.step - 1)); },
  "ob-next": async () => {
    capture();
    const k = id();
    if (k === "goals") {
      if (!OB.goals.trim()) return toast("Tell Claude what you want to work on first.");
      goTo(4);
      if (!OB.plan || OB.planFor !== OB.goals) await plan();
      return;
    }
    if (k === "schedule") return finish();
    goTo(OB.step + 1);
  },
  "ob-cpath": async () => { const p = $("#ob-cpath")?.value.trim(); if (!p) return; await api.saveSettings({ claudePath: p }); toast("Checking Claude…"); await loadState(true); renderOnboarding(); },
  "ob-upload": () => openUpload(),
  "ob-remove-resume": async (el) => {
    if (!confirm(`Remove ${el.dataset.file}? It's moved to the data folder, not deleted.`)) return;
    await api.removeResume(el.dataset.file); S.RES = await api.getResumes(); renderOnboarding();
  },
  "ob-gh-check": async () => {
    capture(); if (!OB.github) return toast("Type your GitHub username first.");
    try { OB.ghInfo = await api.checkGithub(OB.github); OB.github = OB.ghInfo.user; OB.ghError = ""; save(); } catch (e) { OB.ghInfo = null; OB.ghError = e.message; }
    renderOnboarding();
  },
  "ob-gh-anyway": () => { OB.ghInfo = { user: OB.github, unchecked: true }; OB.ghError = ""; save(); renderOnboarding(); },
  "ob-wp": (el) => { capture(); const v = el.dataset.v, w = OB.workplace; OB.workplace = w.includes(v) ? (w.length > 1 ? w.filter((x) => x !== v) : w) : [...w, v]; renderOnboarding(); },
  "ob-plan": () => { capture(); return plan(); },
  "ob-plan-add": () => { capture(); OB.plan.targets.push({ field: "", searchTerms: [] }); renderOnboarding(); document.querySelector(`#ob-pn-${OB.plan.targets.length - 1}`)?.focus(); },
  "ob-plan-remove": (el) => { capture(); OB.plan.targets.splice(Number(el.dataset.i), 1); renderOnboarding(); },
  "ob-li-check": async () => {
    OB.li = { busy: true }; renderOnboarding();
    try { const r = await api.checkLinkedin(); OB.li = { checked: true, ...r }; OB.linkedinDone = !!r.loggedIn; }
    catch (e) { OB.li = { checked: true, error: e.message }; }
    save(); renderOnboarding();
  },
  "ob-li-manual": () => { OB.linkedinDone = true; save(); renderOnboarding(); },
  "ob-mode": (el) => { capture(); OB.sched.mode = el.dataset.v; renderOnboarding(); },
  "ob-models": (el) => { capture(); OB.sched.models = el.dataset.v; renderOnboarding(); },
};
