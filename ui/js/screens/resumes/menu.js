// The Resumes list's menu: Open, Export as PDF, Export to edit, Rename, Delete. Opens on right-click, from a row's "⋯" button,
// and with Shift+F10 or the context-menu key on a focused row. Arrow keys, Home/End move; Enter runs; Escape and Tab close.
import { esc, icon, pdfUrl } from "../../util.js";
import { docxUrl } from "../../api.js";
import { openRename, openDelete } from "./manage.js";
import * as M from "./model.js";

let open = null; // { el, opener, onKey, onDown }

function items(x) {
  const cur = M.current(x), path = x.kind === "original" ? x.path : cur.path || x.path;
  const sentNow = x.kind === "tailored" && x.sent?.v === cur.v;
  const docx = x.kind === "original" && !x.read?.resume
    ? `<button class="menu-item" type="button" role="menuitem" tabindex="-1" data-action="res-docx-read" data-file="${esc(x.file)}">${icon("download")}Export to edit (.docx)</button>`
    : `<a class="menu-item" role="menuitem" tabindex="-1" href="${docxUrl(x.id)}" download>${icon("download")}Export to edit (.docx)</a>`;
  return `<button class="menu-item" type="button" role="menuitem" tabindex="-1" data-m="open">${icon("doc")}Open</button>
    ${/\.pdf$/i.test(path) ? `<a class="menu-item" role="menuitem" tabindex="-1" href="${pdfUrl(path)}&dl=1">${icon("download")}Export as PDF</a>` : ""}
    ${docx}<hr>
    <button class="menu-item" type="button" role="menuitem" tabindex="-1" data-m="rename">Rename…</button>
    <button class="menu-item" type="button" role="menuitem" tabindex="-1" data-m="delete" ${sentNow ? 'aria-disabled="true"' : ""}>Delete…${sentNow ? `<span class="foot">Sent versions can't be deleted</span>` : ""}</button>`;
}

export function closeMenu(refocus = true) {
  if (!open) return;
  document.removeEventListener("keydown", open.onKey, true);
  document.removeEventListener("pointerdown", open.onDown, true);
  open.el.remove();
  if (refocus) open.opener?.focus?.();
  open = null;
}

// at: { x, y } in the window (right-click), or null to place it under the opener
export function openMenu(x, opener, at = null, onOpen = () => {}) {
  closeMenu(false);
  const el = document.createElement("div");
  el.className = "menu rs-menu";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", `Actions for ${x.name}`);
  el.innerHTML = items(x);
  document.body.append(el);
  const r = opener.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min((at?.x ?? r.right - w), innerWidth - w - 8), top = (at?.y ?? r.bottom + 4) + h > innerHeight - 8 ? Math.max(8, (at?.y ?? r.top) - h - 4) : (at?.y ?? r.bottom + 4);
  Object.assign(el.style, { position: "fixed", left: `${Math.max(8, left)}px`, top: `${top}px` });
  const list = () => [...el.querySelectorAll("[role=menuitem]")];
  const move = (d) => { const l = list(), i = l.indexOf(document.activeElement); l[(i + d + l.length) % l.length].focus(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return closeMenu(); }
    if (e.key === "Tab") return closeMenu(false);
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    if (e.key === "Home") { e.preventDefault(); list()[0].focus(); }
    if (e.key === "End") { e.preventDefault(); list().at(-1).focus(); }
  };
  const onDown = (e) => { if (!el.contains(e.target)) closeMenu(false); };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[role=menuitem]"); if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
    const m = b.dataset.m;
    closeMenu(m !== "open"); // back on the row first, so a sheet opened next returns focus there
    if (m === "open") onOpen(x);
    if (m === "rename") openRename(x);
    if (m === "delete") openDelete(x);
    // links and the .docx button run through their own handlers
  });
  open = { el, opener, onKey, onDown };
  list()[0].focus();
}
