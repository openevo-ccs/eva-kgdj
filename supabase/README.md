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

## Open questions (decide before the pilot)

1. **Seed visibility.** Signed-off rule: "proposed → author, reviewers, editors, instructor". Implemented
   literally for **submissions** (`proposed_changes`). The 306 imported nodes with `status = 'proposed'`
   are visible to **all members** here, because they *are* the review queue the pilot exists for. Confirm.
2. **Blind review.** `peer_reviews.is_blind` defaults to `true`; proposers see reviews through
   `proposal_reviews_for_author`, which nulls the reviewer. Editors and instructors always see who
   reviewed. Should students be able to opt out of blindness, or should blindness be per-module?
3. **Who may peer-review a proposal?** Currently any member who can see it: same-module members (once
   pending/under_review), editors, instructors. Should researchers outside the module see student
   proposals too?
4. **Editors and portfolios.** Editors do *not* automatically see student subgraphs (only owner, shares,
   instructor, and `module`/`members` visibility). Keep?
5. **Erasure policy.** `erase_profile()` deletes portfolios and anonymises the profile but keeps approved
   canonical contributions attributed to a "deleted user" placeholder. Is that the institute's position?
