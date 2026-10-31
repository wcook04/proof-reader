// Shared shapes for the map engine: the layered layout, the connector plan
// and the per-frame route.

import type { LinkKind } from "../../model/graph";

/** A drawn edge in stored direction: `from` is the consumer (drawn above), `to` the prerequisite. */
export interface EngineEdge {
  key: string;
  from: string;
  to: string;
  kind: LinkKind;
}

export interface Size {
  w: number;
  h: number;
}

/** A card's rectangle, top-left corner and size, in world coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Metrics {
  /** Horizontal space between two cards in a rank. */
  sepCard: number;
  /** Horizontal space between a long edge's column and its neighbour. */
  sepDummy: number;
  /** Smallest vertical gap between two ranks. */
  gapMin: number;
  /** Vertical distance between neighbouring tracks in a gap. */
  trackSp: number;
  /** Space above the top track (holds the arrowhead and a corner) and below the bottom one. */
  padTop: number;
  padBottom: number;
  /** Corner radius. */
  radius: number;
  /** Arrowhead length. */
  arrow: number;
  /** Ports keep this far from a card's side. */
  inset: number;
  /** Smallest distance between two ports on one side of a card. */
  portSp: number;
}

export const METRICS: Metrics = {
  sepCard: 28,
  sepDummy: 16,
  gapMin: 76,
  trackSp: 11,
  padTop: 24,
  padBottom: 20,
  radius: 8,
  arrow: 10,
  inset: 16,
  portSp: 14,
};

export const METRICS_COMPACT: Metrics = {
  sepCard: 16,
  sepDummy: 10,
  gapMin: 46,
  trackSp: 7,
  padTop: 17,
  padBottom: 12,
  radius: 6,
  arrow: 7,
  inset: 11,
  portSp: 9,
};

export interface Dummy {
  key: string;
  edge: string;
  rank: number;
  x: number;
}

export interface Layout {
  root: string;
  metrics: Metrics;
  edges: EngineEdge[];
  rank: Map<string, number>;
  /** Each rank's members, left to right: card ids and dummy keys. */
  layers: string[][];
  boxes: Map<string, Rect>;
  dummies: Map<string, Dummy>;
  /** For each edge spanning several ranks, its dummy keys from just below the consumer down to just above the prerequisite. */
  chains: Map<string, string[]>;
  rowTop: number[];
  rowHeight: number[];
  /** gap[r] lies between rank r and rank r + 1. */
  gap: number[];
  crossings: number;
  /** Crossings of the order seeded from the previous layout, before any sweep. */
  seedCrossings: number;
  /** The seeded order, for stability checks. */
  seedLayers: string[][];
}
