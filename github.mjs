// Reads the candidate's public GitHub repos (cached daily) and gets a blunt, cached Claude review of each.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.mjs";
import { assessRepos } from "./llm.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, "data", "github");
const REPOS_FILE = path.join(CACHE, "repos.json");
const REVIEW_FILE = path.join(CACHE, "review.json");

async function gh(url, accept = "application/vnd.github+json") {
  const headers = { Accept: accept, "User-Agent": "job-auto-apply" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}: ${(await res.text()).slice(0, 200)}`);
  return accept.includes("raw") ? res.text() : { data: await res.json(), link: res.headers.get("link") };
}

async function fetchRepos(user) {
  const { data: list } = await gh(`https://api.github.com/users/${user}/repos?per_page=100&sort=pushed`);
  const repos = [];
  for (const r of list.filter((r) => !r.fork && !r.archived)) {
    const readme = (await gh(`https://api.github.com/repos/${user}/${r.name}/readme`, "application/vnd.github.raw").catch(() => null)) || "";
    const langs = (await gh(r.languages_url))?.data || {};
    // Commit count: ask for 1 per page and read the last page number from the Link header
    const commits = await gh(`https://api.github.com/repos/${user}/${r.name}/commits?per_page=1`).catch(() => null);
    const commitCount = commits?.link?.match(/page=(\d+)>; rel="last"/)?.[1] ?? (commits?.data?.length || 0);
    const tree = (await gh(`https://api.github.com/repos/${user}/${r.name}/git/trees/${r.default_branch}?recursive=1`).catch(() => null))?.data;
    const files = (tree?.tree || []).filter((t) => t.type === "blob").map((t) => t.path);
    repos.push({
      name: r.name, url: r.html_url, description: r.description || "", topics: r.topics || [],
      languages: langs, stars: r.stargazers_count, created: r.created_at, pushed: r.pushed_at, sizeKb: r.size,
      commits: Number(commitCount), fileCount: files.length, files: files.slice(0, 150),
      readme: readme.slice(0, 6000),
    });
  }
  return repos;
}

// Returns [{ ...repo, review }] — fetched at most once per `github.refreshHours`, reviewed only when a repo changed.
export async function loadGithub({ force = false } = {}) {
  const G = config.github;
  if (!G?.user) return [];
  fs.mkdirSync(CACHE, { recursive: true });
  let cached = fs.existsSync(REPOS_FILE) ? JSON.parse(fs.readFileSync(REPOS_FILE, "utf8")) : null;
  const stale = !cached || cached.user !== G.user || Date.now() - Date.parse(cached.fetchedAt) > (G.refreshHours ?? 24) * 3600e3;
  if (force || stale) {
    try {
      cached = { user: G.user, fetchedAt: new Date().toISOString(), repos: await fetchRepos(G.user) };
      fs.writeFileSync(REPOS_FILE, JSON.stringify(cached, null, 2));
    } catch (e) {
      if (!cached) throw e;
      console.log(`  GitHub refresh failed, using cached repos: ${e.message}`);
    }
  }
  const reviews = fs.existsSync(REVIEW_FILE) ? JSON.parse(fs.readFileSync(REVIEW_FILE, "utf8")) : {};
  // changed repos, plus (on a refresh) reviews from before relevance, fixes and pins were asked for
  const toReview = cached.repos.filter((r) => reviews[r.name]?.pushed !== r.pushed || (force && reviews[r.name]?.relevance == null));
  if (toReview.length) {
    console.log(`  Reviewing ${toReview.length} GitHub repo(s) with Claude...`);
    const { reviews: fresh } = await assessRepos(toReview);
    for (const rv of fresh) {
      const repo = toReview.find((r) => r.name === rv.name);
      if (repo) reviews[rv.name] = { ...rv, pushed: repo.pushed, reviewedAt: new Date().toISOString() };
    }
    fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviews, null, 2));
  }
  return cached.repos.map((r) => ({ ...r, review: reviews[r.name] || null }));
}

// Compact text for prompts: what the repo is plus the honest review.
export function githubBrief(repos) {
  if (!repos?.length) return "";
  return `Candidate's public GitHub repositories, each with an independent critical review:\n` + repos.map((r) => {
    const v = r.review;
    return `- ${r.name} (${r.url}) | ${Object.keys(r.languages).join(", ") || "no code"} | ${r.commits} commits, ${r.fileCount} files | ${r.description}` +
      (v ? `\n  Review: ${v.verdict.toUpperCase()}. ${v.summary} Skills shown: ${v.skills_demonstrated.join(", ")}. Critique: ${v.critique}` : "");
  }).join("\n");
}
