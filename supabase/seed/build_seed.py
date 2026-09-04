#!/usr/bin/env python3
"""Generate seed SQL for the KGDJ from eva-graph's own mpi-eva-graph data.

Decision 2026-09-04: every imported node/edge enters with status 'proposed'
(all 306 nodes are single-pass curator drafts; the KGDJ review is the path to
canonical). Department rows come from js/eva-departments.js's registry
(real institute colours) and evalit's PuRe OU ids.

    python apps/kgdj/supabase/seed/build_seed.py
    -> apps/kgdj/supabase/seed/0001_mpi_eva_graph.sql   (idempotent: on conflict do nothing)

Run AFTER the migrations, as the postgres/service role (it writes kgdj.nodes,
which have no user write policies).
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
GRAPH = REPO / "ask_eva" / "eva-graph-pilot-app" / "ask-eva-app" / "data" / "mpi-eva-graph.json"
OUT = HERE / "0001_mpi_eva_graph.sql"

DEPTS = [  # code, name, abbr, hex, pure OU
    ("dag", "Department of Archaeogenetics", "DAG", "#1b5e4e", "ou_3222712"),
    ("hbec", "Department of Human Behavior, Ecology and Culture", "HBEC", "#7d7a9c", "ou_2173689"),
    ("dlce", "Department of Linguistic and Cultural Evolution", "DLCE", "#17948a", "ou_3237541"),
    ("evogen", "Department of Evolutionary Genetics", "EvoGen", "#8fa0b3", "ou_1497672"),
    ("humor", "Department of Human Origins", "HumOr", "#e8c33e", "ou_3482006"),
    ("primevo", "Department of Primate Behavior and Evolution", "PrimEvo", "#e2841e", "ou_3367832"),
    ("ccp", "Department of Comparative Cultural Psychology", "CCP", "#a3a13a", "ou_3040267"),
]
TYPE_MAP = {"theory": "theory", "domain": "domain", "method": "method", "topic": "topic",
            "scicomm-sensitivity": "scicomm-sensitivity", "fieldsite": "fieldsite"}


def q(s) -> str:
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def qj(obj) -> str:
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def qarr(items) -> str:
    return "array[" + ",".join(q(x) for x in items) + "]::text[]" if items else "'{}'::text[]"


def main() -> int:
    g = json.loads(GRAPH.read_text(encoding="utf-8"))
    lines = [f"-- Eva KGDJ seed: mpi-eva-graph -> kgdj (generated {date.today().isoformat()} by build_seed.py from {GRAPH.name}, graph generated {g.get('generated')})",
             "-- Every node/edge is status 'proposed'. Idempotent (on conflict do nothing).", "begin;", ""]
    lines.append("insert into kgdj.departments (code, name, abbr, color_hex, pure_ou_id) values")
    lines.append(",\n".join(f"  ({q(c)}, {q(n)}, {q(a)}, {q(h)}, {q(ou)})" for c, n, a, h, ou in DEPTS) + "\non conflict (code) do nothing;\n")

    lines.append("-- nodes")
    n_nodes = 0
    for n in g["nodes"]:
        depts = n.get("departments") or ([n["department"]] if n.get("department") else [])
        dept = depts[0] if len(depts) == 1 else None
        prov = dict(n.get("provenance") or {})
        prov.update({"imported_from": "eva-graph/mpi-eva-graph", "imported_at": date.today().isoformat(), "assigned_by": "curator",
                     "import_note": "single-pass curator draft; enters the journal as proposed"})
        ext = {"meg": n["id"]}
        if n.get("conceptBaseId"):
            ext["conceptBaseId"] = n["conceptBaseId"]
        if len(depts) > 1:
            ext["departments"] = depts
        if n.get("scope") == "institute":
            ext["scope"] = "institute"
        lines.append(
            "insert into kgdj.nodes (slug, label, type_code, description, department_id, status, external_ids, provenance, tags) values "
            f"({q(n['id'])}, {q(n['label'])}, {q(TYPE_MAP.get(n.get('type'), 'concept'))}, {q(n.get('desc') or '')}, "
            f"(select id from kgdj.departments where code = {q(dept)}), 'proposed', {qj(ext)}, {qj(prov)}, {qarr(n.get('tags') or [])}) "
            "on conflict (slug) do nothing;")
        n_nodes += 1
    lines.append("")
    lines.append("-- edges")
    n_edges = 0
    known_rel = {"grounds", "enables", "applies-to", "measures", "informs", "contrasts-with", "relates-to", "cross-dept", "represents", "evidences", "scicomm-relevant-to"}
    for e in g["edges"]:
        rel = e.get("type") if e.get("type") in known_rel else "relates-to"
        prov = {"source": "eva-graph/mpi-eva-graph", "status": "draft", "original_type": e.get("type"), "imported_at": date.today().isoformat()}
        lines.append(
            "insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, weight, status, provenance) "
            f"select s.id, t.id, {q(rel)}, {q(e.get('label'))}, {float(e.get('weight') or 3):.1f}, 'proposed', {qj(prov)} "
            f"from kgdj.nodes s, kgdj.nodes t where s.slug = {q(e['s'])} and t.slug = {q(e['t'])} "
            "on conflict (source_node_id, target_node_id, relationship_code) do nothing;")
        n_edges += 1
    lines += ["", "commit;", ""]
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"{n_nodes} nodes, {n_edges} edges -> {OUT.relative_to(REPO)} ({OUT.stat().st_size / 1e3:.0f} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
