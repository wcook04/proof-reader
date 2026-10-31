// The layered layout of the visible skeleton.
//
// 1. Ranks: the longest path from the root, so the goal is rank 0 and a
//    result sits one rank below the lowest result that uses it. A card's rank
//    only changes when unfolding reveals a longer path to it.
// 2. Long edges get one dummy per rank they pass, so they run in columns that
//    cards keep clear of.
// 3. Order: seeded from the previous layout's positions, then barycenter
//    sweeps with transposition (order.ts), kept only on a strict gain.
// 4. x: the quadratic objective with anchors to the previous positions and a
//    strong pin on the card being unfolded (coords.ts); then a rigid shift so
//    the pinned card does not move.
// 5. y: rows top-aligned, each as tall as its tallest card; each gap as tall
//    as its connector tracks need (router.ts plans the tracks).
//
// Structure after the Sugiyama method as d3-dag implements it
// (https://github.com/erikbrinkman/d3-dag, Copyright (c) 2018 Erik Brinkman,
// MIT licence): src/sugiyama/layering/longest-path.ts (forward pass only, here)
// and src/sugiyama/sugify.ts (dummy chains, layer heights). Changed: written
// for a rooted, goal-first view with stable re-layout.

import { assignX } from "./coords";
import { reduceCrossings, type Adjacency } from "./order";
import { plan, type Plan } from "./router";
import type { EngineEdge, Layout, Metrics, Rect, Size } from "./types";

export interface LayoutInput {
  root: string;
  nodes: readonly string[];
  /** The skeleton edges (already reduced). */
  edges: readonly EngineEdge[];
  size(id: string): Size;
  metrics: Metrics;
  prev?: Layout | null;
  /** A card to keep in place (the one being unfolded or folded). */
  pin?: string | null;
}

export const ANCHOR = 0.03;
export const PIN = 500;
/** Extra space between a consumer's auxiliary inputs (assumptions, Lean correspondences) and its supports. */
export const AUX_GAP = 28;

const isDummyKey = (id: string) => id.startsWith("§");

export function computeRanks(root: string, nodes: readonly string[], edges: readonly EngineEdge[]): Map<string, number> {
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const id of nodes) {
    indeg.set(id, 0);
    out.set(id, []);
  }
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
    out.get(e.from)!.push(e.to);
    indeg.set(e.to, indeg.get(e.to)! + 1);
  }
  const rank = new Map<string, number>();
  for (const id of nodes) rank.set(id, 0);
  const queue = nodes.filter((id) => indeg.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of out.get(id)!) {
      rank.set(to, Math.max(rank.get(to)!, rank.get(id)! + 1));
      indeg.set(to, indeg.get(to)! - 1);
      if (indeg.get(to) === 0) queue.push(to);
    }
  }
  // The root always sits alone on top.
  const r0 = rank.get(root) ?? 0;
  if (r0 !== 0) for (const [id, r] of rank) rank.set(id, r - r0);
  for (const [id, r] of rank) if (id !== root && r <= 0) rank.set(id, 1);
  return rank;
}

export function layoutTree(input: LayoutInput): { layout: Layout; plan: Plan } {
  const { root, nodes, edges, metrics, prev, pin } = input;
  const rank = computeRanks(root, nodes, edges);
  const depth = Math.max(0, ...rank.values());

  // Dummies and the segment graph.
  const up: Adjacency = new Map();
  const down: Adjacency = new Map();
  const link = (a: string, b: string) => {
    const w = isDummyKey(a) && isDummyKey(b) ? 2 : 1;
    if (!down.has(a)) down.set(a, []);
    if (!up.has(b)) up.set(b, []);
    down.get(a)!.push({ id: b, w });
    up.get(b)!.push({ id: a, w });
  };
  const chains = new Map<string, string[]>();
  const dummyEdge = new Map<string, string>();
  const dummyRank = new Map<string, number>();
  for (const e of edges) {
    const a = rank.get(e.from)!;
    const b = rank.get(e.to)!;
    const chain: string[] = [];
    for (let r = a + 1; r < b; r++) {
      const key = `§${e.key}#${r}`;
      chain.push(key);
      dummyEdge.set(key, e.key);
      dummyRank.set(key, r);
    }
    chains.set(e.key, chain);
    const path = [e.from, ...chain, e.to];
    for (let i = 0; i + 1 < path.length; i++) link(path[i], path[i + 1]);
  }

  // Auxiliary inputs: cards reached only by assumption or Lean-correspondence edges.
  // Among a consumer's new inputs they are seeded first, so they read as their own group.
  const viaSupport = new Set<string>();
  const viaAux = new Set<string>();
  for (const e of edges) (e.kind === "supports" ? viaSupport : viaAux).add(e.to);
  const isAux = (id: string) => viaAux.has(id) && !viaSupport.has(id);

  // Seed positions: the previous layout where known, else from neighbours above.
  const prevX = new Map<string, number>();
  if (prev) {
    for (const [id, b] of prev.boxes) prevX.set(id, b.x + b.w / 2);
    for (const [key, d] of prev.dummies) prevX.set(key, d.x);
  }
  const layers: string[][] = Array.from({ length: depth + 1 }, () => []);
  for (const id of nodes) layers[rank.get(id)!].push(id);
  for (const [key, r] of dummyRank) layers[r].push(key);

  // A depth-first index from the root gives a tree-like first order and tie-breaks.
  const dfs = new Map<string, number>();
  {
    const stack = [root];
    const kids = new Map<string, string[]>();
    for (const e of edges) {
      const first = chains.get(e.key)![0] ?? e.to;
      if (!kids.has(e.from)) kids.set(e.from, []);
      kids.get(e.from)!.push(first);
    }
    for (const [key] of dummyRank) {
      const next = down.get(key)?.[0]?.id;
      if (next) kids.set(key, [next]);
    }
    while (stack.length) {
      const id = stack.pop()!;
      if (dfs.has(id)) continue;
      dfs.set(id, dfs.size);
      const list = kids.get(id) ?? [];
      for (let i = list.length - 1; i >= 0; i--) if (!dfs.has(list[i])) stack.push(list[i]);
    }
  }
  const seedX = new Map<string, number>();
  const unit = 120;
  for (let r = 0; r <= depth; r++) {
    const fresh: string[] = [];
    for (const id of layers[r]) {
      if (prevX.has(id)) seedX.set(id, prevX.get(id)!);
      else fresh.push(id);
    }
    fresh.sort((a, b) => Number(isAux(b)) - Number(isAux(a)) || (dfs.get(a) ?? 0) - (dfs.get(b) ?? 0));
    // New members: under the mean of their neighbours above, spread by sibling order.
    const byParent = new Map<string, string[]>();
    for (const id of fresh) {
      const ups = (up.get(id) ?? []).map((n) => n.id).filter((p) => seedX.has(p));
      if (!ups.length) {
        seedX.set(id, prev ? Infinity : (dfs.get(id) ?? 0) * unit);
        continue;
      }
      const mean = ups.reduce((s, p) => s + seedX.get(p)!, 0) / ups.length;
      seedX.set(id, mean);
      const k = ups.slice().sort().join("|");
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(id);
    }
    for (const group of byParent.values()) {
      group.forEach((id, i) => seedX.set(id, seedX.get(id)! + (i - (group.length - 1) / 2) * unit * 0.5));
    }
    for (const id of fresh) if (seedX.get(id) === Infinity) seedX.set(id, Math.max(0, ...[...seedX.values()].filter(Number.isFinite)) + unit);
    layers[r].sort((a, b) => seedX.get(a)! - seedX.get(b)! || (dfs.get(a) ?? 0) - (dfs.get(b) ?? 0));
  }
  const seedLayers = layers.map((l) => [...l]);
  const ordered = reduceCrossings(layers, up, down);

  // Coordinates.
  const width = (id: string) => (isDummyKey(id) ? 0 : input.size(id).w);
  const segments: [string, string][] = [];
  for (const [a, list] of down) for (const n of list) segments.push([a, n.id]);
  const bends: [string, string, string][] = [];
  for (const key of dummyRank.keys()) bends.push([up.get(key)![0].id, key, down.get(key)![0].id]);
  const anchors = new Map<string, { x0: number; lambda: number }>();
  for (const [id, x0] of prevX) anchors.set(id, { x0, lambda: ANCHOR });
  if (pin && prevX.has(pin)) anchors.set(pin, { x0: prevX.get(pin)!, lambda: PIN });
  // Start each member at its seed but in the new order, so the solver starts feasible-ish.
  const start = new Map<string, number>();
  for (const layer of ordered.layers) {
    const xs = layer.map((id) => seedX.get(id)!).sort((a, b) => a - b);
    layer.forEach((id, i) => start.set(id, xs[i]));
  }
  const shareParent = (a: string, b: string) => {
    const above = new Set((up.get(a) ?? []).map((n) => n.id));
    return (up.get(b) ?? []).some((n) => above.has(n.id));
  };
  const extraGap = (left: string, right: string) => (isAux(left) && !isDummyKey(right) && !isAux(right) && shareParent(left, right) ? AUX_GAP * (metrics.sepCard / 28) : 0);
  const xs = assignX({
    layers: ordered.layers,
    width,
    isDummy: isDummyKey,
    segments,
    bends,
    sepCard: metrics.sepCard,
    sepDummy: metrics.sepDummy,
    extraGap,
    start,
    anchors,
  });

  // Long edges run as one straight vertical where their layers allow it (a
  // Brandes–Köpf style alignment of each dummy chain): the quadratic objective
  // leaves small sideways steps between dummies, which read as needless jogs.
  {
    const at = new Map<string, { layer: number; i: number }>();
    ordered.layers.forEach((layer, li) => layer.forEach((id, i) => at.set(id, { layer: li, i })));
    const sep = (a: string, b: string) => (width(a) + width(b)) / 2 + (isDummyKey(a) || isDummyKey(b) ? metrics.sepDummy : metrics.sepCard) + extraGap(a, b);
    const fits = (id: string, x: number) => {
      const { layer, i } = at.get(id)!;
      const row = ordered.layers[layer];
      const left = row[i - 1];
      const right = row[i + 1];
      if (left !== undefined && x - xs.get(left)! < sep(left, id) - 0.01) return false;
      if (right !== undefined && xs.get(right)! - x < sep(id, right) - 0.01) return false;
      return true;
    };
    for (let pass = 0; pass < 2; pass++)
      for (const [key, chain] of chains) {
        if (!chain.length) continue;
        const e = edges.find((x) => x.key === key)!;
        const xsNow = chain.map((d) => xs.get(d)!);
        if (Math.max(...xsNow) - Math.min(...xsNow) < 0.5 && Math.abs(xsNow[xsNow.length - 1] - xs.get(e.to)!) < 0.5) continue;
        // Prefer straight into the prerequisite, then into the consumer, then any of its own columns.
        const candidates = [xs.get(e.to)!, xs.get(e.from)!, ...xsNow];
        let best: number | null = null;
        let cost = Infinity;
        for (const x of candidates) {
          if (!chain.every((d) => fits(d, x))) continue;
          const c = chain.reduce((sum, d) => sum + Math.abs(xs.get(d)! - x), 0) + (x === candidates[0] ? 0 : 0.5);
          if (c < cost) [cost, best] = [c, x];
        }
        if (best !== null) for (const d of chain) xs.set(d, best);
      }
  }

  // Rigid shift: the pinned card (else the root) stays where it was.
  const keep = pin && prev?.boxes.has(pin) && rank.has(pin) ? pin : prev?.boxes.has(root) ? root : null;
  let dx = 0;
  if (keep) dx = prevX.get(keep)! - xs.get(keep)!;
  else {
    let left = Infinity;
    for (const layer of ordered.layers) if (layer.length) left = Math.min(left, xs.get(layer[0])! - width(layer[0]) / 2);
    dx = -left;
  }

  const boxes = new Map<string, Rect>();
  for (const id of nodes) {
    const s = input.size(id);
    boxes.set(id, { x: xs.get(id)! + dx - s.w / 2, y: 0, w: s.w, h: s.h });
  }
  const dummies = new Map<string, { key: string; edge: string; rank: number; x: number }>();
  for (const [key, r] of dummyRank) dummies.set(key, { key, edge: dummyEdge.get(key)!, rank: r, x: xs.get(key)! + dx });

  const rowHeight = ordered.layers.map((layer) => Math.max(0, ...layer.filter((id) => !isDummyKey(id)).map((id) => input.size(id).h)));
  const layout: Layout = {
    root,
    metrics,
    edges: [...edges],
    rank,
    layers: ordered.layers,
    boxes,
    dummies,
    chains,
    rowTop: [],
    rowHeight,
    gap: rowHeight.map(() => metrics.gapMin),
    crossings: ordered.crossings,
    seedCrossings: ordered.seedCrossings,
    seedLayers,
  };
  const p = plan(layout);
  layout.gap = rowHeight.map((_, r) => gapFor(p.trackCount[r] ?? 0, metrics));
  let y = 0;
  layout.rowTop = rowHeight.map((h, r) => {
    const top = y;
    y += h + layout.gap[r];
    return top;
  });
  let dy = 0;
  if (keep && prev) {
    const before = prev.boxes.get(keep)!;
    dy = before.y - layout.rowTop[rank.get(keep)!];
  }
  layout.rowTop = layout.rowTop.map((t) => t + dy);
  for (const [id, b] of boxes) b.y = layout.rowTop[rank.get(id)!];
  return { layout, plan: p };
}

export function gapFor(tracks: number, m: Metrics): number {
  return Math.max(m.gapMin, m.padTop + m.padBottom + Math.max(0, tracks - 1) * m.trackSp + m.radius);
}

export function layoutBounds(layout: Layout): { x0: number; y0: number; x1: number; y1: number } {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of layout.boxes.values()) {
    b.x0 = Math.min(b.x0, r.x);
    b.y0 = Math.min(b.y0, r.y);
    b.x1 = Math.max(b.x1, r.x + r.w);
    b.y1 = Math.max(b.y1, r.y + r.h);
  }
  for (const d of layout.dummies.values()) {
    b.x0 = Math.min(b.x0, d.x);
    b.x1 = Math.max(b.x1, d.x);
  }
  return b;
}
