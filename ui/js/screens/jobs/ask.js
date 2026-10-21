// Ask Claude about this job (canvas board A-Ask): a slide-over chat with the job as context.
// Conversations are saved by the server in data/conversations/<site>-<id>.json (conversations.mjs): the same conversation Guidance shows.
import { S, app } from "../../state.js";
import * as api from "../../api.js";
import { $, esc, icon } from "../../util.js";
import { tag } from "../../components/tag.js";
import { callout } from "../../components/card.js";
import { coachText } from "../../components/coach-text.js";
import * as M from "./model.js";

// key -> { messages, loaded, pending, error }; kept across re-renders and job switches
const CONV = {};
const conv = (k) => (CONV[k] ||= { messages: [], loaded: false, pending: null, error: "" });

export async function openAsk(r) {
  const c = conv(M.keyOf(r));
  // reloaded each time it opens: Guidance may have added to it
  if (!c.pending) {
    try { c.messages = (await api.getConversation(r.site, r.id)).messages || []; c.loaded = true; }
    catch (e) { c.error = `Couldn't load the earlier conversation: ${e.message}`; }
  }
}

export async function sendAsk(r, text) {
  const k = M.keyOf(r), c = conv(k);
  text = String(text || "").trim();
  if (!text || c.pending) return;
  c.pending = text; c.error = ""; S.askDraft = "";
  app.render();
  try { c.messages = (await api.askAboutJob(r.site, r.id, text)).messages; c.loaded = true; }
  catch (e) { c.error = `Claude couldn't answer: ${e.message}`; S.askDraft = text; }
  c.pending = null;
  app.render();
  if (S.panel === "ask" && S.selected === k) $("#ask-input")?.focus();
}

const bubble = (who, text) => who === "user" ? `<div class="bubble bubble--me">${esc(text).replace(/\n/g, "<br>")}</div>`
  : `<div class="bubble bubble--claude">${coachText(text)}</div>`;

export function askHtml(r) {
  const c = conv(M.keyOf(r)), s = M.scores(r), gap = M.skills(r).missing[0];
  const suggest = ["Why did Claude pick this one?", gap ? `How do I close the ${gap} gap?` : "What should I prepare for an interview?", "Draft a short note to the recruiter"];
  const sees = ["This posting", `Score ${s.score}`, r.tailored?.used ? "Tailored resume" : "Your resume", "Your goals", ...(S.GH?.repos?.length ? ["GitHub"] : [])];
  return `<aside class="jd-ask" aria-label="Ask Claude about this job">
    <div class="jd-ask__head">
      <div class="jd-ask__title"><h3 class="t-headline">Ask Claude</h3><span class="meta ellip">About ${esc(r.title)} · ${esc(r.company)}</span></div>
      <button class="jp-btn jp-btn--sm btn-icon" type="button" aria-label="Open in Guidance" title="Open in Guidance" data-action="open-in-guidance" data-k="${esc(M.keyOf(r))}">${icon("external")}</button>
      <button class="jp-btn jp-btn--sm btn-icon" type="button" aria-label="Close" data-action="panel-close">${icon("close")}</button>
    </div>
    <div class="jd-ask__sees"><span class="foot">Claude can see</span>${sees.map((x) => tag(x)).join("")}</div>
    <div class="jd-ask__log" id="ask-log" role="log" aria-live="polite" aria-busy="${!!c.pending}">
      ${!c.messages.length && !c.pending ? `<p class="foot">Ask anything about this job: the fit, the gaps, what to say. Claude answers from what it saved about it.</p>` : ""}
      ${c.messages.map((m) => bubble(m.role, m.text)).join("")}
      ${c.pending ? bubble("user", c.pending) + `<div class="bubble bubble--claude jd-typing"><span class="sr-only">Claude is writing</span><span aria-hidden="true">Thinking…</span></div>` : ""}
      ${c.error ? callout(esc(c.error), "danger") : ""}
      ${c.pending ? "" : `<p class="cap" style="margin-top:10px">Suggested</p>
        <div class="jd-ask__suggest">${suggest.map((x) => `<button class="chip" type="button" data-action="ask-suggest" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>`}
    </div>
    <form class="jd-ask__form" data-ask-form>
      <label class="jp-field"><span class="sr-only">Message Claude about this job</span>
        <input class="jp-input" id="ask-input" type="text" placeholder="Ask about this job" autocomplete="off" value="${esc(S.askDraft || "")}" ${c.pending ? 'readonly aria-disabled="true"' : ""}></label>
      <button class="jp-btn jp-btn--primary" type="submit" ${c.pending ? "disabled" : ""}>Send</button>
    </form>
  </aside>`;
}
