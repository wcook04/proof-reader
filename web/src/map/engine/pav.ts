// Weighted isotonic regression by pool-adjacent-violators, and its use for a
// row of positions that must keep a minimum spacing.

/** Minimise sum a_i (y_i - z_i)^2 subject to y_1 <= y_2 <= ... (exact, O(n)). */
export function isotonic(z: readonly number[], a: readonly number[]): number[] {
  const n = z.length;
  const mean: number[] = [];
  const weight: number[] = [];
  const count: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = z[i];
    let w = a[i] > 0 ? a[i] : 1e-9;
    let c = 1;
    while (mean.length && mean[mean.length - 1] > m) {
      const pm = mean.pop()!;
      const pw = weight.pop()!;
      const pc = count.pop()!;
      m = (pm * pw + m * w) / (pw + w);
      w += pw;
      c += pc;
    }
    mean.push(m);
    weight.push(w);
    count.push(c);
  }
  const y = new Array<number>(n);
  let k = 0;
  for (let b = 0; b < mean.length; b++) for (let j = 0; j < count[b]; j++) y[k++] = mean[b];
  return y;
}

/**
 * Positions closest (weighted) to `target` that keep x_{i+1} - x_i >= sep[i]
 * (sep has n - 1 entries). Order is fixed.
 */
export function spaced(target: readonly number[], weight: readonly number[], sep: readonly number[]): number[] {
  const n = target.length;
  const offset = new Array<number>(n);
  offset[0] = 0;
  for (let i = 1; i < n; i++) offset[i] = offset[i - 1] + sep[i - 1];
  const y = isotonic(
    target.map((t, i) => t - offset[i]),
    weight,
  );
  return y.map((v, i) => v + offset[i]);
}

/** As `spaced` with equal weights and spacing, then held inside [lo, hi]. */
export function spacedWithin(target: readonly number[], sp: number, lo: number, hi: number): number[] {
  const n = target.length;
  if (!n) return [];
  if (hi - lo <= sp * (n - 1)) {
    if (n === 1) return [(lo + hi) / 2];
    return target.map((_, i) => lo + ((hi - lo) * i) / (n - 1));
  }
  const xs = spaced(
    target,
    target.map(() => 1),
    new Array(Math.max(0, n - 1)).fill(sp),
  );
  return xs.map((x, i) => Math.min(hi - (n - 1 - i) * sp, Math.max(lo + i * sp, x)));
}
