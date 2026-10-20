// Small helpers shared by every screen: escaping, text formatting, dates, toast.
export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Inline: escape + **bold**
export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
export const fmtDate = (s) => s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
export const ago = (iso) => {
  if (!iso) return "";
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  return d < 1 ? "today" : d < 2 ? "1 day ago" : d < 14 ? `${Math.round(d)} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`;
};
export const lines = (s) => String(s || "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
export const pdfUrl = (p) => "/pdf?p=" + encodeURIComponent(p);

// Turns Claude's text into scannable HTML: "- " lines become bullets, **x** becomes bold,
// and long plain paragraphs are split into one bullet per sentence.
export function rich(text) {
  if (!text) return "";
  let ls = String(text).replace(/\\n/g, "\n").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (ls.length === 1 && !ls[0].startsWith("- ") && ls[0].length > 180)
    ls = ls[0].split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9"'(])/).map((s) => "- " + s);
  const bullets = ls.filter((l) => /^[-•*]\s/.test(l));
  if (!bullets.length) return `<div class="rich"><p>${md(ls.join(" "))}</p></div>`;
  return `<div class="rich">${ls.filter((l) => !/^[-•*]\s/.test(l)).map((l) => `<p>${md(l)}</p>`).join("")}<ul>${bullets.map((l) => `<li>${md(l.replace(/^[-•*]\s/, ""))}</li>`).join("")}</ul></div>`;
}

export const toast = (msg, ms = 4000) => {
  const t = $("#toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = "none"), ms);
};

// Line icons (single weight, rounded), used by the shell
export const icon = (name, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${{
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path>',
  more: '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>',
  check: '<path d="M5 12l5 5 9-10"></path>',
  close: '<path d="M6 6l12 12M18 6L6 18"></path>',
  down: '<path d="M6 9l6 6 6-6"></path>',
  back: '<path d="M15 6l-6 6 6 6"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"></rect><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"></path>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"></path>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"></path>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  next: '<path d="M9 6l6 6-6 6"></path>',
  "doc-check": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 15l2 2 4-4"></path>',
}[name] || ""}</svg>`;
