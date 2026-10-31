// The right-hand page has two modes behind one toggle. In Graph mode the graph follows the
// reader. In Lean mode the Lean has the whole page; anyone who wants both pulls the handle down
// for a band of graph, or a column of it where the page is wide. The split is remembered. A
// caption says what the page is following. Adapted from Lean Exposition's docked record sheet.

import { ModeToggle, type PaneMode } from "./ModeToggle";
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const KEY = "proof-reader-pane";
const SIDE_BY_SIDE = 860;
const MAX = 0.78;
/** A pull shorter than this leaves the Lean the whole page. */
const SHUT = 0.08;
/** What a click on the handle gives the graph. */
const BAND = 0.3;

export interface Layout {
  graph: boolean;
  /** Whether the reader chose Lean mode. It starts as Graph. */
  lean: boolean;
  /** The graph's share of the page in Lean mode, stacked and side by side. None until pulled. */
  share: number;
  sideShare: number;
}

const pull = (value: number) => (value < SHUT ? 0 : Math.min(MAX, value));

export function readLayout(): Layout {
  const fallback = { graph: true, lean: false, share: 0, sideShare: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Layout> | null;
    if (!stored) return fallback;
    const clamp = pull;
    return { graph: stored.graph ?? true, lean: stored.lean ?? false, share: clamp(stored.share ?? fallback.share), sideShare: clamp(stored.sideShare ?? fallback.sideShare) };
  } catch {
    return fallback;
  }
}

export function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
}

interface Props {
  caption: ReactNode;
  /** One line under the graph: the key, or what is under the pointer. */
  reading: ReactNode;
  graph: ReactNode;
  lean: ReactNode;
  leanOpen: boolean;
  onMode(mode: PaneMode): void;
  layout: Layout;
  onLayout(next: Layout): void;
  /** The page can be closed: on demand under 1280px, and in Graph mode above it. */
  onClose?(): void;
}

export const ProofPage = memo(function ProofPage({ caption, reading, graph, lean, leanOpen, onMode, layout, onLayout, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(false);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setSide(el.clientWidth >= SIDE_BY_SIDE);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const share = side ? layout.sideShare : layout.share;
  const withShare = (value: number): Layout => (side ? { ...layout, sideShare: value } : { ...layout, share: value });
  useEffect(() => panes.current?.style.setProperty("--share", String(share)), [share]);

  const change = onLayout;

  // The drag writes one custom property; the panes hear the new room when it ends. A press
  // that does not move is a click, which opens or closes the Lean.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panes.current) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const box = panes.current.getBoundingClientRect();
    const from = { x: event.clientX, y: event.clientY };
    const wasOpen = leanOpen;
    let value = share;
    let moved = false;
    setDragging(true);
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 5) return;
      if (!moved && !wasOpen) onMode("lean");
      moved = true;
      const at = side ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
      value = pull(at);
      panes.current?.style.setProperty("--share", String(value));
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(false);
      if (moved) change(withShare(value));
      else if (wasOpen) change(withShare(share > 0 ? 0 : BAND));
      else onMode("lean");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const onHandleKey = (event: React.KeyboardEvent) => {
    const back = side ? "ArrowLeft" : "ArrowUp";
    const on = side ? "ArrowRight" : "ArrowDown";
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (leanOpen) change(withShare(share > 0 ? 0 : BAND));
      else onMode("lean");
      return;
    }
    if (event.key !== back && event.key !== on) return;
    event.preventDefault();
    event.stopPropagation();
    change(withShare(pull(share + (event.key === on ? 0.05 : -0.05))));
  };

  const both = leanOpen && share > 0;
  const shut = leanOpen && share === 0;
  return (
    <div className="proof" ref={root} data-side={side || undefined} data-lean={leanOpen || undefined} aria-label="The proof" role="region">
      <div className="proof__caption">
        <div className="proof__says">{caption}</div>
        <ModeToggle mode={leanOpen ? "lean" : "graph"} onMode={onMode} />
        {onClose && <button type="button" className="proof__close" onClick={onClose}>Close</button>}
      </div>
      <div className={`proof__panes${both ? " is-both" : ""}${shut ? " is-shut" : ""}${dragging ? " is-dragging" : ""}`} ref={panes}>
        <div className="proof__graph">{graph}</div>
        <div
          className="proof__handle"
          role="separator"
          aria-orientation={side ? "vertical" : "horizontal"}
          aria-label={leanOpen ? "Pull the graph in beside the Lean" : "Open the Lean: click, or drag to choose its size"}
          aria-valuemin={0}
          aria-valuemax={Math.round(MAX * 100)}
          aria-valuenow={Math.round(share * 100)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={onHandleKey}
        >
          <span aria-hidden="true" />
        </div>
        <div className="proof__lean" hidden={!leanOpen}>{lean}</div>
      </div>
      {reading && <div className="proof__reading">{reading}</div>}
    </div>
  );
});
