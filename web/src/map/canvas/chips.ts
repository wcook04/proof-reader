// Edge chips: which drawn cards lie beyond each edge of the view, counted from
// the layout, and the pan that brings them in. A card that is cut by the edge
// counts toward the side it runs furthest past.

import type { View, Viewport } from "../engine/camera";
import type { Rect } from "../engine/types";

export type Side = "left" | "right" | "up" | "down";
export const SIDES: Side[] = ["left", "right", "up", "down"];

export type Beyond = Record<Side, string[]>;

export function beyond(boxes: Iterable<[string, Rect]>, view: View, vp: Viewport, slack = 2): Beyond {
  const out: Beyond = { left: [], right: [], up: [], down: [] };
  const L = vp.insets.left;
  const R = vp.width - vp.insets.right;
  const T = vp.insets.top;
  const B = vp.height - vp.insets.bottom;
  for (const [id, r] of boxes) {
    const x0 = r.x * view.k + view.x;
    const x1 = (r.x + r.w) * view.k + view.x;
    const y0 = r.y * view.k + view.y;
    const y1 = (r.y + r.h) * view.k + view.y;
    const over: [Side, number][] = [
      ["left", L - x0],
      ["right", x1 - R],
      ["up", T - y0],
      ["down", y1 - B],
    ];
    let best: [Side, number] | null = null;
    for (const o of over) if (o[1] > slack && (!best || o[1] > best[1])) best = o;
    if (best) out[best[0]].push(id);
  }
  return out;
}

export function sameBeyond(a: Beyond, b: Beyond): boolean {
  return SIDES.every((s) => a[s].length === b[s].length && a[s].every((id, i) => b[s][i] === id));
}

/** Where a chip sits along its edge: level with (or above) the records it counts, kept inside the view. */
export function chipAt(side: Side, ids: readonly string[], boxes: ReadonlyMap<string, Rect>, view: View, vp: Viewport, margin = 28): number {
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    const r = boxes.get(id);
    if (!r) continue;
    sum += side === "left" || side === "right" ? (r.y + r.h / 2) * view.k + view.y : (r.x + r.w / 2) * view.k + view.x;
    n++;
  }
  const horizontal = side === "left" || side === "right";
  const lo = horizontal ? vp.insets.top + margin : vp.insets.left + 70;
  const hi = horizontal ? vp.height - vp.insets.bottom - margin : vp.width - vp.insets.right - 70;
  const mid = (lo + hi) / 2;
  return Math.round(Math.max(lo, Math.min(hi, n ? sum / n : mid)));
}

/** The view after panning toward `side` far enough to bring those cards in, without pushing any of them out the other way. */
export function panToward(side: Side, ids: readonly string[], boxes: ReadonlyMap<string, Rect>, view: View, vp: Viewport, margin = 8): View {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const r = boxes.get(id);
    if (!r) continue;
    x0 = Math.min(x0, r.x * view.k + view.x);
    x1 = Math.max(x1, (r.x + r.w) * view.k + view.x);
    y0 = Math.min(y0, r.y * view.k + view.y);
    y1 = Math.max(y1, (r.y + r.h) * view.k + view.y);
  }
  if (!Number.isFinite(x0)) return view;
  const L = vp.insets.left + margin;
  const R = vp.width - vp.insets.right - margin;
  const T = vp.insets.top + margin;
  const B = vp.height - vp.insets.bottom - margin;
  const shift = (need: number, cap: number) => Math.max(0, Math.min(need, Math.max(cap, 0)));
  if (side === "right") return { ...view, x: view.x - shift(x1 - R, x0 - L) };
  if (side === "left") return { ...view, x: view.x + shift(L - x0, R - x1) };
  if (side === "down") return { ...view, y: view.y - shift(y1 - B, y0 - T) };
  return { ...view, y: view.y + shift(T - y0, B - y1) };
}

export function chipText(side: Side, n: number): string {
  const words = `${n} ${n === 1 ? "record" : "records"}`;
  if (side === "left") return `◂ ${words}`;
  if (side === "right") return `${words} ▸`;
  if (side === "up") return `▴ ${words}`;
  return `${words} ▾`;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cards on screen, for keeping screen-space controls off them. */
export function screenRects(boxes: Iterable<Rect>, view: View, margin = 6): ScreenRect[] {
  const out: ScreenRect[] = [];
  for (const r of boxes) out.push({ x0: r.x * view.k + view.x - margin, y0: r.y * view.k + view.y - margin, x1: (r.x + r.w) * view.k + view.x + margin, y1: (r.y + r.h) * view.k + view.y + margin });
  return out;
}

const hits = (a: ScreenRect, rects: readonly ScreenRect[]) => rects.some((r) => a.x0 < r.x1 && a.x1 > r.x0 && a.y0 < r.y1 && a.y1 > r.y0);

/**
 * The free position nearest `want` along a line, for a box of size w × h:
 * along y when `axis` is "y" (x0 fixed), along x otherwise (y0 fixed).
 * Null when every position within [lo, hi] would cover a card.
 */
export function freeSpot(axis: "x" | "y", fixed: number, want: number, w: number, h: number, lo: number, hi: number, rects: readonly ScreenRect[], step = 12): number | null {
  const box = (at: number): ScreenRect => (axis === "y" ? { x0: fixed, x1: fixed + w, y0: at - h / 2, y1: at + h / 2 } : { x0: at - w / 2, x1: at + w / 2, y0: fixed, y1: fixed + h });
  const span = axis === "y" ? h / 2 : w / 2;
  const min = lo + span;
  const max = hi - span;
  if (max < min) return null;
  const start = Math.max(min, Math.min(max, want));
  for (let d = 0; d <= max - min + step; d += step) {
    for (const at of d ? [start - d, start + d] : [start]) {
      if (at < min || at > max) continue;
      if (!hits(box(at), rects)) return Math.round(at);
    }
  }
  return null;
}
