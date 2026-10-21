// Guidance screen (canvas boards Guidance, Guidance-Interview): conversations on the left, the chat (or a mock interview) in the
// middle, what Claude knows (or the interview plan) on the right. Phones show the list, then the conversation.
import { S, app } from "../../state.js";
import * as api from "../../api.js";
import { $, toast } from "../../util.js";
import { go } from "../../router.js";
import { listHtml } from "./list.js";
import { chatHtml } from "./chat.js";
import { contextHtml, savedGoals } from "./context.js";
import { interviewHtml, planHtml } from "./interview.js";
import { refreshList, loadConv, withClaude, cancel, runAction, startInterview, rename, remove, copyDraft } from "./act.js";
import * as M from "./model.js";

const DEFAULT_CTX = { goals: true, resumes: true, github: true, jobs: true, market: true, off: [] };
const blank = () => ({ cid: "new", kind: "general", title: "New conversation", messages: [], context: { ...DEFAULT_CTX }, shownJobs: [], createdAt: new Date().toISOString(), usage: { calls: 0 } });
const loading = new Set();
let last = "", poll = null;

function ensure(cid, key = cid) {
  if (loading.has(key)) return;
  loading.add(key);
  (cid ? loadConv(cid) : refreshList()).finally(() => { loading.delete(key); app.render(); });
}

export function renderGuidance() {
  if (!S.g.list) ensure(null, "list");
  if (S.g.sel === "new") S.g.convs.new ||= blank();
  const c = M.current();
  if (!c && !S.g.errors[S.g.sel]) ensure(S.g.sel);
  const center = c ? (c.interview ? interviewHtml(c) : chatHtml(c))
    : `<section class="jp-card gd-chat gd-chat--empty"><p class="t-callout gd-muted">${S.g.errors[S.g.sel] ? "Couldn't open this conversation. It may have been deleted." : "Loading the conversation…"}</p></section>`;
  const right = c ? (c.interview ? planHtml(c) : contextHtml(c)) : "";
  const html = `<div class="gd" data-show="${S.g.open ? "chat" : "list"}">${listHtml()}${center}${right}</div>`;
  // Server still answering from before a reload: look again in a few seconds
  clearTimeout(poll);
  if (S.g.serverPending[S.g.sel] && !S.g.pending[S.g.sel]) poll = setTimeout(async () => { await refreshList(); await loadConv(S.g.sel); app.render(); }, 4000);
  if (html.replace(/\d\d:\d\d<\/span>/g, "") === last && $("#view .gd")) return;
  const a = document.activeElement, log = $("#g-log");
  const focus = a?.id ? `#${a.id}` : a?.dataset?.action ? `[data-action="${a.dataset.action}"]${a.dataset.cid ? `[data-cid="${CSS.escape(a.dataset.cid)}"]` : ""}` : null;
  const caret = a?.id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  const keep = { list: $("#g-list-scroll")?.scrollTop, log: log && log.scrollHeight - log.scrollTop - log.clientHeight > 80 ? log.scrollTop : null };
  $("#view").innerHTML = html;
  last = html.replace(/\d\d:\d\d<\/span>/g, "");
  if (keep.list != null && $("#g-list-scroll")) $("#g-list-scroll").scrollTop = keep.list;
  const nl = $("#g-log"); if (nl) nl.scrollTop = keep.log ?? nl.scrollHeight; // stays at the newest message unless you scrolled up
  if (focus) try { const el = document.querySelector(focus); el?.focus({ preventScroll: true }); if (caret && el?.setSelectionRange) el.setSelectionRange(...caret); } catch {}
}

const conv = () => M.current();
function open(cid) {
  S.g.sel = cid; S.g.open = true; S.g.history = false;
  go("guidance/" + cid);
  if (cid !== "new") loadConv(cid).then(() => app.render());
  if (!M.phone()) $("#g-input")?.focus();
}

async function send(text) {
  text = String(text || "").trim();
  let c = conv();
  if (!text || !c || M.isRunning(c.cid)) return;
  if (c.cid === "new") {
    const made = await api.coachNew();
    const changed = Object.keys(DEFAULT_CTX).some((k) => JSON.stringify(c.context[k]) !== JSON.stringify(DEFAULT_CTX[k]));
    S.g.convs[made.cid] = changed ? await api.coachContext(made.cid, c.context) : made;
    delete S.g.convs.new; S.g.drafts.new = "";
    S.g.sel = made.cid; c = S.g.convs[made.cid];
    history.replaceState(null, "", "#guidance/" + made.cid);
  }
  const cid = c.cid;
  if (c.interview) return withClaude(cid, "interview-answer", text, (signal) => api.coachInterview({ cid, op: "answer", text }, signal));
  const weekly = S.g.deep; S.g.deep = false;
  await withClaude(cid, "reply", text, (signal) => api.coachSend(cid, text, weekly, signal));
}

async function setCtx(patch) {
  const c = conv(); if (!c) return;
  if (c.cid === "new") { Object.assign(c.context, patch); return app.render(); }
  S.g.convs[c.cid] = { ...c, ...(await api.coachContext(c.cid, patch)) };
  app.render();
}

const ivStep = async (op, extra = {}) => { const c = conv(); S.g.convs[c.cid] = { ...c, ...(await api.coachInterview({ cid: c.cid, op, ...extra })) }; app.render(); };

// data-action handlers, merged into actions.js
export const GUIDE_ACTIONS = {
  "g-select": (el) => open(el.dataset.cid),
  "g-new": () => { S.g.convs.new = blank(); open("new"); },
  "g-back": () => { S.g.open = false; app.render(); },
  "g-history": () => { S.g.history = !S.g.history; app.render(); },
  "g-cancel": (el) => { cancel(el.dataset.cid); app.render(); },
  "g-suggest": (el) => send(el.dataset.v),
  "g-deep": () => {
    if (!S.g.deep && !confirm(`Use your weekly model (${S.STATE?.settings?.modelWeekly || "the bigger model"}) for the next message? It's slower and uses more of your Claude plan.`)) return;
    S.g.deep = !S.g.deep; app.render();
  },
  "g-checkin": () => {
    const lastIn = [...(S.g.convs.weekly?.messages || [])].reverse().find((m) => m.kind === "checkin");
    if (lastIn && Date.now() - Date.parse(lastIn.at) < 7 * 864e5 && !confirm(`Your last check-in was ${M.day(lastIn.at)}. Write a new one now? It's one Claude call.`)) return;
    S.g.sel = "weekly"; S.g.open = true;
    return withClaude("weekly", "checkin", "", (signal) => api.coachCheckin(signal));
  },
  "g-act": (el) => { const c = S.g.convs[el.dataset.cid]; if (c) runAction(c, Number(el.dataset.i), Number(el.dataset.j)); },
  "g-copy": (el) => copyDraft(el.dataset.key),
  "g-rename": () => conv() && rename(conv()),
  "g-delete": () => conv() && remove(conv()),
  "g-iv-start": (el) => startInterview(el.dataset.cid),
  "g-iv-lang": (el) => ivStep("lang", { lang: el.dataset.v }),
  "g-iv-skip": () => ivStep("skip"),
  "g-iv-end": () => {
    const c = conv(); if (!c?.interview) return;
    const answered = c.interview.answers.filter((a) => !a.skipped).length;
    if (!confirm(answered ? "End the interview? Claude writes a summary of your answers (one call)." : "End the interview? You haven't answered anything yet, so there's no summary.")) return;
    withClaude(c.cid, "interview-end", "", (signal) => api.coachInterview({ cid: c.cid, op: "end" }, signal));
  },
  "g-ctx": (el) => setCtx({ [el.dataset.k]: !conv().context[el.dataset.k] }),
  "g-ctx-job": (el) => { const off = new Set(conv().context.off || []); off.has(el.dataset.k) ? off.delete(el.dataset.k) : off.add(el.dataset.k); return setCtx({ off: [...off] }); },
  "g-goals-save": async () => {
    const v = $("#g-goals").value.trim();
    if (!v) return toast("Goals can't be empty.");
    S.STATE.profile = await api.saveProfile({ goalsText: v, preferences: v });
    S.g.goals = null; app.render(); toast("Goals saved. Claude and the next run use them.");
  },
  // Links in Claude's text open the job, resume, repo or to-do step
  "coach-link": (el) => {
    const id = el.dataset.id, type = el.dataset.type;
    if (type === "job") { const r = M.jobOf(id); if (!r) return; S.showArchived = !!r.archived; S.selected = id; S.jobOpen = true; S.panel = "none"; return go("jobs"); }
    if (type === "resume") { S.res.sel = id; S.res.open = true; return go("resumes"); }
    if (type === "repo") return go("insights/github");
    if (type === "todo") { S.ins.step = id; S.ins.list = "all"; S.ins.showHidden = true; return go("insights/todo"); }
  },
  // The Jobs Ask panel's "Open in Guidance": the same conversation
  "open-in-guidance": (el) => { S.panel = "none"; delete S.g.convs[el.dataset.k]; open(el.dataset.k); },
};

// The composer (Enter sends; Ctrl+Enter in the interview answer box), drafts, goals draft, search, the thinking timer. Bound once.
export function bindGuidance() {
  document.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-g-form]")) return;
    e.preventDefault(); send($("#g-input").value);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "g-input" && e.target.tagName === "TEXTAREA" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(e.target.value); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "g-input") S.g.drafts[S.g.sel] = e.target.value;
    if (e.target.id === "g-goals") { S.g.goals = e.target.value; const b = $('[data-action="g-goals-save"]'); if (b) b.disabled = e.target.value.trim() === savedGoals().trim(); }
    if (e.target.id === "g-q") { S.g.query = e.target.value; app.render(); }
  });
  setInterval(() => document.querySelectorAll(".gd-elapsed").forEach((el) => { el.textContent = M.elapsed(el.dataset.since); }), 1000);
}
