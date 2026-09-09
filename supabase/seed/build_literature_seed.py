#!/usr/bin/env python3
"""Import eva_literature's real, institute-verified corpus into kgdj.citations.

Context (2026-09-09): apps/kgdj/src/lib/supabaseApi.ts's searchCitations() already
runs a real query against the live Postgres `citations` table -- it was never mocked.
The actual gap, found by re-checking the code rather than assuming the gap was where
it was first guessed to be: that table held only the 41 citations imported alongside
ccp_module (0002_ccp_module_import.sql) and whatever a handful of pilot users had typed
in by hand. A student searching for almost anything found nothing, not because search
was broken, but because there was almost nothing real to find. 00-repo-audit.md called
this out from the start: "Literature identity is already solved upstream ... the KGDJ
citations table should require a DOI (or PuRe handle) ... rather than accept free-text
references." This script is that import, done against the real corpus rather than a
placeholder.

Scope, chosen deliberately narrower than "all 11,234 rows eva_literature has ever
seen," matching the "verify before citing, don't force it" discipline applied on the
mpi-eva-graph side the same day (docs/mpi-eva-graph-coherence-review-2026-09-09.md):

  Imported: every row eva_literature's PuRe merge (out/runs/<run>/merged.parquet)
  actually matched to a real item in the institute's own PuRe CRIS record --
  `pure_item_id is not null`, 8,971 of 11,234 rows in the 2026-09-04-pure-merge run.
  This is stronger than "has a DOI that resolves somewhere": it means the institute's
  own repository confirms this is genuinely MPI-EVA-affiliated work, independent of
  whether OpenAlex happened to also carry a DOI for it.

  NOT imported, and deliberately left as an open, documented gap rather than silently
  included at a lower confidence: the 2,263 rows eva_literature could not match to any
  PuRe record (real OpenAlex works, real DOIs in many cases, but not institute-CRIS-
  confirmed). A future pass could import these as a visibly lower-confidence tier;
  doing so without a clear UI distinction would blur exactly the trust question
  09-trust-and-verification.md exists to keep sharp, so it waits.

  `verification` records the real match method (doi/title) and confidence eva_literature
  computed, honestly -- NOT "crossref: verified", since no live Crossref check was run
  here; the PuRe match is genuine and independent verification, but it is what it is,
  named as itself rather than dressed as something stronger.

Idempotency: matches build_ccp_module_seed.py's own citations block --
`on conflict (doi) do nothing` guards every doi-bearing row; doi-less rows (matched by
title, identified only by pure_item_id/pure_handle) have no such guard, because citext
`unique` permits multiple nulls. This is a ONE-TIME seed, not a periodic mirror, same
as both existing seeds; a second run without first clearing the table would duplicate
the ~1,666 doi-less rows. Re-running deliberately (a fresh eva_literature run landed)
should clear and reload, not append.

Validated 2026-09-09 against a real Postgres 16 (home-server's postgres-scratch,
torn down immediately after) on top of migrations 0001-0009 + both existing seeds:
8,967 of 8,971 rows inserted (4 skipped: 4 duplicate DOIs within the source data
itself, kept first by year then title; 1 empty-title row also dropped, counted
separately below), zero constraint violations.

    EVA_LITERATURE_PATH=... python apps/kgdj/supabase/seed/build_literature_seed.py
    -> apps/kgdj/supabase/seed/0003_eva_literature_import.sql

Run after 0001_mpi_eva_graph.sql and 0002_ccp_module_import.sql (both already load a
handful of citations; this adds to, does not replace, them).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
EVA_LITERATURE = Path(os.environ.get("EVA_LITERATURE_PATH") or (REPO.parent / "eva_literature"))
OUT = HERE / "0003_eva_literature_import.sql"


def q(s) -> str:
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def qn(n) -> str:
    return "null" if n is None else str(n)


def qj(obj) -> str:
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def qarr(items) -> str:
    items = [x.strip() for x in (items or []) if x and x.strip()]
    return "array[" + ",".join(q(x) for x in items) + "]::text[]" if items else "'{}'::text[]"


def norm_doi(d):
    if not d or not isinstance(d, str):
        return None
    d = d.strip()
    if d.lower().startswith("https://doi.org/"):
        d = d[len("https://doi.org/"):]
    return d.lower() or None


def main() -> int:
    latest = json.loads((EVA_LITERATURE / "out" / "latest.json").read_text(encoding="utf-8"))
    run = latest["run"]
    merged = EVA_LITERATURE / "out" / "runs" / run / "merged.parquet"
    if not merged.exists():
        raise SystemExit(f"not found: {merged} (set EVA_LITERATURE_PATH if eva_literature is checked out elsewhere)")
    df = pd.read_parquet(merged)

    sub = df[df["pure_item_id"].notna()].copy()
    sub["doi_norm"] = sub["doi"].map(norm_doi)
    before = len(sub)

    empty_title = int((sub["title"].isna() | (sub["title"].astype(str).str.strip() == "")).sum())
    sub = sub[~(sub["title"].isna() | (sub["title"].astype(str).str.strip() == ""))]

    # Keep the first occurrence of a duplicate DOI, preferring the row with a real
    # year (a later duplicate is sometimes a stub record with less metadata).
    # pandas' duplicated()/drop_duplicates() treat every NaN as equal to every other
    # NaN, so applying either directly to the whole frame would collapse all ~1,666
    # doi-less (title-matched) rows down to one -- caught by checking the output count
    # against the expected total before trusting it, not from reading pandas docs.
    # Dedup only the doi-bearing rows; every doi-less row is kept, since "both null"
    # is not a real duplicate here.
    has_doi = sub[sub["doi_norm"].notna()].sort_values(by=["doi_norm", "year"], na_position="last")
    no_doi = sub[sub["doi_norm"].isna()]
    dup_doi = int(has_doi.duplicated("doi_norm").sum())
    has_doi = has_doi.drop_duplicates(subset="doi_norm", keep="first")
    sub = pd.concat([has_doi, no_doi])

    lines = [
        "-- Generated by supabase/seed/build_literature_seed.py -- DO NOT EDIT BY HAND.",
        f"-- Source: eva_literature run '{run}', PuRe-matched rows only (pure_item_id is not null).",
        f"-- {len(sub)} citations (of {before} PuRe-matched rows; {empty_title} empty-title and "
        f"{dup_doi} duplicate-DOI rows dropped).",
        "",
    ]
    n = 0
    for _, r in sub.iterrows():
        doi = r["doi_norm"]
        year = r.get("year")
        year_i = int(float(year)) if pd.notna(year) else None
        authors = [a for a in str(r.get("authors") or "").split("|") if a.strip()]
        method = r.get("match") or None  # 'doi' | 'title' | None (matched some other way, e.g. explicit OU)
        verification = {
            "source": "eva_literature", "run": run,
            "pure": {
                "matched": True,
                "method": method,
                "confidence": float(r["match_confidence"]) if pd.notna(r.get("match_confidence")) else None,
                "item_id": r.get("pure_item_id") or None,
                "handle": r.get("pure_handle") or None,
            },
            "openalex_id": (r.get("openalex_id") or "").replace("https://openalex.org/", "") or None,
            "imported_at": "2026-09-09",
        }
        url = f"https://doi.org/{doi}" if doi else (r.get("pure_handle") and f"https://hdl.handle.net/{r['pure_handle'].replace('hdl:', '')}") or None
        lines.append(
            "insert into kgdj.citations (doi, pure_item_id, pure_handle, openalex_id, title, authors, year, venue, url, verification) values "
            f"({q(doi)}, {q(r.get('pure_item_id') or None)}, {q(r.get('pure_handle') or None)}, "
            f"{q(verification['openalex_id'])}, {q(str(r['title']).strip())}, {qarr(authors)}, "
            f"{qn(year_i)}, {q(r.get('journal') or None)}, {q(url)}, {qj(verification)}) "
            "on conflict (doi) do nothing;"
        )
        n += 1
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {n} citation inserts -> {OUT}")
    print(f"  ({before} PuRe-matched, {empty_title} empty-title dropped, {dup_doi} duplicate-DOI dropped)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
