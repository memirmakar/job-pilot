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
// One entry per line only (LinkedIn locations like "Istanbul, Türkiye" contain commas)
export const rows = (s) => String(s || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
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
  plus: '<path d="M12 5v14M5 12h14"></path>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"></path>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"></path><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path>',
  target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path>',
  send: '<path d="M4 12l16-8-6 16-2-7z"></path>',
  ban: '<circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"></path>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"></path>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect><path d="M11 18.5h2"></path>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5 5 0 0 0-1.4-3.6 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.4 0C6.1 1.1 5 1.4 5 1.4a4.7 4.7 0 0 0-.1 3.5A5 5 0 0 0 3.5 8.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V21"></path>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>',
}[name] || ""}</svg>`;
