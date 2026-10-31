// The graph of the proof, adapted from Lean Exposition's map beside the paper. It comes
// along with the reading: every branch drawn, the statement under the reading line in
// amber, what lies ahead quieter. A soft green says what Lean holds. The camera moves only
// if a card has left the view. In Lean mode the graph is out of sight, or a band pulled
// down above the Lean with the card in the middle of it, and leaving Lean mode gives the
// camera back exactly. The reader stays in charge: moving the map pauses following.

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { Edition } from "../app/edition";
import { ArgumentTree, type Insets, type MapViewHandle } from "../map/ArgumentTree";
import type { MapScene } from "../map/canvas/scene";
import { isType } from "../model/fromEdition";
import type { ArgGraph } from "../model/graph";

const INSETS: Insets = { top: 10, right: 12, bottom: 10, left: 12 };
/** Narrow tiles, so that at the 11px floor the proof fits half a laptop's window. */
const TILE_W = 134;
const TILE_H = 64;
/** Under this height the graph is the band above the Lean. */
const BAND = 340;

export interface MapPaneHandle {
  scene(): MapScene | null;
  paused(): boolean;
  restore(scene: MapScene | null, paused: boolean): void;
}

interface Props {
  ref?: Ref<MapPaneHandle>;
  edition: Edition;
  graph: ArgGraph;
  /** What the right page is showing: outlined. */
  lit: readonly string[];
  /** Previewed by the pointer: tinted, and nothing moves. */
  pointed: ReadonlySet<string> | null;
  /** Declarations whose statements the reader has passed. */
  passed: ReadonlySet<string>;
  /** How many declarations the reader has reached, and how many there are. */
  reached: number;
  selected: string | null;
  /** Hold the camera still for the next change: a card was just clicked. */
  stay: boolean;
  /** The Lean has the lower part of the page, so the graph has a band. */
  leanOpen: boolean;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  onPauseChange(paused: boolean): void;
}

export const MapPane = memo(function MapPane({ ref, edition, graph, lit, pointed, passed, reached, selected, stay, leanOpen, onSelect, onHover, onPauseChange }: Props) {
  const tree = useRef<MapViewHandle>(null);
  const body = useRef<HTMLDivElement>(null);
  const { claims } = edition;
  const types = useMemo(() => edition.declarations.filter(isType), [edition]);
  // A map draws one claim's proof. A paper with several gets a switch.
  const [goal, setGoal] = useState(claims[0]?.id ?? "");
  const claim = claims.find((c) => c.id === goal) ?? claims[0];
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const litIds = useMemo(() => (lit.length ? new Set(lit) : null), [lit]);
  const litKey = lit.join("|");
  const shelf = useRef<HTMLDivElement>(null);
  // The shelf is one line: bring a lit type into it.
  useEffect(() => {
    const row = shelf.current;
    const item = row?.querySelector<HTMLElement>(".is-lit");
    if (row && item) row.scrollLeft = Math.max(0, item.offsetLeft - row.offsetLeft - 8);
  }, [litKey]);
  const stayRef = useRef(stay);
  stayRef.current = stay;
  const leanRef = useRef(leanOpen);
  const before = useRef<MapScene | null>(null);
  const missed = useRef(false);

  // Scrolling must stay smooth, so the trail is written straight onto the tiles.
  const writeTrail = useCallback(() => {
    body.current?.querySelectorAll<HTMLElement>(".card[data-record]").forEach((card) => {
      const id = card.dataset.record!;
      const state = litIds?.has(id) ? "here" : passed.has(id) || id === goal ? "" : "ahead";
      if ((card.dataset.trail ?? "") !== state) card.dataset.trail = state;
    });
  }, [goal, litIds, passed]);
  useEffect(writeTrail);

  const inView = useCallback((ids: readonly string[]) => {
    const canvas = body.current?.getBoundingClientRect();
    if (!canvas?.width) return true;
    return ids.every((id) => {
      const cards = body.current!.querySelectorAll<HTMLElement>(`.card[data-record="${CSS.escape(id)}"]`);
      if (!cards.length) return true;
      return [...cards].some((card) => {
        const r = card.getBoundingClientRect();
        return r.top >= canvas.top && r.bottom <= canvas.bottom && r.left >= canvas.left && r.right <= canvas.right;
      });
    });
  }, []);

  useEffect(() => {
    if (pausedRef.current || stayRef.current || !lit.length) return;
    // Out of sight in Lean mode: catch up on the way back.
    if (!body.current?.clientHeight) {
      missed.current = true;
      return;
    }
    const drawn = lit.filter((id) => graph.nodes.has(id));
    if (drawn.length && leanRef.current && (body.current?.clientHeight ?? 0) < BAND) tree.current?.panTo(drawn, { centre: true });
    else if (drawn.length && !inView(drawn)) tree.current?.panTo(drawn);
    // Only when what is lit changes: the map re-centres itself when its room changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [litKey]);

  const setPause = useCallback((next: boolean) => {
    if (pausedRef.current === next) return;
    pausedRef.current = next;
    setPaused(next);
    onPauseChange(next);
  }, [onPauseChange]);

  const restoring = useRef(false);
  useImperativeHandle(ref, (): MapPaneHandle => ({
    scene: () => tree.current?.getScene() ?? null,
    paused: () => pausedRef.current,
    restore: (scene, wasPaused) => {
      pausedRef.current = wasPaused;
      setPaused(wasPaused);
      if (!scene) return;
      restoring.current = true;
      tree.current?.restoreScene(scene);
      window.setTimeout(() => {
        restoring.current = false;
      }, 80);
    },
  }), []);

  // Every branch is drawn from the start, so following only frames; it never folds.
  const litRef = useRef(lit);
  litRef.current = lit;
  const opened = useRef(false);
  useEffect(() => {
    let again = 0;
    const open = window.setTimeout(() => tree.current?.expandAll(), 0);
    const frame = window.setTimeout(() => {
      // A reload or a return to this entry finds the camera the reader left.
      const saved = !opened.current ? (window.history.state as { scene?: MapScene; mapPaused?: boolean } | null) : null;
      opened.current = true;
      if (saved?.mapPaused) {
        pausedRef.current = true;
        setPaused(true);
      }
      if (saved?.scene) {
        const scene = saved.scene;
        tree.current?.restoreScene(scene);
        // A slow first layout can frame the map after this: put the camera back once more.
        again = window.setTimeout(() => {
          if (!pausedRef.current && !leanRef.current) tree.current?.restoreScene(scene);
        }, 400);
      } else {
        tree.current?.fitAll(false);
        if (!pausedRef.current && litRef.current.length && !inView(litRef.current)) tree.current?.panTo(litRef.current);
      }
    }, 80);
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(frame);
      window.clearTimeout(again);
    };
  }, [goal, inView]);

  // The Lean rises: remember the camera, to give it back exactly when the Lean goes.
  useLayoutEffect(() => {
    if (leanRef.current === leanOpen) return;
    leanRef.current = leanOpen;
    if (leanOpen) {
      before.current = tree.current?.getScene() ?? null;
      missed.current = false;
    }
  }, [leanOpen]);

  // Back in Graph mode. A resize has given the camera back; if the Lean followed the text
  // while the graph was out of sight, the graph catches up.
  useEffect(() => {
    if (leanOpen) return;
    const timer = window.setTimeout(() => {
      before.current = null;
      if (missed.current && !pausedRef.current && !restoring.current && litRef.current.length && !inView(litRef.current)) tree.current?.panTo(litRef.current);
      missed.current = false;
    }, 240);
    return () => window.clearTimeout(timer);
  }, [inView, leanOpen]);

  // The room changed: the Lean rose or went, the handle was dragged, the window changed.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let timer = 0;
    let size = "";
    const observer = new ResizeObserver(() => {
      const next = `${el.clientWidth}x${el.clientHeight}`;
      // Folded away for a statement with no card: the camera waits.
      if (next === size || !el.clientHeight) return;
      const first = !size;
      size = next;
      if (first) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (restoring.current) return;
        if (leanRef.current) {
          // A band of graph is only useful with the card in the middle of it.
          if (litRef.current.length && el.clientHeight < BAND) tree.current?.panTo(litRef.current, { centre: true });
          else if (litRef.current.length && !inView(litRef.current)) tree.current?.panTo(litRef.current);
        } else if (before.current) {
          tree.current?.restoreScene(before.current);
          before.current = null;
        } else {
          tree.current?.fitAll(false);
          if (litRef.current.length && !inView(litRef.current)) tree.current?.panTo(litRef.current);
        }
      }, 140);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [inView]);

  const select = useCallback((id: string | null) => {
    if (id) onSelect(id);
  }, [onSelect]);
  const onUserMove = useCallback(() => setPause(true), [setPause]);
  const noTrace = useCallback(() => undefined, []);

  const map = useMemo(
    () => (
      <ArgumentTree
        key={goal}
        ref={tree}
        graph={graph}
        goal={goal}
        insets={INSETS}
        persist={false}
        mode="overview"
        tileWidth={TILE_W}
        tileHeight={TILE_H}
        oneCardEach
        fitMax={1.8}
        selected={selected ?? undefined}
        litIds={litIds}
        previewIds={pointed}
        rootExcerpt={<span>{claim?.title}</span>}
        onSelect={select}
        onTrace={noTrace}
        onHover={onHover}
        onUserMove={onUserMove}
      />
    ),
    [goal, graph, selected, litIds, pointed, claim, select, noTrace, onHover, onUserMove],
  );

  return (
    <section className="graph" aria-label="Graph of the Lean proof">
      {paused && (
        <p className="graph__paused" role="status">
          Paused while you move the graph.
          <button type="button" onClick={() => setPause(false)}>Follow the paper again</button>
        </p>
      )}
      {claims.length > 1 && (
        <div className="claims" role="group" aria-label="Which claim's proof to show">
          {claims.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === claim?.id} onClick={() => setGoal(c.id)}>{c.title}</button>
          ))}
        </div>
      )}
      {types.length > 0 && (
        <div className="vocab" aria-label="Types the proof is written in">
          <span className="vocab__name">Types</span>
          <div className="vocab__list" ref={shelf}>
            {types.map((d) => (
              <button key={d.id} type="button" data-vocab={d.id} className={lit.includes(d.id) ? "is-lit" : ""} aria-label={`${d.plain} (${d.id})`} onClick={() => onSelect(d.id)} onMouseEnter={() => onHover(d.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(d.id)} onBlur={() => onHover(null)}>
                {d.plain}
              </button>
            ))}
          </div>
          <span className="vocab__reached">{reached} of {edition.declarations.length} declarations reached</span>
        </div>
      )}
      <div className="graph__canvas" ref={body}>{map}</div>
    </section>
  );
});
