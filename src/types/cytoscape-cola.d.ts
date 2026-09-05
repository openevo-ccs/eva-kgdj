// cytoscape-cola has no official @types package; shaped like @types/cytoscape-dagre's
// own ambient declaration (a cytoscape.Ext registration function).
declare module "cytoscape-cola" {
  import type cytoscape from "cytoscape";
  const cytoscapeCola: cytoscape.Ext;
  export = cytoscapeCola;
}
