// Everything that touches LinkedIn in the browser: search, job pages, the Easy Apply form, availability checks.
// Button/label patterns cover English and Turkish UIs; add more languages to LI if LinkedIn shows another one.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DIR } from "./config.mjs";
import config from "./config.mjs";

export const PROFILE_DIR = path.join(DIR, "browser_profile");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pause = () => { const [a, b] = config.delaySeconds; return sleep((a + Math.random() * (b - a)) * 1000); };
export const short = () => sleep(800 + Math.random() * 1200);
export const btn = (scope, re) => scope.getByRole("button", { name: re }).filter({ visible: true }).first();
export const exists = async (l) => (await l.count()) > 0 && (await l.isVisible().catch(() => false));
// Lowercase that treats Turkish İ/I/ı as i, so "MÜHENDİSİ" matches "mühendisi"
export const norm = (s) => (s || "").replace(/[İIı]/g, "i").toLowerCase();

export const LI = {
  // Must START with it: "similar jobs" cards on the page also contain "Easy Apply" further into their label
  easyApply: /^\s*(bu işe )?(easy apply|kolay başvuru)/i,
  submit: /submit application|başvuruyu gönder/i,
  review: /^\s*(review|[İi]ncele|gözden geçir)/i,
  next: /^\s*(next|continue to next step|[İi]leri|sonraki|devam)/i,
  dismiss: /dismiss|kapat|close/i,
  discard: /^\s*(discard|sil|vazgeç)/i,
  done: /^\s*(done|bitti|tamam)/i,
  applied: /^(applied|başvuruldu|başvurulanlar|başvurdunuz)/i,
  closed: /no longer accepting applications|artık başvuru kabul etmiyor|this job is no longer available|bu iş ilanı artık mevcut değil/i,
};

// ---------- browser ----------
export async function launch({ headless = false } = {}) {
  const opts = { headless, viewport: null, args: ["--start-maximized"] };
  try {
    return await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: config.browserChannel || undefined });
  } catch (e) {
    if (!config.browserChannel) throw e;
    return chromium.launchPersistentContext(PROFILE_DIR, opts);
  }
}
export function findEdge() {
  return ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]
    .find((p) => fs.existsSync(p)) || null;
}
// A normal (not automated) Edge window on the tool's profile, so the user can sign in (Google sign-in blocks automated browsers).
export function openNormalEdge(urls) {
  const edge = findEdge();
  if (!edge) throw new Error("Microsoft Edge not found.");
  return spawn(edge, [`--user-data-dir=${PROFILE_DIR}`, "--no-first-run", ...urls], { stdio: "ignore", detached: true });
}

// ---------- search ----------
// Collects listings (Easy Apply and external) from search result cards: id, title, company, location, easyApply, alreadyApplied.
export async function collectListings(page, keyword, location) {
  const found = new Map();
  for (let p = 0; p < config.pagesPerSearch; p++) {
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}` +
      `${location ? `&location=${encodeURIComponent(location)}` : ""}&f_TPR=${config.linkedinPostedWithin}&start=${p * 25}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(4500);
    if (/\/login|\/authwall|\/checkpoint/.test(page.url())) throw new LinkedInLoginError("Not logged in to LinkedIn");
    // Scroll the results list so lazy cards render
    await page.evaluate(async () => {
      const list = [...document.querySelectorAll("[data-occludable-job-id]")].at(-1)?.closest("ul")?.parentElement;
      for (let i = 0; list && i < 6; i++) { list.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 400)); }
    }).catch(() => {});
    const cards = await page.evaluate(() => {
      const out = [];
      for (const li of document.querySelectorAll("[data-occludable-job-id], [data-job-id]")) {
        const id = li.getAttribute("data-occludable-job-id") || li.getAttribute("data-job-id");
        const lines = (li.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
        if (!/^\d+$/.test(id || "") || !lines.length) continue;
        // Card layout: title, (title repeated, sometimes as "<title> with verification"), company, location, insights..., "Easy Apply"/"Applied"
        const uniq = lines.filter((l, i) => i === 0 || !l.startsWith(lines[0]));
        out.push({ id, title: uniq[0], company: uniq[1] || "", location: uniq[2] || "", lines: uniq.slice(3) });
      }
      return out;
    });
    if (!cards.length) break;
    for (const c of cards) {
      if (found.has(c.id)) continue;
      found.set(c.id, {
        id: c.id, title: c.title, company: c.company, location: c.location.replace(/\s*\(.*\)$/, ""),
        easyApply: c.lines.some((l) => /^(easy apply|kolay başvuru)$/i.test(l)),
        alreadyApplied: c.lines.some((l) => LI.applied.test(l)),
        searchTerm: keyword, searchLocation: location,
      });
    }
    await pause();
  }
  return [...found.values()];
}
export class LinkedInLoginError extends Error {}

// ---------- job page ----------
// "3 days ago" / "3 gün önce" / "Reposted 2 weeks ago" -> ISO date (approximate)
export function parsePosted(text) {
  const m = norm(text).match(/(\d+)\s*(minute|min|hour|day|week|month|year|dakika|saat|gün|hafta|ay|yil|yıl)s?\s*(ago|önce)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { minute: 6e4, min: 6e4, dakika: 6e4, hour: 36e5, saat: 36e5, day: 864e5, "gün": 864e5, week: 6048e5, hafta: 6048e5, month: 2592e6, ay: 2592e6, year: 31536e6, yil: 31536e6, "yıl": 31536e6 }[m[2]];
  return unit ? new Date(Date.now() - n * unit).toISOString() : null;
}

export async function readJobPage(page, id) {
  const url = `https://www.linkedin.com/jobs/view/${id}/`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  if (/\/login|\/authwall|\/checkpoint/.test(page.url())) throw new LinkedInLoginError("Not logged in to LinkedIn");
  // The tab title is "Title | Company | LinkedIn"; the page has no stable title element
  const parts = (await page.title()).replace(/^\(\d+\)\s*/, "").split(" | ");
  const title = parts.length >= 3 ? parts[0].trim() : "";
  const company = parts.length >= 3 ? parts[1].trim() : "";
  const top = (await page.locator("main").first().innerText().catch(() => "")).slice(0, 1500);
  // Top line looks like "Istanbul, Türkiye · 3 days ago · 100+ applicants"
  const meta = top.split("\n").map((s) => s.trim()).find((l) => l.includes(" · ") && /ago|önce/i.test(l)) || "";
  const [location = "", postedText = "", applicants = ""] = meta.split(" · ").map((s) => s.trim());
  const closed = LI.closed.test(top);
  const easyBtn = page.getByRole("button", { name: LI.easyApply }).or(page.getByRole("link", { name: LI.easyApply })).filter({ visible: true }).first();
  const easyApply = !closed && (await exists(easyBtn));
  const alreadyApplied = await page.getByText(LI.applied).first().isVisible().catch(() => false);
  // Company logo in the top card (best effort; the app shows initials without it)
  const logo = await page.locator('main a[href*="/company/"] img').first().getAttribute("src", { timeout: 1500 }).catch(() => null);
  return { url, title, company, location, postedText, postedAt: parsePosted(postedText), applicants, closed, easyApply, alreadyApplied, easyBtn,
    logoUrl: /^https:\/\//.test(logo || "") ? logo : null };
}

// External jobs: click "Apply on company website" and capture where it leads (the new tab is closed right away).
// If LinkedIn first asks to share the user's profile with the poster, we close that prompt instead: sharing is the user's call,
// so they click Apply themselves (the app links to the listing).
export async function externalApplyUrl(page) {
  const name = /^\s*(şirket web sitesinde başvur|apply on company website|apply|başvur)\s*$/i;
  const b = page.getByRole("button", { name }).or(page.getByRole("link", { name })).filter({ visible: true }).first();
  if (!(await exists(b))) return null;
  const popupP = page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null);
  await b.click().catch(() => {});
  const popup = await popupP;
  if (!popup) { await closeDialog(page).catch(() => {}); return null; } // share-profile prompt (or nothing): don't continue
  await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  const url = popup.url();
  await popup.close().catch(() => {});
  return /^https?:/.test(url) && !/linkedin\.com\/(jobs|login)/.test(url) ? url : null;
}

export async function jobDescription(page) {
  const more = page.getByRole("button", { name: /see more|show more|daha fazla/i }).filter({ visible: true }).first();
  if (await exists(more)) await more.click().catch(() => {});
  // Current layout: the section under the "About the job" / "İş ilanı hakkında" heading
  const byHeading = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2, h3")].find((e) => /about the job|[İi]ş ilanı hakkında/i.test(e.innerText));
    let el = h;
    while (el && el.innerText.length < 400) el = el.parentElement;
    return el ? el.innerText.trim() : "";
  });
  if (byHeading.length > 200) return byHeading.slice(0, 20000);
  return (await page.locator("main").first().innerText().catch(() => "")).trim().slice(0, 15000);
}

// Is a listing still open? Returns { open, reason }.
export async function checkAvailability(page, url) {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    if (res && res.status() === 404) return { open: false, reason: "Listing removed (404)" };
    if (!/\/jobs\/view\//.test(page.url())) return { open: false, reason: "Listing removed (redirected)" };
    const top = (await page.locator("main").first().innerText().catch(() => "")).slice(0, 1500);
    if (LI.closed.test(top)) return { open: false, reason: "No longer accepting applications" };
    return { open: true };
  } catch (e) { return { open: true, error: e.message }; }
}

// ---------- Easy Apply form ----------
// Tags every input inside `root` and returns descriptors, including current values.
export async function scanFields(root) {
  return root.evaluate((rootEl) => {
    let n = Date.now() % 100000;
    const tag = (el) => { const id = `f${n++}`; el.setAttribute("data-ab", id); return id; };
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 400);
    const labelOf = (el) => {
      let t = "";
      if (el.id) { const l = rootEl.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.innerText; }
      if (!t) t = el.getAttribute("aria-label") || "";
      if (!t) { const fs = el.closest("fieldset"); const lg = fs && fs.querySelector("legend"); if (lg) t = lg.innerText; }
      if (!t) { const p = el.parentElement?.parentElement; if (p) t = p.innerText; }
      return clean(t);
    };
    const fields = [], radioGroups = {};
    rootEl.querySelectorAll("input, textarea, select").forEach((el) => {
      const type = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : (el.type || "text");
      if (["hidden", "file", "submit", "button", "search"].includes(type)) return;
      if (type === "radio") {
        const key = el.name || el.closest("fieldset")?.id || "r";
        const fs = el.closest("fieldset");
        const legend = clean(fs?.querySelector("legend")?.innerText || fs?.getAttribute("aria-label") || "");
        const g = (radioGroups[key] ||= { kind: "radio", id: tag(fs || el), label: legend, value: "", options: [], optionIds: {}, name: el.name });
        const lab = el.id ? rootEl.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        // Option text: its label, else the text of the largest wrapper that contains only this radio
        let wrap = el;
        while (wrap.parentElement && wrap.parentElement !== rootEl && wrap.parentElement.querySelectorAll('input[type="radio"]').length === 1) wrap = wrap.parentElement;
        let text = clean(lab?.innerText || el.closest("label")?.innerText || el.getAttribute("aria-label") || wrap.innerText || el.value);
        if (g.options.includes(text)) text = `${text} (${g.options.length + 1})`;
        g.options.push(text);
        g.optionIds[text] = tag(lab || el);
        if (el.checked) g.value = text;
        return;
      }
      if (type === "checkbox") {
        if (/follow/i.test(el.id + el.name) || el.checked) return; // skip "follow company" and already-ticked boxes
        const lab = el.id ? rootEl.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const label = clean(lab?.innerText || labelOf(el));
        if (/top choice|en çok tercih/i.test(label)) return; // LinkedIn "top choice": limited per month, leave it to the user
        fields.push({ kind: "checkbox", id: tag(lab || el), label, value: "", options: ["check", "leave unchecked"] });
        return;
      }
      if (el.offsetParent === null) return;
      if (type === "select") {
        const opts = [...el.options].map((o) => clean(o.text));
        const placeholder = el.selectedIndex <= 0 || /select|seçiniz|seçin/i.test(opts[el.selectedIndex] || "");
        fields.push({ kind: "select", id: tag(el), label: labelOf(el), value: placeholder ? "" : opts[el.selectedIndex], options: opts.slice(1) });
        return;
      }
      const numeric = type === "number" || /numeric/i.test(el.id) || el.inputMode === "numeric";
      // Character limit: maxlength attribute, or a hint like "Maximum 400 characters" / "Maksimum 400 karakter" near the field
      let maxLength = el.maxLength > 0 ? el.maxLength : 0;
      for (let box = el.parentElement, i = 0; !maxLength && box && box !== rootEl && i < 4; box = box.parentElement, i++) {
        if (box.querySelectorAll("input, select, textarea").length > 1) break;
        const m = (box.innerText || "").match(/(?:max(?:imum)?|maksimum|en fazla)\s*([\d.,]+)\s*(?:karakter|characters?|chars?)/i);
        if (m) maxLength = parseInt(m[1].replace(/[.,]/g, ""), 10);
      }
      fields.push({ kind: type === "textarea" ? "textarea" : "text", id: tag(el), label: labelOf(el), value: el.value || "", numeric, ...(maxLength ? { maxLength } : {}) });
    });
    // Question text for groups without a <legend>: the text of the smallest wrapper holding all the
    // group's radios, minus the option texts
    for (const g of Object.values(radioGroups)) {
      if (g.label || !g.name) continue;
      const radios = rootEl.querySelectorAll(`input[type="radio"][name="${CSS.escape(g.name)}"]`);
      let box = radios[0];
      while (box.parentElement && box !== rootEl && box.querySelectorAll(`input[type="radio"][name="${CSS.escape(g.name)}"]`).length < radios.length) box = box.parentElement;
      const textOf = (b) => { let t = b.innerText || ""; for (const o of g.options) t = t.replace(o.replace(/ \(\d+\)$/, ""), " "); return clean(t); };
      // The question often sits beside the radio wrapper: widen until there's text, without swallowing other questions
      const ownInputs = radios.length;
      while (!textOf(box) && box.parentElement && box.parentElement !== rootEl &&
             box.parentElement.querySelectorAll("input, select, textarea").length === ownInputs) box = box.parentElement;
      g.label = textOf(box);
      // Still nothing: take the text just before the group (a sibling heading/span)
      for (let b = box, i = 0; !g.label && b && i < 4; b = b.parentElement, i++) {
        const prev = b.previousElementSibling;
        if (prev && !prev.querySelector("input, select, textarea")) g.label = clean(prev.innerText);
      }
    }
    const notResumePicker = (g) => !g.options.some((o) => /\.(pdf|docx?)\b/i.test(o)); // handled by selectResume
    return [...fields, ...Object.values(radioGroups).filter(notResumePicker).map(({ name, ...g }) => g)];
  });
}

function matchOption(options, value) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return null;
  return options.find((o) => o.toLowerCase() === v) ?? options.find((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase())) ?? null;
}

export async function applyAnswer(page, root, f, value) {
  const loc = (id) => root.locator(`[data-ab="${id}"]`);
  if (f.kind === "text" || f.kind === "textarea") {
    let v = f.numeric ? String(value).replace(/[^\d.,]/g, "") : String(value);
    if (f.maxLength && v.length > f.maxLength) {
      // Safety net: cut at the last sentence end that fits
      const cut = v.slice(0, f.maxLength);
      const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
      v = end > f.maxLength * 0.5 ? cut.slice(0, end + 1) : cut;
    }
    await loc(f.id).fill(v);
    await sleep(900);
    // Typeahead fields (e.g. city) need a suggestion picked
    const option = page.locator('[role="listbox"] [role="option"]').filter({ visible: true }).first();
    if (await option.count()) await option.click().catch(() => {});
    return v;
  }
  if (f.kind === "select") {
    const opt = matchOption(f.options, value);
    if (!opt) throw new Error(`"${value}" is not an option`);
    await loc(f.id).selectOption({ label: opt });
    return opt;
  }
  if (f.kind === "radio") {
    const opt = matchOption(f.options, value);
    if (!opt) throw new Error(`"${value}" is not an option`);
    await loc(f.optionIds[opt]).click({ force: true });
    return opt;
  }
  if (f.kind === "checkbox") {
    if (/^check/i.test(value)) await loc(f.id).click({ force: true });
    return value;
  }
}

// On the resume step, select the named file. Returns null if this isn't a resume step.
export async function selectResume(page, root, file) {
  const findIt = () => root.evaluate((rootEl, file) => {
    const strip = (s) => s.toLowerCase().replace(/\.(pdf|docx?)$/i, "").trim();
    const leaves = [...rootEl.querySelectorAll("h3, h4, span, p, div, label")].filter((el) => !el.children.length || el.tagName.startsWith("H"));
    const names = [...new Set(leaves.map((el) => (el.innerText || "").trim()).filter((t) => /\.(pdf|docx?)$/i.test(t)))];
    const hit = leaves.find((el) => strip(el.innerText || "") === strip(file));
    if (hit) (hit.closest('label, button, [role="radio"], [role="button"], [class*="document"][class*="card"]') || hit).setAttribute("data-ab-resume", "1");
    return { names, found: !!hit };
  }, file);
  let r = await findIt();
  if (!r.names.length) return null;
  if (!r.found) {
    const more = btn(root, /show more resumes|daha fazla özgeçmiş/i);
    if (await exists(more)) { await more.click(); await sleep(1200); r = await findIt(); }
  }
  if (!r.found) return { selected: false, onLinkedIn: r.names };
  await root.locator('[data-ab-resume="1"]').first().click({ force: true });
  await sleep(800);
  return { selected: true, onLinkedIn: r.names };
}

export async function uploadResume(page, dialog, file) {
  try {
    const input = dialog.locator('input[type="file"]');
    if (await input.count()) await input.first().setInputFiles(file);
    else {
      const b = btn(dialog, /upload resume|cv yükle|özgeçmiş yükle/i);
      if (!(await exists(b))) return false;
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 8000 }), b.click()]);
      await chooser.setFiles(file);
    }
    await sleep(6000); // LinkedIn processes the upload
    return true;
  } catch { return false; }
}

export async function closeDialog(page) {
  await btn(page, LI.dismiss).click().catch(() => {});
  await sleep(1200);
  const discard = btn(page, LI.discard);
  if (await exists(discard)) await discard.click().catch(() => {});
  await sleep(800);
}
