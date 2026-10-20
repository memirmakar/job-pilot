// Widgets of the pre-rebuild screens (styled by styles/legacy.css). Stages replace them with components/; delete what is unused.
import { S } from "./state.js";
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

// Score gauge: ring fill = score/100, colored by pass/fail against the threshold (number always shown)
export function gauge(score, size = 76) {
  const r = 30, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score || 0));
  const color = v >= (S.META.tailorTarget || 80) ? "var(--success)" : v >= S.META.minAtsScore ? "var(--accent)" : "var(--serious)";
  return `<svg class="gauge" viewBox="0 0 76 76" width="${size}" height="${size}" role="img" aria-label="ATS score ${v}">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--chart-track)" stroke-width="7"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${(v / 100) * c} ${c}" transform="rotate(-90 38 38)"/>
    <text x="38" y="45" text-anchor="middle">${v}</text></svg>`;
}

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

const SKILL_KINDS = new Set(["skill", "tool", "domain_knowledge", "certification"]);
export const KIND = { location: "Location", travel: "Travel", military: "Military", driving_license: "License", language: "Language", education: "Education", experience: "Experience", soft_skill: "Soft skill", generic_duty: "Generic duty", noise: "Not a skill" };
// Splits a job's raw "missing" keywords using the cached sanity audit
export function splitMissing(x) {
  const skills = new Map(), other = new Map();
  for (const k of [...(x.missing_keywords || []), ...(x.unmet_requirements || [])]) {
    const a = S.AUDIT[String(k).replace(/[İIı]/g, "i").toLowerCase().trim()];
    if (!a) { skills.set(k, { canonical: k }); continue; }
    if (SKILL_KINDS.has(a.kind) && !a.satisfied_by_profile) skills.set(a.canonical, a);
    else other.set(a.canonical, a);
  }
  return { skills: [...skills.values()], other: [...other.values()] };
}

export const PHASE = { preflight: "Getting ready", library: "Updating resume library", collect: "Searching LinkedIn", select: "Claude is picking jobs",
  analyze: "Analyzing and applying", availability: "Checking listings are still open", "market review": "Updating market review", starting: "Starting" };

// Status filter capsules used by the Jobs and Activity screens
export const filterButtons = (statuses, rows, key = "status") => statuses.map((s) =>
  `<button data-f="${s}" class="${s === S.filter ? "on" : ""}">${s === "all" ? "All" : (STATUS[s]?.[0] || s)} · ${s === "all" ? rows.length : rows.filter((r) => r[key] === s).length}</button>`).join("");
