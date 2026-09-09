// Builds src/mock/graph.json for the KGDJ's mock mode (VITE_KGDJ_MODE=mock):
// the same 306 nodes / 499 edges the seed imports, in the shape the app's
// data layer expects, so the whole UI can be exercised (and screenshot-tested)
// without a Supabase project. Never contains people. The committed
// src/mock/graph.json is a build product (also required for `tsc`/`vite build`
// to resolve mockApi.ts's static import, so it can't just be gitignored here).
// Regenerating it needs the private openevo-ccs/eva-graph lab monorepo checked
// out as a sibling of this repo's parent directory (source path below) — not
// something a public contributor needs to do to build or run the app.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../ask_eva/eva-graph-pilot-app/ask-eva-app/data/mpi-eva-graph.json");
const out = resolve(here, "../src/mock/graph.json");
const g = JSON.parse(readFileSync(src, "utf-8"));

const DEPTS = [
  ["dag", "Department of Archaeogenetics", "DAG", "#1b5e4e"], ["hbec", "Department of Human Behavior, Ecology and Culture", "HBEC", "#7d7a9c"],
  ["dlce", "Department of Linguistic and Cultural Evolution", "DLCE", "#17948a"], ["evogen", "Department of Evolutionary Genetics", "EvoGen", "#8fa0b3"],
  ["humor", "Department of Human Origins", "HumOr", "#e8c33e"], ["primevo", "Department of Primate Behavior and Evolution", "PrimEvo", "#e2841e"],
  ["ccp", "Department of Comparative Cultural Psychology", "CCP", "#a3a13a"],
];
const departments = DEPTS.map(([code, name, abbr, color_hex], i) => ({ id: `dept-${code}`, code, name, abbr, color_hex }));
const deptId = Object.fromEntries(departments.map((d) => [d.code, d.id]));
const KNOWN_REL = new Set(["grounds", "enables", "applies-to", "measures", "informs", "contrasts-with", "relates-to", "cross-dept", "represents", "evidences", "scicomm-relevant-to"]);

const nodes = g.nodes.map((n, i) => {
  const depts = n.departments || (n.department ? [n.department] : []);
  return {
    id: `n-${i + 1}`, slug: n.id, label: n.label, type_code: n.type || "concept", description: n.desc || "",
    department_id: depts.length === 1 ? deptId[depts[0]] : null, status: "proposed",
    external_ids: { meg: n.id, ...(depts.length > 1 ? { departments: depts } : {}), ...(n.scope === "institute" ? { scope: "institute" } : {}) },
    provenance: { ...(n.provenance || {}), imported_from: "eva-graph/mpi-eva-graph", assigned_by: "curator", status: "draft" },
    tags: n.tags || [], version: 1, created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z", canonical_since: null,
  };
});
const idBySlug = Object.fromEntries(nodes.map((n) => [n.slug, n.id]));
const edges = g.edges.filter((e) => idBySlug[e.s] && idBySlug[e.t]).map((e, i) => ({
  id: `e-${i + 1}`, source_node_id: idBySlug[e.s], target_node_id: idBySlug[e.t],
  relationship_code: KNOWN_REL.has(e.type) ? e.type : "relates-to", label: e.label || null, weight: e.weight || 3,
  status: "proposed", provenance: { source: "eva-graph/mpi-eva-graph", status: "draft", original_type: e.type }, version: 1,
  created_by: null, created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z", canonical_since: null,
}));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), source: "mpi-eva-graph.json", departments, nodes, edges }));
console.log(`${nodes.length} nodes, ${edges.length} edges -> ${out}`);
