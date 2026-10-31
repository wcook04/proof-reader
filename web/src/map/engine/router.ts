// Orthogonal connectors with rounded corners, in two steps:
//
// plan(layout), once per layout: which side and port of each card each
// connector uses (as a fraction of the card's width, so it moves with the
// card), which connectors join a parent's fan-in bus, and which horizontal
// track each connector takes in each gap between ranks.
//
// route(plan, frame), every animation frame: the actual points from the
// current (interpolated) card rectangles. Corners use min(r, leg / 2), so a
// horizontal run that shrinks to nothing becomes a straight line smoothly.
//
// Arrows follow the blueprint convention: a connector runs from a
// prerequisite up into the result whose argument uses it. All `supports` connectors
// into one result join a single bus in the gap below it: each rises from its
// own port, turns onto the bus's track and the bus rises as one stem into the
// result, ending in one arrowhead. `assumes` and `formalizes` connectors run
// on their own.
//
// The track order follows MSAGL's order-then-assign split for nudging
// parallel segments (https://github.com/microsoft/msagljs, Copyright (c)
// Microsoft Corporation, MIT licence: routing/nudging/CombinatorialNudger.ts,
// Nudger.ts), reduced here to a pairwise crossing preference with a left-edge
// fallback; no code is copied. The rounded corner is adapted from xyflow
// (https://github.com/xyflow/xyflow, Copyright (c) 2019-2025 webkid GmbH, MIT
// licence): packages/system/src/utils/edges/smoothstep-edge.ts, getBend and the
// collinear-point drop in getPoints. Changed: any number of points, corners
// sized by both legs, numbers rounded for the DOM. The arrowhead triangle
// follows getArrowheadPoints in msagljs modules/renderer-svg/src/svgCreator.ts,
// with a wider angle.

import { spacedWithin } from "./pav";
import type { EngineEdge, Layout, Metrics, Rect } from "./types";

export interface PlanEdge {
  key: string;
  kind: EngineEdge["kind"];
  from: string;
  to: string;
  /** Joins the consumer's fan-in bus. */
  bus: boolean;
  arrow: boolean;
  /** Port on the prerequisite's top edge, as a fraction of its width. */
  childPort: number;
  /** Port on the consumer's bottom edge (the bus stem for bus edges). */
  parentPort: number;
  rankFrom: number;
  rankTo: number;
  chain: string[];
  /** Track per gap, indexed by gap - rankFrom; null runs straight. */
  tracks: (number | null)[];
}

export interface PlanBus {
  parent: string;
  edges: string[];
  stem: number;
  rank: number;
  track: number | null;
}

export interface Plan {
  metrics: Metrics;
  edges: Map<string, PlanEdge>;
  buses: Map<string, PlanBus>;
  rank: Map<string, number>;
  /** Card ids per rank. */
  rows: string[][];
  trackCount: number[];
  /** Gaps whose lane preferences formed a cycle, so one preference had to give way. */
  brokenChannels: number[];
}

const EPS = 0.75;
/** Two parallel runs of different lines closer than this read as one line. */
const NEAR = 4;
/** A sideways step shorter than this reads as a jog, not a route. */
const JOG = 24;
/** How close to a card's corner a straight connection may meet it. */
const SNAP_INSET = 6;

interface Obj {
  id: string;
  top: number[];
  bottom: number[];
  l: number;
  r: number;
  track: number;
  /** The consumer this run turns up into, when it is the run's last gap. */
  parent?: string;
  /** An assumption or Lean correspondence entering its consumer (not a support bus). */
  aux?: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function plan(layout: Layout): Plan {
  const m = layout.metrics;
  const { boxes, dummies, rank } = layout;
  const dx = (key: string) => dummies.get(key)!.x;
  const edges = new Map<string, PlanEdge>();
  const buses = new Map<string, PlanBus>();

  for (const e of layout.edges) {
    const bus = e.kind === "supports";
    edges.set(e.key, {
      key: e.key,
      kind: e.kind,
      from: e.from,
      to: e.to,
      bus,
      arrow: e.kind !== "formalizes",
      childPort: 0.5,
      parentPort: 0.5,
      rankFrom: rank.get(e.from)!,
      rankTo: rank.get(e.to)!,
      chain: layout.chains.get(e.key) ?? [],
      tracks: [],
    });
    if (bus) {
      if (!buses.has(e.from)) buses.set(e.from, { parent: e.from, edges: [], stem: 0.5, rank: rank.get(e.from)!, track: null });
      buses.get(e.from)!.edges.push(e.key);
    }
  }

  // ---- Ports -------------------------------------------------------------------------
  const cx = (id: string) => boxes.get(id)!.x + boxes.get(id)!.w / 2;
  const topX = new Map<string, number>(); // edge key -> x on the prerequisite's top
  const botX = new Map<string, number>(); // edge key (non-bus) or "bus:" + parent -> x on the consumer's bottom
  for (const pe of edges.values()) {
    topX.set(pe.key, cx(pe.to));
    if (!pe.bus) botX.set(pe.key, cx(pe.from));
  }
  for (const b of buses.values()) botX.set(`bus:${b.parent}`, cx(b.parent));

  const tops = new Map<string, string[]>();
  const bottoms = new Map<string, string[]>();
  for (const pe of edges.values()) {
    if (!tops.has(pe.to)) tops.set(pe.to, []);
    tops.get(pe.to)!.push(pe.key);
    const bk = pe.bus ? `bus:${pe.from}` : pe.key;
    if (!bottoms.has(pe.from)) bottoms.set(pe.from, []);
    if (!bottoms.get(pe.from)!.includes(bk)) bottoms.get(pe.from)!.push(bk);
  }
  const upX = (pe: PlanEdge) => (pe.chain.length ? dx(pe.chain[pe.chain.length - 1]) : botX.get(pe.bus ? `bus:${pe.from}` : pe.key)!);
  const downX = (pe: PlanEdge) => (pe.chain.length ? dx(pe.chain[0]) : topX.get(pe.key)!);
  const resolve = (card: string, keys: string[], desired: (k: string) => number, into: Map<string, number>, auxFirst = false) => {
    const box = boxes.get(card)!;
    const list = keys.map((k) => ({ k, x: desired(k) })).sort((a, b) => a.x - b.x || (a.k < b.k ? -1 : 1));
    // Into a consumer, each assumption and Lean correspondence has its own port
    // left of the support bus's, ordered like their cards.
    if (auxFirst) list.sort((a, b) => Number(a.k.startsWith("bus:")) - Number(b.k.startsWith("bus:")));
    const xs = spacedWithin(
      list.map((p) => p.x),
      m.portSp,
      box.x + m.inset,
      box.x + box.w - m.inset,
    );
    list.forEach((p, i) => into.set(p.k, xs[i]));
  };
  for (let round = 0; round < 3; round++) {
    for (const [card, keys] of bottoms) {
      resolve(
        card,
        keys,
        (k) => {
          if (k.startsWith("bus:")) {
            // The stem rises straight from one of its inputs (the one nearest the middle), so no input meets it with a short sideways step.
            const all = buses.get(card)!.edges.map((ek) => downX(edges.get(ek)!));
            const box = boxes.get(card)!;
            const inside = all.filter((x) => x >= box.x + m.inset && x <= box.x + box.w - m.inset);
            const mid = median(all);
            const xs = inside.length ? inside : all;
            return xs.reduce((b, x) => (Math.abs(x - mid) < Math.abs(b - mid) - 0.01 ? x : b), xs[0]);
          }
          return downX(edges.get(k)!);
        },
        botX,
        true,
      );
    }
    for (const [card, keys] of tops) resolve(card, keys, (k) => upX(edges.get(k)!), topX);
  }
  const setPorts = () => {
  for (const pe of edges.values()) {
    const child = boxes.get(pe.to)!;
    const parent = boxes.get(pe.from)!;
    pe.childPort = (topX.get(pe.key)! - child.x) / child.w;
    pe.parentPort = ((pe.bus ? botX.get(`bus:${pe.from}`)! : botX.get(pe.key)!) - parent.x) / parent.w;
  }
  for (const b of buses.values()) {
    const parent = boxes.get(b.parent)!;
    b.stem = (botX.get(`bus:${b.parent}`)! - parent.x) / parent.w;
  }
  };
  setPorts();

  // ---- Straight where nearly straight ----------------------------------------------
  // A connection whose two ends lie less than JOG apart would make a short sideways
  // step. Where both cards (with a slimmer inset) and their other ports allow it, the
  // two ends meet at one x instead.
  const canPlace = (map: Map<string, number>, key: string, card: string, x: number): boolean => {
    const box = boxes.get(card)!;
    if (x < box.x + SNAP_INSET - 0.01 || x > box.x + box.w - SNAP_INSET + 0.01) return false;
    const cur = map.get(key)!;
    for (const k of (map === topX ? tops.get(card) : bottoms.get(card)) ?? []) {
      if (k === key) continue;
      const o = map.get(k)!;
      if (Math.abs(o - x) < m.portSp - 0.01 || (o - cur) * (o - x) < 0) return false;
    }
    return true;
  };
  for (const pe of edges.values()) {
    const lowKey = pe.key;
    const highKey = pe.bus ? `bus:${pe.from}` : pe.key;
    const low = topX.get(lowKey)!;
    if (pe.chain.length) {
      // Into the prerequisite from its column; out of the consumer into its column.
      const first = dx(pe.chain[pe.chain.length - 1]);
      if (Math.abs(low - first) > 0.5 && Math.abs(low - first) < JOG && canPlace(topX, lowKey, pe.to, first)) topX.set(lowKey, first);
      const top = dx(pe.chain[0]);
      const high = botX.get(highKey)!;
      if (!pe.bus && Math.abs(high - top) > 0.5 && Math.abs(high - top) < JOG && canPlace(botX, highKey, pe.from, top)) botX.set(highKey, top);
      continue;
    }
    const high = botX.get(highKey)!;
    const d = Math.abs(low - high);
    if (d < 0.5 || d >= JOG) continue;
    if (canPlace(topX, lowKey, pe.to, high)) topX.set(lowKey, high);
    else if (canPlace(botX, highKey, pe.from, low)) botX.set(highKey, low);
    else {
      // Both move to one x where the two cards overlap.
      const c = boxes.get(pe.to)!;
      const p = boxes.get(pe.from)!;
      const lo = Math.max(c.x, p.x) + SNAP_INSET;
      const hi = Math.min(c.x + c.w, p.x + p.w) - SNAP_INSET;
      const x = Math.max(lo, Math.min(hi, (low + high) / 2));
      if (lo <= hi && canPlace(topX, lowKey, pe.to, x) && canPlace(botX, highKey, pe.from, x)) {
        topX.set(lowKey, x);
        botX.set(highKey, x);
      }
    }
  }
  setPorts();

  // ---- Tracks ------------------------------------------------------------------------
  const depth = layout.layers.length;
  const perGap: Obj[][] = Array.from({ length: Math.max(0, depth - 1) }, () => []);
  const busObj = new Map<string, Obj>();
  const pieceObj = new Map<string, Obj>();
  for (const pe of edges.values()) {
    pe.tracks = new Array(pe.rankTo - pe.rankFrom).fill(null);
    let xb = topX.get(pe.key)!;
    for (let g = pe.rankTo - 1; g >= pe.rankFrom; g--) {
      const atParent = g === pe.rankFrom;
      const xt = atParent ? botX.get(pe.bus ? `bus:${pe.from}` : pe.key)! : dx(pe.chain[g - pe.rankFrom - 1]);
      if (atParent && pe.bus) {
        let o = busObj.get(pe.from);
        if (!o) {
          o = { id: `bus:${pe.from}`, top: [xt], bottom: [], l: xt, r: xt, track: -1, parent: pe.from };
          busObj.set(pe.from, o);
        }
        o.bottom.push(xb);
        o.l = Math.min(o.l, xb);
        o.r = Math.max(o.r, xb);
      } else if (Math.abs(xt - xb) > EPS) {
        const o: Obj = { id: `${pe.key}@${g}`, top: [xt], bottom: [xb], l: Math.min(xt, xb), r: Math.max(xt, xb), track: -1, parent: atParent ? pe.from : undefined, aux: atParent && !pe.bus };
        pieceObj.set(o.id, o);
        perGap[g].push(o);
      }
      xb = xt;
    }
  }
  for (const [parent, o] of busObj) if (o.r - o.l > EPS) perGap[rank.get(parent)!].push(o);

  const trackCount = new Array(depth).fill(0);
  const brokenChannels: number[] = [];
  const pad = m.radius + 2;
  const inside = (x: number, o: Obj) => x > o.l + EPS && x < o.r - EPS;
  const cost = (a: Obj, b: Obj) => {
    // a's track above b's: a's lower legs cross b's run, b's upper legs cross a's run.
    let c = 0;
    for (const x of a.bottom) if (inside(x, b)) c++;
    for (const x of b.top) if (inside(x, a)) c++;
    // And between the two tracks a's lower leg and b's upper leg both run
    // vertically: at (nearly) the same x they would lie on top of each other.
    for (const x of a.bottom) for (const y of b.top) if (Math.abs(x - y) < NEAR) c += 1000;
    return c;
  };
  /** A hard order within one consumer: its auxiliary lanes above its support bus, left port highest. */
  const fixed = (a: Obj, b: Obj): number => {
    if (!a.parent || a.parent !== b.parent || (!a.aux && !b.aux)) return 0;
    if (a.aux && !b.aux) return -1;
    if (!a.aux && b.aux) return 1;
    return a.top[0] - b.top[0];
  };
  perGap.forEach((objs, g) => {
    if (!objs.length) return;
    const n = objs.length;
    const overlap = (a: Obj, b: Obj) => a.l - pad < b.r + pad && b.l - pad < a.r + pad;
    // C[i][j]: what it costs to put i's track above j's. A greedy linear
    // ordering: repeatedly take the object whose placement above all the
    // remaining ones costs least (hard orders within a consumer cost most).
    const HARD = 1e6;
    const C: number[][] = objs.map(() => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const hard = fixed(objs[i], objs[j]);
        if (hard < 0) C[j][i] = HARD;
        else if (hard > 0) C[i][j] = HARD;
        if (!overlap(objs[i], objs[j])) continue;
        C[i][j] += cost(objs[i], objs[j]);
        C[j][i] += cost(objs[j], objs[i]);
      }
    const placed: number[] = [];
    const done = new Set<number>();
    while (placed.length < n) {
      let pick = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (done.has(i)) continue;
        let c = 0;
        for (let j = 0; j < n; j++) if (j !== i && !done.has(j)) c += C[i][j];
        if (c < best - 1e-9 || (Math.abs(c - best) < 1e-9 && objs[i].l < objs[pick].l)) {
          best = c;
          pick = i;
        }
      }
      done.add(pick);
      placed.push(pick);
    }
    // A preference placed against its cheaper direction means the preferences formed a cycle here.
    const rankOf = new Map(placed.map((i, r) => [i, r]));
    let broken = false;
    for (let i = 0; i < n && !broken; i++) for (let j = 0; j < n; j++) if (C[i][j] > C[j][i] && C[i][j] < HARD && rankOf.get(i)! < rankOf.get(j)!) broken = true;
    if (broken) brokenChannels.push(g);
    const order: Obj[] = [];
    for (const i of placed) {
      const o = objs[i];
      let t = 0;
      for (const p of order) if (overlap(p, o)) t = Math.max(t, p.track + 1);
      o.track = t;
      order.push(o);
    }
    trackCount[g] = Math.max(...objs.map((o) => o.track)) + 1;
  });
  for (const [parent, o] of busObj) buses.get(parent)!.track = o.track >= 0 ? o.track : null;
  for (const pe of edges.values()) {
    for (let g = pe.rankFrom; g < pe.rankTo; g++) {
      if (g === pe.rankFrom && pe.bus) pe.tracks[0] = buses.get(pe.from)!.track;
      else {
        const o = pieceObj.get(`${pe.key}@${g}`);
        pe.tracks[g - pe.rankFrom] = o ? o.track : null;
      }
    }
  }

  // ---- Keep verticals apart -------------------------------------------------------
  // Two different lines whose vertical legs share a stretch of a gap must not
  // run within NEAR of each other. Tracks already order the legs they can; a
  // leg that runs the whole gap (a straight drop, a stem beside a taller
  // neighbour) cannot be fixed by tracks, so the port at one end moves aside.
  interface Leg {
    line: string;
    x: number;
    /** -1: from the upper row down to track t; 1: from track t down to the lower row; 0: the whole gap. */
    part: -1 | 0 | 1;
    t: number;
    port: { map: Map<string, number>; key: string; card: string } | null;
  }
  const legsOf = (): Leg[][] => {
    const out: Leg[][] = Array.from({ length: Math.max(0, depth - 1) }, () => []);
    for (const pe of edges.values()) {
      const line = pe.bus ? `bus:${pe.from}` : pe.key;
      let xb = topX.get(pe.key)!;
      for (let g = pe.rankTo - 1; g >= pe.rankFrom; g--) {
        const atParent = g === pe.rankFrom;
        const pk = pe.bus ? `bus:${pe.from}` : pe.key;
        const xt = atParent ? botX.get(pk)! : dx(pe.chain[g - pe.rankFrom - 1]);
        const t = pe.tracks[g - pe.rankFrom] ?? 0;
        const low = g === pe.rankTo - 1 ? { map: topX, key: pe.key, card: pe.to } : null;
        const high = atParent ? { map: botX, key: pk, card: pe.from } : null;
        if (Math.abs(xt - xb) <= EPS) out[g].push({ line, x: xb, part: 0, t, port: low ?? high });
        else {
          out[g].push({ line, x: xb, part: 1, t, port: low });
          out[g].push({ line, x: xt, part: -1, t, port: high });
        }
        xb = xt;
      }
    }
    return out;
  };
  const share = (a: Leg, b: Leg) => {
    if (a.part === 0 || b.part === 0 || a.part === b.part) return true;
    const lower = a.part === 1 ? a : b;
    const upper = a.part === 1 ? b : a;
    return lower.t < upper.t;
  };
  const tryMove = (port: NonNullable<Leg["port"]>, away: number, from: number): boolean => {
    const box = boxes.get(port.card)!;
    const siblings = (port.map === topX ? tops.get(port.card) : bottoms.get(port.card)) ?? [];
    const cur = port.map.get(port.key)!;
    const target = from + Math.sign(away || 1) * (NEAR + 0.5);
    if (target < box.x + m.inset - 0.01 || target > box.x + box.w - m.inset + 0.01) return false;
    for (const k of siblings) {
      if (k === port.key) continue;
      const x = port.map.get(k)!;
      if (Math.abs(x - target) < m.portSp - 0.01) return false;
      // Never pass a neighbour: the order of ports is the order of their lines.
      if ((x - cur) * (x - target) < 0) return false;
    }
    port.map.set(port.key, target);
    return true;
  };
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const legs of legsOf()) {
      for (let i = 0; i < legs.length && !moved; i++)
        for (let j = i + 1; j < legs.length && !moved; j++) {
          const a = legs[i];
          const b = legs[j];
          if (a.line === b.line || Math.abs(a.x - b.x) >= NEAR || !share(a, b)) continue;
          moved = (!!a.port && tryMove(a.port, a.x - b.x, b.x)) || (!!b.port && tryMove(b.port, b.x - a.x, a.x));
        }
      if (moved) break;
    }
    if (!moved) break;
  }
  setPorts();

  const rows: string[][] = layout.layers.map((layer) => layer.filter((id) => !id.startsWith("§")));
  return { metrics: m, edges, buses, rank, rows, trackCount, brokenChannels };
}

// ---- Per frame ------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

export interface Frame {
  boxes: Map<string, Rect>;
  dummyX(key: string): number;
  /** Cards left out of the row extents (for example, cards still entering). */
  ignoreRows?: ReadonlySet<string>;
}

export interface RoutedEdge {
  key: string;
  points: Pt[];
  /** Where the connector meets its consumer's bus (or its midpoint in the last gap). */
  junction: Pt;
  /** The part that belongs to this edge alone (without a shared stem). */
  own: Pt[];
}

export interface RoutedBus {
  parent: string;
  stem: Pt[];
  head: Pt[];
}

export interface Routed {
  edges: Map<string, RoutedEdge>;
  buses: Map<string, RoutedBus>;
  /** Arrowheads of connectors that run on their own (assumes). */
  heads: Map<string, Pt[]>;
}

export function arrowHead(tip: Pt, length: number, angleDeg = 40): Pt[] {
  const s = length * Math.tan(((angleDeg / 2) * Math.PI) / 180);
  const base = { x: tip.x, y: tip.y + length };
  return [{ x: base.x - s, y: base.y }, tip, { x: base.x + s, y: base.y }];
}

export function route(p: Plan, frame: Frame): Routed {
  const m = p.metrics;
  const { boxes } = frame;
  const depth = p.rows.length;
  const rowTop = new Array<number>(depth);
  const rowBottom = new Array<number>(depth);
  for (let r = 0; r < depth; r++) {
    let top = Infinity;
    let bottom = -Infinity;
    let any = false;
    for (const id of p.rows[r]) {
      if (frame.ignoreRows?.has(id)) continue;
      const b = boxes.get(id);
      if (!b) continue;
      any = true;
      top = Math.min(top, b.y);
      bottom = Math.max(bottom, b.y + b.h);
    }
    if (!any)
      for (const id of p.rows[r]) {
        const b = boxes.get(id);
        if (!b) continue;
        top = Math.min(top, b.y);
        bottom = Math.max(bottom, b.y + b.h);
      }
    rowTop[r] = top;
    rowBottom[r] = bottom;
  }
  const bandMid = (g: number) => {
    const lo = rowBottom[g] + m.padTop;
    const hi = rowTop[g + 1] - m.padBottom;
    return hi >= lo ? (lo + hi) / 2 : (rowBottom[g] + rowTop[g + 1]) / 2;
  };
  const trackY = (g: number, t: number | null): number => {
    const lo = rowBottom[g] + m.padTop;
    const hi = rowTop[g + 1] - m.padBottom;
    const mid = bandMid(g);
    const T = p.trackCount[g] || 1;
    if (t === null || T <= 1) return mid;
    const sp = hi > lo ? Math.min(m.trackSp, (hi - lo) / (T - 1)) : 0;
    return mid - (sp * (T - 1)) / 2 + t * sp;
  };

  const edges = new Map<string, RoutedEdge>();
  const heads = new Map<string, Pt[]>();
  for (const pe of p.edges.values()) {
    const child = boxes.get(pe.to);
    const parent = boxes.get(pe.from);
    if (!child || !parent) continue;
    const pts: Pt[] = [{ x: child.x + pe.childPort * child.w, y: child.y }];
    let junction: Pt = pts[0];
    let ownEnd = 1;
    for (let g = pe.rankTo - 1; g >= pe.rankFrom; g--) {
      const at = pts[pts.length - 1];
      const atParent = g === pe.rankFrom;
      const want = atParent ? parent.x + pe.parentPort * parent.w : frame.dummyX(pe.chain[g - pe.rankFrom - 1]);
      const t = pe.tracks[g - pe.rankFrom];
      const turn = Math.abs(want - at.x) > 0.01;
      const xt = turn ? want : at.x;
      const ty = trackY(g, t);
      if (turn) pts.push({ x: at.x, y: ty }, { x: xt, y: ty });
      if (atParent) {
        junction = { x: at.x, y: ty };
        ownEnd = turn ? pts.length - 1 : pts.length;
        pts.push({ x: xt, y: parent.y + parent.h + (pe.arrow ? m.arrow : 0) });
      } else pts.push({ x: xt, y: rowTop[g] });
    }
    const own = pe.bus ? [...pts.slice(0, ownEnd), junction] : pts;
    edges.set(pe.key, { key: pe.key, points: pts, junction, own });
    if (!pe.bus && pe.arrow) heads.set(pe.key, arrowHead({ x: pts[pts.length - 1].x, y: parent.y + parent.h - 0.5 }, m.arrow));
  }

  const buses = new Map<string, RoutedBus>();
  for (const b of p.buses.values()) {
    const parent = boxes.get(b.parent);
    if (!parent) continue;
    const x = parent.x + b.stem * parent.w;
    const ty = b.rank + 1 < depth ? trackY(b.rank, b.track) : parent.y + parent.h + m.padTop;
    const stem = [
      { x, y: ty },
      { x, y: parent.y + parent.h + m.arrow },
    ];
    buses.set(b.parent, { parent: b.parent, stem, head: arrowHead({ x, y: parent.y + parent.h - 0.5 }, m.arrow) });
  }
  return { edges, buses, heads };
}

// ---- Path strings -----------------------------------------------------------------------

const f = (v: number) => (Math.round(v * 10) / 10).toString();

/** An orthogonal polyline with rounded corners: radius min(r, leg / 2) at each corner. */
export function roundedPath(points: readonly Pt[], r: number): string {
  const pts: Pt[] = [];
  for (const q of points) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - q.x) < 0.01 && Math.abs(last.y - q.y) < 0.01) continue;
    // Drop a point the path runs straight through; it would shrink the next corner.
    const prev = pts[pts.length - 2];
    if (prev && last && ((Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - q.x) < 0.01 && (last.y - prev.y) * (q.y - last.y) >= 0) || (Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - q.y) < 0.01 && (last.x - prev.x) * (q.x - last.x) >= 0)))
      pts.pop();
    pts.push(q);
  }
  if (pts.length < 2) return pts.length ? `M${f(pts[0].x)},${f(pts[0].y)}` : "";
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const rho = Math.min(r, ab / 2, bc / 2);
    if (rho < 0.05) {
      d += `L${f(b.x)},${f(b.y)}`;
      continue;
    }
    const p1 = { x: b.x + ((a.x - b.x) / ab) * rho, y: b.y + ((a.y - b.y) / ab) * rho };
    const p2 = { x: b.x + ((c.x - b.x) / bc) * rho, y: b.y + ((c.y - b.y) / bc) * rho };
    d += `L${f(p1.x)},${f(p1.y)}Q${f(b.x)},${f(b.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${f(z.x)},${f(z.y)}`;
}

export function polygonPath(points: readonly Pt[]): string {
  return points.map((q, i) => `${i ? "L" : "M"}${f(q.x)},${f(q.y)}`).join("") + "Z";
}

/** Sample a rounded path's polyline (corners cut by their chords) every `step` px, for tests. */
export function samplePolyline(points: readonly Pt[], step = 4): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (points.length) out.push(points[points.length - 1]);
  return out;
}
