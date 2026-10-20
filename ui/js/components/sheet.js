// Sheet: a slide-over panel above a scrim (radius-xl, shadow-float). One sheet at a time.
// Closes on Escape, on the scrim and on any [data-sheet-close]; focus returns to what opened it.
import { esc, icon } from "../util.js";

let open = null;

export function openSheet({ title, body = "", actions = "" }) {
  closeSheet();
  const opener = document.activeElement;
  const el = document.createElement("div");
  el.className = "sheet-scrim";
  el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet__head"><h2 id="sheet-title" class="t-title2">${esc(title)}</h2>
      <button class="jp-btn jp-btn--sm" type="button" data-sheet-close aria-label="Close" style="width:28px;padding:0">${icon("close")}</button></div>
    <div class="sheet__body">${body}</div>
    ${actions ? `<div class="sheet__actions">${actions}</div>` : ""}</div>`;
  const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-sheet-close]")) closeSheet(); });
  document.addEventListener("keydown", onKey);
  document.body.append(el);
  open = { el, onKey, opener };
  el.querySelector("[data-sheet-close]").focus();
  return el;
}

export function closeSheet() {
  if (!open) return;
  document.removeEventListener("keydown", open.onKey);
  open.el.remove();
  open.opener?.focus?.();
  open = null;
}
