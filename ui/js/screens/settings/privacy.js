// Settings > Data and privacy (board Settings-Privacy): what goes to Claude through your Claude Code CLI and what stays here,
// your accounts, Export (a ZIP of data/, resumes/ and the log) and Delete my data (a backup ZIP first, then everything goes).
import { S, app } from "../../state.js";
import * as api from "../../api.js";
import { esc, icon, toast } from "../../util.js";
import { openSheet, closeSheet, sheetEl } from "../../components/sheet.js";
import { callout } from "../../components/card.js";
import { profile } from "./index.js";
import { resetOnboarding } from "../onboarding/index.js";

const SENT = [
  ["Job postings Claude reads", "The text of each listing your searches return, to pick and score them"],
  ["Your resumes, facts and standard answers", "To score each job, tailor a resume and answer application questions"],
  ["Your goals", "Read when Claude picks jobs and in every Guidance answer"],
  ["Your public GitHub repos", "READMEs and file lists, as evidence for your skills. Never private repos"],
  ["Application questions", "The form's questions, so Claude can draft answers"],
  ["What you write in Guidance and Ask", "Only the conversation you're in, and what you let it see"],
];
const LOCAL = [
  ["LinkedIn sign-in", "Job Pilot's own Edge profile (browser_profile). Claude never sees your password"],
  ["Jobs, statuses and the Activity log", "data/applications and applications.csv"],
  ["Resumes: originals, ready and tailored", "resumes/ and data/, every version"],
  ["Conversations with Claude", "data/conversations. Claude Code saves no session of its own for these calls"],
  ["Settings, search profiles and never-apply list", "data/settings.json and data/profile.json"],
];
const items = (list) => list.map(([label, sub]) => `<div class="st-item"><span class="st-row__label">${esc(label)}</span><span class="foot">${esc(sub)}</span></div>`).join("");

export function privacyHtml() {
  const p = profile();
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Data and privacy</h2>
      <p class="meta">What Claude sees, and what never leaves this computer.</p></div></div>
    <div class="st-pair">
      <section class="jp-card st-pcard" aria-labelledby="st-sent"><h3 id="st-sent" class="t-headline st-pcard__title">${icon("send", "ico ico--20 st-acc")}Sent to Claude</h3>
        <span class="foot">Through your own Claude Code CLI, under your Claude account, only when a run or a conversation needs it</span>${items(SENT)}</section>
      <section class="jp-card st-pcard" aria-labelledby="st-local"><h3 id="st-local" class="t-headline st-pcard__title">${icon("monitor", "ico ico--20")}Stays on this computer</h3>
        <span class="foot">In ${esc(S.STATE.dir || "Job Pilot's folder")}</span>${items(LOCAL)}</section>
    </div>
    <section class="jp-list st-wide" aria-label="Accounts">
      <div class="st-row"><span class="st-row__text"><span class="st-row__label">LinkedIn</span><span class="foot">${S.STATE.linkedinProfile ? "Signed in once in Job Pilot's Edge window. Sign in again if a run says you're logged out." : "Not signed in yet"}</span></span>
        <button class="jp-btn jp-btn--sm" type="button" data-action="linkedin-login">Open LinkedIn to sign in</button></div>
      <label class="st-row"><span class="st-row__text"><span class="st-row__label">GitHub username</span><span class="foot">Public repos only, read without signing in. Empty = Claude doesn't use GitHub.</span></span>
        <input class="jp-input st-gh" type="text" data-pset="githubUser" value="${esc(p.githubUser || "")}" placeholder="username" autocomplete="off"></label>
    </section>
    <section class="jp-list st-wide" aria-label="Your data">
      <div class="st-row"><span class="st-row__text"><span class="st-row__label">Export my data</span>
        <span class="foot">A ZIP with your jobs, resumes, answers, conversations, settings and Activity log. Not your LinkedIn sign-in.</span></span>
        <a class="jp-btn" href="${api.exportUrl}" download>${icon("download")}Export</a></div>
      <div class="st-row"><span class="st-row__text"><span class="st-row__label">Delete my data</span>
        <span class="foot">Removes everything Job Pilot stored here, signs it out of LinkedIn and turns off the schedule. A backup ZIP is saved first.</span></span>
        <button class="jp-btn jp-btn--danger" type="button" data-action="data-delete">Delete my data…</button></div>
    </section>`;
}

function deleteSheet() {
  openSheet({
    center: true, title: "Delete all your data?", subtitle: "Job Pilot starts again from its first-run setup",
    body: `${callout("This removes your jobs, resumes, tailored files, conversations, settings, search profiles and the Activity log, and signs Job Pilot out of LinkedIn. Claude Code itself and your LinkedIn account aren't touched.", "danger")}
      <p class="t-callout">First, a backup ZIP of everything is saved in the <b>backups</b> folder inside Job Pilot's folder. Delete that file too if you want nothing left.</p>
      <label class="jp-field" for="dd-confirm"><span class="jp-field__label">Type DELETE to confirm</span><input class="jp-input" id="dd-confirm" type="text" autocomplete="off" spellcheck="false"></label>`,
    actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>
      <button class="jp-btn jp-btn--danger" type="button" data-action="data-delete-yes" disabled>Back up and delete</button>`,
  });
  const input = sheetEl().querySelector("#dd-confirm");
  input.addEventListener("input", () => { sheetEl().querySelector('[data-action="data-delete-yes"]').disabled = input.value.trim() !== "DELETE"; });
  setTimeout(() => input.focus(), 0);
}

export const PRIVACY_ACTIONS = {
  "data-delete": () => deleteSheet(),
  "data-delete-yes": async (el) => {
    if (sheetEl()?.querySelector("#dd-confirm")?.value.trim() !== "DELETE") return;
    el.disabled = true; el.textContent = "Backing up…";
    try {
      const r = await api.deleteData();
      closeSheet();
      toast(`Deleted. The backup is ${r.backup}.${r.failed.length ? ` Couldn't remove ${r.failed.join(", ")}: close Edge and delete it by hand.` : ""}`, 12000);
      resetOnboarding(); await app.load();
    } catch (e) { el.disabled = false; el.textContent = "Back up and delete"; toast(e.message, 8000); }
  },
};
