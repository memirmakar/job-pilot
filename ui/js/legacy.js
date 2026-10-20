// Widgets of the pre-rebuild screens (styled by styles/legacy.css). Stages replace them with components/; delete what is unused.
import { esc } from "./util.js";
import { STATUS } from "./components/status-pill.js";

const OLD = { success: "p-good", warning: "p-warn", serious: "p-serious", danger: "p-bad", neutral: "p-neutral", accent: "p-accent", info: "p-info" };
export const pill = (s) => { const [l, t] = STATUS[s] || [s, "neutral"]; return `<span class="pill ${OLD[t]}">${esc(l)}</span>`; };

export const PHASE = { preflight: "Getting ready", library: "Updating resume library", collect: "Searching LinkedIn", select: "Claude is picking jobs",
  analyze: "Analyzing and applying", availability: "Checking listings are still open", "market review": "Updating market review", starting: "Starting",
  "send approved": "Sending the jobs you approved", tracker: "Reading your LinkedIn job tracker" };
