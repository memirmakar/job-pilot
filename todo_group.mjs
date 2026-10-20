// Merges near-identical to-do steps with Claude (llm.mjs ask), incrementally: groups already in data/market/todo_groups.json
// keep their ids and only steps no group has seen yet are sent, so it runs only when the sources change.
// Run from the daily run's upkeep and from `node apply.mjs todo`.
import { ask } from "./llm.mjs";
import { sources, loadGroups, looseId, moveMarks, GROUPS_FILE } from "./todo.mjs";
import fs from "node:fs";
import path from "node:path";

const BATCH = 120;
const GroupSchema = {
  type: "object", additionalProperties: false, required: ["groups"],
  properties: {
    groups: {
      type: "array", description: "Every new step exactly once",
      items: {
        type: "object", additionalProperties: false, required: ["id", "title", "steps"],
        properties: {
          id: { type: "string", description: "An existing group's id when the steps are the same piece of work as it; empty for a new group" },
          title: { type: "string", description: "Short label for the work, 3-8 words, sentence case, e.g. 'Unit tests and CI on your STM32 repo'" },
          steps: { type: "array", items: { type: "integer" }, description: "Numbers of the new steps in this group" },
        },
      },
    },
  },
};
const SYSTEM = `You merge a job seeker's to-do steps. The steps come from many job analyses and a market review, so the same piece
of work often appears with different wording ("Learn C# to intermediate level" and "Take Microsoft's C# path").
Put steps in one group only when doing one of them would also do the others: the same skill, course, project or resume edit.
Different projects that happen to use the same skill stay apart. Prefer an existing group when a step matches it.
Every new step goes in exactly one group. Reply only with the structured result.`;

// Returns { added, groups } (added = new steps grouped this time)
export async function groupTodo({ log = console.log } = {}) {
  const src = sources(), G = loadGroups();
  const seen = new Set(G.groups.flatMap((g) => g.keys));
  const fresh = [...src.values()].filter((s) => !seen.has(s.key));
  if (!fresh.length) return { added: 0, groups: G.groups.length };
  const moves = {};
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    log(`  Merging ${batch.length} to-do step(s) with Claude...`);
    const existing = G.groups.map((g) => `${g.id} | ${g.title}`).join("\n") || "(none yet)";
    const prompt = `Existing groups (id | title):\n${existing}\n\nNew steps (number: kind · text):\n` +
      batch.map((s, n) => `${n}: ${s.kind || "other"} · ${String(s.text).replace(/\s+/g, " ").slice(0, 260)}`).join("\n");
    const { data } = await ask({ system: SYSTEM, prompt, schema: GroupSchema });
    const byId = new Map(G.groups.map((g) => [g.id, g])), placed = new Set();
    for (const g of data.groups) {
      const steps = g.steps.filter((n) => batch[n] && !placed.has(n));
      if (!steps.length) continue;
      steps.forEach((n) => placed.add(n));
      let grp = byId.get(g.id);
      if (!grp) {
        // a new group takes its first step's loose id, so a done mark on that step stays put
        let id = looseId(batch[steps[0]].text);
        while (byId.has(id)) id += "x";
        grp = { id, title: g.title.trim(), keys: [] };
        G.groups.push(grp); byId.set(id, grp);
      }
      for (const n of steps) { grp.keys.push(batch[n].key); moves[looseId(batch[n].text)] = grp.id; }
    }
    // anything Claude left out stays a group of its own
    batch.forEach((s, n) => {
      if (placed.has(n)) return;
      const id = looseId(s.text);
      if (byId.has(id)) byId.get(id).keys.push(s.key);
      else { const grp = { id, title: null, keys: [s.key] }; G.groups.push(grp); byId.set(id, grp); }
    });
    G.at = new Date().toISOString();
    fs.mkdirSync(path.dirname(GROUPS_FILE), { recursive: true });
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(G, null, 2));
  }
  moveMarks(moves);
  return { added: fresh.length, groups: G.groups.length };
}

// Steps no group has seen yet (the To-do tab offers to merge them)
export const pendingCount = () => { const seen = new Set(loadGroups().groups.flatMap((g) => g.keys)); return [...sources().keys()].filter((k) => !seen.has(k)).length; };
