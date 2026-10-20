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
    "POST /api/todo/add": async (req, res) => {
      const { ids, added = true } = await body(req);
      if (!Array.isArray(ids) || !ids.length) return json(res, { error: "No steps to add" }, 400);
      const T = await fresh("todo.mjs");
      json(res, T.setAdded(ids.map(String), !!added));
    },
  };
}
