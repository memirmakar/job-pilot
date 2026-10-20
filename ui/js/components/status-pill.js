// Status pill (jp-pill): every job status as the word the user sees plus its tone. Color never appears without the word.
import { esc } from "../util.js";

// status -> [label, tone]; tone is one of success | warning | serious | danger | info | accent | neutral
export const STATUS = {
  applied: ["Applied", "success"], dry_run: ["Dry run", "neutral"], resume_insufficient: ["Resume too weak", "serious"],
  needs_manual: ["Needs manual", "warning"], skipped_by_user: ["Skipped", "neutral"], in_progress: ["In progress", "warning"],
  error: ["Error", "danger"], filtered: ["Filtered", "neutral"], parse_error: ["Couldn't read page", "warning"],
  no_easy_apply: ["No Easy Apply", "neutral"], already_applied: ["Already applied", "neutral"],
  external: ["Apply externally", "accent"], ready_to_apply: ["Ready to apply", "accent"], not_selected: ["Not picked", "neutral"],
  closed: ["Closed", "neutral"],
};
export const statusLabel = (s) => STATUS[s]?.[0] || s;

export const pillClass = (tone) => tone && tone !== "neutral" ? `jp-pill jp-pill--${tone}` : "jp-pill";
export const statusPill = (status) => { const [label, tone] = STATUS[status] || [status, "neutral"]; return pill(label, tone); };
export const pill = (label, tone = "neutral") => `<span class="${pillClass(tone)}">${esc(label)}</span>`;
