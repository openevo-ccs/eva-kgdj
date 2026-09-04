# Eva KGDJ — Knowledge Graph Data Journal

Private, GDPR-minded, peer-reviewed knowledge-graph platform for MPI-EVA researchers and the Uni-Leipzig
MSc Evolutionary Anthropology program. A separate app from the Ask Eva AI-agent whiteboard: it shares
design tokens and the department registry values, nothing else (see `docs/kgdj/00-repo-audit.md`).

```
apps/kgdj/
├── supabase/        Postgres schema, RLS, workflow, auth gate, seed, DB scenario test   (Phase 2)
├── src/
│   ├── lib/         types · api seam · supabaseApi · mockApi · markdown · analytics
│   ├── state/       session (auth + profile + departments)
│   ├── components/  GraphCanvas (Cytoscape) · NodeDrawer · ReviewPanel · Markdown · Chips
│   └── pages/       Login · Explorer · Proposals (+ new) · Proposal · Editorial · Portfolio · Leaderboard · Account
├── scripts/build-mock-data.mjs   -> src/mock/graph.json (306 nodes / 499 edges from mpi-eva-graph)
├── index.html · vite.config.ts · tsconfig.json · package.json · .env.example
```

## Run

```bash
cd apps/kgdj
npm install
npm run mock:build          # once; regenerate after scripts/build_mpi_eva_graph.py changes
cp .env.example .env        # VITE_KGDJ_MODE=mock for offline UI work
npm run dev                 # http://localhost:5173/?as=student   (personas: student student2 researcher editor instructor admin)
npm run typecheck && npm run build
```

Against Supabase: set `VITE_KGDJ_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; apply
`supabase/migrations` + seed (see `supabase/README.md`); add `kgdj` to *Project Settings → API → Exposed
schemas*; enable the *Before User Created* auth hook `kgdj.before_user_created`. Deploy the `dist/` bundle
behind an auth-gated host (Cloudflare Pages + Access recommended — ADR §4); GitHub Pages is not acceptable.

## What the UI does (priority order from the brief)

1. **Auth** — magic-link email (Supabase OTP). Only allowlisted domains/invites get a profile; others see "not a member".
2. **Canonical graph explorer** — Cytoscape.js with department/status/type filters, search, layouts (`cose`, `dagre`,
   `concentric`, `grid`), stylesheet: department colours, **dashed** = proposed/pending review, **double border** =
   student-authored (approved) node, solid green = canonical.
3. **Node drawer** — description, citations, connections, open proposals, provenance chip; tabs for reviews
   (summary + identified reviews + review form), propose (edit / connection / archival), fork to portfolio. Editors get
   promote/archive buttons.
4. **Fork to portfolio** — creates/updates `student_subgraphs` + `subgraph_nodes` with annotation and week; the Portfolio
   page adds the student's own nodes (self/question/resource/theory/method), "I'm connecting X to Y because…" links with
   a lens and week, saved layout positions, visibility, sharing, and classmate critique.
5. **Propose change** — add/edit/archive node, add edge; citations mandatory for add/edit (search existing or add by DOI);
   anonymity toggle (submitter-side, changeable later); draft or submit.
6. **Review interface** — on proposals, nodes, edges (via node drawer), portfolios: markdown commentary + five-level
   rating, reviewer always identified; conflict-of-interest blocked.
7. **Editorial dashboard** — open proposals with review counts/means/credible counts, reviewer-integrity flags with
   resolve, seed nodes with reviews ready to promote.
8. **Leaderboard** — opt-in via consent; informational.
9. **Account** — consent switches, JSON export (portability), account deletion with optional free-text withdrawal.

Graph analysis panel (module exercises): degree centrality (Cytoscape), shortest path (Dijkstra, click two nodes),
community detection (label propagation, `src/lib/analytics.ts`). `cola` is not bundled (extra dependency; `cose`
covers the organic case) — add `cytoscape-cola` if the module wants it.

## Not in the MVP (deliberately)

TinyMCE/rich-text editor (markdown textarea with preview instead; stored value is markdown either way), realtime
updates, Supabase Storage, pgvector/RAG (roadmap step 8), a shared graph-rendering core with the whiteboard.
