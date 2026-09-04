#!/usr/bin/env python3
"""Apply the KGDJ migrations + seed to a throwaway Postgres and exercise the
RLS and workflow with role-switched sessions (no Supabase needed).

A tiny auth shim stands in for Supabase: schema `auth` with a `users` table
and `auth.uid()` reading the `request.jwt.claim.sub` setting, plus the roles
`authenticated`, `anon`, `supabase_auth_admin`.

    docker run --rm -d --name kgdj-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:16
    python apps/kgdj/supabase/test/apply_and_test.py [--dsn postgresql://postgres:pg@127.0.0.1:55432/postgres]
"""
from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
SB = HERE.parent
MIGRATIONS = sorted((SB / "migrations").glob("*.sql"))
SEED = SB / "seed" / "0001_mpi_eva_graph.sql"

AUTH_SHIM = """
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text unique, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
-- as on Supabase: API roles may call auth.uid() (and nothing else in auth)
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
"""

U = {name: str(uuid.uuid5(uuid.NAMESPACE_DNS, name)) for name in ("alice", "bob", "carla", "eve", "mallory")}
EMAIL = {"alice": "alice@uni-leipzig.de", "bob": "bob@uni-leipzig.de", "carla": "carla@eva.mpg.de", "eve": "eve@eva.mpg.de", "mallory": "mallory@example.com"}


class Session:
    """A connection acting as one user under RLS (role authenticated + jwt sub)."""
    def __init__(self, dsn, user=None):
        self.conn = psycopg.connect(dsn, autocommit=True)
        self.user = user
        if user:
            with self.conn.cursor() as c:
                c.execute("set role authenticated")
                c.execute("select set_config('request.jwt.claim.sub', %s, false)", (U[user],))
    def q(self, sql, params=None):
        with self.conn.cursor() as c:
            c.execute(sql, params)
            return c.fetchall() if c.description else None
    def one(self, sql, params=None):
        r = self.q(sql, params); return r[0][0] if r else None
    def expect_error(self, sql, params=None, contains=""):
        try:
            self.q(sql, params)
        except Exception as e:
            assert contains.lower() in str(e).lower(), f"wrong error: {e}"
            return True
        raise AssertionError(f"expected an error ({contains}) for: {sql[:80]}")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dsn", default="postgresql://postgres:pg@127.0.0.1:55432/postgres"); args = ap.parse_args()
    admin = Session(args.dsn)
    admin.q("drop schema if exists kgdj cascade; drop schema if exists auth cascade;")
    admin.q(AUTH_SHIM)
    for m in MIGRATIONS:
        admin.q(m.read_text(encoding="utf-8")); print("applied", m.name)
    admin.q(SEED.read_text(encoding="utf-8")); print("applied", SEED.name)
    n_nodes, n_edges = admin.one("select count(*) from kgdj.nodes"), admin.one("select count(*) from kgdj.edges")
    n_proposed = admin.one("select count(*) from kgdj.nodes where status='proposed'")
    print(f"seed: {n_nodes} nodes, {n_edges} edges; proposed = {n_proposed}")
    assert n_nodes == 306 and n_edges >= 490

    # --- sign-up gate: allowed domains, invite, denial ------------------------
    admin.q("insert into kgdj.allowlist (email, role, institution) values (%s, 'researcher', 'external')", ("mallory@example.com",))  # invited explicitly
    for name in ("alice", "bob", "carla", "eve", "mallory"):
        admin.q("insert into auth.users (id, email) values (%s, %s)", (U[name], EMAIL[name]))
    admin.q("insert into auth.users (id, email) values (%s, %s)", (str(uuid.uuid4()), "stranger@gmail.com"))
    assert admin.one("select count(*) from kgdj.profiles") == 5, "stranger must get no profile"
    assert admin.one("select role::text from kgdj.profiles where id = %s", (U["alice"],)) == "msc_student"
    assert admin.one("select role::text from kgdj.profiles where id = %s", (U["carla"],)) == "researcher"
    hook = admin.one("select kgdj.before_user_created(%s::jsonb)", ('{"user":{"email":"x@gmail.com"}}',))
    assert "error" in hook, hook
    print("signup gate ok (domains, invite, denial, hook)")
    admin.q("update kgdj.profiles set role = 'editor' where id = %s", (U["eve"],))
    admin.q("update kgdj.profiles set role = 'admin' where id = %s", (U["carla"],))
    module_id = admin.one("insert into kgdj.modules (code, name, cohort_year, term, instructor_id) values ('ccp-wise-2026-27','Comparative Cultural Psychology',2026,'WiSe',%s) returning id", (U["carla"],))
    for s in ("alice", "bob"):
        admin.q("insert into kgdj.module_members (module_id, profile_id) values (%s, %s)", (module_id, U[s]))

    alice, bob, carla, eve = (Session(args.dsn, n) for n in ("alice", "bob", "carla", "eve"))
    anon = Session(args.dsn); anon.q("set role anon")

    # --- read visibility --------------------------------------------------------
    assert alice.one("select count(*) from kgdj.nodes") == 306, "members see the proposed seed (review queue)"
    anon.expect_error("select count(*) from kgdj.nodes", contains="permission denied")
    print("read visibility ok (member sees seed; anon denied)")

    # --- no direct writes to canonical graph ----------------------------------
    alice.expect_error("insert into kgdj.nodes (slug,label,type_code) values ('x','X','concept')", contains="row-level security")
    alice.q("update kgdj.nodes set label = 'hacked' where slug = 'ccp-theory-theory-of-mind'")  # RLS: no UPDATE policy -> 0 rows, no error
    assert admin.one("select label from kgdj.nodes where slug = 'ccp-theory-theory-of-mind'") != "hacked"
    print("canonical write-protection ok")

    # --- proposal lifecycle -------------------------------------------------------
    cit = alice.one("insert into kgdj.citations (doi, title, authors, year, created_by) values ('10.1017/s0140525x05000129','Understanding and sharing intentions', array['Tomasello','Carpenter'], 2005, %s) returning id", (U["alice"],))
    tom = admin.one("select id from kgdj.nodes where slug = 'ccp-theory-theory-of-mind'")
    pid = alice.one("insert into kgdj.proposed_changes (proposer_id, change_type, target_node_id, payload, rationale, module_id, status) values (%s,'edit_node',%s,%s,'draft',%s,'draft') returning id",
                    (U["alice"], tom, '{"description":"Revised: attribution of beliefs and desires to others; reviewed against Tomasello et al. 2005."}', module_id))
    alice.expect_error("update kgdj.proposed_changes set status='pending' where id = %s", (pid,), contains="rationale")
    alice.q("update kgdj.proposed_changes set rationale = 'The seed gloss is a draft; this cites the foundational shared-intentionality paper.' where id = %s", (pid,))
    alice.expect_error("update kgdj.proposed_changes set status='pending' where id = %s", (pid,), contains="citation")
    alice.q("insert into kgdj.proposal_citations (proposal_id, citation_id, role) values (%s, %s, 'supports')", (pid, cit))
    alice.q("update kgdj.proposed_changes set status='pending' where id = %s", (pid,))
    assert admin.one("select status::text from kgdj.proposed_changes where id=%s", (pid,)) == "pending"
    # bob (same module) sees it; a researcher outside the module (none here) would not
    assert bob.one("select count(*) from kgdj.proposed_changes where id=%s", (pid,)) == 1
    # alice cannot review her own proposal (RLS) ; bob can
    alice.expect_error("insert into kgdj.peer_reviews (proposal_id, reviewer_id, recommendation, critique_text) values (%s,%s,'accept','looks fine to me, well cited and clear')", (pid, U["alice"]), contains="conflict of interest")
    bob.q("insert into kgdj.peer_reviews (proposal_id, reviewer_id, rating, recommendation, critique_text) values (%s,%s,4,'accept','Good revision; consider also citing the 2019 Rakoczy review.')", (pid, U["bob"]))
    assert admin.one("select status::text from kgdj.proposed_changes where id=%s", (pid,)) == "under_review"
    # blind: alice sees the review but not the reviewer
    row = alice.q("select reviewer_id, recommendation::text from kgdj.proposal_reviews_for_author where proposal_id=%s", (pid,))[0]
    assert row[0] is None and row[1] == "accept", row
    assert alice.one("select count(*) from kgdj.peer_reviews where proposal_id=%s", (pid,)) == 0, "raw table hidden from proposer"
    # a student cannot decide; the editor can
    bob.expect_error("insert into kgdj.editorial_decisions (proposal_id, editor_id, decision) values (%s,%s,'approve')", (pid, U["bob"]), contains="row-level security")
    eve.q("insert into kgdj.editorial_decisions (proposal_id, editor_id, decision, feedback) values (%s,%s,'approve','Accepted with the peer review''s suggestion noted.')", (pid, U["eve"]))
    st, ver, desc = admin.q("select n.status::text, n.version, n.description from kgdj.nodes n where n.id=%s", (tom,))[0]
    assert st == "canonical" and ver == 2 and desc.startswith("Revised"), (st, ver, desc)
    assert admin.one("select count(*) from kgdj.node_citations where node_id=%s", (tom,)) == 1
    assert admin.one("select status::text from kgdj.proposed_changes where id=%s", (pid,)) == "approved"
    assert admin.one("select count(*) from kgdj.audit_log where action like 'approve:%'") == 1
    print("proposal lifecycle ok (gate, COI, blind review, editor approval -> canonical v2 + citation + audit)")

    # add_edge proposal by bob, approved
    src = admin.one("select id from kgdj.nodes where slug='ccp-theory-social-cognition'")
    pid2 = bob.one("insert into kgdj.proposed_changes (proposer_id, change_type, payload, rationale, module_id, status) values (%s,'add_edge',%s,'Social cognition theory grounds theory-of-mind work in the department; see Tomasello 2005.',%s,'draft') returning id",
                   (U["bob"], f'{{"source_node_id":"{src}","target_node_id":"{tom}","relationship_code":"grounds","label":"frames","weight":4}}', module_id))
    bob.q("insert into kgdj.proposal_citations (proposal_id, citation_id) values (%s,%s)", (pid2, cit))
    bob.q("update kgdj.proposed_changes set status='pending' where id=%s", (pid2,))
    eve.q("insert into kgdj.editorial_decisions (proposal_id, editor_id, decision) values (%s,%s,'approve')", (pid2, U["eve"]))
    assert admin.one("select status::text from kgdj.edges where source_node_id=%s and target_node_id=%s and relationship_code='grounds'", (src, tom)) == "canonical"
    print("add_edge approval ok")

    # --- portfolios -------------------------------------------------------------
    sg = alice.one("insert into kgdj.student_subgraphs (owner_id, module_id, title) values (%s,%s,'My orientation graph') returning id", (U["alice"], module_id))
    alice.q("insert into kgdj.subgraph_nodes (subgraph_id, node_id, custom_annotation, pos_x, pos_y, added_week) values (%s,%s,'core of my interest',100,200,1)", (sg, tom))
    self_id = alice.one("insert into kgdj.subgraph_private_nodes (subgraph_id, node_type, label, created_week) values (%s,'self','me',1) returning id", (sg,))
    alice.q("insert into kgdj.subgraph_links (subgraph_id, from_private_id, to_node_id, why, lens, created_week) values (%s,%s,%s,'I want to understand how apes and children differ here.','mechanism',1)", (sg, self_id, tom))
    assert bob.one("select count(*) from kgdj.student_subgraphs where id=%s", (sg,)) == 0, "private by default"
    assert carla.one("select count(*) from kgdj.student_subgraphs where id=%s", (sg,)) == 1, "instructor sees module portfolios"
    assert eve.one("select count(*) from kgdj.student_subgraphs where id=%s", (sg,)) == 0, "editor does not"
    alice.q("insert into kgdj.subgraph_shares (subgraph_id, profile_id) values (%s,%s)", (sg, U["bob"]))
    assert bob.one("select count(*) from kgdj.subgraph_links where subgraph_id=%s", (sg,)) == 1, "shared classmate sees links"
    bob.q("insert into kgdj.subgraph_reviews (subgraph_id, reviewer_id, week, critique) values (%s,%s,2,'Your mechanism lens could also connect to social learning.')", (sg, U["bob"]))
    alice.expect_error("insert into kgdj.subgraph_reviews (subgraph_id, reviewer_id, week, critique) values (%s,%s,2,'self-critique')", (sg, U["alice"]), contains="row-level security")
    bob.q("update kgdj.subgraph_nodes set custom_annotation='vandal' where subgraph_id=%s", (sg,))  # not owner -> 0 rows
    assert admin.one("select custom_annotation from kgdj.subgraph_nodes where subgraph_id=%s", (sg,)) == "core of my interest"
    print("portfolio visibility/sharing/critique ok")

    # --- consent + leaderboard + erasure ---------------------------------------------
    assert alice.one("select count(*) from kgdj.leaderboard") == 0
    alice.q("insert into kgdj.consent_records (profile_id, purpose, granted, policy_version) values (%s,'leaderboard_display',true,'v1')", (U["alice"],))
    assert alice.one("select count(*) from kgdj.leaderboard") == 1 and alice.one("select approved_proposals from kgdj.leaderboard") == 1
    alice.expect_error("select kgdj.erase_profile(%s)", (U["bob"],), contains="only the person")
    bob.q("select kgdj.erase_profile(%s)", (U["bob"],))
    assert admin.one("select is_active from kgdj.profiles where id=%s", (U["bob"],)) is False
    assert admin.one("select count(*) from kgdj.peer_reviews where reviewer_id=%s", (U["bob"],)) == 1, "review record kept, profile anonymised"
    print("consent, leaderboard, erasure ok")
    print("\nALL KGDJ DB TESTS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        import traceback; tb = traceback.extract_tb(sys.exc_info()[2])[-1]
        print("ASSERTION FAILED at line %d: %s" % (tb.lineno, tb.line)); print("  ", e); sys.exit(1)
