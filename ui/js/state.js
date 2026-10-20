// App state: the data loaded from the server plus what the user is looking at.
import * as api from "./api.js";

export const S = {
  // server data
  STATE: null, DATA: [], LOG: [], META: { minAtsScore: 55, tailorTarget: 80 },
  MARKET: null, AUDIT: {}, STATS: null, INS: null, GH: null, LIB: { entries: [] }, DOCS: [], RUNS: [], RES: null,
  // view state
  view: "jobs", sub: "pipeline", filter: "all", selected: null, query: "", showArchived: false,
  // Jobs: grouping (remembered), the open panel over the detail ("none" | "posting" | "ask"), phone list/detail, Ask draft
  groupBy: (() => { try { return localStorage.getItem("jp-group") || "day"; } catch { return "day"; } })(),
  groupMenu: false, panel: "none", jobOpen: false, askDraft: "",
  // Resumes: selected id ("o:file", "r:field", "t:job", "answers"), filter, search, change-kind chip, phone detail, answer drafts
  // Insights: pipeline period and field, the selected to-do step, which steps the list shows, hidden steps shown
  ins: { period: "week", field: "all", step: null, list: "all", showHidden: false },
  res: { sel: null, filter: "all", query: "", kind: "all", open: false, editing: [], drafts: {} },
};

// Hooks the router fills in, so screens can re-render without importing the router
export const app = { render: () => {}, load: async () => {}, renderNav: () => {}, renderStatus: () => {} };

export const isBusy = () => !!(S.STATE?.run?.running || Object.values(S.STATE?.tasks || {}).some((t) => t.running));

export async function loadState(recheck = false) {
  S.STATE = await api.getState(recheck);
  app.renderStatus();
  return S.STATE;
}

export async function loadData() {
  const [data, log, meta, market, gh, lib, docs, runs, res, ins] = await Promise.all([
    api.getApplications(), api.getLog(), api.getMeta(), api.getMarket(), api.getGithub(), api.getLibrary(), api.getDoctor(), api.getRuns(), api.getResumes(), api.getInsights()]);
  Object.assign(S, { DATA: data, LOG: log, META: meta, MARKET: market.market, AUDIT: market.audit, STATS: market.stats,
    GH: gh, LIB: lib, DOCS: docs, RUNS: runs, RES: res?.error ? null : res, INS: ins?.error ? null : ins });
}
