# Eva KGDJ — database

Postgres schema for the Knowledge Graph Data Journal (ADR: `docs/kgdj/01-architecture-decision.md`).
Supabase-hosted for the pilot (project region **eu-central-1 / Frankfurt** — set at project creation,
cannot be changed later; record the project ref here once created), portable by construction.

```
supabase/
├── migrations/
│   ├── 0001_schema.sql     tables, enums, indexes, housekeeping triggers, reference vocabularies
│   ├── 0002_rls.sql        helper functions + row-level security (visibility rules as signed off)
│   ├── 0003_workflow.sql   submission gate, conflict-of-interest guard, approval function, audit triggers, graph view
│   └── 0004_auth.sql       [Supabase-specific] sign-up gate (allowed domains + invite allowlist), profile bootstrap, erasure
├── seed/
│   ├── build_seed.py       mpi-eva-graph -> 0001_mpi_eva_graph.sql (306 nodes, 499 edges, all status = proposed)
│   └── 0001_mpi_eva_graph.sql
└── README.md
```

## Apply

```bash
# Supabase CLI, linked project (once): supabase link --project-ref <ref>
supabase db push                                   # runs migrations/ in order
psql "$SUPABASE_DB_URL" -f supabase/seed/0001_mpi_eva_graph.sql   # as the service/postgres role

# Local, throwaway Postgres (what CI and the 2026-09-04 verification used):
docker run --rm -d --name kgdj-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:16
python apps/kgdj/supabase/test/apply_and_test.py   # creates the auth shim, applies 0001-0004 + seed, runs RLS scenarios
```

Then in the Supabase dashboard: **Authentication → Hooks → Before User Created** → `kgdj.before_user_created`
(the trigger in 0004 is the second line of defence if the hook is not enabled).

## Model in one paragraph

Members (`profiles`, created only for allowlisted domains/addresses) read the **canonical graph**
(`nodes`, `edges`, with normalised `citations` joined through `node_citations` / `edge_citations`). Nobody
writes to `nodes`/`edges` directly. A member files a `proposed_changes` row (`draft` → `pending`), which must
carry a rationale and — for add/edit changes — at least one citation (`proposal_citations`). Other members
file `peer_reviews` (never on their own proposal; blind by default); an editor files an
`editorial_decisions` row, and the `apply_editorial_decision()` trigger turns an `approve` into the
node/edge change, copying the citations across and stamping provenance (`approved_by`, `approved_at`,
`proposal_id`). Students build `student_subgraphs` from canonical nodes (`subgraph_nodes`, with their own
annotation and layout) plus their own `subgraph_private_nodes` (self / question / resource / theory /
method) and `subgraph_links` ("I'm connecting X to Y because …", with a `lens` and a `created_week`) —
a superset of `ccp_module`'s `personal-graph.schema.json`, so existing exports import losslessly.
Classmates the portfolio is shared with leave `subgraph_reviews`. Everything accountable is mirrored to
`audit_log`; consent choices live in `consent_records` and gate the opt-in `leaderboard` view.

## Provenance columns

`nodes.provenance` / `edges.provenance` reuse Ask Eva's index envelope
(`{source, status, verification[], assigned_by, retrieved|approved_at, …}`, see
`docs/cross-repo-integration-plan-2026-09-04.md` §4) so a canonical node exported back to the whiteboard
carries the same chip semantics. `external_ids` holds `meg` (mpi-eva-graph id), `conceptBaseId`,
and later `wikidata` / `pure` — the `same-as` relationship type exists for graph-level identity links.

## What is Supabase-specific (re-implement on another host)

| Piece | Where | Replacement elsewhere |
|---|---|---|
| `auth.uid()` | `0002_rls.sql` helper functions only | a `request.jwt.claim.sub` setting from the auth proxy |
| `authenticated` / `anon` roles | grants in 0002 | any two roles; `anon` has no grants at all |
| Before-User-Created hook + `auth.users` trigger | `0004_auth.sql` | the IdP/proxy's own allowlist |
| `supabase_auth_admin` grants | `0004_auth.sql` | drop |

Nothing uses Supabase Storage, Realtime, or Edge Functions in the MVP.

## Proposal payload contract

| change_type | required payload keys | notes |
|---|---|---|
| `add_node` | `label`, `type_code`, `description` | optional `slug`, `department_code`, `external_ids`, `tags` |
| `edit_node` | any subset of the above | `target_node_id` set; approval also promotes a `proposed` seed node to `canonical` |
| `archive_node` | — | archives the node and every non-archived edge touching it |
| `add_edge` | `source_node_id`, `target_node_id`, `relationship_code` | optional `label`, `weight` |
| `edit_edge` | any subset of `relationship_code`, `label`, `weight` | `target_edge_id` set |
| `delete_edge` | — | soft-delete (status `archived`) |

## Verified (2026-09-04, Postgres 16 in Docker, `test/apply_and_test.py`)

All four migrations and the seed apply cleanly; the scenario test passes: sign-up gate (allowed
domains, invite, denial, hook), member/anon visibility, no direct writes to the canonical graph, the
proposal lifecycle (rationale + citation gate, conflict of interest, blind review through
`proposal_reviews_for_author`, editor approval producing canonical v2 with citation and audit row),
`add_edge` approval, portfolio visibility/sharing/critique, consent-gated leaderboard, erasure.
Three RLS lessons are recorded inline in `0002_rls.sql`: select policies must be written against
the row's own columns (INSERT … RETURNING), cross-table checks inside policies must go through
security-definer helpers (recursion), and workflow triggers that write to other tables must be
security-definer.

## Decisions applied 2026-09-04 (after Dustin's review of Phase 2)

1. **Seed visibility** — the 306 imported `proposed` nodes are visible to all members (they are the review queue). Confirmed.
2. **Blind review is a per-submission option** — `proposed_changes.blind_review` (default true) is set by whoever submits; every review of that
   proposal inherits it (`check_review_coi()`), and `reviews_visible` nulls `reviewer_id` for blind reviews except to the reviewer, editors and
   the module's instructors. Node/edge/subgraph reviews are non-blind unless the reviewer sets `is_blind`.
3. **Anyone may review any proposal, node, edge or subgraph** they can see (never their own) — one polymorphic `reviews` table: markdown
   `commentary_md` of any length plus `rating` ∈ strongly_reject · reject · neutral · accept · strongly_accept, as suggestions to the editors.
   `review_summary` gives editors the count/mean per target; `editorial_decisions` may now target a node or edge directly
   (`promote` proposed→canonical, `archive`) when the editor judges the review sufficient. Sub-cluster promotion = several decisions (UI batches them).
   Drafts stay the proposer's; every other proposal status is visible to all members.
4. **Instructors are assigned by an admin** (`modules.instructor_id` or `module_members.member_role = 'instructor'`); only they — not editors —
   see student portfolios and portfolio critiques for that module.
5. **Erasure on request, any time** — `erase_profile()` deletes the auth account (email), anonymises the profile to `deleted-xxxxxxxx`, removes
   invite/share/consent/module rows, scrubs username/email from audit snapshots, and deletes portfolios; proposals, reviews, decisions and
   canonical contributions remain attributed to the tombstone ("deleted user"). GDPR analysis in `docs/kgdj/02-gdpr-compliance.md` (Phase 4).
   `profiles.id` therefore has **no foreign key** to `auth.users`.

Still open: whether free text a person wrote (rationales, commentary) should be scanned/redacted on erasure — currently not.
