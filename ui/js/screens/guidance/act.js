// Guidance: running a Claude call with Cancel, and the actions Claude's answers end in. Every action that changes your data
// (goals, to-do, a resume) opens a sheet that shows the change and waits for your OK; drafts are only ever copied, never sent.
import { S, app, loadData } from "../../state.js";
import * as api from "../../api.js";
import { esc, toast } from "../../util.js";
import { go } from "../../router.js";
import { openSheet, updateSheet, closeSheet } from "../../components/sheet.js";
import { callout } from "../../components/card.js";
import { openChecked } from "../resumes/reupload.js";
import * as Res from "../resumes/model.js";
import * as M from "./model.js";

export async function refreshList() {
  try { const r = await api.getCoach(); S.g.list = r.list; S.g.serverPending = r.pending || {}; } catch {}
}
export async function loadConv(cid) {
  if (cid === "new") return;
  try { S.g.convs[cid] = await api.getCoachConv(cid); delete S.g.errors[cid]; }
  catch (e) { S.g.errors[cid] = e; }
}

// One Claude call for a conversation: "Claude is thinking" with Cancel; text (the user's message) comes back to the box on failure
export async function withClaude(cid, what, text, fn) {
  if (S.g.pending[cid]) return;
  const ctrl = new AbortController();
  S.g.pending[cid] = { what, ctrl, text, at: new Date().toISOString() };
  delete S.g.errors[cid];
  if (text) S.g.drafts[cid] = "";
  app.render();
  try { const c = await fn(ctrl.signal); if (c?.cid) S.g.convs[c.cid] = { ...S.g.convs[c.cid], ...c }; }
  catch (e) { S.g.errors[cid] = e; if (text) S.g.drafts[cid] = text; }
  delete S.g.pending[cid];
  await refreshList();
  app.render();
}
export function cancel(cid) {
  S.g.pending[cid]?.ctrl.abort();
  api.coachCancel(cid).catch(() => {});
  delete S.g.serverPending[cid];
}

const done = (key) => { S.g.done[key] = true; app.render(); };
const actionsHtml = (label, cls = "jp-btn--primary") => `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>
  <button class="jp-btn ${cls}" type="button" id="g-sheet-ok">${label}</button>`;
const onOk = (el, fn) => el.querySelector("#g-sheet-ok").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try { await fn(); } catch (err) { e.target.disabled = false; toast(err.message, 7000); }
});

// ----- Add to to-do: an existing step, or new ones (a coach answer, an interview's practice list) -----
function addTodo(a, key) {
  const it = a.todo_id ? (S.INS?.todo?.items || []).find((i) => i.id === a.todo_id) : null;
  const items = it ? [{ title: it.title || it.do, why: it.why, hours: it.hours }] : a.items || [{ title: a.title, why: a.why, hours: a.hours }];
  const el = openSheet({ title: "Add to your to-do list?", subtitle: it ? "A step already in your list" : "New steps from Guidance",
    body: `<ul class="gd-sheet-list">${items.map((x) => `<li><span class="t-callout"><b>${esc(x.title)}</b></span>
      ${x.hours ? `<span class="foot"> · about ${esc(x.hours)} ${x.hours === 1 ? "hour" : "hours"}</span>` : ""}${x.why ? `<span class="foot gd-block">${esc(x.why)}</span>` : ""}</li>`).join("")}</ul>
      <p class="foot">It goes under “On your list” in Insights → To-do.</p>`,
    actions: actionsHtml("Add to to-do") });
  onOk(el, async () => {
    if (it) await api.addTodo([it.id]); else await api.addTodoItems(items);
    closeSheet(); await loadData(); done(key);
    toast(items.length === 1 ? "Added to your to-do list." : `${items.length} steps added to your to-do list.`);
  });
}

// ----- Update my goals: shows the change, saves only on OK -----
function updateGoals(a, key) {
  const now = S.STATE.profile?.goalsText || S.STATE.profile?.preferences || "";
  const el = openSheet({ title: "Update your goals?", subtitle: "Claude suggested this. Edit it before saving if you like.",
    body: `<div class="gd-diff"><p class="cap">Now</p><p class="t-callout gd-diff__old">${esc(now) || "(empty)"}</p>
      <label class="cap" for="g-goals-new">Suggested</label><textarea class="jp-input gd-goals" id="g-goals-new" rows="7">${esc(a.goals_text)}</textarea></div>
      <p class="foot">Your goals guide every run's choice of jobs and every coach answer from now on.</p>`,
    actions: actionsHtml("Save new goals") });
  onOk(el, async () => {
    const v = el.querySelector("#g-goals-new").value.trim();
    if (!v) throw new Error("Goals can't be empty");
    S.STATE.profile = await api.saveProfile({ goalsText: v, preferences: v });
    S.g.goals = null; closeSheet(); done(key); toast("Goals saved. The next run uses them.");
  });
}

// ----- Suggest a resume edit: Resumes' re-upload check, then you choose Use this version there -----
function resumeEdit(a, key) {
  const x = Res.byId(a.resume_id);
  const el = openSheet({ title: "Suggest a resume edit", subtitle: esc(x ? x.name + (x.job ? ` · ${x.job.company}` : "") : a.resume_id),
    body: `<div class="gd-diff"><p class="cap">This line</p><p class="t-callout gd-diff__old">${esc(a.find)}</p>
      <p class="cap">Becomes</p><p class="t-callout gd-diff__new">${esc(a.replace)}</p></div>
      ${a.why ? `<p class="t-callout gd-muted">${esc(a.why)}</p>` : ""}
      <p class="foot">Claude checks the edited resume against your originals, flags any line they don't support and re-scores it (a minute or two).
      Nothing changes until you choose Use this version in Resumes, which saves it as a new version.</p>`,
    actions: actionsHtml("Check and open in Resumes") });
  onOk(el, async () => {
    updateSheet({ body: `<p class="meta gd-wait"><span class="gd-dots" aria-hidden="true"><i></i><i></i><i></i></span>Claude is checking the edited resume…</p>`, actions: "" });
    let p;
    try { p = await api.coachResumeEdit({ id: a.resume_id, find: a.find, replace: a.replace }); }
    catch (e) { updateSheet({ body: callout(esc(e.message), "danger"), actions: `<button class="jp-btn" type="button" data-sheet-close>Close</button>` }); return; }
    closeSheet(); done(key);
    S.res.sel = a.resume_id; S.res.open = true; go("resumes");
    const item = Res.byId(a.resume_id);
    if (item) openChecked(item, p);
  });
}

// ----- Mock interview: pick the language, then Claude plans the questions -----
export function startInterview(cid, key = null) {
  const r = M.jobOf(cid);
  if (!r) return toast("That job isn't in your list any more.");
  let lang = M.langGuess(r);
  const seg = () => M.LANGS.map(([k, l]) => `<button class="jp-seg__item" type="button" data-lang="${k}" aria-pressed="${k === lang}" aria-selected="${k === lang}">${l}</button>`).join("");
  const el = openSheet({ title: "Start a mock interview", subtitle: `${esc(r.title)} · ${esc(r.company)}`,
    body: `<p class="t-callout">Claude plans six questions from the posting and your ${r.tailored?.path ? "tailored " : ""}resume, asks them one at a time and gives short feedback after each answer.
      End it whenever you like for a summary of what to practise.</p>
      <div class="gd-lang"><span class="cap">Language</span><div class="jp-seg" role="group" aria-label="Interview language" id="g-lang">${seg()}</div></div>
      <p class="foot">One Claude call to plan, one per answer, one for the summary. Skipping a question is free.</p>`,
    actions: actionsHtml("Start interview") });
  el.querySelector("#g-lang").addEventListener("click", (e) => { const b = e.target.closest("[data-lang]"); if (b) { lang = b.dataset.lang; el.querySelector("#g-lang").innerHTML = seg(); } });
  onOk(el, async () => {
    closeSheet();
    if (key) S.g.done[key] = true;
    S.g.sel = cid; S.g.open = true;
    go("guidance/" + cid);
    await withClaude(cid, "interview-start", "", (signal) => api.coachInterview({ cid, op: "start", lang }, signal));
  });
}

export function runAction(c, i, j) {
  const a = c.messages[i]?.actions?.[j], key = `${c.cid}:${i}:${j}`;
  if (!a) return;
  if (a.type === "add_todo") return addTodo(a, key);
  if (a.type === "update_goals") return updateGoals(a, key);
  if (a.type === "resume_edit") return resumeEdit(a, key);
  if (a.type === "mock_interview") return startInterview(a.job, key);
}

// ----- rename and delete -----
export function rename(c) {
  const el = openSheet({ title: "Rename conversation", body: `<label class="jp-field"><span class="jp-field__label">Name</span>
    <input class="jp-input" id="g-name" type="text" maxlength="80" value="${esc(c.title)}"></label>`, actions: actionsHtml("Save") });
  el.querySelector("#g-name").focus();
  onOk(el, async () => { S.g.convs[c.cid] = { ...c, ...(await api.coachRename(c.cid, el.querySelector("#g-name").value)) }; closeSheet(); await refreshList(); app.render(); });
}
export function remove(c) {
  const el = openSheet({ title: "Delete this conversation?", body: `<p class="t-callout">“${esc(c.title)}” and its ${c.messages.length} messages leave Guidance${c.kind === "job" ? " and the job's Ask Claude panel" : ""}.
    The file is kept in data/conversations/deleted, so nothing is lost for good.</p>`, actions: actionsHtml("Delete", "jp-btn--danger") });
  onOk(el, async () => { await api.coachDelete(c.cid); delete S.g.convs[c.cid]; S.g.sel = "weekly"; S.g.open = false; closeSheet(); await refreshList(); go("guidance"); });
}
export async function copyDraft(key) {
  const t = document.getElementById("draft-" + key)?.textContent || "";
  try { await navigator.clipboard.writeText(t); S.g.done[key] = true; app.render(); toast("Copied. Paste it into LinkedIn yourself."); }
  catch { toast("Couldn't copy. Select the text and copy it yourself."); }
}
