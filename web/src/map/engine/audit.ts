// Measures a routed drawing the way a reader sees it: where two different
// lines cross, and where two different lines run on top of each other. Lines
// that join the same consumer's support bus are one line for this purpose.

import type { Plan, Pt, Routed } from "./router";

export interface Segment {
  line: string;
  a: Pt;
  b: Pt;
}

/** Every straight run of every drawn line, labelled by line identity (a bus counts as one line). */
export function segments(plan: Plan, routed: Routed): Segment[] {
  const out: Segment[] = [];
  for (const re of routed.edges.values()) {
    const pe = plan.edges.get(re.key)!;
    const line = pe.bus ? `bus:${pe.from}` : re.key;
    const pts = re.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) continue;
      out.push({ line, a, b });
    }
  }
  for (const [parent, rb] of routed.buses) out.push({ line: `bus:${parent}`, a: rb.stem[0], b: rb.stem[1] });
  // A bus's shared runs (its lane, its stem) appear in each of its edges: count each once,
  // and a run contained in a longer run of the same line (a stem inside an edge's last leg) once.
  const r = (v: number) => Math.round(v * 2) / 2;
  const seen = new Set<string>();
  const unique = out.filter((s) => {
    const key = `${s.line}|${r(Math.min(s.a.x, s.b.x))},${r(Math.min(s.a.y, s.b.y))},${r(Math.max(s.a.x, s.b.x))},${r(Math.max(s.a.y, s.b.y))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const within = (s: Segment, t: Segment) =>
    s !== t && s.line === t.line && Math.abs(s.a.x - s.b.x) < 1e-6 && Math.abs(t.a.x - t.b.x) < 1e-6 && Math.abs(s.a.x - t.a.x) < 0.5 &&
    Math.min(s.a.y, s.b.y) >= Math.min(t.a.y, t.b.y) - 0.5 && Math.max(s.a.y, s.b.y) <= Math.max(t.a.y, t.b.y) + 0.5 &&
    Math.abs(s.a.y - s.b.y) < Math.abs(t.a.y - t.b.y);
  return unique.filter((s) => !unique.some((t) => within(s, t)));
}

const vertical = (s: Segment) => Math.abs(s.a.x - s.b.x) < 1e-6;
const horizontal = (s: Segment) => Math.abs(s.a.y - s.b.y) < 1e-6;

/** Pairs of different lines whose parallel runs lie closer than `tol` with overlapping extent. */
export function collinearOverlaps(segs: readonly Segment[], tol = 4, minOverlap = 0.5): { a: Segment; b: Segment }[] {
  const found: { a: Segment; b: Segment }[] = [];
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      if (s.line === t.line) continue;
      if (vertical(s) && vertical(t) && Math.abs(s.a.x - t.a.x) < tol) {
        const lo = Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y));
        const hi = Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y));
        if (hi - lo > minOverlap) found.push({ a: s, b: t });
      } else if (horizontal(s) && horizontal(t) && Math.abs(s.a.y - t.a.y) < tol) {
        const lo = Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x));
        const hi = Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x));
        if (hi - lo > minOverlap) found.push({ a: s, b: t });
      }
    }
  return found;
}

/** Proper crossings between different lines: a horizontal run of one passing strictly through a vertical run of another. */
export function lineCrossings(segs: readonly Segment[]): number {
  let n = 0;
  const hs = segs.filter(horizontal);
  const vs = segs.filter(vertical);
  for (const h of hs) {
    const x0 = Math.min(h.a.x, h.b.x);
    const x1 = Math.max(h.a.x, h.b.x);
    for (const v of vs) {
      if (v.line === h.line) continue;
      const y0 = Math.min(v.a.y, v.b.y);
      const y1 = Math.max(v.a.y, v.b.y);
      if (v.a.x > x0 + 0.5 && v.a.x < x1 - 0.5 && h.a.y > y0 + 0.5 && h.a.y < y1 - 0.5) n++;
    }
  }
  return n;
}

/** Short sideways steps: horizontal runs shorter than `min` px that a line makes on its way (bus lanes included). */
export function jogs(segs: readonly Segment[], min = 24): Segment[] {
  return segs.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-6 && Math.abs(s.a.x - s.b.x) > 0.5 && Math.abs(s.a.x - s.b.x) < min);
}
