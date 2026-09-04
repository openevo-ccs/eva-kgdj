-- Eva KGDJ — 0003 editorial workflow: submission checks, conflict-of-interest
-- guard, and the approval function that turns an approved proposed_change
-- into a canonical node/edge change. All plain PL/pgSQL.

-- ---------------------------------------------------------------- submission gate
-- draft -> pending requires: at least one citation for add/edit changes, a
-- rationale, and a payload with the fields the change type needs.
create or replace function kgdj.check_proposal_submission() returns trigger language plpgsql as $$
declare n_cit int;
begin
  if new.status = 'pending' and (old.status is null or old.status in ('draft', 'revision_requested')) then
    if length(coalesce(new.rationale, '')) < 20 then
      raise exception 'A proposal needs a rationale of at least 20 characters before submission';
    end if;
    if new.change_type in ('add_node', 'edit_node', 'add_edge', 'edit_edge') then
      select count(*) into n_cit from kgdj.proposal_citations pc where pc.proposal_id = new.id;
      if n_cit = 0 then
        raise exception 'A % proposal must reference at least one citation before submission', new.change_type;
      end if;
    end if;
    if new.change_type = 'add_node' and (new.payload ->> 'label') is null then
      raise exception 'add_node payload needs at least {label, type_code, description}';
    end if;
    if new.change_type = 'add_edge' and ((new.payload ->> 'source_node_id') is null or (new.payload ->> 'target_node_id') is null or (new.payload ->> 'relationship_code') is null) then
      raise exception 'add_edge payload needs {source_node_id, target_node_id, relationship_code}';
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end $$;

create trigger proposal_submission_gate before insert or update on kgdj.proposed_changes
  for each row execute function kgdj.check_proposal_submission();

-- ---------------------------------------------------------------- conflict of interest
-- security definer: the pending -> under_review transition below is a write
-- the reviewer's own RLS would not allow (they are not the proposer/editor).
create or replace function kgdj.check_review_coi() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare proposer uuid; st kgdj.proposal_status; author uuid;
begin
  if new.target_kind = 'proposal' then
    select proposer_id, status into proposer, st from kgdj.proposed_changes where id = new.proposal_id;
    if proposer = new.reviewer_id then
      raise exception 'Conflict of interest: a proposer cannot review their own proposal';
    end if;
    if st not in ('pending', 'under_review') then
      raise exception 'Proposal is not open for review (status %)', st;
    end if;
    update kgdj.proposed_changes set status = 'under_review' where id = new.proposal_id and status = 'pending';
  elsif new.target_kind = 'node' then
    select created_by into author from kgdj.nodes where id = new.node_id;
    if author = new.reviewer_id then raise exception 'Conflict of interest: you authored this node'; end if;
  elsif new.target_kind = 'edge' then
    select created_by into author from kgdj.edges where id = new.edge_id;
    if author = new.reviewer_id then raise exception 'Conflict of interest: you authored this edge'; end if;
  elsif new.target_kind = 'subgraph' then
    select owner_id into author from kgdj.student_subgraphs where id = new.subgraph_id;
    if author = new.reviewer_id then raise exception 'Conflict of interest: you own this portfolio'; end if;
  end if;
  return new;
end $$;

create trigger review_coi before insert on kgdj.reviews for each row execute function kgdj.check_review_coi();

-- The submitter may switch their anonymity on or off at ANY time, whatever
-- the proposal's status (the ordinary update policy only allows edits while
-- draft / revision_requested).
create or replace function kgdj.set_submission_anonymity(pid uuid, anonymous boolean) returns void language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
begin
  if not exists (select 1 from kgdj.proposed_changes where id = pid and proposer_id = auth.uid()) then
    raise exception 'Only the submitter can change the anonymity of a submission';
  end if;
  update kgdj.proposed_changes set submitter_anonymous = anonymous where id = pid;
end $$;
revoke execute on function kgdj.set_submission_anonymity(uuid, boolean) from public, anon;
grant execute on function kgdj.set_submission_anonymity(uuid, boolean) to authenticated;

-- Editors resolve a reviewer-integrity flag once a credible reviewer has looked again.
create or replace function kgdj.resolve_review_flag(flag uuid, note_text text default null) returns void language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
begin
  if not kgdj.is_editor() then raise exception 'Only editors resolve review flags'; end if;
  update kgdj.review_flags set resolved_at = now(), resolved_by = auth.uid(), note = coalesce(note_text, note) where id = flag and resolved_at is null;
end $$;
revoke execute on function kgdj.resolve_review_flag(uuid, text) from public, anon;
grant execute on function kgdj.resolve_review_flag(uuid, text) to authenticated;

-- ---------------------------------------------------------------- approval: proposed_change -> canonical graph
-- Runs as SECURITY DEFINER so it can write kgdj.nodes/edges, which have no
-- user write policies (0002). It is only ever invoked by the trigger on
-- editorial_decisions, whose insert policy requires an editor.
create or replace function kgdj.apply_editorial_decision() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare
  pc      kgdj.proposed_changes%rowtype;
  p       jsonb;
  new_node_id uuid;
  new_edge_id uuid;
  dept    uuid;
  cit     record;
begin
  -- Direct decisions on existing records (decision 3): promote proposed -> canonical, or archive.
  if new.proposal_id is null then
    if new.node_id is not null then
      if new.decision = 'promote' then
        update kgdj.nodes set status = 'canonical', canonical_since = coalesce(canonical_since, now()), version = version + 1, updated_by = new.editor_id,
          provenance = provenance || jsonb_build_object('status', 'canonical', 'approved_by', new.editor_id, 'approved_at', now(), 'assigned_by', 'editorial-review', 'decision_id', new.id)
        where id = new.node_id and status <> 'archived';
      else
        update kgdj.nodes set status = 'archived', version = version + 1, updated_by = new.editor_id,
          provenance = provenance || jsonb_build_object('archived_by', new.editor_id, 'archived_at', now(), 'decision_id', new.id) where id = new.node_id;
        update kgdj.edges set status = 'archived', updated_by = new.editor_id where (source_node_id = new.node_id or target_node_id = new.node_id) and status <> 'archived';
      end if;
    elsif new.edge_id is not null then
      if new.decision = 'promote' then
        update kgdj.edges set status = 'canonical', canonical_since = coalesce(canonical_since, now()), version = version + 1, updated_by = new.editor_id,
          provenance = provenance || jsonb_build_object('status', 'canonical', 'approved_by', new.editor_id, 'approved_at', now(), 'assigned_by', 'editorial-review', 'decision_id', new.id)
        where id = new.edge_id and status <> 'archived';
      else
        update kgdj.edges set status = 'archived', version = version + 1, updated_by = new.editor_id,
          provenance = provenance || jsonb_build_object('archived_by', new.editor_id, 'archived_at', now(), 'decision_id', new.id) where id = new.edge_id;
      end if;
    end if;
    insert into kgdj.audit_log (actor_id, action, table_name, row_id, after_row)
    values (new.editor_id, new.decision::text, coalesce(case when new.node_id is not null then 'nodes' end, 'edges'), coalesce(new.node_id, new.edge_id)::text, jsonb_build_object('decision_id', new.id));
    return new;
  end if;

  select * into pc from kgdj.proposed_changes where id = new.proposal_id for update;
  if not found then raise exception 'Proposal % not found', new.proposal_id; end if;
  if pc.status not in ('pending', 'under_review', 'revision_requested') then
    raise exception 'Proposal % is not decidable in status %', pc.id, pc.status;
  end if;
  p := coalesce(pc.payload, '{}'::jsonb);

  if new.decision = 'reject' then
    update kgdj.proposed_changes set status = 'rejected', decided_at = now() where id = pc.id;
    return new;
  elsif new.decision = 'request_revision' then
    update kgdj.proposed_changes set status = 'revision_requested', decided_at = null where id = pc.id;
    return new;
  end if;

  -- decision = approve --------------------------------------------------
  if (p ? 'department_code') then
    select id into dept from kgdj.departments where code = p ->> 'department_code';
  elsif (p ? 'department_id') then
    dept := (p ->> 'department_id')::uuid;
  end if;

  case pc.change_type
    when 'add_node' then
      insert into kgdj.nodes (slug, label, type_code, description, department_id, status, external_ids, provenance, tags, created_by, updated_by, canonical_since)
      values (
        coalesce(p ->> 'slug', kgdj.slugify(p ->> 'label')),
        p ->> 'label', coalesce(p ->> 'type_code', 'concept'), coalesce(p ->> 'description', ''), dept, 'canonical',
        coalesce(p -> 'external_ids', '{}'::jsonb),
        jsonb_build_object('source', 'kgdj', 'status', 'canonical', 'proposal_id', pc.id, 'proposer_id', pc.proposer_id,
                           'approved_by', new.editor_id, 'approved_at', now(), 'assigned_by', 'editorial-review'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb)) x), '{}'),
        pc.proposer_id, new.editor_id, now())
      returning id into new_node_id;
      for cit in select * from kgdj.proposal_citations where proposal_id = pc.id loop
        insert into kgdj.node_citations (node_id, citation_id, role, note, added_by) values (new_node_id, cit.citation_id, cit.role, cit.note, pc.proposer_id)
        on conflict do nothing;
      end loop;
      update kgdj.proposed_changes set status = 'approved', decided_at = now(), result_node_id = new_node_id where id = pc.id;

    when 'edit_node' then
      -- only the keys present in payload are overwritten; a 'proposed' seed
      -- node becomes canonical on its first approved edit (promotion).
      update kgdj.nodes n set
        label         = coalesce(p ->> 'label', n.label),
        type_code     = coalesce(p ->> 'type_code', n.type_code),
        description   = coalesce(p ->> 'description', n.description),
        department_id = coalesce(dept, n.department_id),
        external_ids  = n.external_ids || coalesce(p -> 'external_ids', '{}'::jsonb),
        tags          = case when p ? 'tags' then (select array_agg(x) from jsonb_array_elements_text(p -> 'tags') x) else n.tags end,
        status        = 'canonical',
        canonical_since = coalesce(n.canonical_since, now()),
        provenance    = n.provenance || jsonb_build_object('status', 'canonical', 'last_proposal_id', pc.id, 'approved_by', new.editor_id, 'approved_at', now(), 'assigned_by', 'editorial-review'),
        version       = n.version + 1,
        updated_by    = new.editor_id
      where n.id = pc.target_node_id;
      for cit in select * from kgdj.proposal_citations where proposal_id = pc.id loop
        insert into kgdj.node_citations (node_id, citation_id, role, note, added_by) values (pc.target_node_id, cit.citation_id, cit.role, cit.note, pc.proposer_id)
        on conflict (node_id, citation_id) do update set role = excluded.role, note = excluded.note;
      end loop;
      update kgdj.proposed_changes set status = 'approved', decided_at = now(), result_node_id = pc.target_node_id where id = pc.id;

    when 'archive_node' then
      update kgdj.nodes set status = 'archived', version = version + 1, updated_by = new.editor_id,
        provenance = provenance || jsonb_build_object('archived_by', new.editor_id, 'archived_at', now(), 'proposal_id', pc.id)
      where id = pc.target_node_id;
      update kgdj.edges set status = 'archived', updated_by = new.editor_id where (source_node_id = pc.target_node_id or target_node_id = pc.target_node_id) and status <> 'archived';
      update kgdj.proposed_changes set status = 'approved', decided_at = now(), result_node_id = pc.target_node_id where id = pc.id;

    when 'add_edge' then
      insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, weight, status, provenance, created_by, updated_by, canonical_since)
      values ((p ->> 'source_node_id')::uuid, (p ->> 'target_node_id')::uuid, p ->> 'relationship_code', p ->> 'label',
              coalesce((p ->> 'weight')::numeric, 3), 'canonical',
              jsonb_build_object('source', 'kgdj', 'status', 'canonical', 'proposal_id', pc.id, 'proposer_id', pc.proposer_id, 'approved_by', new.editor_id, 'approved_at', now(), 'assigned_by', 'editorial-review'),
              pc.proposer_id, new.editor_id, now())
      on conflict (source_node_id, target_node_id, relationship_code) do update
        set label = excluded.label, weight = excluded.weight, status = 'canonical', version = kgdj.edges.version + 1, updated_by = excluded.updated_by,
            canonical_since = coalesce(kgdj.edges.canonical_since, now()), provenance = kgdj.edges.provenance || excluded.provenance
      returning id into new_edge_id;
      for cit in select * from kgdj.proposal_citations where proposal_id = pc.id loop
        insert into kgdj.edge_citations (edge_id, citation_id, role, note, added_by)
        values (new_edge_id, cit.citation_id, case when cit.role = 'contrasts' then 'contrasts' else 'supports' end, cit.note, pc.proposer_id)
        on conflict do nothing;
      end loop;
      update kgdj.proposed_changes set status = 'approved', decided_at = now(), result_edge_id = new_edge_id where id = pc.id;

    when 'edit_edge' then
      update kgdj.edges e set
        relationship_code = coalesce(p ->> 'relationship_code', e.relationship_code),
        label  = coalesce(p ->> 'label', e.label),
        weight = coalesce((p ->> 'weight')::numeric, e.weight),
        status = 'canonical', canonical_since = coalesce(e.canonical_since, now()),
        provenance = e.provenance || jsonb_build_object('status', 'canonical', 'last_proposal_id', pc.id, 'approved_by', new.editor_id, 'approved_at', now()),
        version = e.version + 1, updated_by = new.editor_id
      where e.id = pc.target_edge_id;
      update kgdj.proposed_changes set status = 'approved', decided_at = now(), result_edge_id = pc.target_edge_id where id = pc.id;

    when 'delete_edge' then
      update kgdj.edges set status = 'archived', version = version + 1, updated_by = new.editor_id,
        provenance = provenance || jsonb_build_object('archived_by', new.editor_id, 'archived_at', now(), 'proposal_id', pc.id)
      where id = pc.target_edge_id;
      update kgdj.proposed_changes set status = 'approved', decided_at = now(), result_edge_id = pc.target_edge_id where id = pc.id;
  end case;

  insert into kgdj.audit_log (actor_id, action, table_name, row_id, after_row)
  values (new.editor_id, 'approve:' || pc.change_type::text, 'proposed_changes', pc.id::text,
          jsonb_build_object('result_node_id', new_node_id, 'result_edge_id', new_edge_id, 'target_node_id', pc.target_node_id, 'target_edge_id', pc.target_edge_id));
  return new;
end $$;

create trigger apply_decision after insert on kgdj.editorial_decisions
  for each row execute function kgdj.apply_editorial_decision();

-- ---------------------------------------------------------------- slug helper
create or replace function kgdj.slugify(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- ---------------------------------------------------------------- audit triggers on the tables that matter for accountability
do $$
declare t text;
begin
  foreach t in array array['nodes', 'edges', 'node_citations', 'edge_citations', 'proposed_changes', 'reviews', 'editorial_decisions',
                           'profiles', 'allowlist', 'consent_records', 'student_subgraphs', 'subgraph_shares', 'review_flags']
  loop
    execute format('create trigger %I_audit after insert or update or delete on kgdj.%I for each row execute function kgdj.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- convenience: a member's view of the graph for Cytoscape
create or replace view kgdj.graph_elements with (security_invoker = true) as
select 'node' as kind, n.id, n.slug, n.label, n.type_code as type, d.code as department, n.status::text as status,
       null::uuid as source, null::uuid as target, null::text as relationship, null::numeric as weight,
       n.description, n.external_ids, n.provenance, n.updated_at
from kgdj.nodes n left join kgdj.departments d on d.id = n.department_id
where n.status <> 'archived'
union all
select 'edge', e.id, null, e.label, e.relationship_code, null, e.status::text,
       e.source_node_id, e.target_node_id, e.relationship_code, e.weight,
       null, null, e.provenance, e.updated_at
from kgdj.edges e
where e.status <> 'archived';
grant select on kgdj.graph_elements to authenticated;
