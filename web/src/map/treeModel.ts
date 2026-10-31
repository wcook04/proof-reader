// Which part of the argument is on screen. A goal sits at the top; each
// result shown can be unfolded to show the results it uses, down to where the
// recorded argument stops and rests on its cited sources. The graph is not a
// tree: a result used by several others is drawn once, with every recorded
// use among the results on screen.
//
// `within`, where given, is a per-account or per-passage view: only records in
// that set are ever shown (the goal always is).

import { argumentProjection, type ArgEdge, type ArgGraph } from "../model/graph";
import type { EngineEdge } from "./engine/types";

export const TREE_KINDS = new Set(["supports", "formalizes", "assumes"]);

type Within = ReadonlySet<string> | null | undefined;

/** Results directly used by `id` (stored direction: consumer -> prerequisite). */
export function usesOf(graph: ArgGraph, id: string, within?: Within): ArgEdge[] {
  const all = (graph.out.get(id) ?? []).filter((e) => TREE_KINDS.has(e.kind));
  return within ? all.filter((e) => within.has(e.to)) : all;
}

export function visibleSet(graph: ArgGraph, goal: string, expanded: ReadonlySet<string>, within?: Within): Set<string> {
  const visible = new Set<string>([goal]);
  const queue = [goal];
  while (queue.length) {
    const id = queue.shift()!;
    if (id !== goal && !expanded.has(id)) continue;
    for (const e of usesOf(graph, id, within)) {
      if (!visible.has(e.to)) {
        visible.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return visible;
}

/** The edges among visible cards that their unfolded consumers show. */
export function visibleEdges(graph: ArgGraph, goal: string, visible: ReadonlySet<string>, expanded: ReadonlySet<string>, within?: Within): EngineEdge[] {
  const out: EngineEdge[] = [];
  for (const id of visible) {
    if (id !== goal && !expanded.has(id)) continue;
    for (const e of usesOf(graph, id, within)) if (visible.has(e.to)) out.push({ key: e.key, from: e.from, to: e.to, kind: e.kind });
  }
  return out;
}

/** A shortest chain of uses from the goal down to `target`, or null. */
export function pathFromGoal(graph: ArgGraph, goal: string, target: string, within?: Within): string[] | null {
  if (goal === target) return [goal];
  const parent = new Map<string, string>();
  const queue = [goal];
  const seen = new Set([goal]);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of usesOf(graph, id, within)) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      parent.set(e.to, id);
      if (e.to === target) {
        const path = [target];
        let at = target;
        while (parent.has(at)) {
          at = parent.get(at)!;
          path.unshift(at);
        }
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

/** Every result the goal's argument reaches. */
export function reach(graph: ArgGraph, goal: string, within?: Within): Set<string> {
  const seen = new Set([goal]);
  const queue = [goal];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of usesOf(graph, id, within)) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

/** Every record on some chain of uses from the goal down to one of the targets. */
export function routeTo(graph: ArgGraph, goal: string, targets: Iterable<string>, within?: Within): Set<string> {
  const down = reach(graph, goal, within);
  const up = new Set<string>();
  const queue: string[] = [];
  for (const t of targets) if (down.has(t) && !up.has(t)) {
    up.add(t);
    queue.push(t);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of graph.in.get(id) ?? []) {
      if (!TREE_KINDS.has(e.kind) || up.has(e.from) || !down.has(e.from)) continue;
      up.add(e.from);
      queue.push(e.from);
    }
  }
  return up;
}

/** The goal whose argument contains `id`, preferring the smallest such argument. */
export function goalFor(graph: ArgGraph, id: string, goals: string[]): string | null {
  let best: { goal: string; size: number } | null = null;
  for (const goal of goals) {
    const r = reach(graph, goal);
    if (r.has(id) && (!best || r.size < best.size)) best = { goal, size: r.size };
  }
  return best?.goal ?? null;
}

/** Expand every node on the chains from the goal to each target. */
export function expandTo(graph: ArgGraph, goal: string, targets: Iterable<string>, expanded: Set<string>, within?: Within): boolean {
  let changed = false;
  for (const target of targets) {
    const path = pathFromGoal(graph, goal, target, within);
    if (!path) continue;
    for (const id of path.slice(0, -1)) {
      if (id !== goal && !expanded.has(id)) {
        expanded.add(id);
        changed = true;
      }
    }
  }
  return changed;
}

/** The graph with only the edges live in the goal's scoped argument (a premise an application supplies is not drawn back in). */
export function scopedGraph(graph: ArgGraph, goal: string): ArgGraph {
  let live: Set<string>;
  try {
    live = argumentProjection(graph, [goal]).edges;
  } catch {
    return graph;
  }
  const keep = (e: ArgEdge) => !TREE_KINDS.has(e.kind) || live.has(e.key);
  if (graph.edges.every(keep)) return graph;
  const filter = (m: Map<string, ArgEdge[]>) => new Map([...m].map(([k, list]) => [k, list.filter(keep)]));
  return { ...graph, edges: graph.edges.filter(keep), out: filter(graph.out), in: filter(graph.in) };
}

/**
 * Exactly the unfolded set that draws `targets` from the goal: every record on
 * the map's own route (pathFromGoal) to each target, short of the target
 * itself. An assumption is drawn as a tag on a record that assumes it, so for
 * an assumption it is that record which must be drawn, not unfolded.
 * Targets the goal's argument does not reach are left out.
 */
export function neededExpansion(graph: ArgGraph, goal: string, targets: Iterable<string>, within?: Within): Set<string> {
  const open = new Set<string>();
  for (const target of targets) {
    const path = pathFromGoal(graph, goal, target, within);
    if (!path) continue;
    const tag = graph.nodes.get(target)?.kind === "assumption";
    for (const id of path.slice(1, tag ? -2 : -1)) open.add(id);
  }
  return open;
}

export interface GoalChoice {
  id: string;
  /** Selected by the account being read. */
  own: boolean;
}

/**
 * The main result whose argument contains most of `records`. Ties go to the
 * account's own selected results (in their order), then to `current`, then to
 * the earlier candidate. With no record contained anywhere, `current` stays.
 */
export function chooseGoal(records: readonly string[], candidates: readonly GoalChoice[], reachOf: (goal: string) => ReadonlySet<string>, current?: string | null): string | null {
  let best: { id: string; score: number; rank: number } | null = null;
  candidates.forEach((c, i) => {
    const r = reachOf(c.id);
    const score = records.filter((id) => r.has(id)).length;
    // Lower rank wins a tie.
    const rank = (c.own ? 0 : 2) + (c.id === current ? 0 : 1) + i / 1000;
    if (!best || score > best.score || (score === best.score && rank < best.rank)) best = { id: c.id, score, rank };
  });
  const chosen = best as { id: string; score: number } | null;
  if (!chosen || chosen.score === 0) return current ?? candidates[0]?.id ?? null;
  return chosen.id;
}

/** Every record below `id`, recursively to the records with no recorded inputs (assumptions included), within the drawn scope. */
export function lineageOf(graph: ArgGraph, id: string, within?: Within): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of usesOf(graph, at, within)) {
      if (e.to === id || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return seen;
}

/** What is unfolded while `id`'s lineage is previewed: what is open now, plus `id` and every record in its lineage that has inputs. */
export function peekExpansion(graph: ArgGraph, id: string, expanded: ReadonlySet<string>, within?: Within): Set<string> {
  const open = new Set(expanded);
  for (const x of [id, ...lineageOf(graph, id, within)])
    if (graph.nodes.get(x)?.kind !== "assumption" && usesOf(graph, x, within).some((e) => e.kind !== "assumes")) open.add(x);
  return open;
}
