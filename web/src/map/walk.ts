// Walking the drawn graph with the arrow keys. Up goes to the result that uses
// this one, down to its first input, left and right among the inputs of the
// same result. Pure, so the rules are tested without a browser.

import type { EngineEdge, Rect } from "./engine/types";

export type WalkKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface WalkScene {
  boxes: ReadonlyMap<string, Rect>;
  rank: ReadonlyMap<string, number>;
  edges: readonly EngineEdge[];
}

const centre = (r: Rect) => r.x + r.w / 2;

/** The card an arrow key moves to from `from`, or null when there is none drawn. */
export function walkStep(scene: WalkScene, from: string, key: WalkKey): string | null {
  const { boxes, rank, edges } = scene;
  const here = boxes.get(from);
  if (!here) return null;
  const x = centre(here);
  const byX = (ids: string[]) => [...new Set(ids)].filter((id) => boxes.has(id)).sort((a, b) => centre(boxes.get(a)!) - centre(boxes.get(b)!));
  const ups = byX(edges.filter((e) => e.to === from).map((e) => e.from)).sort((a, b) => Math.abs(centre(boxes.get(a)!) - x) - Math.abs(centre(boxes.get(b)!) - x));
  if (key === "ArrowUp") return ups[0] ?? null;
  if (key === "ArrowDown") return byX(edges.filter((e) => e.from === from).map((e) => e.to))[0] ?? null;
  const step = key === "ArrowLeft" ? -1 : 1;
  const siblings = ups.length ? byX(edges.filter((e) => e.from === ups[0]).map((e) => e.to)) : [];
  const beside = siblings[siblings.indexOf(from) + step];
  if (beside) return beside;
  // At the end of a family, on to the nearest card along the same rank.
  const row = byX([...boxes.keys()].filter((id) => rank.get(id) === rank.get(from)));
  return row[row.indexOf(from) + step] ?? null;
}
