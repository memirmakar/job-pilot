// Once per run: read LinkedIn's job tracker (Applied and Interview tabs) without clicking anything, and add what
// changed to the matching records' statusHistory (statuses.mjs). Only the first page (10 newest) of each tab is read:
// later pages need a click on the pager.
import { guard } from "./linkedin_guard.mjs";
import { sleep } from "./linkedin.mjs";
import { loadAllRecords, saveRecord, log } from "./store.mjs";
import { addHistory, hasHistory } from "./statuses.mjs";

const TRACKER = (stage) => `https://www.linkedin.com/jobs-tracker/?stage=${stage}`;
// Card lines (Turkish checked on a real account; English from LinkedIn's English UI, check on a real run)
export const TRACK = {
  viewed: /^(başvuru görüntülendi|application viewed)$/i,
  downloaded: /^(cv indirildi|özgeçmiş indirildi|resume downloaded)$/i,
  closed: /^\(?(artık başvuru kabul etmiyor|no longer accepting applications)\)?$/i,
};

// -> [{ id, title, company, lines }] for one tab; scrolling only
export async function readTracker(page, stage = "applied") {
  const res = await page.goto(TRACKER(stage), { waitUntil: "domcontentloaded" });
  await sleep(5000);
  await guard(page, res);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 2500); await sleep(900); }
  return page.evaluate(() => {
    const seen = new Map();
    for (const a of document.querySelectorAll('a[href*="/jobs/view/"]')) {
      const id = (a.href.match(/jobs\/view\/(\d+)/) || [])[1];
      if (!id || seen.has(id)) continue;
      // The card: the widest ancestor that still holds only this job's links (title and logo)
      let el = a;
      while (el.parentElement && el.parentElement.tagName !== "MAIN" && el.parentElement.querySelectorAll('a[href*="/jobs/view/"]').length <= 2) el = el.parentElement;
      const lines = (el.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
      seen.set(id, { id, title: lines[0] || "", company: (lines[1] || "").split(" · ")[0], lines });
    }
    return [...seen.values()];
  });
}

// Pure: what a card adds to a record (used by syncApplied and the selftest)
export function changesFor(rec, card, stage) {
  const add = [], has = (t) => hasHistory(rec, t), lines = card.lines || [];
  if (lines.some((l) => TRACK.viewed.test(l)) && !has((h) => h.status === "viewed" && h.note === "Application viewed"))
    add.push({ status: "viewed", source: "linkedin", note: "Application viewed" });
  if (lines.some((l) => TRACK.downloaded.test(l)) && !has((h) => h.note === "Resume downloaded"))
    add.push({ status: "viewed", source: "linkedin", note: "Resume downloaded" });
  if (lines.some((l) => TRACK.closed.test(l)) && !has((h) => h.status === "listing_closed"))
    add.push({ status: "listing_closed", source: "linkedin", note: "No longer accepting applications" });
  if (stage === "interview" && !has((h) => h.status === "interview"))
    add.push({ status: "interview", source: "linkedin", note: "In LinkedIn's Interview column" });
  return add;
}

// `node apply.mjs tracker`: read both tabs in a headless browser and report what syncApplied would add (saves nothing)
export async function trackerReport() {
  const { launch } = await import("./linkedin.mjs");
  const ctx = await launch({ headless: true });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    const mine = new Map(loadAllRecords().filter((r) => r.status === "applied").map((r) => [String(r.id), r]));
    const out = {};
    for (const stage of ["applied", "interview"]) {
      const cards = await readTracker(page, stage);
      out[stage] = cards.map((c) => ({ id: c.id, title: c.title, company: c.company, status: c.lines.filter((l) => Object.values(TRACK).some((re) => re.test(l))),
        yours: mine.has(c.id), wouldAdd: mine.has(c.id) ? changesFor(mine.get(c.id), c, stage).map((e) => e.note) : [] }));
    }
    return out;
  } finally { await ctx.close().catch(() => {}); }
}

export async function syncApplied(page) {
  const mine = new Map(loadAllRecords().filter((r) => r.status === "applied").map((r) => [String(r.id), r]));
  if (!mine.size) return { read: 0, updated: 0 };
  let read = 0, updated = 0;
  for (const stage of ["applied", "interview"]) {
    const cards = await readTracker(page, stage);
    read += cards.length;
    for (const c of cards) {
      const rec = mine.get(c.id);
      if (!rec) continue;
      const add = changesFor(rec, c, stage);
      if (!add.length) continue;
      for (const e of add) addHistory(rec, e);
      saveRecord(rec);
      updated++;
      log(`  LinkedIn: ${rec.title} @ ${rec.company}: ${add.map((e) => e.note).join(", ")}`);
    }
  }
  return { read, updated };
}
