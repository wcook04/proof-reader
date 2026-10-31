// The drawn skeleton: a support-only simplification of the visible subgraph.
// A `supports` edge u -> w is left out when another visible path of
// `supports` edges from u reaches w, because that longer chain of recorded
// support already says u rests on w. Assumptions (`assumes`) and Lean
// correspondences (`formalizes`) are never left out: a route through other
// kinds does not say what they say. The graph is acyclic.

import type { EngineEdge } from "./types";

export interface Skeleton {
  edges: EngineEdge[];
  /** Keys of visible `supports` edges that a longer visible support-only path implies. */
  implied: Set<string>;
}

export function transitiveReduction(nodes: Iterable<string>, edges: readonly EngineEdge[]): Skeleton {
  const ids = new Set(nodes);
  const live = edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to));
  const out = new Map<string, EngineEdge[]>();
  for (const id of ids) out.set(id, []);
  for (const e of live) if (e.kind === "supports") out.get(e.from)!.push(e);

  // Descendants along support edges only (excluding the node itself), memoised in post-order.
  const below = new Map<string, Set<string>>();
  const visit = (id: string): Set<string> => {
    const known = below.get(id);
    if (known) return known;
    const set = new Set<string>();
    below.set(id, set); // acyclic, so no re-entry
    for (const e of out.get(id)!) {
      set.add(e.to);
      for (const d of visit(e.to)) set.add(d);
    }
    return set;
  };
  for (const id of ids) visit(id);

  const implied = new Set<string>();
  const kept: EngineEdge[] = [];
  for (const e of live) {
    let longer = false;
    if (e.kind === "supports") {
      for (const other of out.get(e.from)!) {
        if (other.to !== e.to && below.get(other.to)!.has(e.to)) {
          longer = true;
          break;
        }
      }
    }
    if (longer) implied.add(e.key);
    else kept.push(e);
  }
  return { edges: kept, implied };
}
