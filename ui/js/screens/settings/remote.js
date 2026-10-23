// Settings > Phone access (docs/plans/remote-access.md): the remoteAccess switch, whether Tailscale is ready, and the address to open on the phone.
import { S } from "../../state.js";
import { esc, toast } from "../../util.js";
import { callout } from "../../components/card.js";
import { pill } from "../../components/status-pill.js";
import { settings } from "./index.js";

const row = (label, sub, body) => `<div class="st-srow"><span class="st-srow__head"><span class="st-row__label">${label}</span><span class="foot">${sub}</span></span><span class="st-srow__body">${body}</span></div>`;

// Tailscale, step by step: installed, signed in, sharing Job Pilot's port
function tailscaleBody(t = {}, port) {
  if (!t.installed) return callout("Tailscale isn't installed on this PC. Install it here and on your phone from tailscale.com/download, and sign in to both with the same account.", "warning");
  if (!t.running) return callout("Tailscale is installed but not connected. Open Tailscale on this PC and sign in.", "warning");
  if (!t.serving) return callout(`Tailscale is connected. To share Job Pilot with your phone, run <code>tailscale serve --bg ${port}</code> once in a terminal on this PC. Then open this page again.`, "warning");
  return `<span class="st-inline">${pill("Ready", "success")}<a href="${esc(t.address)}" target="_blank" rel="noopener">${esc(t.address)}</a>
      <button class="jp-btn jp-btn--sm" type="button" data-action="remote-copy">Copy address</button></span>
    <span class="foot">Open this address on your phone and bookmark it. Turn Tailscale on in the phone's Tailscale app first.</span>`;
}

function thisPc(r) {
  if (r.testCopy) return callout("This is a test copy, so Windows isn't changed: no startup shortcut and no keeping awake.");
  return `<span class="st-chips">${pill(r.startup ? "Starts when you sign in" : "Doesn't start by itself", r.startup ? "success" : "warning")}
    ${pill(r.awake ? "Keeping this PC awake" : "Not keeping this PC awake", r.awake ? "success" : "warning")}</span>`;
}

export function remoteHtml() {
  const on = !!settings().remoteAccess, r = S.STATE.remote || {};
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Phone access</h2>
      <p class="meta">Use Job Pilot from your phone, anywhere, through Tailscale: a private network of your own devices. Job Pilot keeps running on this PC.</p></div></div>
    <div class="jp-list st-narrow">
      ${row("Phone access", "Keeps Job Pilot reachable", `<span class="st-inline">
          <button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Phone access" data-action="set-toggle" data-key="remoteAccess" data-msg="${on ? "Phone access is off. This PC can sleep again." : "Phone access is on."}"></button></span>
        <span class="foot">When on, Job Pilot starts when you sign in to Windows, and this PC doesn't sleep while Job Pilot runs. The screen can still turn off.</span>`)}
      ${on ? row("On this PC", "Startup and sleep", thisPc(r)) : ""}
      ${row("Tailscale", "The private network", tailscaleBody(r.tailscale, r.port || 4510))}
      ${row("Who can get in", "No passcode", `<span class="foot">Every device signed in to your Tailscale account can use Job Pilot, including sending applications. Add only your own devices.
        Never use <code>tailscale funnel</code>: it puts Job Pilot on the public internet.</span>`)}
    </div>`;
}

export const REMOTE_ACTIONS = {
  "remote-copy": async () => {
    try { await navigator.clipboard.writeText(S.STATE.remote?.tailscale?.address || ""); toast("Copied the address."); } catch { toast("Couldn't copy. Select the address and copy it yourself."); }
  },
};
