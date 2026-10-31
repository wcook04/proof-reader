// The relation under the pointer: its name, the first sentence of its
// recorded explanation, and how to read the whole step. The pointer can move
// onto it; Escape closes it before anything else on the page.

import { useLayoutEffect, useRef, useState } from "react";
import type { ArgEdge, ArgGraph } from "../../model/graph";
import { relationName, relationPhrase } from "../labels";
import { firstSentence } from "./trace";

export interface TipState {
  key: string;
  x: number;
  y: number;
}

interface Props {
  tip: TipState;
  graph: ArgGraph;
  edge: ArgEdge | null;
  /** For a bus stem: the consumer and how many inputs meet there. */
  bus: { parent: string; count: number } | null;
  wrap: HTMLElement | null;
  compact: boolean;
  onEnter(): void;
  onLeave(): void;
}

export function EdgeTip({ tip, graph, edge, bus, wrap, compact, onEnter, onLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Beside the pointer, away from the (mostly vertical) line; flipped to stay inside.
    let left = tip.x + 14;
    let top = tip.y - h / 2;
    if (left + w > W - 8) left = tip.x - 14 - w;
    left = Math.max(8, Math.min(W - w - 8, left));
    top = Math.max(8, Math.min(H - h - 8, top));
    setPos({ left, top });
  }, [tip, wrap]);
  const label = (id: string) => graph.nodes.get(id)?.label ?? id;
  let body: React.ReactNode = null;
  if (bus) {
    body = (
      <>
        <p className="edge-tip__kind">
          <span className="rel-sample" aria-hidden="true" />
          <span className="caps">{relationName("supports")}</span>
        </p>
        <p className="edge-tip__rel">
          {label(bus.parent)} uses {bus.count === 1 ? "one record" : `${bus.count} records`} directly
        </p>
        <p className="edge-tip__hint">Select the line to open {label(bus.parent)}</p>
      </>
    );
  } else if (edge) {
    body = (
      <>
        <p className="edge-tip__kind">
          <span className={`rel-sample rel-sample--${edge.kind}`} aria-hidden="true" />
          <span className="caps">{relationName(edge.kind)}</span>
        </p>
        <p className="edge-tip__rel">{relationPhrase(edge.kind, label(edge.from), label(edge.to))}</p>
        {edge.warrant?.text && <p className="edge-tip__warrant">{firstSentence(edge.warrant.text)}</p>}
        <p className="edge-tip__hint">Select the line to open this step</p>
      </>
    );
  }
  if (!body) return null;
  return (
    <div
      ref={ref}
      className={`edge-tip${compact ? " edge-tip--compact" : ""}`}
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {body}
    </div>
  );
}
