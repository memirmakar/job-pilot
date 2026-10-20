// The app shell (canvas board Main.dc.html): segmented sections, live run status with Run now / Stop, Ask Claude, More menu.
import { S, app } from "./state.js";
import { $, esc, fmtDate, icon } from "./util.js";
import { SECTIONS, MORE } from "./router.js";
import { PHASE } from "./legacy.js";
import { pill } from "./components/status-pill.js";
import { callout } from "./components/card.js";
import { openSheet } from "./components/sheet.js";
import { isDark, getChoice } from "./theme.js";
import { runProblem, waitingCount } from "./screens/jobs/track.js";
import { time, shortDay } from "./screens/jobs/model.js";

export function renderNav() {
  const onboarding = S.view === "onboarding";
  $("#bar").toggleAttribute("data-onboarding", onboarding);
  $("#nav").innerHTML = SECTIONS.map(([id, label]) =>
    `<button class="jp-seg__item" type="button" data-nav="${id}" aria-selected="${id === S.view}"${id === S.view ? ' aria-current="page"' : ""}>${esc(label)}</button>`).join("");
  renderMenu();
}

export function renderMenu() {
  const m = $("#more-menu");
  m.innerHTML = `<p class="cap">More</p>
    ${MORE.map(([id, label]) => `<button class="navbtn" type="button" role="menuitem" data-nav="${id}"${id === S.view ? ' aria-current="page"' : ""}>${esc(label)}</button>`).join("")}
    <hr>
    <div class="menu-row"><span id="theme-label">Dark appearance</span>
      <button class="switch" type="button" role="switch" aria-labelledby="theme-label" aria-checked="${isDark()}" data-action="theme-toggle"></button></div>
    <div class="menu-row foot">${getChoice() ? `<button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="theme-system">Match system</button>` : "Following your system setting"}</div>`;
  const more = $("#more-btn");
  more.classList.toggle("jp-btn--tinted", MORE.some(([id]) => id === S.view));
}

export function toggleMenu(open = $("#more-menu").hidden) {
  $("#more-menu").hidden = !open;
  $("#more-btn").setAttribute("aria-expanded", String(open));
  if (open) $("#more-menu").querySelector("[data-nav]")?.focus();
}

// Something that needs the user, shown in the bar instead of the schedule: [tone, pill, text]
const day = (iso) => `${shortDay(iso) === "Today" ? "today" : shortDay(iso)} ${time(iso)}`;
function barProblem() {
  const c = S.STATE.claude;
  if (c && !c.found) return ["danger", "Claude not found", "Set its path in Settings"];
  if (c?.loggedIn === false) return ["danger", "Signed out of Claude", "Sign in from Settings"];
  const p = runProblem(), n = p?.run?.outcome?.analyzed ?? p?.run?.counts?.analyzed ?? 0;
  if (p?.kind === "loggedOut") return ["danger", "Logged out", n ? `of LinkedIn · run stopped after ${n} jobs` : "of LinkedIn · the last run didn't start"];
  if (p?.kind === "runFailed") return ["danger", "Run stopped", `at ${time(p.at)}${n ? ` after ${n} ${n === 1 ? "job" : "jobs"}` : ""}`];
  if (p?.kind === "limited") return ["warning", "Paused", `LinkedIn limit${p.resumeAt ? ` · next try ${day(p.resumeAt)}` : ""}`];
  if (p?.kind === "firstDay") return ["neutral", "Not run yet", S.STATE.schedule?.exists ? `First run ${fmtDate(S.STATE.schedule.next)}` : "Press Run now to start"];
  return null;
}
// " · 2 waiting for your OK", a link to them on Jobs
function waitingHint() {
  const n = waitingCount();
  return n ? ` · <a href="#jobs" class="bar-link" data-action="show-waiting"><span class="jp-num">${n}</span> waiting for your OK</a>` : "";
}

export function renderStatus() {
  const bar = $("#runbar"), st = S.STATE;
  if (!st?.onboarded) { bar.innerHTML = ""; return; }
  const run = st.run, c = run?.current;
  const busy = Object.entries(st.tasks || {}).filter(([k, t]) => t.running && k !== "run").map(([k]) => k);
  const problem = !run?.running && !busy.length && barProblem();
  let lead, text;
  if (run?.running) {
    lead = `<span class="jp-dot jp-dot--live" aria-hidden="true"></span>`;
    text = `${esc(PHASE[c.phase] || c.phase)}${c.detail ? ` · ${esc(c.detail)}` : ""}${c.counts?.applied ? ` · <span class="jp-num" style="color:var(--text)">${c.counts.applied}</span> applied` : ""}`;
  } else if (busy.length) {
    lead = `<span class="jp-dot jp-dot--live" aria-hidden="true"></span>`;
    text = `Working: ${esc(busy.join(", "))}`;
  } else if (problem) {
    lead = pill(problem[1], problem[0]);
    text = esc(problem[2]) + waitingHint();
  } else {
    lead = icon("clock");
    text = (st.schedule?.exists ? `Next run <span class="jp-num" style="color:var(--text)">${esc(fmtDate(st.schedule.next))}</span>` : "Not scheduled") + waitingHint();
  }
  const plain = text.replace(/<[^>]+>/g, "");
  bar.innerHTML = `${lead}<span class="txt ellip" title="${esc(plain)}">${text}</span>
    ${run?.running ? `<button class="jp-btn jp-btn--sm" type="button" data-action="stop">Stop</button>`
      : `<button class="jp-btn jp-btn--sm" type="button" data-action="run">Run now</button>`}`;
}

export function openAskClaude() {
  openSheet({
    title: "Ask Claude",
    body: `<div style="display:flex;flex-direction:column;gap:var(--space-4)">
      <p class="t-callout" style="color:var(--text-secondary)">Asking Claude about a job, your search or your resumes comes in a later stage.</p>
      ${callout("For now, every job's detail explains Claude's decisions, and the <b>Doctor</b> can check the app when something goes wrong.")}</div>`,
    actions: `<a class="jp-btn jp-btn--tinted" href="#doctor" data-nav="doctor" data-sheet-close>Open Doctor</a>
      <button class="jp-btn jp-btn--plain" type="button" data-sheet-close>Close</button>`,
  });
}

Object.assign(app, { renderNav, renderStatus });
