// Lighting a route: each lit relation's reveal starts when the route reaches
// its rank. "rests" spreads down from the selected record to the foundations;
// "uses" spreads up from it to the goal. The whole route lights within
// --t-trace; nothing loops.

import { TRACE_MS } from "../engine/motion";

export interface Reveal {
  delay: number;
  dur: number;
  /** The connector's points run from the prerequisite up to the consumer; reveal from that end ("start") or the other. */
  from: "start" | "end";
}

export function traceTiming(
  edges: readonly { key: string; from: string; to: string }[],
  rank: ReadonlyMap<string, number>,
  selected: string,
  trace: "rests" | "uses",
  budget = TRACE_MS,
): Map<string, Reveal> {
  const out = new Map<string, Reveal>();
  if (!edges.length) return out;
  const r0 = rank.get(selected) ?? 0;
  // How many ranks from the selection each relation's near end lies.
  const level = (e: { from: string; to: string }) => (trace === "rests" ? (rank.get(e.from) ?? r0) - r0 : r0 - (rank.get(e.to) ?? r0));
  const levels = Math.max(0, ...edges.map(level)) + 1;
  const dur = Math.min(240, budget / Math.max(1, Math.min(levels, 2)));
  const stagger = levels > 1 ? Math.min(140, (budget - dur) / (levels - 1)) : 0;
  for (const e of edges) out.set(e.key, { delay: Math.max(0, level(e)) * stagger, dur, from: trace === "rests" ? "end" : "start" });
  return out;
}

/** The first sentence of a recorded explanation, for a tooltip: whole, however long. */
export function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const m = t.match(/^(.+?[.!?])(\s+(?=[A-Z(])|$)/);
  return m ? m[1] : t;
}
