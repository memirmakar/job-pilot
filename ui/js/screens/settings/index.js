// Settings screen (canvas boards Settings, Settings-*): a section list on the left, one section on the right.
// Changes save as they're made: data-set="<settings key>" and data-pset="<profile key>" fields save on change.
// Each section renders from its own file; their data-action handlers are merged here into SET_ACTIONS.
import { S, app, loadState } from "../../state.js";
import * as api from "../../api.js";
import { $, esc, icon, rows, toast } from "../../util.js";
import { go } from "../../router.js";
import { profilesHtml, PROFILE_ACTIONS, bindProfiles } from "./profiles.js";
import { applyingHtml, APPLYING_ACTIONS } from "./applying.js";
import { neverHtml, NEVER_ACTIONS } from "./never.js";
import { scheduleHtml, SCHEDULE_ACTIONS } from "./schedule.js";
import { notificationsHtml, NOTIFY_ACTIONS } from "./notifications.js";
import { privacyHtml, PRIVACY_ACTIONS } from "./privacy.js";
import { usageHtml, USAGE_ACTIONS } from "./usage.js";
import { remoteHtml, REMOTE_ACTIONS } from "./remote.js";

export const SETTINGS_SECTIONS = [["profiles", "Search profiles", "search"], ["applying", "Applying", "send"], ["never", "Never apply to", "ban"],
  ["schedule", "Schedule", "clock"], ["remote", "Phone access", "phone"], ["notifications", "Notifications", "bell"], ["privacy", "Data and privacy", "lock"], ["usage", "Claude usage", "chart"]];
const HTML = { profiles: profilesHtml, applying: applyingHtml, never: neverHtml, schedule: scheduleHtml, remote: remoteHtml, notifications: notificationsHtml, privacy: privacyHtml, usage: usageHtml };

export const settings = () => S.STATE.settings;
export const profile = () => S.STATE.profile || {};

// Saving: one place, so every section shows the same "Saved" and re-reads the schedule when it changed
export async function saveSettings(patch, msg = "Saved. It applies from the next run.") {
  const r = await api.saveSettings(patch);
  S.STATE.settings = r.settings;
  S.META = await api.getMeta(); // Jobs and Insights read the target, cutoff and limits from here
  if (r.schedule && String(r.schedule).startsWith("failed")) toast(`Saved, but Windows couldn't update the scheduled task: ${r.schedule.slice(8, 200)}`, 9000);
  else if (r.remote && String(r.remote).startsWith("failed")) toast(`Saved, but Windows couldn't set up phone access: ${r.remote.slice(8, 200)}`, 9000);
  else toast(msg);
  if (r.schedule || r.remote) await loadState();
  app.render();
}
export async function saveProfile(patch, msg = "Saved. It applies from the next run.") {
  S.STATE.profile = await api.saveProfile(patch);
  if (msg) toast(msg);
  app.render();
}

// The two lists only Settings needs, loaded when their section opens
function ensure(sec) {
  const need = sec === "usage" ? "usage" : sec === "never" ? "never" : null;
  if (!need || S.set[need]) return;
  S.set[need] = "loading";
  (need === "usage" ? api.getUsage() : api.getNever()).then((d) => { S.set[need] = d; }).catch((e) => { S.set[need] = { error: e.message }; })
    .finally(() => { if (S.view === "settings") app.render(); });
}

function nav() {
  const p = profile(), on = (p.targets || []).filter((t) => t.on !== false).length;
  const count = { profiles: on, never: (p.companyExclude || []).length + (p.titleExclude || []).length };
  return `<nav class="st-nav" aria-label="Settings sections"><h1 class="t-title1 st-nav__title">Settings</h1>
    <div class="st-nav__list">${SETTINGS_SECTIONS.map(([id, label, ico]) => `<button class="navbtn" type="button" data-action="set-sec" data-v="${id}"${id === S.set.sec ? ' aria-current="page"' : ""}>
      ${icon(ico)}${esc(label)}${count[id] ? `<span class="count">${count[id]}</span>` : ""}</button>`).join("")}</div>
    <p class="foot st-nav__foot">Changes save as you make them.</p></nav>`;
}

let last = "";
export function renderSettings() {
  if (!S.STATE) return; // a hash change before the first load
  if (!HTML[S.set.sec]) S.set.sec = "profiles";
  ensure(S.set.sec);
  const html = `<div class="st">${nav()}<main class="st-main" id="st-main">${HTML[S.set.sec]()}</main></div>`;
  if (html === last && $("#view .st")) return;
  const a = document.activeElement, ds = a?.dataset || {};
  const focus = a?.id ? `#${CSS.escape(a.id)}` : ds.action ? `[data-action="${ds.action}"]${ds.v ? `[data-v="${CSS.escape(ds.v)}"]` : ""}${ds.i ? `[data-i="${ds.i}"]` : ""}` : null;
  $("#view").innerHTML = last = html;
  if (focus) try { document.querySelector(focus)?.focus({ preventScroll: true }); } catch {}
}

export const SET_ACTIONS = {
  "set-sec": (el) => { go(`settings/${el.dataset.v}`); },
  // a switch bound to one setting: data-key (dotted for notify.run)
  "set-toggle": async (el) => {
    const [k, sub] = el.dataset.key.split(".");
    const on = el.getAttribute("aria-checked") !== "true";
    await saveSettings(sub ? { [k]: { ...(settings()[k] || {}), [sub]: on } } : { [k]: on }, el.dataset.msg || "Saved.");
  },
  ...PROFILE_ACTIONS, ...APPLYING_ACTIONS, ...NEVER_ACTIONS, ...SCHEDULE_ACTIONS, ...NOTIFY_ACTIONS, ...PRIVACY_ACTIONS, ...USAGE_ACTIONS, ...REMOTE_ACTIONS,
};

// Fields that save on change: data-set (settings; data-type num | lines | str) and data-pset (profile)
const value = (el) => {
  const t = el.dataset.type, v = el.value;
  if (t === "num") { const n = Number(v); if (v === "" || !Number.isFinite(n)) return null; return Math.max(Number(el.min || -Infinity), Math.min(Number(el.max || Infinity), n)); }
  return t === "lines" ? rows(v) : v.trim();
};
export function bindSettings() {
  bindProfiles();
  document.addEventListener("change", async (e) => {
    const el = e.target.closest?.("[data-set], [data-pset]");
    if (!el || S.view !== "settings") return;
    const v = value(el);
    if (v === null) { toast("Type a number."); return app.render(); }
    try {
      if (el.dataset.set) await saveSettings({ [el.dataset.set]: v }, el.dataset.msg);
      else await saveProfile({ [el.dataset.pset]: v }, el.dataset.msg);
    } catch (err) { toast(err.message, 7000); }
  });
}
