// Doctor health checks → words (canvas board Doctor). Each check: { id title detail status tone problem fix action icon }.
// action: { label, act (a data-action) | nav (a section) }. Read only: built from what the app already loaded, plus
// /api/doctor/checks (C) and its LinkedIn session check. No HTML here.
import { S } from "../../state.js";
import { runProblem } from "../jobs/track.js";
import { when, duration, time } from "../activity/model.js";

export const ICON = {
  linkedin: '<path d="M4 4h16v16H4zM8 10v6M8 7v.5M12 16v-4a2 2 0 0 1 4 0v4"></path>',
  claude: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path>',
  resumes: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 15l2 2 4-4"></path>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5 5 0 0 0-1.4-3.6 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.4 0C6.1 1.1 5 1.4 5 1.4a4.7 4.7 0 0 0-.1 3.5A5 5 0 0 0 3.5 8.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V21"></path>',
  run: '<path d="M5 12l5 5 9-10"></path>',
};
const ok = (status) => ({ status, tone: "success" });
const LOGIN = { label: "Log in to LinkedIn", act: "linkedin-login" };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const lastRun = () => S.RUNS?.[0] || null;

function linkedin(C) {
  const li = C?.linkedin, run = lastRun(), o = run?.outcome || {};
  const base = { id: "linkedin", title: "LinkedIn session", icon: ICON.linkedin };
  const out = { problem: "You're logged out of LinkedIn.", fix: "Log in to LinkedIn, then run again.", status: "Logged out", tone: "danger", action: LOGIN };
  if (C && !C.linkedinProfile) return { ...base, ...out, status: "Not logged in", detail: "Job Pilot has no LinkedIn session yet, so runs can't search or apply.", problem: "You're not logged in to LinkedIn." };
  // The newest evidence wins: the session check here, or what the last run saw
  if (li && (!run || li.at > (run.endedAt || run.startedAt))) {
    if (li.loggedIn === false) return { ...base, ...out, detail: `Checked ${when(li.at)}: LinkedIn asked you to sign in. The next run can't start until you log in.` };
    if (li.limited) return { ...base, status: "Limited", tone: "warning", detail: `Checked ${when(li.at)}: ${li.error}`, problem: "LinkedIn is limiting your account.", fix: "Runs pause until it lifts; there's nothing to do now.", action: { label: "Check again", act: "doc-linkedin" } };
    if (li.loggedIn == null) return { ...base, status: "Couldn't check", tone: "warning", detail: `Checked ${when(li.at)}: ${li.error || "the browser didn't open"}.`, action: { label: "Check again", act: "doc-linkedin" } };
    return { ...base, ...ok("Logged in"), detail: `Checked ${when(li.at)} · searches and Easy Apply work`, action: { label: "Log in again", act: "linkedin-login" } };
  }
  if (o.stopKind === "linkedin_login") return { ...base, ...out, detail: `Your session ended ${when(o.stoppedAt || run.endedAt)}. The next run can't start until you log in.` };
  if (o.stopKind === "linkedin_limit") return { ...base, status: "Limited", tone: "warning", detail: `LinkedIn limited your account ${when(o.stoppedAt || run.endedAt)}.${o.resumeAt ? ` Runs try again ${when(o.resumeAt)}.` : ""}`, action: { label: "Check now", act: "doc-linkedin" } };
  const used = (S.RUNS || []).find((r) => r.counts?.listings_seen || r.outcome?.analyzed);
  if (used) return { ...base, ...ok("Logged in"), detail: `Last used by the run ${when(used.startedAt)} · check now to be sure`, action: { label: "Check now", act: "doc-linkedin" } };
  return { ...base, status: "Not checked", tone: "neutral", detail: "No run has used LinkedIn yet.", action: { label: "Check now", act: "doc-linkedin" } };
}

// A plan limit is over at the reset time Claude gave ("resets 8:30pm"), or after 5 hours when it gave none
function limitOver(r) {
  const m = String(r.outcome?.stop).match(/resets (\d{1,2})(?::(\d\d))?\s*(am|pm)/i), end = new Date(r.endedAt);
  if (!m) return Date.now() - end > 5 * 36e5;
  const reset = new Date(end);
  reset.setHours((Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0), Number(m[2] || 0), 0, 0);
  if (reset < end) reset.setDate(reset.getDate() + 1);
  return Date.now() > reset;
}

function claude(C) {
  const c = S.STATE?.claude, base = { id: "claude", title: "Claude connection and usage", icon: ICON.claude };
  const spent = C?.usage ? `$${C.usage.costUsd.toFixed(2)} used by Job Pilot this month` : "";
  if (!c) return { ...base, status: "Not checked", tone: "neutral", detail: "Checking…", action: { label: "Check again", act: "doc-check" } };
  if (!c.found) return { ...base, status: "Not found", tone: "danger", detail: "The Claude Code CLI isn't installed, or isn't where Job Pilot looks.", problem: "Job Pilot can't find Claude.", fix: "Set its path in Settings.", action: { label: "Open Settings", nav: "settings" } };
  if (c.loggedIn === false) return { ...base, status: "Signed out", tone: "danger", detail: c.note || "Claude answered that you're not signed in.", problem: "You're signed out of Claude.", fix: "Sign in, then check again.", action: { label: "Sign in to Claude", act: "claude-login" } };
  if (c.loggedIn == null) return { ...base, status: "Not sure", tone: "warning", detail: `Claude didn't answer in time${c.note ? ` (${c.note})` : ""}.`, action: { label: "Check again", act: "doc-check" } };
  const limit = (S.RUNS || []).find((r) => r.outcome?.stopKind === "claude_limit" && !limitOver(r));
  if (limit) return { ...base, status: "Plan limit", tone: "warning", detail: `Connected · ${spent}. The run ${when(limit.endedAt)} hit your plan limit: ${limit.outcome.stop.replace(/^Claude plan limit reached \(?|\)?\. The rest.*$/g, "")}.`, action: { label: "Open usage", nav: "settings" } };
  return { ...base, ...ok("Connected"), detail: `Connected${spent ? " · " + spent : ""}`, action: { label: "Open usage", nav: "settings" } };
}

function resumes(C) {
  const r = C?.resumes, base = { id: "resumes", title: "Resumes read correctly", icon: ICON.resumes, action: { label: "Open Resumes", nav: "resumes" } };
  if (!r) return { ...base, status: "Not checked", tone: "neutral", detail: "Checking…" };
  const all = `${plural(r.originals, "original")} and ${plural(r.tailored, "tailored resume")}`;
  if (!r.originals) return { ...base, status: "No resumes", tone: "danger", detail: "Claude needs at least one resume to score and tailor.", problem: "You have no resumes yet.", fix: "Add an original on Resumes." };
  if (r.empty.length) return { ...base, status: "Can't read", tone: "danger", detail: all, problem: `${plural(r.empty.length, "file")} look${r.empty.length === 1 ? "s" : ""} empty: ${r.empty.join(", ")}.`, fix: "Upload a version with text in it (not a scan)." };
  if (r.unread.length) return { ...base, status: `${r.unread.length} not read yet`, tone: "warning", detail: `${all} · Claude hasn't read ${r.unread.join(", ")} yet. It does on the next run.` };
  return { ...base, ...ok("All read"), detail: `${all} · each one read or scored by Claude` };
}

function github(C) {
  const g = C?.github, base = { id: "github", title: "GitHub connected", icon: ICON.github };
  const read = { label: "Read GitHub again", act: "task", task: "github" };
  if (!g) return { ...base, status: "Not checked", tone: "neutral", detail: "Checking…" };
  if (!g.user) return { ...base, status: "Not connected", tone: "neutral", detail: "Add your GitHub user name in Settings so Claude can use your projects.", action: { label: "Open Settings", nav: "settings" } };
  if (!g.fetchedAt || !g.sameUser) return { ...base, status: "Not read yet", tone: "warning", detail: `${g.user} · Claude hasn't read these repos yet.`, action: read };
  const old = Date.now() - Date.parse(g.fetchedAt) > 30 * 864e5;
  return { ...base, ...(old ? { status: "Out of date", tone: "warning" } : ok("Connected")), detail: `${g.user} · ${plural(g.repos ?? 0, "public repo")} · last read ${when(g.fetchedAt)}`, action: read };
}

function run() {
  const base = { id: "run", title: "Last run succeeded", icon: ICON.run, action: { label: "Open Activity", nav: "activity" } };
  if (S.STATE?.run?.running) return { ...base, status: "Running", tone: "info", detail: "A run is going now." };
  const p = runProblem(), r = p?.run || lastRun();
  if (!r) return { ...base, status: "No runs yet", tone: "neutral", detail: "Your first run shows up here." };
  const o = r.outcome || {}, span = `${when(r.startedAt)} – ${time(r.endedAt || p?.at || r.startedAt)}`;
  const counts = `${o.analyzed ?? r.counts?.analyzed ?? 0} analyzed, ${o.applied ?? 0} applied${r.opts?.dryRun ? " · test run" : ""}`;
  if (p?.kind === "limited") return { ...base, status: "Paused", tone: "warning", detail: `${span} · ${counts}`, problem: "The last run paused.", fix: o.stop };
  if (p?.kind === "runFailed" || p?.kind === "loggedOut") return { ...base, status: "Stopped", tone: "danger", detail: `${span} · ${counts}`, problem: "The last run stopped.", fix: p.reason || o.stop, action: { label: "Run again", act: "doc-run-again" } };
  return { ...base, ...ok("Finished"), detail: `${span} (${duration(r.startedAt, r.endedAt || r.startedAt)}) · ${counts}` };
}

// Only the first failing check's fix is the primary button
export function allChecks(C) {
  const list = [linkedin(C), claude(C), resumes(C), github(C), run()];
  const first = list.find((c) => c.tone === "danger");
  return list.map((c) => ({ ...c, primary: c === first }));
}
