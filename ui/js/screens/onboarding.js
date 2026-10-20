// Onboarding wizard: Claude, resumes, goals, plan, LinkedIn, schedule. Shown instead of the app until onboarded.
import { S, app } from "../state.js";
import * as api from "../api.js";
import { bindDrop } from "../components/drop.js";
import { targetRows, readTargets } from "./settings.js";
import { $, esc, md, toast, lines } from "../util.js";

export const OB = { step: 0, goals: "", locations: "", workplace: ["onsite", "hybrid", "remote"], seniority: "", extra: "", github: "", plan: null, busy: false, linkedinDone: false };
const OB_STEPS = ["Claude", "Resumes", "Goals", "Your plan", "LinkedIn", "Schedule"];
export function renderOnboarding() {
  const st = OB.step, c = S.STATE.claude || {};
  const steps = `<div class="steps">${OB_STEPS.map((s, i) => `<span class="${i === st ? "on" : i < st ? "done" : ""}">${i < st ? "✓ " : ""}${i + 1}. ${s}</span>`).join("")}</div>`;
  const nav = (nextOk, nextLabel = "Next") => `<div class="btns" style="margin-top:18px">${st ? `<button class="btn" data-action="ob-back">Back</button>` : ""}
    <button class="btn primary" data-action="ob-next" ${nextOk ? "" : "disabled"}>${nextLabel}</button></div>`;
  let body = "";
  if (st === 0) body = `<h1>Welcome to Job Pilot</h1><p class="sub">Job Pilot finds jobs that fit you every day, tailors your resume for each one, applies where it can and explains every decision. It runs on <b>your own Claude Code</b> subscription.</p>
    <div class="card" style="margin-top:14px"><div class="stack">
      <div class="btns"><b>Claude Code CLI</b>${c.found ? `<span class="pill p-good">Found</span><span class="sub">${esc(c.path)}</span>` : `<span class="pill p-bad">Not found</span>`}</div>
      ${!c.found ? `<div class="sub">Install Claude Code from <a href="https://claude.com/claude-code" target="_blank" rel="noopener">claude.com/claude-code</a>, then press <b>Check again</b>.</div>` : ""}
      ${c.found ? `<div class="btns"><b>Signed in</b>${c.loggedIn ? `<span class="pill p-good">Yes</span>` : `<span class="pill p-bad">No</span> <button class="btn sm" data-action="claude-login">Sign in</button><span class="sub">A window opens: type <code>/login</code>, finish in the browser, close it.</span>`}</div>` : ""}
      <div><button class="btn sm" data-action="recheck">Check again</button></div></div></div>${nav(c.found && c.loggedIn)}`;
  if (st === 1) body = `<h1>Your resumes</h1><p class="sub">Add one or more. They're the only source of facts: Claude never invents experience. PDF works best.</p>
    <div class="card" style="margin-top:14px"><div class="drop" id="drop">Drop resume files here, or <b>click to choose</b><input type="file" id="file" accept=".pdf,.txt,.md" multiple hidden></div>
    <div class="stack" style="margin-top:12px">${S.STATE.resumes.map((r) => `<div class="btns"><b style="flex:1">${esc(r.file)}</b><button class="btn sm danger" data-action="remove-resume" data-file="${esc(r.file)}">Remove</button></div>`).join("")}</div></div>${nav(S.STATE.resumes.length)}`;
  if (st === 2) body = `<h1>What do you want to work on?</h1><p class="sub">Say it however you like. Claude turns it into searches.</p>
    <div class="card" style="margin-top:14px"><div class="form">
      <div class="field"><label>Your goals</label><textarea id="ob-goals" placeholder="e.g. I want to work in robotics or industrial automation, ideally hands-on with PLCs and embedded firmware. Junior roles. Not interested in sales.">${esc(OB.goals)}</textarea></div>
      <div class="row2"><div class="field"><label>Where?</label><textarea id="ob-loc" style="min-height:70px" placeholder="One per line: cities, countries or regions. e.g.&#10;Istanbul, Türkiye&#10;Germany&#10;Remote">${esc(OB.locations)}</textarea></div>
        <div class="field"><label>Workplace</label><div class="checks">${["onsite", "hybrid", "remote"].map((w) => `<label class="check"><input type="checkbox" data-wp="${w}" ${OB.workplace.includes(w) ? "checked" : ""}> ${w[0].toUpperCase() + w.slice(1)}</label>`).join("")}</div>
          <label style="margin-top:12px;font-weight:600;font-size:13px">Seniority</label><select id="ob-sen">${["", "Internship", "Entry level / new graduate", "Junior", "Mid-level", "Senior", "Lead / manager"].map((x) => `<option ${x === OB.seniority ? "selected" : ""} value="${esc(x)}">${x || "Let Claude decide from my resume"}</option>`).join("")}</select></div></div>
      <div class="row2"><div class="field"><label>GitHub username <span class="hint">optional</span></label><input type="text" id="ob-gh" value="${esc(OB.github)}"></div><div></div></div>
      <div class="field"><label>Anything employers might ask <span class="hint">optional</span></label><textarea id="ob-extra" placeholder="Phone, languages, work authorization, driving license, notice period, salary expectations…">${esc(OB.extra)}</textarea></div>
    </div></div>${nav(true, "Let Claude plan my search")}`;
  if (st === 3) body = OB.busy ? `<h1>Planning your search…</h1><div class="card" style="margin-top:14px"><span class="spinner"></span> Claude is reading your resumes and goals. This takes about a minute.</div>`
    : `<h1>Your search plan</h1><p class="sub">Edit anything. You can change it later in Settings.</p>
    ${OB.plan?.notes ? `<div class="callout info" style="margin-top:12px"><div class="ico">ℹ</div><div>${md(OB.plan.notes)}</div></div>` : ""}
    <div class="card" style="margin-top:14px"><div class="form">
      <div class="field"><label>Target fields</label><div class="stack" id="targets">${targetRows(OB.plan?.targets || [])}</div><div class="btns"><button class="btn sm" data-action="add-target">+ Add field</button></div></div>
      <div class="row2"><div class="field"><label>Locations</label><textarea id="pl-loc" style="min-height:70px">${esc((OB.plan?.locations || []).join("\n"))}</textarea></div>
        <div class="field"><label>Skip titles containing</label><textarea id="pl-ex" style="min-height:70px">${esc((OB.plan?.titleExclude || []).join("\n"))}</textarea></div></div>
      <div class="field"><label>Facts Claude may use in applications</label><textarea id="pl-facts" style="min-height:140px">${esc(OB.plan?.facts || "")}</textarea><div class="hint">Replace anything marked "unknown" if you can.</div></div>
    </div></div>${nav(true)}`;
  if (st === 4) body = `<h1>Sign in to LinkedIn</h1><p class="sub">Job Pilot uses its own Edge profile, so your normal browser isn't touched. Sign in once; it stays signed in.</p>
    <div class="card" style="margin-top:14px"><div class="stack"><div class="btns"><button class="btn primary" data-action="linkedin-login">Open LinkedIn</button><span class="sub">Sign in, then close that window.</span></div>
    <label class="check"><input type="checkbox" id="ob-li" ${OB.linkedinDone ? "checked" : ""}> I've signed in to LinkedIn</label>
    <div class="callout warn"><div class="ico">⚠</div><div>LinkedIn's terms don't allow automated applying. Keep the daily numbers modest; accounts that apply too much too fast can be restricted.</div></div></div></div>${nav(OB.linkedinDone)}`;
  if (st === 5) body = `<h1>When should it run?</h1>
    <div class="card" style="margin-top:14px"><div class="form">
      <div class="row2"><div class="field"><label>Every day at</label><input type="time" id="ob-time" value="${esc(S.STATE.settings.scheduleTime)}"></div>
        <div class="field"><label>Jobs to analyze per day</label><input type="number" id="ob-jobs" min="1" max="60" value="${S.STATE.settings.dailyJobs}"></div></div>
      <div class="field"><label>When a job has Easy Apply</label><select id="ob-mode"><option value="auto">Apply automatically</option><option value="analyze_only">Only analyze and tailor; I'll apply myself</option></select></div>
      <div class="field"><label>Claude usage</label><select id="ob-models"><option value="balanced">Balanced: Sonnet daily, Opus weekly (recommended)</option><option value="opus">Opus for everything (best, uses the most)</option><option value="sonnet">Sonnet for everything (lightest)</option></select>
        <div class="hint">Every job uses a few Claude calls (picking, scoring, tailoring, answering) from your plan.</div></div>
    </div></div>${nav(true, "Finish and start")}`;
  $("#view").innerHTML = `<div class="wizard">${steps}${body}</div>`;
  if (st === 1) bindDrop($("#drop"), $("#file"), async (files) => {
    S.STATE.resumes = await api.uploadResumes(files);
    toast(`Added ${files.length} file${files.length > 1 ? "s" : ""}`);
    app.render();
  });
}
export async function obNext() {
  const st = OB.step;
  if (st === 2) {
    OB.goals = $("#ob-goals").value.trim(); OB.locations = $("#ob-loc").value; OB.seniority = $("#ob-sen").value; OB.github = $("#ob-gh").value.trim(); OB.extra = $("#ob-extra").value;
    OB.workplace = [...document.querySelectorAll("[data-wp]")].filter((x) => x.checked).map((x) => x.dataset.wp);
    if (!OB.goals) return toast("Tell Claude what you want to work on first.");
    OB.step = 3; OB.busy = true; renderOnboarding();
    try { OB.plan = await api.planSearch({ goals: OB.goals, locations: lines(OB.locations), workplace: OB.workplace, seniority: OB.seniority, extra: OB.extra }); }
    catch (e) { OB.step = 2; toast(`Claude couldn't plan: ${e.message}`, 8000); }
    OB.busy = false; return renderOnboarding();
  }
  if (st === 3) Object.assign(OB.plan, { targets: readTargets(), locations: lines($("#pl-loc").value), titleExclude: lines($("#pl-ex").value), facts: $("#pl-facts").value });
  if (st === 5) {
    const models = { balanced: ["sonnet", "opus"], opus: ["opus", "opus"], sonnet: ["sonnet", "sonnet"] }[$("#ob-models").value];
    const p = OB.plan;
    await api.finishOnboarding(
      { name: p.name, goalsText: OB.goals, preferences: p.preferences || OB.goals, locations: p.locations, workplace: OB.workplace, seniority: p.seniority || OB.seniority,
        targets: p.targets, titleExclude: p.titleExclude, companyExclude: [], facts: p.facts, githubUser: OB.github || null },
      { scheduleEnabled: true, scheduleTime: $("#ob-time").value, dailyJobs: Number($("#ob-jobs").value) || 20, applyMode: $("#ob-mode").value, modelDaily: models[0], modelWeekly: models[1] });
    toast("All set. Claude is writing your ready resumes now; your first daily run starts on schedule (or press Run now).", 9000);
    S.view = "jobs"; return app.load();
  }
  OB.step++; renderOnboarding();
}
