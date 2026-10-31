// Horizontal coordinates for a layered drawing with a fixed order.
//
// The objective is d3-dag's quadratic one: keep each edge segment vertical
// and keep long edges straight through their dummy nodes. It is solved here
// without a QP library, by block-coordinate descent: with the other layers
// held, one layer's problem is diagonal with ordering constraints, which a
// weighted pool-adjacent-violators pass solves exactly.
//
// Adapted from d3-dag (https://github.com/erikbrinkman/d3-dag), Copyright (c)
// 2018 Erik Brinkman, MIT licence: src/sugiyama/coord/utils.ts (minDist,
// minBend) and src/sugiyama/coord/quad.ts (how the objective is assembled).
// Changed: a sparse matrix, a dependency-free solver in place of quadprog,
// anchor and pin terms towards previous positions, and fixed weights for
// dummy-dummy, dummy-card and card-card segments.

import { spaced } from "./pav";

export interface CoordInput {
  layers: readonly string[][];
  /** Width of each member (0 for dummies). */
  width(id: string): number;
  isDummy(id: string): boolean;
  /** Pairs (upper, lower) of members in neighbouring layers joined by an edge segment. */
  segments: readonly [string, string][];
  /** Triples (upper, dummy, lower) along long edges. */
  bends: readonly [string, string, string][];
  sepCard: number;
  sepDummy: number;
  /** Extra separation between two neighbouring members, beyond the gap their kinds need. */
  extraGap?(left: string, right: string): number;
  /** Starting positions (centres). */
  start: Map<string, number>;
  /** Anchor targets and strengths: lambda (x - x0)^2. */
  anchors: Map<string, { x0: number; lambda: number }>;
}

class Sym {
  diag: Float64Array;
  off: Map<number, number>[];
  lin: Float64Array;
  constructor(n: number) {
    this.diag = new Float64Array(n);
    this.off = Array.from({ length: n }, () => new Map<number, number>());
    this.lin = new Float64Array(n);
  }
  add(i: number, j: number, v: number): void {
    if (i === j) this.diag[i] += v;
    else this.off[i].set(j, (this.off[i].get(j) ?? 0) + v);
  }
}

/** coef * (x_p - x_c)^2 */
function minDist(Q: Sym, p: number, c: number, coef: number): void {
  Q.add(c, c, coef);
  Q.add(c, p, -coef);
  Q.add(p, c, -coef);
  Q.add(p, p, coef);
}

/** (pcoef (x_p - x_n) + ccoef (x_c - x_n))^2 */
function minBend(Q: Sym, p: number, n: number, c: number, pcoef: number, ccoef: number): void {
  const ncoef = pcoef + ccoef;
  Q.add(c, c, ccoef * ccoef);
  Q.add(c, n, -ccoef * ncoef);
  Q.add(c, p, ccoef * pcoef);
  Q.add(n, c, -ncoef * ccoef);
  Q.add(n, n, ncoef * ncoef);
  Q.add(n, p, -ncoef * pcoef);
  Q.add(p, c, pcoef * ccoef);
  Q.add(p, n, -pcoef * ncoef);
  Q.add(p, p, pcoef * pcoef);
}

export const WEIGHT = { dummyDummy: 8, dummyCard: 2, cardCard: 1, bend: 1 };

export function assignX(input: CoordInput): Map<string, number> {
  const index = new Map<string, number>();
  const ids: string[] = [];
  for (const layer of input.layers)
    for (const id of layer) {
      index.set(id, ids.length);
      ids.push(id);
    }
  const n = ids.length;
  const Q = new Sym(n);
  for (const [u, v] of input.segments) {
    const du = input.isDummy(u);
    const dv = input.isDummy(v);
    const w = du && dv ? WEIGHT.dummyDummy : du || dv ? WEIGHT.dummyCard : WEIGHT.cardCard;
    minDist(Q, index.get(u)!, index.get(v)!, w);
  }
  for (const [p, d, c] of input.bends) minBend(Q, index.get(p)!, index.get(d)!, index.get(c)!, WEIGHT.bend, WEIGHT.bend);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = input.start.get(ids[i]) ?? 0;
    x[i] = s;
    // A faint pull to the start keeps the problem well posed.
    Q.diag[i] += 1e-4;
    Q.lin[i] += -2e-4 * s;
  }
  for (const [id, { x0, lambda }] of input.anchors) {
    const i = index.get(id);
    if (i === undefined) continue;
    Q.diag[i] += lambda;
    Q.lin[i] += -2 * lambda * x0;
  }

  const seps = input.layers.map((layer) =>
    layer.slice(1).map((id, k) => {
      const prev = layer[k];
      const gap = input.isDummy(prev) || input.isDummy(id) ? input.sepDummy : input.sepCard;
      return (input.width(prev) + input.width(id)) / 2 + gap + (input.extraGap?.(prev, id) ?? 0);
    }),
  );
  const layerIdx = input.layers.map((layer) => layer.map((id) => index.get(id)!));

  const solveLayer = (li: number): number => {
    const idx = layerIdx[li];
    if (!idx.length) return 0;
    const target: number[] = [];
    const weight: number[] = [];
    for (const i of idx) {
      let b = Q.lin[i];
      for (const [j, q] of Q.off[i]) b += 2 * q * x[j];
      const a = Q.diag[i];
      target.push(-b / (2 * a));
      weight.push(a);
    }
    const next = spaced(target, weight, seps[li]);
    let moved = 0;
    idx.forEach((i, k) => {
      moved = Math.max(moved, Math.abs(next[k] - x[i]));
      x[i] = next[k];
    });
    return moved;
  };

  // Make the start feasible, then sweep down and up until nothing moves.
  for (let li = 0; li < layerIdx.length; li++) {
    const idx = layerIdx[li];
    const next = spaced(
      idx.map((i) => x[i]),
      idx.map(() => 1),
      seps[li],
    );
    idx.forEach((i, k) => (x[i] = next[k]));
  }
  for (let sweep = 0; sweep < 600; sweep++) {
    let moved = 0;
    if (sweep % 2 === 0) for (let li = 0; li < layerIdx.length; li++) moved = Math.max(moved, solveLayer(li));
    else for (let li = layerIdx.length - 1; li >= 0; li--) moved = Math.max(moved, solveLayer(li));
    if (moved < 0.02) break;
  }
  const out = new Map<string, number>();
  ids.forEach((id, i) => out.set(id, x[i]));
  return out;
}
