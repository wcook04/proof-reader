// The right-hand page. At rest it is the graph, following the reader. One click or a
// drag on the handle brings up the Lean: stacked under a band of graph, or side by side
// where the page is wide enough. Left open, it follows too. The split and the choice to
// close the graph are remembered. A caption says what the page is following. Adapted
// from Lean Exposition's docked record sheet.

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const KEY = "proof-reader-page";
const SIDE_BY_SIDE = 860;
const MIN = 0.14;
const MAX = 0.78;

export interface Layout {
  graph: boolean;
  /** Whether the reader keeps the Lean open while reading. It starts closed. */
  lean: boolean;
  /** The graph's share of the page, stacked and side by side. */
  share: number;
  sideShare: number;
}

export function readLayout(narrow: boolean): Layout {
  const fallback = { graph: !narrow, lean: false, share: 0.3, sideShare: 0.5 };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Layout> | null;
    if (!stored) return fallback;
    const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));
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
  /** A signature or a reference under the pointer. Its room is always kept, so nothing moves. */
  reading: ReactNode;
  graph: ReactNode;
  lean: ReactNode;
  leanOpen: boolean;
  onLean(open: boolean): void;
  layout: Layout;
  onLayout(next: Layout): void;
  /** Under 1280px the page opens on demand and can be closed. */
  onClose?(): void;
}

export const ProofPage = memo(function ProofPage({ caption, reading, graph, lean, leanOpen, onLean, layout, onLayout, onClose }: Props) {
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
      if (!moved && !wasOpen) onLean(true);
      moved = true;
      const at = side ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
      value = Math.min(MAX, Math.max(MIN, at));
      panes.current?.style.setProperty("--share", String(value));
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(false);
      if (moved) change(withShare(value));
      else onLean(!wasOpen);
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
      onLean(!leanOpen);
      return;
    }
    if (event.key !== back && event.key !== on) return;
    event.preventDefault();
    event.stopPropagation();
    change(withShare(Math.min(MAX, Math.max(MIN, share + (event.key === on ? 0.05 : -0.05)))));
  };

  const both = layout.graph && leanOpen;
  return (
    <div className="proof" ref={root} data-side={side || undefined} data-lean={leanOpen || undefined} aria-label="The proof" role="region">
      <div className="proof__caption">
        <div className="proof__says">{caption}</div>
        <div className="proof__show" role="group" aria-label="Show on this page">
          <button type="button" aria-pressed={layout.graph} title={layout.graph ? "Close the graph" : "Open the graph"} onClick={() => change({ ...layout, graph: !layout.graph })}>Graph</button>
          <button type="button" aria-pressed={leanOpen} title={leanOpen ? "Close the Lean" : "Open the Lean, which then follows the paper"} onClick={() => onLean(!leanOpen)}>Lean</button>
        </div>
        {onClose && <button type="button" className="proof__close" onClick={onClose}>Close</button>}
      </div>
      <div className={`proof__panes${both ? " is-both" : ""}${dragging ? " is-dragging" : ""}`} ref={panes}>
        <div className="proof__graph" hidden={!layout.graph}>{graph}</div>
        {layout.graph && (
          <div
            className="proof__handle"
            role="separator"
            aria-orientation={side ? "vertical" : "horizontal"}
            aria-label={leanOpen ? "Resize the graph and the Lean, or press Enter to close the Lean" : "Open the Lean: click, or drag to choose its size"}
            aria-valuemin={Math.round(MIN * 100)}
            aria-valuemax={Math.round(MAX * 100)}
            aria-valuenow={Math.round(share * 100)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onHandleKey}
          >
            <span aria-hidden="true" />
          </div>
        )}
        <div className="proof__lean" hidden={!leanOpen}>{lean}</div>
      </div>
      <div className="proof__reading">{reading}</div>
    </div>
  );
});
