// One paper's Lean as the graph the copied map engine draws. An edge runs from a
// declaration to something it refers to, as Lean reports it: a use in the statement
// or a use only in the proof or body, drawn differently as blueprints draw them.
// Types sit on a shelf below the map instead: nearly everything uses them, and drawn
// as cards they bury the shape of the proof.

import type { Declaration, Edition } from "../app/edition";
import type { ArgEdge, ArgGraph, ArgNode, LinkKind, Origin } from "./graph";

const origin = (family: string, label: string, slot: 0 | 1 | 2 | 3): Origin => ({ family, label, slot, place: null, locator: null, url: null });
const LEAN = origin("lean", "Lean", 3);
const PAPER = origin("paper", "The paper", 1);

const KIND_WORDS: Record<string, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  def: "Definition",
  abbrev: "Definition",
  instance: "Instance",
  axiom: "Axiom",
  opaque: "Definition",
};

export const isType = (d: Declaration) => ["inductive", "structure", "class"].includes(d.keyword);

/** The form a declaration takes on the map and in the lists. */
export function shapeOf(d: Declaration): "definition" | "theorem" | "axiom" {
  if (d.keyword === "axiom") return "axiom";
  return d.keyword === "theorem" || d.keyword === "lemma" ? "theorem" : "definition";
}

/** A section as a reader names it: "§3.3". */
export const sectionLabel = (number: string) => (/^[0-9A-Z]/.test(number) ? `§${number}` : number);

export function editionGraph(edition: Edition): ArgGraph {
  const goal = edition.claims[0]?.id ?? "";
  const drawn = edition.declarations.filter((d) => !isType(d));
  const nodes = new Map<string, ArgNode>();
  const blank = { papers: {}, region: goal, passedExtraction: true };
  for (const claim of edition.claims) {
    nodes.set(claim.id, { ...blank, id: claim.id, ref: claim.id, kind: "goal", kindLabel: "The paper's claim", label: claim.title, status: "external", origin: PAPER });
  }
  for (const d of drawn) {
    nodes.set(d.id, {
      ...blank,
      id: d.id,
      ref: d.id,
      kind: d.keyword === "axiom" ? "assumption" : "declaration",
      kindLabel: KIND_WORDS[d.keyword],
      label: d.id,
      declaration: d.id,
      shape: shapeOf(d),
      status: d.keyword === "axiom" ? "axiom" : "kernel_checked",
      origin: LEAN,
    });
  }
  const edges: ArgEdge[] = [];
  const add = (from: string, to: string, kind: LinkKind) =>
    edges.push({ key: `${from}→${to}→${kind}`, from, to, kind, linkIds: [`${from}→${to}`], scoped: false, semanticClass: kind });
  for (const claim of edition.claims) for (const name of claim.lean) add(claim.id, name, "formalizes");
  for (const d of drawn) {
    for (const to of d.uses_proof) if (nodes.has(to)) add(d.id, to, "supports");
    for (const to of d.uses_statement) if (nodes.has(to)) add(d.id, to, "lean_type_dependency");
  }

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
      { family: "lean", label: "Lean", slot: 3, count: drawn.length },
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
