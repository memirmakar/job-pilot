// Every [data-action] button, plus the page-wide click / change / input / tooltip handlers.
import { S, app, loadState } from "./state.js";
import * as api from "./api.js";
import { $, toast } from "./util.js";
import { go } from "./router.js";
import { toggleMenu, renderMenu, openAskClaude } from "./shell.js";
import { setChoice, isDark } from "./theme.js";
import { SET_ACTIONS, bindSettings } from "./screens/settings/index.js";
import { OB_ACTIONS } from "./screens/onboarding/index.js";
import { JOB_ACTIONS, bindJobs } from "./screens/jobs/index.js";
import { RES_ACTIONS, bindResumes } from "./screens/resumes/index.js";
import { INS_ACTIONS, bindInsights } from "./screens/insights/index.js";
import { GUIDE_ACTIONS, bindGuidance } from "./screens/guidance/index.js";
import { ACT_ACTIONS } from "./screens/activity/index.js";
import { DOC_ACTIONS } from "./screens/doctor/index.js";

const ACTIONS = {
  run: async () => { await api.startRun({}); toast("Run started. You'll see an Edge window working; leave it open."); await loadState(); },
  "dry-run": async () => { await api.startRun({ dryRun: true, limit: 2 }); toast("Test run started on 2 jobs. Nothing will be submitted."); await loadState(); },
  stop: async () => { await api.stopRun(); toast("Stopping the run…"); setTimeout(app.load, 1500); },
  task: async (el) => { await api.startTask(el.dataset.task); toast(`${el.dataset.task} started`); await loadState(); app.render(); },
  recheck: async () => { toast("Checking Claude…"); await loadState(true); app.render(); },
  "claude-login": async () => { await api.loginClaude(); toast("A Claude window opened: type /login, finish in your browser, close it, then press Check again.", 9000); },
  "linkedin-login": async () => { await api.loginLinkedin(); toast("An Edge window opened. Sign in to LinkedIn, then close it.", 8000); },
  archive: async (el) => { await api.setArchived(el.dataset.site, el.dataset.id, !!el.dataset.v); app.load(); },
  "retry-load": () => app.load(),
  quit: async () => { if (!confirm(S.STATE?.settings?.remoteAccess ? "Quit Job Pilot? Your phone can't reach it until Job Pilot is opened again on this PC. The scheduled daily run still happens." : "Quit Job Pilot? The scheduled daily run still happens.")) return; await api.quit(); document.body.innerHTML = `<div class="placeholder"><p class="t-headline">Job Pilot closed. Open it again from the desktop shortcut.</p></div>`; },
  // shell
  "insights-tab": (el) => go("insights/" + el.dataset.tab),
  "ask-claude": () => openAskClaude(),
  "show-waiting": () => { go("jobs"); S.filter = "todo"; const w = S.DATA.find((r) => r.status === "waiting_ok" && !r.archived); if (w) { S.selected = `${w.site}-${w.id}`; S.jobOpen = true; } app.render(); },
  more: () => toggleMenu(),
  "theme-toggle": () => { setChoice(isDark() ? "light" : "dark"); renderMenu(); },
  "theme-system": () => { setChoice(null); renderMenu(); },
  // jobs screen
  ...JOB_ACTIONS,
  // resumes screen
  ...RES_ACTIONS,
  // insights screen (and the to-do marks on a job's raise card)
  ...INS_ACTIONS,
  // guidance screen (and links in Claude's text anywhere, the Ask panel's Open in Guidance)
  ...GUIDE_ACTIONS,
  // activity and doctor screens
  ...ACT_ACTIONS,
  ...DOC_ACTIONS,
  // settings and onboarding
  ...SET_ACTIONS,
  ...OB_ACTIONS,
};

export function bindEvents() {
  bindJobs();
  bindResumes();
  bindInsights();
  bindGuidance();
  bindSettings();
  document.addEventListener("click", async (e) => {
    if (!e.target.closest(".menu-wrap")) toggleMenu(false);
    const act = e.target.closest("[data-action]");
    if (act && act.tagName !== "INPUT" && ACTIONS[act.dataset.action]) {
      e.preventDefault();
      try { await ACTIONS[act.dataset.action](act); } catch (err) { toast(err.message, 7000); }
      return;
    }
    const nav = e.target.closest("[data-nav]");
    if (nav) { e.preventDefault(); toggleMenu(false); go(nav.dataset.nav); return; }
    const f = e.target.closest("[data-f]");
    if (f) { S.filter = f.dataset.f; app.render(); return; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#more-menu").hidden) { toggleMenu(false); $("#more-btn").focus(); } });
  document.addEventListener("input", (e) => {
    if (e.target.id !== "q") return;
    S.query = e.target.value; const pos = e.target.selectionStart;
    app.render(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos);
  });
  // tooltips for chart marks
  const tip = $("#tip");
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) { tip.style.display = "none"; return; }
    tip.textContent = t.dataset.tip; tip.style.display = "block";
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px"; tip.style.top = (e.clientY + 16) + "px";
  });
}
