// Status pill (jp-pill): every job status as the word the user sees plus its tone. Color never appears without the word.
// The one place a stored status becomes words, a tone and a Jobs filter. Stage 2 adds its statuses here.
import { esc } from "../util.js";

// status -> [label, tone, bucket]
// tone: success | warning | serious | danger | info | accent | neutral
// bucket: the Jobs status filter it falls under (todo | applied | attention), or "" for All only
export const STATUS = {
  applied: ["Applied", "success", "applied"], dry_run: ["Test run", "neutral", ""],
  resume_insufficient: ["Resume too weak", "serious", "attention"], needs_manual: ["Needs manual", "warning", "attention"],
  skipped_by_user: ["Skipped", "neutral", ""], in_progress: ["In progress", "warning", ""],
  error: ["Error", "danger", "attention"], filtered: ["Filtered", "neutral", ""], parse_error: ["Couldn't read page", "warning", "attention"],
  no_easy_apply: ["No Easy Apply", "neutral", ""], already_applied: ["Already applied", "neutral", ""],
  external: ["Apply externally", "info", "todo"], ready_to_apply: ["Ready to apply", "accent", "todo"], not_selected: ["Not picked", "neutral", ""],
  closed: ["Closed", "neutral", ""],
};
export const statusLabel = (s) => STATUS[s]?.[0] || "Unknown status";
export const statusBucket = (s) => STATUS[s]?.[2] || "";

export const pillClass = (tone) => tone && tone !== "neutral" ? `jp-pill jp-pill--${tone}` : "jp-pill";
export const statusPill = (status) => { const [label, tone] = STATUS[status] || ["Unknown status", "neutral"]; return pill(label, tone); };
export const pill = (label, tone = "neutral") => `<span class="${pillClass(tone)}">${esc(label)}</span>`;
