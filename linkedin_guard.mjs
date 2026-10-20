// Page checks after each LinkedIn navigation: signed out, or LinkedIn limiting/blocking the account.
// The run stops on either and records a clear reason (outcome.stopKind) for the app.
export class LinkedInLoginError extends Error {}
export class LinkedInLimitError extends Error {}

// LinkedIn's limit and warning pages, English and Turkish (check these on a real limit; they're from LinkedIn's help pages)
const LIMIT = /too many requests|unusual activity|reached the (weekly |daily |monthly )?(commercial use |search )?limit|temporarily (restricted|limited)|account (has been |is )?restricted|olağan ?dışı (etkinlik|aktivite)|çok fazla istek|(geçici olarak )?kısıtlan(dı|mış)|arama limitine ulaştınız/i;

const BANNER = /too many requests|you('|’)ve reached the (weekly |daily |monthly )?(commercial use |search )?limit|çok fazla istek|arama limitine ulaştınız/i;

// banner: also look for a limit message inside the page (search result pages)
export async function guard(page, res = null, { banner = false } = {}) {
  const url = page.url();
  if (res?.status?.() === 429) throw new LinkedInLimitError("LinkedIn answered 429 Too Many Requests");
  const restricted = /\/checkpoint\/(challenge|rp|restricted)|\/restricted/.test(url);
  if (restricted || /\/checkpoint\//.test(url)) {
    const text = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).slice(0, 3000);
    if (restricted || LIMIT.test(text)) throw new LinkedInLimitError(`LinkedIn showed a limit or security check (${url.replace(/\?.*/, "")})`);
  }
  if (/\/login|\/authwall|\/checkpoint/.test(url)) throw new LinkedInLoginError("Not logged in to LinkedIn");
  // A limit banner on a search page (narrower words: job descriptions can mention "unusual activity")
  if (!banner) return;
  const top = (await page.locator("main").first().innerText({ timeout: 1500 }).catch(() => "")).slice(0, 1200);
  if (BANNER.test(top)) throw new LinkedInLimitError(`LinkedIn says: ${top.match(BANNER)[0]}`);
}

// When the next scheduled run starts (for "paused until"); null when the schedule is off
export function nextScheduled(settings, from = new Date()) {
  if (!settings?.scheduleEnabled || !/^\d\d:\d\d$/.test(settings.scheduleTime || "")) return null;
  const [h, m] = settings.scheduleTime.split(":").map(Number);
  const d = new Date(from); d.setHours(h, m, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
