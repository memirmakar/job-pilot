// Boot: theme, shell, events, first load, then the refresh loop.
import { S, loadState, isBusy } from "./state.js";
import { parse, load, FORM_VIEWS } from "./router.js";
import { renderMenu } from "./shell.js";
import { bindEvents } from "./actions.js";
import { applyTheme, watchSystem } from "./theme.js";
import { onboardingTick } from "./screens/onboarding/index.js";

applyTheme();
watchSystem(renderMenu);
Object.assign(S, parse(location.hash.slice(1)));
// #guidance/<conversation id> opens that conversation
if (S.view === "guidance" && S.sub) { S.g.sel = S.sub; S.g.open = true; S.sub = "pipeline"; }
if (S.view === "settings" && S.sub) S.set.sec = S.sub;
if (!S.sub) S.sub = "overview";
bindEvents();

// Refresh: every 5 s while something runs (only the status bar on form pages), every 30 s otherwise
let lastFull = 0;
async function tick() {
  try {
    await loadState();
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!FORM_VIEWS.has(S.view) && !typing && (isBusy() || Date.now() - lastFull > 30e3)) { lastFull = Date.now(); await load(); }
    else if (S.view === "onboarding" && !typing) onboardingTick();
  } catch {}
  setTimeout(tick, isBusy() ? 5000 : 30000);
}
load().then(() => { lastFull = Date.now(); setTimeout(tick, 5000); });
