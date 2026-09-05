// Portfolio metrics (same definitions as kgdj.portfolio_metrics() in
// supabase/migrations/0005_ux.sql) and the self-contained HTML comparison
// report a student can download. The report deliberately has no single score:
// it shows several dimensions and names the ones where this portfolio is
// strongest, so different ways of modelling one's own learning are visible.
import type { CohortStats, GraphNode, MetricKey, PortfolioMetrics, SubgraphDetail } from "./types";

export function portfolioMetrics(d: SubgraphDetail, nodesById: Record<string, GraphNode>): PortfolioMetrics {
  const ann = d.nodes.map((n) => n.custom_annotation.length);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const depts = new Set<string>(); const types = new Set<string>();
  for (const sn of d.nodes) { const n = nodesById[sn.node_id]; if (!n) continue; if (n.department_id) depts.add(n.department_id); types.add(n.type_code); }
  const day = (iso: string) => iso.slice(0, 10);
  const days = new Set<string>();
  d.nodes.forEach((n) => days.add(day(n.added_at))); d.privateNodes.forEach((n) => days.add(day(n.created_at))); d.links.forEach((l) => days.add(day(l.created_at)));
  const cross = d.links.filter((l) => { const a = l.from_node_id ? nodesById[l.from_node_id] : null, b = l.to_node_id ? nodesById[l.to_node_id] : null; return a?.department_id && b?.department_id && a.department_id !== b.department_id; }).length;
  const byType = (t: string) => d.privateNodes.filter((p) => p.node_type === t).length;
  return {
    canonical_nodes: d.nodes.length, annotated_nodes: ann.filter((x) => x >= 40).length, avg_annotation_len: avg(ann),
    own_nodes: d.privateNodes.length, questions: byType("question"), resources: byType("resource"), theories: byType("theory"), methods: byType("method"),
    connections: d.links.length, avg_why_len: avg(d.links.map((l) => l.why.length)), lenses: new Set(d.links.map((l) => (l.lens || "").trim()).filter(Boolean)).size,
    adopted_edges: d.links.filter((l) => l.edge_id).length, cross_dept_connections: cross,
    departments_covered: depts.size, node_types_covered: types.size, active_days: days.size, critiques_received: d.reviews.length,
  };
}

export const METRIC_LABEL: Record<MetricKey, string> = {
  canonical_nodes: "canonical nodes", annotated_nodes: "nodes with a real annotation (≥ 40 chars)", avg_annotation_len: "average annotation length",
  own_nodes: "own nodes", questions: "questions raised", resources: "resources added", theories: "own theory nodes", methods: "own method nodes",
  connections: "connections written", avg_why_len: "average 'because' length", lenses: "distinct lenses used", adopted_edges: "canonical edges adopted",
  cross_dept_connections: "connections across departments", departments_covered: "departments touched", node_types_covered: "node types touched",
  active_days: "distinct days active", critiques_received: "critiques received",
};

export interface Dimension { key: string; title: string; blurb: string; metrics: MetricKey[]; next: string }
export const DIMENSIONS: Dimension[] = [
  { key: "range", title: "Range", blurb: "How much of the institute's map you have walked.", metrics: ["canonical_nodes", "departments_covered", "node_types_covered"], next: "Fork one node from a department you have not touched yet and write why it is (or is not) relevant to you." },
  { key: "depth", title: "Depth of annotation", blurb: "Whether each node carries your own reading of it.", metrics: ["annotated_nodes", "avg_annotation_len"], next: "Pick the three nodes with the shortest annotations and say what they mean for your own question." },
  { key: "reasoning", title: "Reasoning in connections", blurb: "The 'because' sentences — the core of the exercise.", metrics: ["connections", "avg_why_len", "lenses"], next: "Rewrite one 'because' so that someone outside the module could follow it; try a lens you have not used (mechanism, evidence, method, history)." },
  { key: "bridging", title: "Bridging", blurb: "Links that cross department lines or adopt canonical structure and re-explain it.", metrics: ["cross_dept_connections", "adopted_edges"], next: "Find two nodes from different departments that speak to the same question and connect them." },
  { key: "voice", title: "Own voice", blurb: "Nodes that exist only because you added them: questions, resources, theories, methods.", metrics: ["own_nodes", "questions", "resources", "theories", "methods"], next: "Add one question you actually have, and one resource you found yourself, with its source." },
  { key: "rhythm", title: "Rhythm", blurb: "Whether the portfolio grew over several sessions or in one sitting.", metrics: ["active_days"], next: "Come back to it again this week — even one new connection keeps the rhythm visible." },
  { key: "dialogue", title: "Dialogue", blurb: "Critique you invited from classmates.", metrics: ["critiques_received"], next: "Share the portfolio with one classmate and ask for a critique of a specific connection." },
];

type Pos = "above" | "around" | "below" | "n/a";
function position(mine: number, c: CohortStats | null, k: MetricKey): { pos: Pos; median: number | null; p75: number | null; max: number | null } {
  const m = c?.metrics?.[k]; if (!m) return { pos: "n/a", median: null, p75: null, max: null };
  const pos: Pos = mine >= m.p75 && mine > m.median ? "above" : mine < m.median * 0.6 ? "below" : "around";
  return { pos, median: m.median, p75: m.p75, max: m.max };
}

export interface ReportInput {
  title: string; owner: string; moduleName: string | null; generatedAt: Date; metrics: PortfolioMetrics; cohorts: CohortStats[];
  nodes: { label: string; type: string; dept: string | null; annotation: string }[]; privateNodes: { label: string; type: string; source: string | null }[];
  links: { from: string; to: string; why: string; lens: string | null; created_at: string }[];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function buildReportHtml(r: ReportInput): string {
  const primary = r.cohorts.find((c) => c.metrics) ?? null;
  const dims = DIMENSIONS.map((d) => {
    const rows = d.metrics.map((k) => ({ k, mine: r.metrics[k], ...position(r.metrics[k], primary, k) }));
    const score = rows.filter((x) => x.pos !== "n/a").reduce((a, x) => a + (x.pos === "above" ? 1 : x.pos === "below" ? -1 : 0), 0);
    return { ...d, rows, score };
  });
  const ranked = dims.filter((d) => d.rows.some((x) => x.pos !== "n/a")).sort((a, b) => b.score - a.score);
  const signature = ranked.filter((d) => d.score > 0).slice(0, 2);
  const growth = ranked.filter((d) => d.score < 0).slice(-2);
  const scopeName = (c: CohortStats) => c.scope === "module" ? (r.moduleName ? `your module (${r.moduleName})` : "your module") : c.scope === "program" ? "the MSc program" : "all members";
  const bar = (v: number, max: number | null, color: string) => { const w = max ? Math.min(100, Math.round((v / Math.max(max, 1)) * 100)) : 0; return `<span class="bar"><i style="width:${w}%;background:${color}"></i></span>`; };
  const dimHtml = dims.map((d) => `
    <section class="dim">
      <h3>${esc(d.title)} <small>${esc(d.blurb)}</small></h3>
      <table>
        <thead><tr><th>measure</th><th>you</th>${r.cohorts.map((c) => `<th>${esc(scopeName(c))} median · p75 · max</th>`).join("")}<th></th></tr></thead>
        <tbody>${d.rows.map((x) => `<tr>
          <td>${esc(METRIC_LABEL[x.k])}</td><td class="num"><b>${x.mine}</b></td>
          ${r.cohorts.map((c) => { const m = c.metrics?.[x.k]; return `<td class="num">${m ? `${m.median} · ${m.p75} · ${m.max}` : `<span class="muted">n/a (${c.n} portfolio${c.n === 1 ? "" : "s"})</span>`}</td>`; }).join("")}
          <td class="pos pos-${x.pos}">${x.pos === "n/a" ? "" : x.pos === "above" ? "among the upper quarter" : x.pos === "below" ? "below the median" : "around the median"} ${bar(x.mine, x.max, x.pos === "above" ? "#1a6b46" : x.pos === "below" ? "#c9b6dc" : "#8fb8a3")}</td>
        </tr>`).join("")}</tbody>
      </table>
      <p class="next"><b>One thing to try:</b> ${esc(d.next)}</p>
    </section>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.title)} — portfolio report</title>
<style>
 body{font-family:Georgia,"Times New Roman",serif;max-width:900px;margin:32px auto;padding:0 20px;color:#1e2126;line-height:1.45}
 h1{font-size:26px;margin:0 0 4px} h2{font-size:19px;margin:28px 0 8px;border-bottom:1px solid #dcdcd6;padding-bottom:4px} h3{font-size:15px;margin:18px 0 6px} h3 small{font-weight:normal;color:#7a808a;font-family:system-ui,sans-serif;font-size:12px;margin-left:8px}
 .muted{color:#7a808a;font-size:12px} table{border-collapse:collapse;width:100%;font-family:system-ui,sans-serif;font-size:12.5px} th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
 th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#7a808a} .num{white-space:nowrap} .bar{display:inline-block;width:90px;height:8px;background:#f0f0ec;border-radius:4px;vertical-align:middle;margin-left:6px} .bar i{display:block;height:100%;border-radius:4px}
 .pos-above{color:#145c3b} .pos-below{color:#7a4d9c} .pos-around{color:#4a4f57} .next{font-family:system-ui,sans-serif;font-size:12.5px;background:#f7f7f5;padding:8px 10px;border-radius:8px}
 .sig{display:flex;gap:12px;flex-wrap:wrap} .sig div{flex:1;min-width:220px;border:1px solid #dcdcd6;border-radius:10px;padding:10px 12px;background:#fff} .sig b{display:block;font-size:14px} .callout{background:#e6f2f1;border-left:4px solid #0f6f6a;padding:10px 14px;margin:12px 0;font-family:system-ui,sans-serif;font-size:13px}
 .why{font-family:system-ui,sans-serif;font-size:12.5px;margin:0 0 6px;padding-left:10px;border-left:2px solid #dcdcd6} .why b{font-weight:600} @media print{body{margin:0}}
</style></head><body>
<h1>${esc(r.title)}</h1>
<div class="muted">Portfolio of ${esc(r.owner)}${r.moduleName ? ` · ${esc(r.moduleName)}` : ""} · report generated ${r.generatedAt.toLocaleString()} · Eva KGDJ</div>
<div class="callout">This report compares the <i>shape</i> of your portfolio with anonymised aggregates of your peers (never with a named person). There is no overall score on purpose: a portfolio can be excellent by being wide, or deep, or well-argued, or brave in its questions. The aggregates are released only when at least three portfolios are in scope.</div>
<h2>Where this portfolio is strongest</h2>
<div class="sig">
 ${signature.length ? signature.map((d) => `<div><b>${esc(d.title)}</b><span class="muted">${esc(d.blurb)}</span></div>`).join("") : `<div><b>Not enough comparison data yet</b><span class="muted">${primary ? "No dimension is clearly above your peers yet — see the tables." : "Aggregates appear once three or more portfolios exist in your module or program."}</span></div>`}
</div>
${growth.length ? `<h2>Where there is most room to grow</h2><div class="sig">${growth.map((d) => `<div><b>${esc(d.title)}</b><span class="muted">${esc(d.next)}</span></div>`).join("")}</div>` : ""}
<h2>Dimensions</h2>
${r.cohorts.map((c) => `<p class="muted">${esc(scopeName(c))}: ${c.metrics ? `${c.n} portfolios aggregated` : esc(c.reason || "no aggregates")}.</p>`).join("")}
${dimHtml}
<h2>Your connections (${r.links.length})</h2>
${r.links.length ? r.links.map((l) => `<p class="why"><b>${esc(l.from)} → ${esc(l.to)}</b>${l.lens ? ` <span class="muted">[${esc(l.lens)}]</span>` : ""} <span class="muted">${esc(new Date(l.created_at).toLocaleDateString())}</span><br>${esc(l.why)}</p>`).join("") : `<p class="muted">None yet.</p>`}
<h2>Nodes (${r.nodes.length} canonical · ${r.privateNodes.length} own)</h2>
<table><thead><tr><th>node</th><th>type</th><th>department</th><th>your annotation</th></tr></thead><tbody>
${r.nodes.map((n) => `<tr><td>${esc(n.label)}</td><td>${esc(n.type)}</td><td>${esc(n.dept ?? "—")}</td><td>${esc(n.annotation) || '<span class="muted">(none)</span>'}</td></tr>`).join("")}
${r.privateNodes.map((n) => `<tr><td>★ ${esc(n.label)}</td><td>${esc(n.type)} (own)</td><td>—</td><td>${esc(n.source ?? "")}</td></tr>`).join("")}
</tbody></table>
<p class="muted" style="margin-top:28px">Definitions: a node counts as annotated at 40+ characters; a connection crosses departments when both ends are canonical nodes of different departments; a lens is the free-text tag on a connection. Peer aggregates are medians, upper quartiles and maxima over portfolios in scope; nobody's individual portfolio is exposed.</p>
</body></html>`;
}
