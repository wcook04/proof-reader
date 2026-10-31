// Crossing reduction for a layered drawing: a weighted crossing counter,
// barycenter sweeps and adjacent transposition, accepting a new order only
// when it strictly reduces crossings.
//
// Adapted from two MIT-licensed projects:
// - dagre (https://github.com/dagrejs/dagre), Copyright (c) 2012-2014 Chris
//   Pettitt, MIT licence: lib/order/cross-count.ts (twoLayerCrossCount, the
//   bilayer accumulator tree of Barth et al.), lib/order/barycenter.ts and the
//   unsortable-node handling of lib/order/sort.ts. Changed: typed arrays over
//   a plain neighbour map, both sweep directions, ties broken by the previous
//   index rather than input order.
// - d3-dag (https://github.com/erikbrinkman/d3-dag), Copyright (c) 2018 Erik
//   Brinkman, MIT licence: src/sugiyama/twolayer/greedy.ts (swapChange and
//   adjacentSwap). Changed: the swap gain counts both neighbouring layers, and
//   only a strictly positive gain swaps.

export interface Nbr {
  id: string;
  w: number;
}

export type Adjacency = Map<string, Nbr[]>;

/** Weighted crossings between two neighbouring layers, O(E log V). */
export function twoLayerCrossings(north: readonly string[], south: readonly string[], down: Adjacency): number {
  const southPos = new Map<string, number>();
  south.forEach((id, i) => southPos.set(id, i));
  const entries: { pos: number; w: number }[] = [];
  for (const v of north) {
    const list = (down.get(v) ?? [])
      .filter((n) => southPos.has(n.id))
      .map((n) => ({ pos: southPos.get(n.id)!, w: n.w }))
      .sort((a, b) => a.pos - b.pos);
    for (const e of list) entries.push(e);
  }
  let first = 1;
  while (first < south.length) first <<= 1;
  const tree = new Float64Array(2 * first - 1);
  first -= 1;
  let cc = 0;
  for (const entry of entries) {
    let index = entry.pos + first;
    tree[index] += entry.w;
    let sum = 0;
    while (index > 0) {
      if (index % 2) sum += tree[index + 1];
      index = (index - 1) >> 1;
      tree[index] += entry.w;
    }
    cc += entry.w * sum;
  }
  return cc;
}

export function crossings(layers: readonly string[][], down: Adjacency): number {
  let cc = 0;
  for (let i = 1; i < layers.length; i++) cc += twoLayerCrossings(layers[i - 1], layers[i], down);
  return cc;
}

/** Order one layer by the barycenter of its neighbours in `ref`; nodes without neighbours keep their slot. */
function sortLayer(layer: string[], ref: readonly string[], nbrs: Adjacency): string[] {
  const pos = new Map<string, number>();
  ref.forEach((id, i) => pos.set(id, i));
  const prev = new Map<string, number>();
  layer.forEach((id, i) => prev.set(id, i));
  const sortable: { id: string; bc: number }[] = [];
  const fixed = new Set<string>();
  for (const id of layer) {
    let sum = 0;
    let weight = 0;
    for (const n of nbrs.get(id) ?? []) {
      const p = pos.get(n.id);
      if (p === undefined) continue;
      sum += p * n.w;
      weight += n.w;
    }
    if (weight > 0) sortable.push({ id, bc: sum / weight });
    else fixed.add(id);
  }
  sortable.sort((a, b) => a.bc - b.bc || prev.get(a.id)! - prev.get(b.id)!);
  const out: string[] = [];
  let k = 0;
  for (const id of layer) out.push(fixed.has(id) ? id : sortable[k++].id);
  return out;
}

/** Gain in crossings from swapping neighbours l, r (l currently left of r), against one reference layer. */
function swapGain(l: string, r: string, pos: Map<string, number>, nbrs: Adjacency): number {
  let delta = 0;
  for (const nl of nbrs.get(l) ?? []) {
    const il = pos.get(nl.id);
    if (il === undefined) continue;
    for (const nr of nbrs.get(r) ?? []) {
      const ir = pos.get(nr.id);
      if (ir === undefined) continue;
      delta += Math.sign(il - ir) * nl.w * nr.w;
    }
  }
  return delta;
}

/** Adjacent swaps with strictly positive gain, counted against both neighbouring layers. */
function transpose(layer: string[], above: readonly string[] | undefined, below: readonly string[] | undefined, up: Adjacency, down: Adjacency): void {
  const posA = new Map<string, number>();
  above?.forEach((id, i) => posA.set(id, i));
  const posB = new Map<string, number>();
  below?.forEach((id, i) => posB.set(id, i));
  const gain = (l: string, r: string) => swapGain(l, r, posA, up) + swapGain(l, r, posB, down);
  const ranges: [number, number][] = [[0, layer.length]];
  let range: [number, number] | undefined;
  let guard = 0;
  while ((range = ranges.pop()) && guard++ < 4 * layer.length * layer.length + 16) {
    const [start, end] = range;
    if (end - start < 2) continue;
    let best = 0;
    let at = -1;
    for (let i = start; i < end - 1; i++) {
      const g = gain(layer[i], layer[i + 1]);
      if (g > best) {
        best = g;
        at = i;
      }
    }
    if (at >= 0) {
      const t = layer[at];
      layer[at] = layer[at + 1];
      layer[at + 1] = t;
      ranges.push([start, at + 1], [at + 1, end]);
    }
  }
}

/**
 * Reduce crossings from a seeded order. Returns the best order found; it
 * differs from the seed only if it has strictly fewer crossings.
 */
export function reduceCrossings(seed: readonly string[][], up: Adjacency, down: Adjacency, maxPasses = 16): { layers: string[][]; crossings: number; seedCrossings: number } {
  let layers = seed.map((l) => [...l]);
  const seedCrossings = crossings(layers, down);
  let best = layers.map((l) => [...l]);
  let bestCC = seedCrossings;
  let stale = 0;
  for (let pass = 0; pass < maxPasses && bestCC > 0 && stale < 4; pass++) {
    if (pass % 2 === 0) {
      for (let i = 1; i < layers.length; i++) {
        layers[i] = sortLayer(layers[i], layers[i - 1], up);
        transpose(layers[i], layers[i - 1], layers[i + 1], up, down);
      }
    } else {
      for (let i = layers.length - 2; i >= 0; i--) {
        layers[i] = sortLayer(layers[i], layers[i + 1], down);
        transpose(layers[i], layers[i - 1], layers[i + 1], up, down);
      }
    }
    const cc = crossings(layers, down);
    if (cc < bestCC) {
      bestCC = cc;
      best = layers.map((l) => [...l]);
      stale = 0;
    } else stale++;
  }
  // A transposition pass on the best order alone, again only on strict gain.
  const polished = best.map((l) => [...l]);
  for (let i = 0; i < polished.length; i++) transpose(polished[i], polished[i - 1], polished[i + 1], up, down);
  const pcc = crossings(polished, down);
  if (pcc < bestCC) {
    best = polished;
    bestCC = pcc;
  }
  layers = best;
  return { layers, crossings: bestCC, seedCrossings };
}
