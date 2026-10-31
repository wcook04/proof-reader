// The right-hand page: the graph above and the Lean below, with a handle between
// them, or side by side where the page is wide enough. Either can be closed, and the
// choice and the split are remembered. A caption says what the page is following.
// Adapted from Lean Exposition's docked record sheet.

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const KEY = "proof-reader-page";
const SIDE_BY_SIDE = 860;
const MIN = 0.22;
const MAX = 0.78;

interface Layout {
  graph: boolean;
  lean: boolean;
  /** The graph's share of the page, stacked and side by side. */
  share: number;
  sideShare: number;
}

function readLayout(narrow: boolean): Layout {
  const fallback = { graph: !narrow, lean: true, share: 0.5, sideShare: 0.6 };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Layout> | null;
    if (!stored) return fallback;
    const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));
    return { graph: stored.graph ?? true, lean: stored.lean ?? true, share: clamp(stored.share ?? fallback.share), sideShare: clamp(stored.sideShare ?? fallback.sideShare) };
  } catch {
    return fallback;
  }
}

function saveLayout(layout: Layout) {
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
  phone: boolean;
  /** Under 1280px the page opens on demand and can be closed. */
  onClose?(): void;
}

export const ProofPage = memo(function ProofPage({ caption, reading, graph, lean, phone, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(() => readLayout(phone));
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

  const change = (next: Layout) => {
    setLayout(next);
    saveLayout(next);
  };

  // The drag writes one custom property; the panes hear the new room when it ends.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panes.current) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const box = panes.current.getBoundingClientRect();
    let value = share;
    setDragging(true);
    const move = (e: PointerEvent) => {
      const at = side ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
      value = Math.min(MAX, Math.max(MIN, at));
      panes.current?.style.setProperty("--share", String(value));
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(false);
      change(withShare(value));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const onHandleKey = (event: React.KeyboardEvent) => {
    const back = side ? "ArrowLeft" : "ArrowUp";
    const on = side ? "ArrowRight" : "ArrowDown";
    if (event.key !== back && event.key !== on) return;
    event.preventDefault();
    event.stopPropagation();
    change(withShare(Math.min(MAX, Math.max(MIN, share + (event.key === on ? 0.05 : -0.05)))));
  };

  const both = layout.graph && layout.lean;
  return (
    <div className="proof" ref={root} data-side={side || undefined} aria-label="The proof" role="region">
      <div className="proof__caption">
        <div className="proof__says">{caption}</div>
        <div className="proof__show" role="group" aria-label="Show on this page">
          <button type="button" aria-pressed={layout.graph} disabled={layout.graph && !layout.lean} title={layout.graph ? "Close the graph" : "Open the graph"} onClick={() => change({ ...layout, graph: !layout.graph })}>Graph</button>
          <button type="button" aria-pressed={layout.lean} disabled={layout.lean && !layout.graph} title={layout.lean ? "Close the Lean" : "Open the Lean"} onClick={() => change({ ...layout, lean: !layout.lean })}>Lean</button>
        </div>
        {onClose && <button type="button" className="proof__close" onClick={onClose}>Close</button>}
      </div>
      <div className={`proof__panes${both ? " is-both" : ""}${dragging ? " is-dragging" : ""}`} ref={panes}>
        <div className="proof__graph" hidden={!layout.graph}>{graph}</div>
        {both && (
          <div
            className="proof__handle"
            role="separator"
            aria-orientation={side ? "vertical" : "horizontal"}
            aria-label="Resize the graph and the Lean"
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
        <div className="proof__lean" hidden={!layout.lean}>{lean}</div>
      </div>
      <div className="proof__reading">{reading}</div>
    </div>
  );
});
