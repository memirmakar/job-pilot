// Sheet: a slide-over panel above a scrim (radius-xl, shadow-float). One sheet at a time.
// Closes on Escape, on the scrim and on any [data-sheet-close]; focus returns to what opened it.
// center: a dialog near the top of the window instead of a slide-over (Resumes upload and re-upload); lead: HTML before the title.
import { esc, icon } from "../util.js";

let open = null;

export function openSheet({ title, subtitle = "", lead = "", body = "", actions = "", center = false, onClose = null }) {
  closeSheet();
  const opener = document.activeElement;
  const el = document.createElement("div");
  el.className = `sheet-scrim${center ? " sheet-scrim--center" : ""}`;
  el.innerHTML = `<div class="sheet${center ? " sheet--center" : ""}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet__head">${lead}<div class="sheet__titles"><h2 id="sheet-title" class="t-title2">${esc(title)}</h2>${subtitle ? `<span class="foot sheet__sub">${subtitle}</span>` : ""}</div>
      <button class="jp-btn jp-btn--sm" type="button" data-sheet-close aria-label="Close" style="width:28px;padding:0">${icon("close")}</button></div>
    <div class="sheet__body">${body}</div>
    <div class="sheet__actions"${actions ? "" : " hidden"}>${actions}</div></div>`;
  const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-sheet-close]")) closeSheet(); });
  document.addEventListener("keydown", onKey);
  document.body.append(el);
  open = { el, onKey, opener, onClose };
  el.querySelector("[data-sheet-close]").focus();
  return el;
}

// Replaces parts of the open sheet (e.g. when Claude's result arrives); returns false if it was closed meanwhile
export function updateSheet({ title, subtitle, body, actions } = {}) {
  if (!open) return false;
  const q = (s) => open.el.querySelector(s);
  if (title !== undefined) q("#sheet-title").textContent = title;
  if (subtitle !== undefined && q(".sheet__sub")) q(".sheet__sub").innerHTML = subtitle;
  if (body !== undefined) q(".sheet__body").innerHTML = body;
  if (actions !== undefined) { q(".sheet__actions").innerHTML = actions; q(".sheet__actions").hidden = !actions; }
  return true;
}
export const sheetEl = () => open?.el || null;

export function closeSheet() {
  if (!open) return;
  const { onClose } = open;
  document.removeEventListener("keydown", open.onKey);
  open.el.remove();
  open.opener?.focus?.();
  open = null;
  onClose?.();
}
