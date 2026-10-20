// Activity screen (canvas boards Activity, Activity-Stopped): every run newest first; open one to see each job and why.
import { S, app, loadState } from "../../state.js";
import * as api from "../../api.js";
import { $, toast } from "../../util.js";
import { go } from "../../router.js";
import { activityHtml } from "./view.js";

// open: the expanded run (null = the newest, "none" = all closed); sub: its job tab; full: runs showing every job
const V = { runs: null, at: 0, loading: false, view: "all", open: null, sub: "all", full: new Set() };
let last = "";

// The run history is loaded here, not with the rest: it's only needed on this screen. Refreshed with the app's tick.
function ensure() {
  if (V.loading || Date.now() - V.at < 15e3) return;
  V.loading = true;
  api.getActivity().then((runs) => { if (Array.isArray(runs)) V.runs = runs; }).catch(() => {})
    .finally(() => { V.loading = false; V.at = Date.now(); if (S.view === "activity") app.render(); });
}

export function renderActivity() {
  ensure();
  if (!V.runs) { $("#view").innerHTML = last = `<div class="act"><p class="meta">Loading your runs…</p></div>`; return; }
  if (V.open === null) V.open = V.runs[0]?.id || "none";
  const html = activityHtml(V.runs, V);
  if (html === last && $("#view .act")) return;
  const a = document.activeElement, focus = a?.dataset?.action ? `[data-action="${a.dataset.action}"]${a.dataset.id ? `[data-id="${CSS.escape(a.dataset.id)}"]` : a.dataset.v ? `[data-v="${a.dataset.v}"]` : ""}` : null;
  $("#view").innerHTML = last = html;
  if (focus) try { document.querySelector(focus)?.focus({ preventScroll: true }); } catch {}
}

const reload = () => { V.at = 0; ensure(); };
export const ACT_ACTIONS = {
  "act-view": (el) => { V.view = el.dataset.v; app.render(); },
  "act-toggle": (el) => { V.open = V.open === el.dataset.id ? "none" : el.dataset.id; V.sub = "all"; app.render(); },
  "act-sub": (el) => { V.sub = el.dataset.v; app.render(); },
  "act-all": (el) => { V.full.add(el.dataset.id); app.render(); },
  "act-open-job": (el) => {
    const r = S.DATA.find((x) => `${x.site}-${x.id}` === el.dataset.k);
    if (!r) return toast("That job isn't in your list any more.");
    S.showArchived = !!r.archived; S.selected = el.dataset.k; S.jobOpen = true; S.panel = "none";
    go("jobs");
  },
  // A test run again stays a test run (2 jobs, nothing sent); a real run asks first
  "act-run-again": async (el) => {
    const dry = !!el.dataset.dry;
    if (!dry && !confirm("Start a real run now? Claude applies to the jobs that pass your rules.")) return;
    await api.startRun(dry ? { dryRun: true, limit: 2 } : {});
    toast(dry ? "Test run started on 2 jobs. Nothing will be submitted." : "Run started. You'll see an Edge window working; leave it open.");
    await loadState(); reload();
  },
};
