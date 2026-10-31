// One paper's Lean declarations as the graph the copied map engine draws.
// The map's "supports" relation carries Lean's own uses here: an edge runs from
// a declaration to something it refers to, as Lean reports it.

import type { Edition } from "../app/edition";
import type { ArgEdge, ArgGraph, ArgNode, LinkKind, Origin } from "./graph";

const origin = (family: string, label: string, slot: 0 | 1 | 2 | 3): Origin => ({ family, label, slot, place: null, locator: null, url: null });
const LEAN = origin("lean", "Lean", 3);
const PAPER = origin("paper", "The paper", 1);

export function editionGraph(edition: Edition): ArgGraph {
  const goal = edition.claims[0]?.id ?? "";
  const nodes = new Map<string, ArgNode>();
  const blank = { papers: {}, region: goal, passedExtraction: true };
  for (const claim of edition.claims) {
    nodes.set(claim.id, { ...blank, id: claim.id, ref: claim.id, kind: "goal", label: claim.title, status: "external", origin: PAPER });
  }
  for (const d of edition.declarations) {
    nodes.set(d.id, {
      ...blank,
      id: d.id,
      ref: d.id,
      kind: d.keyword === "axiom" ? "assumption" : "declaration",
      label: d.id,
      declaration: d.id,
      status: d.keyword === "axiom" ? "axiom" : "kernel_checked",
      origin: LEAN,
    });
  }
  const edges: ArgEdge[] = [];
  const add = (from: string, to: string, kind: LinkKind) =>
    edges.push({ key: `${from}→${to}→${kind}`, from, to, kind, linkIds: [`${from}→${to}`], scoped: false, semanticClass: kind });
  for (const claim of edition.claims) for (const name of claim.lean) add(claim.id, name, "formalizes");
  const axioms = new Set(edition.analytics.axioms);
  for (const d of edition.declarations) for (const to of d.uses) add(d.id, to, axioms.has(to) ? "assumes" : "supports");

  const out = new Map<string, ArgEdge[]>();
  const into = new Map<string, ArgEdge[]>();
  for (const id of nodes.keys()) {
    out.set(id, []);
    into.set(id, []);
  }
  for (const edge of edges) {
    out.get(edge.from)!.push(edge);
    into.get(edge.to)!.push(edge);
  }
  const members = [...nodes.keys()];
  return {
    origins: [
      { family: "paper", label: "The paper", slot: 1, count: edition.claims.length },
      { family: "lean", label: "Lean", slot: 3, count: edition.declarations.length },
    ],
    cites: [],
    nodes,
    order: members,
    edges,
    out,
    in: into,
    regions: [{ id: goal, title: edition.claims[0]?.title ?? "", goal, members }],
    regionOf: new Map(members.map((id) => [id, goal])),
    goals: edition.claims.map((c) => c.id),
    cyclic: new Set(),
    boundaries: new Map(),
  };
}
