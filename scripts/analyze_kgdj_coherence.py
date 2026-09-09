#!/usr/bin/env python3
"""analyze_kgdj_coherence.py -- structural-coherence measures over KGDJ's own graph.

Same category of question eva-graph-66's mpi-eva-graph coherence review asked
(docs/mpi-eva-graph-coherence-review-2026-09-09.md), computed natively over
kgdj.nodes/kgdj.edges instead -- a DIFFERENT graph object (live Postgres,
student/editor-writable) that has diverged from mpi-eva-graph since KGDJ's
seed was cut, not a copy of the same data.

    python scripts/analyze_kgdj_coherence.py [--dsn postgresql://...] [--out report.json]

Read-only: every query is a SELECT. Point --dsn at a throwaway copy (the
apply_and_test.py / home-server postgres-scratch pattern) for exploration,
or a read-only role against the linked project for a real editorial report --
never a role that can write.

Computes three of eva-graph-66's five coherence categories that have a direct
analog in KGDJ's schema:
  1. Under-linked-but-plausible nodes -- degree <= 1, same department already
     has theory/method nodes that could plausibly ground it.
  2. Department-pair matrix -- of the 21 possible department pairs, which have
     zero direct cross-department edges.
  3. Import-vs-asserted edge mix -- what fraction of a node's edges are still
     exactly as imported (untouched since the seed) vs. added or reviewed
     since. The closest honest analog to eva-graph-66's "generic-stub
     inflation" finding: KGDJ has no synthetic per-department stub node for
     every import to fan into (department is a plain column, not an edge),
     so that specific failure mode can't occur here -- this script reports
     the analog it CAN measure instead of forcing a match.

Categories 4 (recording a reviewed "no link exists") and 5 (candidate-bridge
discovery feeding a proposal) are product/workflow questions, not something a
one-shot script computes -- see docs/kgdj/12-graph-coherence.md.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import networkx as nx
import psycopg

DEFAULT_DSN = "postgresql://postgres:pg@127.0.0.1:55432/postgres"
GROUNDING_TYPES = {"theory", "method"}


def load_graph(dsn: str):
    conn = psycopg.connect(dsn, autocommit=True)
    nodes = conn.execute(
        "select id, label, type_code, department_id, status, provenance from kgdj.nodes"
    ).fetchall()
    edges = conn.execute(
        "select id, source_node_id, target_node_id, relationship_code, status, provenance "
        "from kgdj.edges"
    ).fetchall()
    # Stringified keys: node_info stores dept_id as str(uuid) (psycopg returns UUID
    # objects, and a UUID object is never == the same-valued string), so a dict keyed
    # by the raw UUID objects here would silently miss every lookup below -- every
    # department-code lookup would fall through to the fallback default and the
    # pair-matrix would report every pair empty regardless of the real count. Caught
    # this exact failure 2026-09-09 by cross-checking against a direct SQL count
    # before trusting the script's own output -- see docs/kgdj/12-graph-coherence.md.
    depts = {str(i): c for i, c in conn.execute("select id, code from kgdj.departments").fetchall()}
    return nodes, edges, depts


def build_graph(nodes, edges):
    g = nx.Graph()
    node_info = {}
    for nid, label, type_code, dept_id, status, prov in nodes:
        g.add_node(str(nid))
        node_info[str(nid)] = {
            "label": label, "type_code": type_code, "dept_id": str(dept_id) if dept_id else None,
            "status": status, "provenance": prov or {},
        }
    for _eid, s, t, rel, status, prov in edges:
        g.add_edge(str(s), str(t), relationship_code=rel, status=status, provenance=prov or {})
    return g, node_info


def under_linked_but_plausible(g, node_info, depts, max_flag=40):
    """Category 1: degree <= 1, same department already has grounding material."""
    by_dept_type = defaultdict(list)
    for nid, info in node_info.items():
        if info["dept_id"]:
            by_dept_type[(info["dept_id"], info["type_code"])].append((nid, info["label"]))

    out = []
    for nid, info in node_info.items():
        deg = g.degree(nid)
        if deg > 1 or not info["dept_id"]:
            continue
        grounding = [
            lbl for t in GROUNDING_TYPES
            for (n2, lbl) in by_dept_type.get((info["dept_id"], t), [])
            if n2 != nid
        ]
        if grounding:
            out.append({
                "node_id": nid, "label": info["label"], "type_code": info["type_code"],
                "department": depts.get(info["dept_id"], info["dept_id"]), "degree": deg,
                "candidate_grounding": grounding[:5],
            })
    out.sort(key=lambda r: (r["degree"], r["department"]))
    return out[:max_flag], len(out)


def department_pair_matrix(g, node_info, depts):
    """Category 2: which of the 21 department pairs have zero direct cross-dept edges."""
    dept_codes = sorted(depts.values())
    counts = defaultdict(int)
    for u, v in g.edges():
        du, dv = node_info[u]["dept_id"], node_info[v]["dept_id"]
        if du and dv and du != dv:
            cu, cv = depts.get(du, du), depts.get(dv, dv)
            key = tuple(sorted((cu, cv)))
            counts[key] += 1
    pairs = []
    for i, a in enumerate(dept_codes):
        for b in dept_codes[i + 1:]:
            key = tuple(sorted((a, b)))
            pairs.append({"pair": list(key), "cross_edges": counts.get(key, 0)})
    empty = [p["pair"] for p in pairs if p["cross_edges"] == 0]
    return pairs, empty


def import_vs_asserted(g, node_info):
    """Category 3 analog: fraction of each node's edges still exactly as imported."""
    untouched = touched = 0
    for u, v, data in g.edges(data=True):
        prov = data.get("provenance") or {}
        # Both seed imports stamp a status/imported_at pair and never an approved_by;
        # anything with approved_by, or without an imported_at at all, has been acted
        # on since (promoted, added post-import, or edited).
        if prov.get("imported_at") and not prov.get("approved_by"):
            untouched += 1
        else:
            touched += 1
    total = untouched + touched
    return {
        "total_edges": total,
        "still_exactly_as_imported": untouched,
        "added_or_reviewed_since": touched,
        "pct_untouched": round(100 * untouched / total, 1) if total else 0.0,
    }


def pendant_chains(g, node_info, depts, min_chain_len=4):
    """Category 6 (from eva-graph-66's live finding, 2026-09-09): a department can pass
    the pair-matrix and degree checks and still hide a long linear "spike" -- a chain of
    nodes stitched together by weak generic edges, each missing its own direct link to
    the department's real hub, visible by eye in a force-directed layout but invisible
    to a table of degree/component numbers alone.

    Algorithm: within each department's *internal-only* subgraph, multi-source BFS from
    every "exit point" (a node with >=1 edge leaving the department) gives every node's
    hop-distance to the nearest point of contact with the rest of the graph. A long
    unbranching run of high-distance nodes is a pendant chain -- report the longest
    branchless path ending in each local-maximum node.
    """
    by_dept = defaultdict(set)
    for nid, info in node_info.items():
        if info["dept_id"]:
            by_dept[info["dept_id"]].add(nid)

    chains = []
    for dept_id, members in by_dept.items():
        internal = g.subgraph(members)
        exits = {n for n in members if any(nb not in members for nb in g.neighbors(n))}
        if not exits or internal.number_of_edges() == 0:
            continue
        dist = {}
        frontier = [(e, 0) for e in exits]
        seen = set(exits)
        while frontier:
            nxt = []
            for n, d in frontier:
                dist[n] = d
                for nb in internal.neighbors(n):
                    if nb not in seen:
                        seen.add(nb); nxt.append((nb, d + 1))
            frontier = nxt
        # a "tip" is a degree-1 node (within the department) that isn't itself an exit;
        # walk back from it along the strictly-increasing-distance-toward-it direction
        # to the nearest branch point or exit, i.e. the pendant chain itself.
        for tip in members:
            if tip in exits or internal.degree(tip) != 1:
                continue
            path, cur, prev = [tip], tip, None
            while True:
                nbrs = [x for x in internal.neighbors(cur) if x != prev]
                if len(nbrs) != 1:
                    break
                prev, cur = cur, nbrs[0]
                path.append(cur)
                if cur in exits or internal.degree(cur) != 2:
                    break
            if len(path) >= min_chain_len:
                chains.append({
                    "department": depts.get(dept_id, dept_id),
                    "length_hops": len(path) - 1,
                    "chain": [node_info[n]["label"] for n in path],
                    "distance_from_nearest_exit": dist.get(path[-1], dist.get(tip)),
                })
    chains.sort(key=lambda c: c["length_hops"], reverse=True)
    return chains


def structural_measures(g):
    components = sorted(nx.connected_components(g), key=len, reverse=True)
    largest = g.subgraph(components[0]) if components else g
    articulation = list(nx.articulation_points(largest)) if largest.number_of_nodes() > 2 else []
    degree = dict(g.degree())
    betweenness = nx.betweenness_centrality(largest) if largest.number_of_nodes() > 2 else {}
    top_degree = sorted(degree.items(), key=lambda kv: kv[1], reverse=True)[:10]
    top_between = sorted(betweenness.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return {
        "nodes": g.number_of_nodes(), "edges": g.number_of_edges(),
        "components": len(components),
        "isolates": sum(1 for c in components if len(c) == 1),
        "largest_component_size": len(components[0]) if components else 0,
        "articulation_points": len(articulation),
        "top_degree": top_degree, "top_betweenness": [(k, round(v, 4)) for k, v in top_between],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dsn", default=DEFAULT_DSN)
    ap.add_argument("--out", type=Path, default=None, help="write full JSON report here")
    args = ap.parse_args()

    nodes, edges, depts = load_graph(args.dsn)
    g, node_info = build_graph(nodes, edges)
    label_of = {nid: info["label"] for nid, info in node_info.items()}

    struct = structural_measures(g)
    struct["top_degree"] = [(label_of[n][:60], d) for n, d in struct["top_degree"]]
    struct["top_betweenness"] = [(label_of[n][:60], b) for n, b in struct["top_betweenness"]]

    under_linked, under_linked_total = under_linked_but_plausible(g, node_info, depts)
    pairs, empty_pairs = department_pair_matrix(g, node_info, depts)
    imp = import_vs_asserted(g, node_info)
    chains = pendant_chains(g, node_info, depts)

    print(f"Loaded {struct['nodes']} nodes / {struct['edges']} edges from {args.dsn.split('@')[-1]}")
    print()
    print("STRUCTURE")
    print(f"  components: {struct['components']} (largest: {struct['largest_component_size']} nodes, "
          f"isolates: {struct['isolates']})")
    print(f"  articulation points in the largest component: {struct['articulation_points']}")
    print("  top by degree:", struct["top_degree"][:5])
    print("  top by betweenness:", struct["top_betweenness"][:5])
    print()
    print(f"UNDER-LINKED BUT PLAUSIBLE ({under_linked_total} total, showing up to 40)")
    for r in under_linked[:15]:
        print(f"  [{r['department']}] \"{r['label']}\" (degree {r['degree']}) -- "
              f"could plausibly connect to: {', '.join(r['candidate_grounding'][:3])}")
    print()
    print(f"DEPARTMENT-PAIR MATRIX -- {len(empty_pairs)} of {len(pairs)} pairs have zero cross-dept edges")
    for pair in empty_pairs:
        print(f"  {pair[0]} <-> {pair[1]}: 0")
    print()
    print("IMPORT-VS-ASSERTED EDGE MIX (category-3 analog -- no stub-node equivalent exists in KGDJ)")
    print(f"  {imp['still_exactly_as_imported']} of {imp['total_edges']} edges "
          f"({imp['pct_untouched']}%) are still exactly as imported, untouched since the seed")
    print()
    print(f"PENDANT CHAINS -- {len(chains)} chains of >= 4 hops found")
    for c in chains[:10]:
        print(f"  [{c['department']}] {c['length_hops']} hops: " + " -> ".join(c["chain"]))

    if args.out:
        report = {
            "structure": struct, "under_linked": under_linked, "under_linked_total": under_linked_total,
            "department_pairs": pairs, "empty_pairs": empty_pairs, "import_vs_asserted": imp,
            "pendant_chains": chains,
        }
        args.out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(f"\nfull report written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
