// Onboarding step bodies (boards Onboarding, Onboarding-Profile). Each returns HTML; index.js reads the inputs back.
import { S } from "../../state.js";
import { esc, icon, rich } from "../../util.js";
import { tag } from "../../components/tag.js";
import { pill } from "../../components/status-pill.js";
import { callout } from "../../components/card.js";
import { OB } from "./index.js";

const WORK = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]];
const SENIORITY = ["", "Internship", "Entry level / new graduate", "Junior", "Mid-level", "Senior", "Lead / manager"];
const MODES = [["ask_below_target", "Apply at my target, ask me below it", "Recommended to start: you approve the weaker matches"],
  ["ask_all", "Ask before every application", "Claude prepares each one and sends nothing until you approve"],
  ["auto", "Apply automatically", "Every Easy Apply job above the cutoff, within your daily limits"],
  ["analyze_only", "Only analyze and tailor", "Nothing is sent; you apply yourself"]];
const PRESETS = [["balanced", "Balanced"], ["best", "Best quality"], ["light", "Lightest"]];
const tile = (ico, title, sub, btn = "") => `<div class="ob-tile"><span class="ob-tile__ico" aria-hidden="true">${ico}</span>
  <span class="ob-tile__text"><span class="ob-tile__title">${title}</span><span class="foot">${sub}</span></span>${btn}</div>`;
const field = (id, label, input, hint = "") => `<label class="jp-field" for="${id}"><span class="jp-field__label">${label}</span>${input}${hint ? `<span class="jp-field__hint">${hint}</span>` : ""}</label>`;

export function claudeStep() {
  const c = S.STATE.claude || {};
  if (!c.found) return `${tile(icon("doc", "ico ico--20"), "Claude Code isn't installed, or Job Pilot can't find it", "Job Pilot does all its thinking through your own Claude Code subscription.")}
    ${callout(`Install Claude Code from <a href="https://claude.com/claude-code" target="_blank" rel="noopener">claude.com/claude-code</a>, then press <b>Check again</b>. If it's installed somewhere unusual, paste the path to claude.exe below.`, "warning")}
    <div class="ob-inline">${field("ob-cpath", "Path to claude.exe", `<input class="jp-input" id="ob-cpath" type="text" spellcheck="false" placeholder="C:\\Users\\you\\.local\\bin\\claude.exe">`)}
      <button class="jp-btn" type="button" data-action="ob-cpath">Use this path</button></div>
    <button class="jp-btn jp-btn--tinted ob-self" type="button" data-action="recheck">Check again</button>`;
  const signed = c.loggedIn === true ? pill("Signed in", "success") : c.loggedIn === false ? pill("Not signed in", "danger") : pill("Couldn't check", "warning");
  return `${tile(icon("check", "ico ico--20"), "Claude Code found", esc(c.path), pill("Found", "success"))}
    ${tile(icon("user", "ico ico--20"), "Your Claude account", c.loggedIn ? "Every analysis uses your plan; there's no extra cost." : "Sign in once. A window opens: type /login, finish in your browser, then close it.", signed)}
    ${c.loggedIn === false ? `${c.note ? callout(`Claude said: ${esc(c.note)}`, "warning") : ""}<div class="ob-inline"><button class="jp-btn jp-btn--primary" type="button" data-action="claude-login">Sign in to Claude</button>
      <button class="jp-btn" type="button" data-action="recheck">Check again</button></div>` : ""}
    ${c.loggedIn == null ? callout("The check timed out. Press Check again; if it keeps timing out you can continue and Job Pilot will tell you if a run can't reach Claude.", "warning") + `<button class="jp-btn ob-self" type="button" data-action="recheck">Check again</button>` : ""}`;
}

export function resumesStep() {
  const list = S.RES?.originals || [];
  return `${list.length ? `<section class="ob-sec" aria-labelledby="ob-files"><h3 id="ob-files" class="cap">Your resumes</h3>${list.map((o) => `<div class="ob-file">
      <span class="ob-tile__ico ob-tile__ico--acc" aria-hidden="true">${icon("doc-check", "ico ico--20")}</span>
      <span class="ob-tile__text"><span class="ob-tile__title">${esc(o.name)} <span class="foot">· ${esc(o.file)}</span></span>
        <span class="foot">${o.read ? `Claude read it: ${esc([o.read.roles?.length ? `${o.read.roles.length} roles` : "", o.read.languages?.join(", ")].filter(Boolean).join(" · "))}` : "Not read by Claude yet; it reads it on the first run"}</span>
        ${o.read?.skills?.length ? `<span class="ob-tags">${o.read.skills.slice(0, 10).map((s) => tag(s)).join("")}</span>` : ""}</span>
      <button class="jp-btn jp-btn--plain jp-btn--sm st-danger" type="button" data-action="ob-remove-resume" data-file="${esc(o.file)}">Remove</button></div>`).join("")}</section>` : ""}
    <button class="ob-drop" type="button" data-action="ob-upload"><span class="ob-tile__ico ob-tile__ico--acc" aria-hidden="true">${icon("upload", "ico ico--20")}</span>
      <span class="ob-tile__text"><span class="ob-tile__title">${list.length ? "Add another resume" : "Add your resume"}</span><span class="foot">PDF works best. Claude reads it and shows what it found.</span></span></button>
    <p class="foot">Claude only uses what's in your resumes, your facts and GitHub. It never invents experience. If something is missing, fix the file and upload it again.</p>`;
}

export function githubStep() {
  const ok = OB.ghInfo;
  return `${tile(icon("github", "ico ico--20"), "Read-only access to your public repos", "Claude uses them as evidence when it tailors a resume, and reviews them in Insights. No sign-in, never private repos.")}
    <div class="ob-inline">${field("ob-gh", "GitHub username", `<input class="jp-input" id="ob-gh" type="text" autocomplete="off" spellcheck="false" value="${esc(OB.github)}" placeholder="username">`)}
      <button class="jp-btn" type="button" data-action="ob-gh-check">Check</button></div>
    ${OB.ghError ? callout(esc(OB.ghError), "danger") + `<button class="jp-btn jp-btn--plain jp-btn--sm ob-self" type="button" data-action="ob-gh-anyway">Use ${esc(OB.github)} without checking</button>` : ok?.unchecked ? callout(`Claude will use <b>${esc(ok.user)}</b>. If the name is wrong, GitHub just returns nothing and you can fix it in Settings.`) : ok ? callout(`Found <b>${esc(ok.name || ok.user)}</b> with <span class="jp-num">${ok.repos}</span> public ${ok.repos === 1 ? "repo" : "repos"}. Claude reviews them during your first run.`) : ""}`;
}

export function goalsStep() {
  return `${field("ob-goals", "Your goals, in your own words", `<textarea class="jp-input ob-goals" id="ob-goals" rows="6" placeholder="e.g. Industrial automation or robotics engineer, full-time. Kocaeli, Izmir or remote. Embedded roles only if they build on my STM32 work. No sales roles.">${esc(OB.goals)}</textarea>`,
      "Claude reads this before every run and every answer in Guidance. Fields, cities and deal-breakers help most.")}
    <div class="ob-grid2">${field("ob-loc", "Where?", `<textarea class="jp-input" id="ob-loc" rows="3" placeholder="One per line, e.g.&#10;Istanbul, Türkiye&#10;Germany">${esc(OB.locations)}</textarea>`, "Cities, countries or regions, as you'd type them on LinkedIn")}
      <div class="jp-field"><span class="jp-field__label" id="ob-wp">Workplace</span><div class="st-chips" role="group" aria-labelledby="ob-wp">${WORK.map(([k, l]) =>
        `<button class="chip" type="button" aria-pressed="${OB.workplace.includes(k)}" data-action="ob-wp" data-v="${k}">${l}</button>`).join("")}</div>
        ${field("ob-sen", "Seniority", `<select class="jp-input" id="ob-sen">${SENIORITY.map((x) => `<option value="${esc(x)}"${x === OB.seniority ? " selected" : ""}>${x || "Let Claude decide from my resume"}</option>`).join("")}</select>`)}</div></div>
    ${field("ob-extra", "Anything employers might ask <span class=\"foot\">· optional</span>", `<textarea class="jp-input" id="ob-extra" rows="3" placeholder="Phone, languages, work authorization, driving license, notice period, salary expectations…">${esc(OB.extra)}</textarea>`)}`;
}

export function planStep() {
  if (OB.busy) return `<p class="meta st-wait"><span class="st-spin" aria-hidden="true"></span>Claude is reading your resumes and goals and writing your search profiles. This takes about a minute.</p>`;
  if (OB.error || !OB.plan) return `${callout(`Claude couldn't make your plan${OB.error ? `: ${esc(OB.error)}` : "."} Check that Claude is signed in (step 1) and your plan has usage left, then try again.`, "danger")}
    <button class="jp-btn jp-btn--primary ob-self" type="button" data-action="ob-plan">Try again</button>`;
  const p = OB.plan;
  return `${callout(`Claude made ${p.targets.length === 1 ? "this profile" : `these ${p.targets.length} profiles`} from your goals and resumes. Change anything; Settings has every detail later.${p.notes ? rich(p.notes) : ""}`)}
    <div class="ob-plan">${p.targets.map((t, i) => `<section class="ob-prof" data-pi="${i}" aria-label="Profile ${i + 1}">
      <div class="ob-prof__head">${field(`ob-pn-${i}`, "Profile name", `<input class="jp-input" id="ob-pn-${i}" data-k="field" type="text" value="${esc(t.field)}">`)}
        <button class="jp-btn jp-btn--sm btn-icon st-x" type="button" aria-label="Remove ${esc(t.field)}" data-action="ob-plan-remove" data-i="${i}">${icon("close")}</button></div>
      ${field(`ob-pt-${i}`, "Job titles to search", `<textarea class="jp-input" id="ob-pt-${i}" data-k="searchTerms" rows="3">${esc(t.searchTerms.join("\n"))}</textarea>`)}
      ${t.why ? `<span class="foot">${esc(t.why)}</span>` : ""}</section>`).join("")}</div>
    <div class="ob-inline"><button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="ob-plan-add">${icon("plus")}Add a profile</button>
      <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="ob-plan">Ask Claude again</button></div>
    <div class="ob-grid2">${field("ob-ploc", "Locations, for every profile", `<textarea class="jp-input" id="ob-ploc" rows="3">${esc((p.locations || []).join("\n"))}</textarea>`)}
      ${field("ob-pex", "Skip titles containing", `<textarea class="jp-input" id="ob-pex" rows="3">${esc((p.titleExclude || []).join("\n"))}</textarea>`, "Words that rule a job out, one per line")}</div>
    ${field("ob-pfacts", "Facts Claude may use in applications", `<textarea class="jp-input" id="ob-pfacts" rows="5">${esc(p.facts || "")}</textarea>`, 'Replace anything marked "unknown" if you can.')}`;
}

export function linkedinStep() {
  const li = OB.li || {};
  return `${tile(`<span class="ob-in">in</span>`, "LinkedIn opens in its own window", "Sign in there as you normally do, then close it. Job Pilot keeps the session on this computer in its own Edge profile; Claude never sees your password.",
      `<button class="jp-btn jp-btn--primary" type="button" data-action="linkedin-login">Open LinkedIn</button>`)}
    <div class="ob-inline"><button class="jp-btn" type="button" data-action="ob-li-check"${li.busy ? " disabled" : ""}>${li.busy ? "Checking…" : "Check I'm signed in"}</button>
      ${li.loggedIn ? pill("Signed in", "success") : li.checked ? pill(li.limited ? "Limited" : "Not signed in", li.limited ? "warning" : "danger") : ""}
      ${OB.linkedinDone || li.busy ? "" : `<button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="ob-li-manual">I signed in, skip the check</button>`}</div>
    ${li.error ? callout(`Couldn't check: ${esc(li.error)}`, "warning") : li.checked && !li.loggedIn ? callout("LinkedIn still shows the sign-in page. Open LinkedIn, sign in, close the window, then check again.", "warning") : ""}
    ${callout("LinkedIn's terms don't allow automated applying. Keep the daily numbers modest; accounts that apply too much too fast can be restricted.", "warning")}`;
}

export function scheduleStep() {
  const s = OB.sched;
  return `<div class="ob-grid2">${field("ob-time", "Run every day at", `<input class="jp-input jp-num" id="ob-time" type="time" value="${esc(s.time)}">`, "Your PC must be on; if it's asleep, the run starts when it wakes")}
      ${field("ob-jobs", "Pause after about this many jobs a day", `<input class="jp-input jp-num" id="ob-jobs" type="number" min="1" max="60" value="${s.jobs}">`, "Each job uses a few Claude calls from your plan")}</div>
    <div class="jp-field"><span class="jp-field__label" id="ob-mode">When a job has Easy Apply</span>
      <div class="st-radios" role="radiogroup" aria-labelledby="ob-mode">${MODES.map(([id, label, sub]) => `<button class="st-radio" type="button" role="radio" aria-checked="${s.mode === id}" data-action="ob-mode" data-v="${id}">
        <span class="st-radio__dot" aria-hidden="true"></span><span class="st-radio__text"><span class="st-radio__label">${label}</span><span class="foot">${sub}</span></span></button>`).join("")}</div></div>
    <div class="jp-field"><span class="jp-field__label" id="ob-models">Claude models</span>
      <span class="jp-seg ob-self" role="radiogroup" aria-labelledby="ob-models">${PRESETS.map(([id, l]) => `<button class="jp-seg__item" type="button" role="radio" aria-checked="${s.models === id}" aria-selected="${s.models === id}" data-action="ob-models" data-v="${id}">${l}</button>`).join("")}</span>
      <span class="jp-field__hint">${{ balanced: "Sonnet for daily work, Opus for weekly reviews. Recommended.", best: "Opus for everything: best results, uses your plan fastest.", light: "Sonnet for everything: lightest on your plan." }[s.models]}</span></div>`;
}
