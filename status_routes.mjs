// /api routes for job statuses: marking what happened after Applied, and Waiting for your OK (approve, skip, send now).
// server.mjs merges these into its route table; startTask runs `apply.mjs run --job <id>` for Send now.
import { markStatus } from "./statuses.mjs";
import { approve, skip, requireApproved } from "./approval.mjs";

export function statusRoutes({ body, json, startTask, running }) {
  const handle = (fn) => async (req, res) => {
    const b = await body(req);
    try { json(res, await fn(b)); } catch (e) { json(res, { error: e.message }, 400); }
  };
  return {
    // { site, id, status: interview|offer|rejected|applied, date? }
    "POST /api/status": handle((b) => markStatus(b.site, b.id, { status: b.status, date: b.date, note: b.note })),
    // { site, id, answers: [{ label, value }] }
    "POST /api/approve": handle((b) => approve(b.site, b.id, b.answers)),
    "POST /api/skip": handle((b) => skip(b.site, b.id)),
    // A real single-job run that submits the approved job now
    "POST /api/send": handle((b) => {
      const r = requireApproved(b.site, b.id);
      if (running()) throw new Error("A run is in progress; your approved job is sent when it reaches the queue, or press Send now after it");
      return startTask("run", ["run", "--job", String(r.id)]);
    }),
  };
}
