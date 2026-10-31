// One clock for every moving part of the map: cards, connectors and camera
// share a duration (--t-unfold) and the --ease-move curve,
// cubic-bezier(0.45, 0, 0.2, 1). A camera correction on its own uses --t-camera.

import type { Rect } from "./types";

export const MOVE_MS = 360;
export const CAMERA_MS = 320;
/** A whole route lights within this budget (--t-trace). */
export const TRACE_MS = 520;

/** A CSS cubic-bezier timing function as a function of progress. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dsx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - t;
      const d = dsx(u);
      if (Math.abs(e) < 1e-6) break;
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (u < 0 || u > 1 || Math.abs(sx(u) - t) > 1e-4) {
      let lo = 0;
      let hi = 1;
      u = t;
      for (let i = 0; i < 30; i++) {
        if (sx(u) < t) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return sy(u);
  };
}

export const easeMove = cubicBezier(0.45, 0, 0.2, 1);
export const easeOut = cubicBezier(0.16, 1, 0.3, 1);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: b.w, h: b.h };
}
