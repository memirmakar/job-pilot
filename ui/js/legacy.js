// Widgets of the pre-rebuild screens (styled by styles/legacy.css). Stages replace them with components/; delete what is unused.
import { esc } from "./util.js";
import { STATUS } from "./components/status-pill.js";

export const usd = (u) => u?.costUsd ?? 0;
export const finalScore = (r) => r.tailored?.used ? r.tailored.score : r.ats?.best_score;

const OLD = { success: "p-good", warning: "p-warn", serious: "p-serious", danger: "p-bad", neutral: "p-neutral", accent: "p-accent", info: "p-info" };
export const pill = (s) => { const [l, t] = STATUS[s] || [s, "neutral"]; return `<span class="pill ${OLD[t]}">${esc(l)}</span>`; };
const LEVEL = { high: "p-good", medium: "p-warn", low: "p-neutral", strong: "p-good", moderate: "p-warn", weak: "p-bad" };
export const lvl = (v, prefix = "") => `<span class="pill ${LEVEL[v] || "p-neutral"}">${esc(prefix + v)}</span>`;
export const VERDICT = { real_value: ["Real value", "p-good"], moderate: ["Moderate", "p-warn"], ats_padding: ["ATS padding only", "p-bad"], not_relevant: ["Not relevant", "p-neutral"] };
export const verdict = (v) => { const [l, c] = VERDICT[v] || [v, "p-neutral"]; return `<span class="pill ${c}">${esc(l)}</span>`; };
export const chips = (arr, cls, max = 10) => !arr?.length ? "" :
  `<div class="chips">${arr.slice(0, max).map((k) => `<span class="chip ${cls}">${esc(String(k).replace(/\*\*/g, ""))}</span>`).join("")}${arr.length > max ? `<span class="chip more">+${arr.length - max} more</span>` : ""}</div>`;

export function hbars(items, { max, marker } = {}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return `<div class="hbars">${items.map((i) => `
    <div class="hbar" data-tip="${esc(i.tip || `${i.label}: ${i.display ?? i.value}`)}">
      <div class="lab">${esc(i.label)}</div>
      <div class="trk"><div class="fill" style="width:${(i.value / m) * 100}%;${i.color ? `background:${i.color}` : ""}"></div>
        ${marker != null ? `<div class="marker" style="left:${(marker / m) * 100}%"></div>` : ""}</div>
      <div class="val">${esc(i.display ?? i.value)}</div>
    </div>`).join("")}</div>`;
}

export const KIND = { location: "Location", travel: "Travel", military: "Military", driving_license: "License", language: "Language", education: "Education", experience: "Experience", soft_skill: "Soft skill", generic_duty: "Generic duty", noise: "Not a skill" };
export const PHASE = { preflight: "Getting ready", library: "Updating resume library", collect: "Searching LinkedIn", select: "Claude is picking jobs",
  analyze: "Analyzing and applying", availability: "Checking listings are still open", "market review": "Updating market review", starting: "Starting",
  "send approved": "Sending the jobs you approved", tracker: "Reading your LinkedIn job tracker" };

