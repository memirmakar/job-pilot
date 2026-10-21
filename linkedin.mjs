// Everything that touches LinkedIn in the browser: search, job pages, the Easy Apply form, availability checks.
// Button/label patterns cover English and Turkish UIs; add more languages to LI if LinkedIn shows another one.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DIR } from "./config.mjs";
import config from "./config.mjs";
import { guard, LinkedInLoginError, LinkedInLimitError } from "./linkedin_guard.mjs";
export { LinkedInLoginError, LinkedInLimitError };

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
// workplace: LinkedIn's f_WT value from profiles.mjs workplaceParam() ("" = any)
export async function collectListings(page, keyword, location, { workplace = "" } = {}) {
  const found = new Map();
  for (let p = 0; p < config.pagesPerSearch; p++) {
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}` +
      `${location ? `&location=${encodeURIComponent(location)}` : ""}&f_TPR=${config.linkedinPostedWithin}${workplace ? `&f_WT=${encodeURIComponent(workplace)}` : ""}&start=${p * 25}`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(4500);
    await guard(page, res, { banner: true });
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
        workplace: /\((remote|uzaktan)\)/i.test(c.location) ? "remote" : /\((hybrid|hibrit)\)/i.test(c.location) ? "hybrid" : /\(/.test(c.location) ? "onsite" : null,
        easyApply: c.lines.some((l) => /^(easy apply|kolay başvuru)$/i.test(l)),
        alreadyApplied: c.lines.some((l) => LI.applied.test(l)),
        searchTerm: keyword, searchLocation: location,
      });
    }
    await pause();
  }
  return [...found.values()];
}

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
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  await guard(page, res);
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

// The Easy Apply form helpers live in linkedin_form.mjs (re-exported here)
export { scanFields, applyAnswer, selectResume, uploadResume, closeDialog } from "./linkedin_form.mjs";
