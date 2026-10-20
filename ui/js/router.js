// Sections and hash routing. #jobs, #insights/github, … ; old hashes (#apps, #overview, #log, #github) still work.
import { S, app, loadState, loadData } from "./state.js";
import { $ } from "./util.js";
import { renderJobs } from "./screens/jobs/index.js";
import { renderGuidance } from "./screens/guidance.js";
import { renderResumes } from "./screens/resumes/index.js";
import { renderInsights, INSIGHT_TABS } from "./screens/insights/index.js";
import { renderActivity } from "./screens/activity/index.js";
import { renderDoctor } from "./screens/doctor/index.js";
import { renderSettings } from "./screens/settings.js";
import { renderOnboarding } from "./screens/onboarding.js";

// The segmented control, in order
export const SECTIONS = [["jobs", "Jobs"], ["guidance", "Guidance"], ["resumes", "Resumes"], ["insights", "Insights"]];
// The More menu
export const MORE = [["activity", "Activity"], ["doctor", "Doctor"], ["settings", "Settings"]];

const SCREENS = { jobs: renderJobs, guidance: renderGuidance, resumes: renderResumes, insights: renderInsights,
  activity: renderActivity, doctor: renderDoctor, settings: renderSettings };
const ALIAS = { apps: "jobs", overview: "insights", log: "activity", github: "insights/github" };
// Never re-render these underneath the user while they type
export const FORM_VIEWS = new Set(["settings", "onboarding"]);
// Screens rebuilt in jp- markup; the rest still render inside .legacy
const REBUILT = new Set(["jobs", "resumes", "insights", "activity", "doctor"]);

// "insights/github" -> view "insights", sub "github"
export function parse(hash) {
  const [view, sub] = (ALIAS[hash] || hash || "jobs").split("/");
  return SCREENS[view] || view === "onboarding" ? { view, sub } : { view: "jobs" };
}

export function go(target, { push = true } = {}) {
  const { view, sub } = parse(target);
  S.view = view; S.filter = "all";
  // old #insights/overview links land on Pipeline
  S.sub = view === "insights" ? (INSIGHT_TABS.some(([id]) => id === sub) ? sub : "pipeline") : S.sub;
  const hash = "#" + view + (view === "insights" && S.sub !== "pipeline" ? "/" + S.sub : "");
  if (push && hash !== location.hash) history.pushState(null, "", hash); else history.replaceState(null, "", hash);
  render();
  window.scrollTo(0, 0);
}
// Back / forward and typed hashes (old bookmarks like #apps keep working)
addEventListener("popstate", () => { if (S.view !== "onboarding") go(location.hash.slice(1), { push: false }); });

export function render() {
  app.renderNav();
  app.renderStatus(); // the bar reads run data too (problem states, waiting count)
  $("#view").classList.toggle("legacy", !REBUILT.has(S.view));
  if (S.view === "onboarding") return renderOnboarding();
  (SCREENS[S.view] || renderJobs)();
}

export async function load() {
  await loadState();
  if (!S.STATE.onboarded) { S.view = "onboarding"; app.renderNav(); return renderOnboarding(); }
  if (S.view === "onboarding") S.view = "jobs";
  await loadData();
  render();
}

Object.assign(app, { render, load });
