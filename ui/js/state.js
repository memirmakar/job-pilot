// App state: the data loaded from the server plus what the user is looking at.
import * as api from "./api.js";

export const S = {
  // server data
  STATE: null, DATA: [], LOG: [], META: { minAtsScore: 55, tailorTarget: 80 },
  MARKET: null, DONE: {}, AUDIT: {}, STATS: null, GH: null, LIB: { entries: [] }, DOCS: [], RUNS: [],
  // view state
  view: "jobs", sub: "overview", filter: "all", selected: null, query: "", showArchived: false,
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
  const [data, log, meta, market, gh, lib, docs, runs] = await Promise.all([
    api.getApplications(), api.getLog(), api.getMeta(), api.getMarket(), api.getGithub(), api.getLibrary(), api.getDoctor(), api.getRuns()]);
  Object.assign(S, { DATA: data, LOG: log, META: meta, MARKET: market.market, DONE: market.done, AUDIT: market.audit, STATS: market.stats,
    GH: gh, LIB: lib, DOCS: docs, RUNS: runs });
}
