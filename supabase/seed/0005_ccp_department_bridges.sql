-- Two of the three ready-made department-pair bridges into CCP (humor<->ccp, evogen<->ccp),
-- carried over from eva-graph-66's mpi-eva-graph coherence review
-- (docs/mpi-eva-graph-coherence-review-2026-09-09.md, Part 1) into KGDJ's own graph.
-- ccp<->dag deliberately excluded: that review found no real bridge and said so --
-- not reproduced here either.
--
-- Every citation below is Crossref-verified against a real DOI (checked live via
-- literaturebase_verify_doi before writing this file, not transcribed from the other
-- repo's doc). Somel et al. 2009 was already in kgdj.citations, PuRe-matched (real
-- MPI-EVA output). Bogin and Kaplan et al. are not MPI-EVA output, so correctly absent
-- from the PuRe-matched import -- inserted here with an honest empty verification
-- (real, DOI-checkable, just not institute-confirmed), matching isVerifiedCitation()'s
-- existing distinction rather than overclaiming it.
--
-- One documented substitution: the coherence review cited "Bogin 1999" informally, no
-- DOI given. The specific paper that title/year points to (his book "Patterns of Human
-- Growth," 2nd ed.) carries no resolvable journal DOI. Used his 1997 AJPA paper
-- "Evolutionary hypotheses for human childhood" instead -- same author, same exact
-- topic (the evolution of human childhood), a real Crossref-verified DOI. Noted here,
-- not silently swapped.
--
-- Status stays 'proposed', created_by stays NULL -- matching every other edge already
-- in this graph, all of which arrived the same way (seed SQL, not the app's proposal
-- flow). Not attributed to a human who didn't write it (the exact "unearned trust
-- signal" docs/kgdj/12-graph-coherence.md §3 warned against for machine-suggested
-- edges) -- provenance says plainly where this came from, and 'proposed' means it still
-- needs a real identified review before promotion, same bar as everything else here.

begin;

-- 1. New citations (Somel et al. 2009 already exists, PuRe-matched: c17acaa0-fdc2-4e44-818a-2d92a4877677)
insert into kgdj.citations (doi, title, authors, year, venue, verification)
values
  ('10.1002/(sici)1096-8644(1997)25+<63::aid-ajpa3>3.0.co;2-8',
   'Evolutionary hypotheses for human childhood',
   array['Barry Bogin'], 1997, 'American Journal of Physical Anthropology',
   '{}'::jsonb),
  ('10.1002/1520-6505(2000)9:4<156::aid-evan5>3.0.co;2-7',
   'A theory of human life history evolution: Diet, intelligence, and longevity',
   array['Hillard Kaplan', 'Kim Hill', 'Jane Lancaster', 'A. Magdalena Hurtado'],
   2000, 'Evolutionary Anthropology: Issues, News, and Reviews',
   '{}'::jsonb)
on conflict (doi) do nothing;

-- 2. New cross-department edges (status defaults to 'proposed')
insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, provenance)
select s.id, t.id, 'cross-dept',
       'Extended human childhood as a life-history adaptation for costly cognitive/social development -- Bogin 1997; Kaplan et al. 2000 (embodied-capital theory)',
       '{"source": "eva-graph/mpi-eva-graph-coherence-review-2026-09-09", "status": "draft", "imported_at": "2026-09-10", "note": "humor<->ccp department-pair bridge, carried over from eva-graph-66''s coherence review"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'humor-theory-life-history-evolution' and t.slug = 'ccp-theory-developmental-psychology'
union all
select s.id, t.id, 'cross-dept',
       'Human childhood''s unusually slow growth and extended dependency, a textbook paleoanthropology/developmental-psychology intersection -- Bogin 1997',
       '{"source": "eva-graph/mpi-eva-graph-coherence-review-2026-09-09", "status": "draft", "imported_at": "2026-09-10", "note": "humor<->ccp department-pair bridge, carried over from eva-graph-66''s coherence review"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'humor-topic-growth-and-development' and t.slug = 'ccp-domain-children'
union all
select s.id, t.id, 'cross-dept',
       'Comparative primate transcriptomics as the genomic substrate for great-ape-comparative behavioral research -- brain-transcriptome neoteny, Somel et al. 2009',
       '{"source": "eva-graph/mpi-eva-graph-coherence-review-2026-09-09", "status": "draft", "imported_at": "2026-09-10", "note": "evogen<->ccp department-pair bridge, carried over from eva-graph-66''s coherence review"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'evogen-domain-comparative-primate-genomics' and t.slug = 'ccp-domain-great-ape-comparative-sample'
union all
select s.id, t.id, 'cross-dept',
       'Human-specific delayed brain gene-expression maturation (neoteny) as a documented candidate substrate for the extended social-cognitive development CCP studies behaviorally -- Somel et al. 2009',
       '{"source": "eva-graph/mpi-eva-graph-coherence-review-2026-09-09", "status": "draft", "imported_at": "2026-09-10", "note": "evogen<->ccp department-pair bridge, carried over from eva-graph-66''s coherence review"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'evogen-topic-evolution-of-gene-regulation' and t.slug = 'ccp-theory-social-cognition'
on conflict (source_node_id, target_node_id, relationship_code) do nothing;

-- 3. Attach citations to the new edges
insert into kgdj.edge_citations (edge_id, citation_id, role)
select e.id, c.id, 'supports'
from kgdj.edges e
join kgdj.nodes s on s.id = e.source_node_id
join kgdj.nodes t on t.id = e.target_node_id
join kgdj.citations c on c.doi = '10.1002/(sici)1096-8644(1997)25+<63::aid-ajpa3>3.0.co;2-8'
where (s.slug, t.slug) in (
  ('humor-theory-life-history-evolution', 'ccp-theory-developmental-psychology'),
  ('humor-topic-growth-and-development', 'ccp-domain-children')
)
union all
select e.id, c.id, 'supports'
from kgdj.edges e
join kgdj.nodes s on s.id = e.source_node_id
join kgdj.nodes t on t.id = e.target_node_id
join kgdj.citations c on c.doi = '10.1002/1520-6505(2000)9:4<156::aid-evan5>3.0.co;2-7'
where (s.slug, t.slug) = ('humor-theory-life-history-evolution', 'ccp-theory-developmental-psychology')
union all
select e.id, c.id, 'supports'
from kgdj.edges e
join kgdj.nodes s on s.id = e.source_node_id
join kgdj.nodes t on t.id = e.target_node_id
join kgdj.citations c on c.doi = '10.1073/pnas.0900544106'
where (s.slug, t.slug) in (
  ('evogen-domain-comparative-primate-genomics', 'ccp-domain-great-ape-comparative-sample'),
  ('evogen-topic-evolution-of-gene-regulation', 'ccp-theory-social-cognition')
)
on conflict (edge_id, citation_id) do nothing;

commit;
