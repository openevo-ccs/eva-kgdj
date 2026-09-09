// Structural-coherence measures over the canonical graph, live in the browser.
//
// Same three categories scripts/analyze_kgdj_coherence.py computes offline against a
// real Postgres snapshot (see docs/kgdj/12-graph-coherence.md for the first real run's
// findings and the six-category framing this and mpi-eva-graph's own coherence review
// share). This module recomputes them client-side, over whatever graph the caller
// already has in hand — no extra fetch, no Python dependency, safe to run on every
// EditorialPage load. Pure functions over plain node/edge arrays, matching
// labelPropagation's style in analytics.ts rather than GraphCanvas's cytoscape-bound
// one: none of this needs cytoscape's specific algorithms, just an adjacency list.
//
// Deliberately does NOT suggest which two specific nodes should bridge a department
// gap — eva-graph-66's own bridges each took real research to justify (a named paper,
// a named mechanism). Guessing a pairing here would look like a claim; surfacing the
// gap and letting a person pick real endpoints is the honest version of this feature.
import type { Department, GraphEdge, GraphNode } from "./types";

const GROUNDING_TYPES = new Set(["theory", "method"]);

function buildDegree(edges: GraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) || 0) + 1);
  edges.forEach((e) => { bump(e.source_node_id); bump(e.target_node_id); });
  return degree;
}

export interface UnderLinkedNode { node: GraphNode; degree: number; candidateGrounding: GraphNode[] }

/** Category 1: degree <= 1, same department already has a theory/method that could plausibly ground it. */
export function underLinkedButPlausible(nodes: GraphNode[], edges: GraphEdge[], limit = 40): UnderLinkedNode[] {
  const degree = buildDegree(edges);
  const byDeptType = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (!n.department_id) continue;
    const k = `${n.department_id}|${n.type_code}`;
    (byDeptType.get(k) ?? byDeptType.set(k, []).get(k)!).push(n);
  }
  const out: UnderLinkedNode[] = [];
  for (const n of nodes) {
    const deg = degree.get(n.id) ?? 0;
    if (deg > 1 || !n.department_id) continue;
    const grounding = [...GROUNDING_TYPES]
      .flatMap((t) => byDeptType.get(`${n.department_id}|${t}`) ?? [])
      .filter((g) => g.id !== n.id);
    if (grounding.length) out.push({ node: n, degree: deg, candidateGrounding: grounding.slice(0, 5) });
  }
  return out.sort((a, b) => a.degree - b.degree || a.node.label.localeCompare(b.node.label)).slice(0, limit);
}

export interface DeptPair { a: Department; b: Department; crossEdges: number }

/** Category 2: of every possible department pair, which have zero direct cross-department edges. */
export function departmentPairMatrix(nodes: GraphNode[], edges: GraphEdge[], depts: Department[]): DeptPair[] {
  const nodeDept = new Map(nodes.map((n) => [n.id, n.department_id]));
  const counts = new Map<string, number>();
  for (const e of edges) {
    const du = nodeDept.get(e.source_node_id), dv = nodeDept.get(e.target_node_id);
    if (du && dv && du !== dv) {
      const key = [du, dv].sort().join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const sorted = [...depts].sort((a, b) => a.code.localeCompare(b.code));
  const pairs: DeptPair[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      pairs.push({ a, b, crossEdges: counts.get([a.id, b.id].sort().join("|")) ?? 0 });
    }
  }
  return pairs;
}

export interface PendantChain { department: Department; chain: GraphNode[]; hops: number }

/**
 * Category 6 (eva-graph-66's live find, 2026-09-09): a department can pass the pair-
 * matrix and degree checks and still hide a long linear "spike" — real subfields
 * stitched together by weak edges, each missing its own direct link to the
 * department's actual hub. Walk back from every degree-1 tip along its unbranching
 * run to the nearest branch point or department exit; a long run is the chain.
 */
export function pendantChains(nodes: GraphNode[], edges: GraphEdge[], depts: Department[], minHops = 4): PendantChain[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const deptById = new Map(depts.map((d) => [d.id, d]));
  const adjAll = new Map<string, Set<string>>();
  nodes.forEach((n) => adjAll.set(n.id, new Set()));
  edges.forEach((e) => { adjAll.get(e.source_node_id)?.add(e.target_node_id); adjAll.get(e.target_node_id)?.add(e.source_node_id); });

  const byDept = new Map<string, Set<string>>();
  for (const n of nodes) if (n.department_id) (byDept.get(n.department_id) ?? byDept.set(n.department_id, new Set()).get(n.department_id)!).add(n.id);

  const out: PendantChain[] = [];
  for (const [deptId, members] of byDept) {
    const dept = deptById.get(deptId);
    if (!dept) continue;
    const internal = (id: string) => [...(adjAll.get(id) ?? [])].filter((x) => members.has(x));
    const exits = new Set([...members].filter((m) => [...(adjAll.get(m) ?? [])].some((x) => !members.has(x))));
    if (!exits.size) continue;
    for (const tip of members) {
      if (exits.has(tip) || internal(tip).length !== 1) continue;
      const path = [tip];
      let cur = tip, prev: string | null = null;
      for (;;) {
        const nbrs = internal(cur).filter((x) => x !== prev);
        if (nbrs.length !== 1) break;
        prev = cur; cur = nbrs[0]; path.push(cur);
        if (exits.has(cur) || internal(cur).length !== 2) break;
      }
      const hops = path.length - 1;
      if (hops >= minHops) out.push({ department: dept, chain: path.map((id) => byId.get(id)!).filter(Boolean), hops });
    }
  }
  return out.sort((a, b) => b.hops - a.hops);
}
