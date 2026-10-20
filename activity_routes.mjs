// Activity and Doctor routes: run history, health checks, doctor reports, asking the doctor, and undoing a fix.
const fresh = (m) => import(`./${m}?t=${Date.now()}`);

// browserBusy(): a run or the LinkedIn login window has the browser profile open
export function activityRoutes({ body, json, startTask, browserBusy }) {
  return {
    "GET /api/activity": async (req, res) => json(res, (await fresh("activity.mjs")).activity()),
    "GET /api/doctor": async (req, res) => { const D = await fresh("doctor.mjs"); json(res, D.doctorReports().map((d) => ({ ...d, backedUp: D.backupCount(d.id) }))); },
    "GET /api/doctor/checks": async (req, res) => json(res, (await fresh("doctor_checks.mjs")).checks()),
    // One page visit in a hidden browser; not while something else has the profile open
    "POST /api/doctor/linkedin": async (req, res) => {
      if (browserBusy()) return json(res, { error: "LinkedIn is in use by a run or the login window. Check again when it's done." }, 409);
      json(res, await (await fresh("doctor_checks.mjs")).checkLinkedin());
    },
    "POST /api/doctor": async (req, res) => {
      const { problem } = await body(req);
      try { json(res, startTask("doctor", ["doctor", String(problem || "").trim() || "The user asked for a check-up from the app"])); } catch (e) { json(res, { error: e.message }, 409); }
    },
    "POST /api/doctor/undo": async (req, res) => {
      const { id } = await body(req);
      try { json(res, (await fresh("doctor.mjs")).undoReport(id)); } catch (e) { json(res, { error: e.message }, 400); }
    },
  };
}
