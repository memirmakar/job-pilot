// Insights routes: /api/insights (insights.mjs) and the to-do list's done and added marks (todo.mjs). Mounted by server.mjs.
// Fresh imports each time, like server.mjs, so a changed review or settings file is read without a restart.
const fresh = (m) => import(`./${m}?t=${Date.now()}`);

export function insightsRoutes({ body, json }) {
  return {
    "GET /api/insights": async (req, res) => json(res, (await fresh("insights.mjs")).buildInsights()),
    // { id, done } -> { state, flagged }: done flags the jobs it lifts "Re-score on next run"
    "POST /api/todo": async (req, res) => {
      const { id, done } = await body(req);
      if (!id) return json(res, { error: "Which step?" }, 400);
      const T = await fresh("todo.mjs");
      json(res, T.setDone(String(id), !!done));
    },
    // { ids[], added } -> state: "Add to my to-do list" on a job's card
    // { items[{ title why hours kind }] } -> { state, ids }: new steps from Guidance (a coach answer, a mock interview's practice list)
    "POST /api/todo/add": async (req, res) => {
      const { ids, items, added = true } = await body(req);
      const T = await fresh("todo.mjs");
      if (Array.isArray(items) && items.length) return json(res, T.addCustom(items.slice(0, 10)));
      if (!Array.isArray(ids) || !ids.length) return json(res, { error: "No steps to add" }, 400);
      json(res, T.setAdded(ids.map(String), !!added));
    },
  };
}
