// Tag (jp-tag): keyword chips. kind: "" | "met" | "missing"
import { esc } from "../util.js";

export const tag = (text, kind = "") => `<span class="jp-tag${kind ? " jp-tag--" + kind : ""}">${esc(text)}</span>`;
export const tags = (list, kind = "", max = 10) => !list?.length ? "" :
  `<span style="display:flex;flex-wrap:wrap;gap:var(--space-1)">${list.slice(0, max).map((t) => tag(t, kind)).join("")}${list.length > max ? tag(`+${list.length - max} more`) : ""}</span>`;
