#!/usr/bin/env python3
"""Generate seed SQL for the KGDJ from ccp_module's real Content/Literature.

Decision (2026-09-09, see docs/kgdj/03-roadmap.md and the conversation this
script came out of): unlike 0001_mpi_eva_graph.sql (curator single-pass
drafts from eva-graph's own generic mpi-eva-graph.json), ccp_module's
Content/core+extended concepts are real, already-published department
teaching material — the same tree that exports straight to CCP Module Hub
with no review gate (see ccp_module/docs/architecture/hub-dev-repo-split.md).
So this import:

  * maps one ccp_module Content concept -> one kgdj.nodes row (concept
    granularity, not cluster granularity), preserving each concept's own
    `edges:` as kgdj.edges;
  * enters everything as status='proposed' (KGDJ's review pipeline is the
    only path to 'canonical' — this script does not bypass it), but tags
    provenance.imported_from='ccp_module' and provenance.import_batch so
    editors can find and bulk-promote the whole batch rather than reviewing
    grain-by-grain like a from-scratch student proposal;
  * is a ONE-TIME seed, mirroring build_seed.py's own pattern (idempotent
    via on conflict do nothing) -- not a periodic mirror. Re-run by hand
    after a deliberate decision to re-pull ccp_module's tree, same as
    0001_mpi_eva_graph.sql;
  * imports ccp_module/Literature/entries/*.yml (the reviewed slice, not
    Literature/drafts/) as kgdj.citations, independently of the node
    import -- ccp_module's own concept files don't yet link `literature:`
    ids (only external `oecs:`/`evape:` corpus refs), so no node_citations
    rows are created here; that link doesn't exist upstream yet either;
  * supersedes the generic ccp-* nodes from 0001_mpi_eva_graph.sql: where a
    generic node's label exactly matches a ccp_module concept's label (a
    "clear match", not a fuzzy guess), archives the generic node and links
    it to its ccp_module replacement via a same-as edge. Nodes without a
    clear match are left untouched for an editor to reconcile by hand.

`type` mapping (ccp_module Content type -> kgdj.node_types code): trait/core
-> concept, axis -> topic, method -> method, publication -> finding.
`scientist`-type concept files (researcher bios) are skipped -- kgdj has no
person/researcher node type yet; any edge pointing at a skipped node is
silently dropped by the select-join insert below, same as build_seed.py's
existing behaviour for edges pointing at missing nodes.

    python apps/kgdj/supabase/seed/build_ccp_module_seed.py
    -> apps/kgdj/supabase/seed/0002_ccp_module_import.sql

Run AFTER 0001_mpi_eva_graph.sql, as the postgres/service role.
Set CCP_MODULE_PATH to override the default sibling-repo location
(../../ccp_module relative to this eva-graph checkout).
"""
from __future__ import annotations

import json
import os
import re
from datetime import date
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
CCP_MODULE = Path(os.environ.get("CCP_MODULE_PATH") or (REPO.parents[1] / "ccp_module"))
GRAPH = REPO / "ask_eva" / "eva-graph-pilot-app" / "ask-eva-app" / "data" / "mpi-eva-graph.json"
OUT = HERE / "0002_ccp_module_import.sql"

IMPORT_BATCH = f"ccp_module-{date.today().isoformat()}"

TYPE_MAP = {"trait": "concept", "core": "concept", "axis": "topic", "method": "method", "publication": "finding"}
SKIP_TYPES = {"scientist"}
KNOWN_REL = {"grounds", "enables", "applies-to", "measures", "informs", "contrasts-with",
             "relates-to", "cross-dept", "represents", "evidences", "scicomm-relevant-to", "cites", "same-as"}

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)


def q(s) -> str:
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def qn(n) -> str:
    return "null" if n is None else str(n)


def qj(obj) -> str:
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def qarr(items) -> str:
    items = [x for x in (items or []) if x]
    return "array[" + ",".join(q(x) for x in items) + "]::text[]" if items else "'{}'::text[]"


def load_concepts() -> list[dict]:
    files = sorted((CCP_MODULE / "Content" / "core").glob("*/concepts/*.md"))
    files += sorted((CCP_MODULE / "Content" / "extended").glob("*/concepts/*.md"))
    out = []
    for f in files:
        m = FRONTMATTER_RE.match(f.read_text(encoding="utf-8"))
        if not m:
            continue
        fm = yaml.safe_load(m.group(1)) or {}
        fm["_body"] = m.group(2).strip()
        fm["_path"] = f
        out.append(fm)
    return out


def load_literature() -> list[dict]:
    files = sorted((CCP_MODULE / "Literature" / "entries").glob("*.yml"))
    return [yaml.safe_load(f.read_text(encoding="utf-8")) for f in files]


def load_generic_ccp_nodes() -> list[tuple[str, str]]:
    """(slug, label) pairs for the department-only ccp-* nodes already seeded from mpi-eva-graph.json."""
    g = json.loads(GRAPH.read_text(encoding="utf-8"))
    out = []
    for n in g["nodes"]:
        depts = n.get("departments") or ([n["department"]] if n.get("department") else [])
        if depts == ["ccp"] and n["id"].startswith("ccp-"):
            out.append((n["id"], n["label"]))
    return out


def main() -> int:
    if not CCP_MODULE.exists():
        raise SystemExit(f"ccp_module not found at {CCP_MODULE} -- set CCP_MODULE_PATH")

    concepts = load_concepts()
    lit = load_literature()
    generic = load_generic_ccp_nodes()

    lines = [
        f"-- Eva KGDJ seed: ccp_module -> kgdj (generated {date.today().isoformat()} by build_ccp_module_seed.py)",
        "-- Content concepts enter as 'proposed' but tagged provenance.imported_from='ccp_module' for editor",
        "-- bulk-promote (they are real department material, not curator drafts -- see this script's docstring).",
        "-- Idempotent (on conflict do nothing). Depends on 0001_mpi_eva_graph.sql having run first.",
        "begin;", "",
    ]

    # ---------------------------------------------------------------- citations
    lines.append("-- ccp_module/Literature/entries -> kgdj.citations (reviewed slice only, not Literature/drafts)")
    n_cit = 0
    skipped_cit = []
    for e in lit:
        cit = e.get("citation") or {}
        doi = (cit.get("doi") or "").strip() or None
        if not doi:
            skipped_cit.append(e.get("slug") or e.get("id"))
            continue
        prov = e.get("provenance") or {}
        cls = e.get("classification") or {}
        verification = {"ccp_module": {"slug": e.get("slug"), "id": e.get("id"),
                                        "review_status": prov.get("review_status"),
                                        "classification_status": cls.get("status"),
                                        "added_by": prov.get("added_by")}}
        year = cit.get("year")
        lines.append(
            "insert into kgdj.citations (doi, title, authors, year, venue, url, verification) values "
            f"({q(doi)}, {q(cit.get('title') or e.get('slug'))}, {qarr(cit.get('authors'))}, "
            f"{qn(year) if isinstance(year, int) else 'null'}, {q(cit.get('venue'))}, "
            f"{q(cit.get('url') or f'https://doi.org/{doi}')}, {qj(verification)}) "
            "on conflict (doi) do nothing;")
        n_cit += 1

    # ---------------------------------------------------------------- nodes
    lines += ["", "-- ccp_module/Content/{core,extended}/**/concepts/*.md -> kgdj.nodes"]
    n_nodes = 0
    skipped_nodes = []
    for c in concepts:
        ctype = c.get("type")
        if ctype in SKIP_TYPES:
            skipped_nodes.append((c.get("id"), ctype))
            continue
        slug = f"ccpm-{c['id']}"
        type_code = TYPE_MAP.get(ctype, "concept")
        cluster = c.get("cluster")
        ext = {"ccp_module_id": c["id"], "cluster": cluster}
        if c.get("method_kind"):
            ext["method_kind"] = c["method_kind"]
        prov = {
            "source": "ccp_module/Content", "imported_from": "ccp_module", "import_batch": IMPORT_BATCH,
            "imported_at": date.today().isoformat(), "original_type": ctype, "cluster": cluster,
            "assigned_by": "ccp-department",
            "import_note": "real, already-published department teaching content (exports straight to CCP Module "
                            "Hub with no review gate) -- not a single-pass curator draft like the generic "
                            "mpi-eva-graph import. Tagged for editor bulk-promote, not auto-canonicalized.",
        }
        lines.append(
            "insert into kgdj.nodes (slug, label, type_code, description, department_id, status, external_ids, "
            "provenance, tags) values "
            f"({q(slug)}, {q(c['label'])}, {q(type_code)}, {q(c.get('_body') or '')}, "
            f"(select id from kgdj.departments where code = 'ccp'), 'proposed', {qj(ext)}, {qj(prov)}, "
            f"{qarr([cluster] if cluster else [])}) "
            "on conflict (slug) do nothing;")
        n_nodes += 1

    # ---------------------------------------------------------------- edges
    lines += ["", "-- ccp_module concept edges -> kgdj.edges (unmapped labels keep original text, fall back to relates-to)"]
    n_edges = 0
    for c in concepts:
        if c.get("type") in SKIP_TYPES:
            continue
        s_slug = f"ccpm-{c['id']}"
        for e in (c.get("edges") or []):
            t_slug = f"ccpm-{e.get('to')}"
            label = e.get("label") or ""
            rel = label if label in KNOWN_REL else "relates-to"
            prov = {"source": "ccp_module/Content", "original_label": label, "imported_from": "ccp_module",
                     "import_batch": IMPORT_BATCH, "imported_at": date.today().isoformat()}
            lines.append(
                "insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, status, provenance) "
                f"select s.id, t.id, {q(rel)}, {q(label)}, 'proposed', {qj(prov)} "
                f"from kgdj.nodes s, kgdj.nodes t where s.slug = {q(s_slug)} and t.slug = {q(t_slug)} "
                "on conflict (source_node_id, target_node_id, relationship_code) do nothing;")
            n_edges += 1

    # ---------------------------------------------------------------- supersede generic ccp-* nodes
    lines += ["", "-- supersede: archive generic mpi-eva-graph ccp-* nodes with an exact-label ccp_module replacement"]
    concept_by_label = {c["label"].strip().casefold(): c["id"] for c in concepts if c.get("type") not in SKIP_TYPES}
    n_superseded = 0
    superseded_pairs = []
    for old_slug, old_label in generic:
        new_id = concept_by_label.get(old_label.strip().casefold())
        if not new_id:
            continue
        new_slug = f"ccpm-{new_id}"
        superseded_pairs.append((old_slug, new_slug, old_label))
        lines.append(
            "insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, status, provenance) "
            f"select s.id, t.id, 'same-as', 'superseded by ccp_module import', 'proposed', "
            f"{qj({'source': 'build_ccp_module_seed.py', 'reason': 'exact label match', 'import_batch': IMPORT_BATCH})} "
            f"from kgdj.nodes s, kgdj.nodes t where s.slug = {q(old_slug)} and t.slug = {q(new_slug)} "
            "on conflict (source_node_id, target_node_id, relationship_code) do nothing;")
        lines.append(
            f"update kgdj.nodes set status = 'archived', provenance = provenance || "
            f"{qj({'superseded_by': new_slug, 'superseded_at': date.today().isoformat(), 'superseded_reason': 'replaced by real ccp_module import (exact label match)'})} "
            f"where slug = {q(old_slug)} and status <> 'archived';")
        n_superseded += 1

    lines += ["", "commit;", ""]
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")

    print(f"{n_nodes} nodes ({len(skipped_nodes)} skipped: {skipped_nodes})")
    print(f"{n_edges} edges")
    print(f"{n_cit} citations ({len(skipped_cit)} skipped for missing DOI: {skipped_cit})")
    print(f"{n_superseded} generic ccp-* nodes superseded: {[p[2] for p in superseded_pairs]}")
    print(f"-> {OUT.relative_to(REPO)} ({OUT.stat().st_size / 1e3:.0f} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
