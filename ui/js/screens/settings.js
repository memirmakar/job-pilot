// Settings: profile (goals, locations, target fields, facts), run settings, accounts, app actions.
import { S } from "../state.js";
import { $, esc, fmtDate, lines } from "../util.js";

export function targetRows(targets) {
  return targets.map((t, i) => `<div class="card" style="background:var(--fill)" data-target="${i}">
    <div class="row2"><div class="field"><label>Field</label><input type="text" data-k="field" value="${esc(t.field)}"></div>
      <div class="field"><label>LinkedIn searches <span class="hint">one per line</span></label><textarea data-k="searchTerms" style="min-height:70px">${esc((t.searchTerms || []).join("\n"))}</textarea></div></div>
    ${t.why ? `<div class="sub" style="margin-top:6px">${esc(t.why)}</div>` : ""}
    <div class="btns" style="margin-top:8px"><button class="btn sm danger" data-action="remove-target" data-i="${i}">Remove field</button></div></div>`).join("");
}
export const readTargets = () => [...document.querySelectorAll("[data-target]")].map((el) => ({
  field: el.querySelector('[data-k="field"]').value.trim(), searchTerms: lines(el.querySelector('[data-k="searchTerms"]').value),
})).filter((t) => t.field && t.searchTerms.length);

export function renderSettings() {
  const s = S.STATE.settings, p = S.STATE.profile || {};
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`;
  $("#view").innerHTML = `
    <div class="section-title" style="margin-top:0">What you're looking for</div>
    <div class="card"><div class="form">
      <div class="field"><label>Your goals, in your words</label><textarea id="p-goals">${esc(p.preferences || p.goalsText || "")}</textarea></div>
      <div class="row2">
        <div class="field"><label>Locations <span class="hint">one per line, as you'd type them on LinkedIn</span></label><textarea id="p-locations" style="min-height:70px">${esc((p.locations || []).join("\n"))}</textarea></div>
        <div class="field"><label>Skip titles containing <span class="hint">one per line</span></label><textarea id="p-exclude" style="min-height:70px">${esc((p.titleExclude || []).join("\n"))}</textarea></div>
      </div>
      <div class="row2">
        <div class="field"><label>Seniority</label><input type="text" id="p-seniority" value="${esc(p.seniority || "")}"></div>
        <div class="field"><label>GitHub username</label><input type="text" id="p-github" value="${esc(p.githubUser || "")}" placeholder="optional"></div>
      </div>
      <div class="field"><label>Target fields</label><div class="stack" id="targets">${targetRows(p.targets || [])}</div>
        <div class="btns"><button class="btn sm" data-action="add-target">+ Add field</button></div></div>
      <div class="field"><label>Facts Claude may use in applications</label><textarea id="p-facts" style="min-height:150px">${esc(p.facts || "")}</textarea>
        <div class="hint">Contact details, languages, work authorization, notice period, salary hints… Anything not here or in your resumes, Claude decides to maximize your interview chances.</div></div>
      <div class="btns"><button class="btn primary" data-action="save-profile">Save</button></div>
    </div></div>

    <div class="section-title">How Job Pilot runs</div>
    <div class="card"><div class="form">
      <div class="row2">
        <div class="field"><label>Daily run</label><div class="btns"><label class="check"><input type="checkbox" id="s-sched" ${s.scheduleEnabled ? "checked" : ""}> Every day at</label><input type="time" id="s-time" value="${esc(s.scheduleTime)}" style="width:130px"></div>
          <div class="hint">${S.STATE.schedule.exists ? `Scheduled · next ${fmtDate(S.STATE.schedule.next)}` : "Not scheduled"}. Your PC must be on and you must be logged in to Windows.</div></div>
        <div class="field"><label>When a job has Easy Apply</label><select id="s-mode">${opt("auto", s.applyMode, "Apply automatically")}${opt("ask_below_target", s.applyMode, "Apply at my target and up; ask me below it")}${opt("ask_all", s.applyMode, "Fill the form, then ask me before every application")}${opt("analyze_only", s.applyMode, "Only analyze and tailor; I'll apply myself")}</select></div>
      </div>
      <div class="row2">
        <div class="field"><label>Jobs to analyze per day</label><input type="number" id="s-jobs" min="1" max="60" value="${s.dailyJobs}"></div>
        <div class="field"><label>Applications per day (max)</label><input type="number" id="s-apply" min="0" max="60" value="${s.dailyApplyLimit}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Claude for daily work</label><select id="s-mdaily">${opt("sonnet", s.modelDaily, "Sonnet (recommended: uses less of your plan)")}${opt("opus", s.modelDaily, "Opus (best quality, uses more)")}${opt("haiku", s.modelDaily, "Haiku (lightest)")}</select>
          <div class="hint">Picking, scoring, tailoring and answering questions.</div></div>
        <div class="field"><label>Claude for weekly work</label><select id="s-mweekly">${opt("opus", s.modelWeekly, "Opus (recommended)")}${opt("sonnet", s.modelWeekly, "Sonnet")}</select>
          <div class="hint">Ready resumes, market review, GitHub review, doctor.</div></div>
      </div>
      <div class="row2">
        <div class="field"><label>Don't apply below ATS score</label><input type="number" id="s-min" min="0" max="100" value="${s.minAtsScore}"></div>
        <div class="field"><label>Listings posted within</label><select id="s-posted">${opt("r86400", s.postedWithin, "24 hours")}${opt("r604800", s.postedWithin, "1 week")}${opt("r2592000", s.postedWithin, "1 month")}</select></div>
      </div>
      <div class="row2">
        <div class="field"><label>Tailoring passes per job</label><select id="s-passes">${opt(1, s.tailorMaxPasses, "1 (less usage)")}${opt(2, s.tailorMaxPasses, "2 (higher scores)")}</select></div>
        <div class="field"><label>Stop a run after (minutes)</label><input type="number" id="s-maxmin" min="15" max="600" value="${s.maxRunMinutes}"></div>
      </div>
      <div class="btns"><button class="btn primary" data-action="save-settings">Save</button></div>
    </div></div>

    <div class="section-title">Accounts</div>
    <div class="card"><div class="stack">
      <div class="btns"><b style="min-width:160px">Claude Code CLI</b>
        ${S.STATE.claude?.found ? `<span class="pill ${S.STATE.claude.loggedIn ? "p-good" : "p-bad"}">${S.STATE.claude.loggedIn ? "Signed in" : "Not signed in"}</span><span class="sub">${esc(S.STATE.claude.path)}</span>` : `<span class="pill p-bad">Not found</span>`}
        <button class="btn sm" data-action="claude-login">Sign in</button><button class="btn sm" data-action="recheck">Check again</button></div>
      <div class="field"><label>Claude Code path <span class="hint">only if it isn't found automatically</span></label>
        <div class="btns"><input type="text" id="s-claudepath" value="${esc(s.claudePath || "")}" placeholder="C:\\Users\\you\\.local\\bin\\claude.exe" style="flex:1"><button class="btn sm" data-action="save-claudepath">Save</button></div></div>
      <div class="btns"><b style="min-width:160px">LinkedIn</b><button class="btn sm" data-action="linkedin-login">Open LinkedIn to sign in</button>
        <span class="sub">Signs in inside Job Pilot's own Edge profile. Close that window when you're done.</span></div>
    </div></div>

    <div class="section-title">App</div>
    <div class="card"><div class="btns"><button class="btn" data-action="dry-run">Test run (no submitting)</button>
      <button class="btn" data-action="task" data-task="review">Refresh market review</button>
      <button class="btn" data-action="task" data-task="github">Refresh GitHub</button>
      <button class="btn danger" data-action="quit">Quit Job Pilot</button></div>
      <div class="sub" style="margin-top:8px">Quitting closes this page's server; the daily run still happens on schedule. Open Job Pilot again from its desktop shortcut.</div></div>`;
}
