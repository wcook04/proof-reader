// Clones of shared leaves (the "clone marker" of pathway maps, SBGN). A record
// with no drawn inputs that several drawn records use (a much-used lemma whose
// inputs are folded, a Lean declaration) is drawn once under each of its
// consumers instead of once for all of them.
// One copy at the bottom of the drawing with a dozen lines braiding down to
// it says less than a small card under each user: every line then runs one
// rank, inside its consumer's group, and never across the map.
//
// An occurrence keeps the record's identity: its layout id is
// `${record}@@${consumer}`, and every edge keeps its real key. Records that
// have drawn inputs stay single nodes (splitting them would duplicate their
// whole sub-argument). Assumptions are not laid out at all: they are drawn as
// premise tags on the cards that assume them.

import type { EngineEdge } from "./types";

export const OCC = "@@";

/** The record a layout id draws. */
export function recordOf(lid: string): string {
  const i = lid.indexOf(OCC);
  return i < 0 ? lid : lid.slice(0, i);
}

/** For an occurrence, the consumer it sits under; null for an ordinary node. */
export function consumerOf(lid: string): string | null {
  const i = lid.indexOf(OCC);
  return i < 0 ? null : lid.slice(i + OCC.length);
}

export const occurrenceId = (record: string, consumer: string) => `${record}${OCC}${consumer}`;

/** A copied chain draws one recorded edge more than once; each drawn copy gets its own key with this suffix. */
const COPY = "##";

/** The recorded edge a drawn edge key stands for. */
export function edgeKeyOf(drawnKey: string): string {
  const i = drawnKey.indexOf(COPY);
  return i < 0 ? drawnKey : drawnKey.slice(0, i);
}

export interface Split {
  /** Layout ids: records, or occurrences of shared leaves. */
  nodes: string[];
  /** Edges between layout ids, each with its real key. */
  edges: EngineEdge[];
  /** For each split record, how many drawn consumers it has (= its occurrences). */
  shared: Map<string, number>;
}

export function splitSharedLeaves(root: string, nodes: Iterable<string>, edges: readonly EngineEdge[]): Split {
  const ids = [...nodes];
  const out = new Map<string, EngineEdge[]>();
  const consumers = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
    if (!consumers.has(e.to)) consumers.set(e.to, new Set());
    consumers.get(e.to)!.add(e.from);
  }
  const shared = new Map<string, number>();
  for (const id of ids) {
    if (id === root) continue;
    const n = consumers.get(id)?.size ?? 0;
    if (n >= 2 && !out.get(id)?.length) shared.set(id, n);
  }
  const nodesOut: string[] = [];
  const edgesOut: EngineEdge[] = [];
  // Inside a copied chain, every record is copied too, under the copy that uses it.
  const copy = (record: string, parentLid: string) => {
    const lid = occurrenceId(record, parentLid);
    nodesOut.push(lid);
    for (const e of out.get(record) ?? []) {
      const child = occurrenceId(e.to, lid);
      edgesOut.push({ ...e, key: `${e.key}${COPY}${lid}`, from: lid, to: child });
      copy(e.to, lid);
    }
  };
  for (const id of ids) {
    if (shared.has(id)) continue;
    nodesOut.push(id);
    for (const e of out.get(id) ?? []) {
      if (shared.has(e.to)) {
        edgesOut.push({ ...e, to: occurrenceId(e.to, id) });
        if (!nodesOut.includes(occurrenceId(e.to, id))) copy(e.to, id);
      } else edgesOut.push(e);
    }
  }
  // A record used only inside copied chains is drawn only as copies.
  const used = new Set(edgesOut.map((e) => e.to));
  const drawn = nodesOut.filter((id) => id === root || used.has(id) || !consumers.has(id));
  return { nodes: drawn, edges: edgesOut, shared };
}

/**
 * What is laid out. Explicit assumptions are premise tags on the cards that
 * assume them (like a premise written at each use in a deduction tree), so
 * `assumes` edges are not lines, and an assumption record is a node only when
 * some other drawn relation (a recorded support) reaches it.
 */
export function layoutScope(root: string, nodes: Iterable<string>, edges: readonly EngineEdge[], isAssumption: (id: string) => boolean): { nodes: string[]; edges: EngineEdge[] } {
  const lines = edges.filter((e) => e.kind !== "assumes");
  const reached = new Set(lines.map((e) => e.to));
  const kept = [...nodes].filter((id) => id === root || !isAssumption(id) || reached.has(id));
  const keep = new Set(kept);
  return { nodes: kept, edges: lines.filter((e) => keep.has(e.from) && keep.has(e.to)) };
}
