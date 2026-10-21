// Settings > Notifications (board Settings-Notifications): which Windows toasts the run sends (settings.notify, read by
// run_notices.mjs). Toasts go through PowerShell, so they work for scheduled runs with this page closed. No email.
import * as api from "../../api.js";
import { toast } from "../../util.js";
import { settings } from "./index.js";

const EVENTS = [
  ["run", "Run finished", "A short summary: analyzed and applied"],
  ["needsYou", "Needs you", "Jobs waiting for your OK, or needing manual work"],
  ["replies", "Reply or interview received", "When LinkedIn's job tracker shows an employer viewed, invited or declined"],
  ["errors", "Errors", "A run stopped: LinkedIn signed you out or limited searches, Claude's plan limit, a crash"],
];

export function notificationsHtml() {
  const n = settings().notify || {};
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Notifications</h2>
      <p class="meta">What Claude tells you about after a run. They appear as Windows notifications.</p></div></div>
    <div class="jp-list st-narrow">
      <div class="st-ncols"><span class="cap">Event</span><span class="cap st-center">Desktop</span></div>
      ${EVENTS.map(([k, label, sub]) => `<div class="st-ncols st-ncols--row"><span class="st-row__text"><span class="st-row__label" id="st-n-${k}">${label}</span><span class="foot">${sub}</span></span>
        <span class="st-center"><button class="switch" type="button" role="switch" aria-checked="${n[k] !== false}" aria-labelledby="st-n-${k}" data-action="set-toggle" data-key="notify.${k}"></button></span></div>`).join("")}
      <div class="st-row"><span class="st-row__text"><span class="st-row__label">See how they look</span><span class="foot">Sends one notification now</span></span>
        <button class="jp-btn jp-btn--sm" type="button" data-action="notify-test">Send a test</button></div>
    </div>
    <p class="foot st-narrow">They show even when Job Pilot's page is closed, as long as you're signed in to Windows. Windows hides them while Do not disturb is on; they stay in the notification center.</p>`;
}

export const NOTIFY_ACTIONS = {
  "notify-test": async () => { await api.testNotify(); toast("Sent. If nothing appeared, check Do not disturb and Windows notification settings for PowerShell."); },
};
