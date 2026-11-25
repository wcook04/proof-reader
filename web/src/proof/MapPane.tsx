// The Graph view's drawing. By default it is the focus graph of docs/graph-pane.md: the
// statement in hand in the middle, what uses it above, what it uses below, every
// neighbour drawn with its line. The whole proof, as Lean Exposition's map draws it, is
// one button away in the same place. Under 600 pixels of width the drawing folds to one line.

import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import type { Edition } from "../app/edition";
import { ArgumentTree, type Insets, type MapViewHandle } from "../map/ArgumentTree";
import type { MapScene } from "../map/canvas/scene";
import { reach } from "../map/treeModel";
import type { ArgGraph } from "../model/graph";
import { FocusGraph, type FGCard } from "./FocusGraph";
import { focusData } from "./focusCards";
import "./graph-pane.css";

const INSETS: Insets = { top: 42, right: 12, bottom: 44, left: 12 };
/** Narrow tiles, so that at the 11px floor the proof fits half a laptop's window. */
const TILE_W = 134;
const TILE_H = 64;
/** On a screen narrower than this the drawing folds to one line. */
const FOLD_BELOW = 600;

const tileHeight = (title: string, width: number, raw = "") => {
  // Proof Reader: the map keeps its type a constant size on screen, so at the reading floor
  // (k = 0.85) a 13px title is about 15px of the drawing and a 10.5px name about 12px. The
  // tile is sized for the whole title and the whole Lean name at that floor: neither is cut.
  const room = width - 2 * 9.5;
  const perLine = Math.max(6, Math.floor(room / 8.2));
  let lines = 1;
  let used = 0;
  for (const w of title.split(/\s+/)) {
    if (used && used + 1 + w.length > perLine) {
      lines += 1;
      used = w.length;
    } else used += (used ? 1 : 0) + w.length;
    while (used > perLine) {
      lines += 1;
      used -= perLine;
    }
  }
  const rawLines = raw ? Math.max(1, Math.ceil((raw.length * 7.6) / room)) : 0;
  return Math.ceil(22 + lines * 19 + (rawLines ? 6 + rawLines * 15 : 0) + 4);
};

export interface MapPaneHandle {
  /** The whole map's camera, when the whole map is open. */
  scene(): MapScene | null;
  paused(): boolean;
  restore(scene: MapScene | null, paused: boolean): void;
}

interface Props {
  ref?: Ref<MapPaneHandle>;
  edition: Edition;
  /** The whole proof, for the whole map. */
  graph: ArgGraph;
  /** The declarations in the middle: the statement in hand or under the reading line. */
  subjects: readonly string[];
  autoOverview?: boolean;
  /** Lit from the paper: the sentence or name under the pointer. */
  pointed: ReadonlySet<string> | null;
  /** The card previewed in the dock, if it is not the subject. */
  held: string | null;
  /** The index of the passage being read, to mark what was read and what is stated later. */
  position: number;
  /** One line over the drawing, when the drawing is not the paragraph's own. */
  label?: ReactNode;
  onSubject(id: string): void;
  onHover(id: string | null): void;
  availableHeight: number;
  onFitHeight(height: number): void;
}

export const MapPane = memo(function MapPane({ ref, edition, graph, subjects, autoOverview, pointed, held, position, label, onSubject, onHover, availableHeight, onFitHeight }: Props) {
  const data = useMemo(() => focusData(edition), [edition]);
  const [wholeRequested, setWhole] = useState(false);
  const tree = useRef<MapViewHandle>(null);
  const [narrow, setNarrow] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${FOLD_BELOW - 1}px)`);
    const change = () => setNarrow(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  const subjectSet = useMemo(() => new Set(subjects), [subjects]);
  const card = useCallback((id: string): FGCard | undefined => {
    const c = data.card(id);
    if (!c) return undefined;
    const at = data.firstPassage.get(id);
    const seen = at === undefined || position < 0 || subjectSet.has(id) ? undefined : at < position ? "before" : at > position ? "later" : "here";
    return seen ? { ...c, seen } : c;
  }, [data, position, subjectSet]);
  const shown = useMemo(() => subjects.filter((id) => data.card(id)), [subjects, data]);
  const edges = useMemo(() => data.edges(shown), [data, shown]);
  const claim = edition.claims[0];
  const goal = claim?.id ?? "";
  const hasOverview = useMemo(() => !!goal && reach(graph, goal).size > 1, [graph, goal]);
  const fallback = shown.length > 0 && edges.length === 0 && hasOverview;
  const automaticOverview = autoOverview || fallback;
  const whole = automaticOverview || wholeRequested;
  const route = useMemo(() => data.route(shown), [data, shown]);
  // A label over the drawing already says this is a view of its own (Lean the paper does not
  // state, or the statement before an untied paragraph); a second line saying there is no
  // chain would cost the drawing its room.
  const routeNote = !data.main ? undefined : label && !route ? undefined : route && route.length === 0 ? "This is the main result." : route ? undefined : "No recorded chain of uses leads from this to the main result.";
  const lit = useMemo(() => (pointed ? [...pointed] : []), [pointed]);

  // Counts for the folded line.
  const counts = useMemo(() => {
    const ids = new Set(shown);
    const uses = new Set(edges.filter((e) => ids.has(e.from) && !ids.has(e.to)).map((e) => e.to));
    const users = new Set(edges.filter((e) => ids.has(e.to) && !ids.has(e.from)).map((e) => e.from));
    return { uses: uses.size, users: users.size };
  }, [edges, shown]);

  // The whole map's camera is what a history entry keeps.
  useImperativeHandle(ref, (): MapPaneHandle => ({
    scene: () => (whole ? tree.current?.getScene() ?? null : null),
    paused: () => false,
    restore: (scene) => {
      if (!scene) return;
      setWhole(true);
      window.setTimeout(() => tree.current?.restoreScene(scene), 80);
    },
  }), [whole]);

  const litIds = useMemo(() => (shown.length ? new Set(shown) : null), [shown]);
  const heightOf = useCallback((id: string) => Math.max(TILE_H, tileHeight(graph.nodes.get(id)?.label ?? "", TILE_W, graph.nodes.get(id)?.rawName ?? "")), [graph]);
  // A card on the whole map opens as the subject, back in the drawing around it.
  const chooseOnMap = useCallback((id: string | null) => {
    if (!id) return;
    const target = edition.claims.find((c) => c.id === id)?.lean[0] ?? id;
    if (!data.card(target)) return;
    setWhole(false);
    onSubject(target);
  }, [data, edition, onSubject]);
  const noTrace = useCallback(() => undefined, []);

  const folded = narrow && !unfolded;
  const switchHeight = narrow ? 34 : 0;
  const reportFitHeight = useCallback((height: number) => onFitHeight(height + switchHeight), [onFitHeight, switchHeight]);
  const first = shown[0] ? data.card(shown[0]) : undefined;
  const subjectWords = first ? (shown.length > 1 ? `${first.title} and ${shown.length - 1} more stated here` : first.title) : "Nothing is drawn here";

  return (
    <section className="graph" data-folded={folded || undefined} data-narrow={narrow || undefined} data-whole={whole || undefined} aria-label="Graph of the Lean proof">
      {folded ? (
        <p className="graph__strip">
          <span className="graph__strip-subject">{subjectWords}</span>
          <span className="graph__strip-counts">This uses {counts.uses} · {counts.users} {counts.users === 1 ? "uses" : "use"} this</span>
          <button type="button" onClick={() => setUnfolded(true)}>Show the graph</button>
        </p>
      ) : whole ? (
        <div className="graph__canvas">
          <ArgumentTree
            ref={tree}
            graph={graph}
            goal={goal}
            insets={INSETS}
            persist={false}
            mode="overview"
            tileWidth={TILE_W}
            tileHeight={TILE_H}
            tileHeightOf={heightOf}
            oneCardEach
            litIds={fallback ? null : litIds}
            previewIds={pointed}
            rootExcerpt={<span>{claim?.title}</span>}
            onSelect={chooseOnMap}
            onTrace={noTrace}
            onHover={onHover}
            onFitHeight={reportFitHeight}
          />
          <div className="graph__map-tools" role="group" aria-label="Whole proof map controls">
            <button type="button" onClick={() => tree.current?.zoomBy(0.8)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => tree.current?.zoomBy(1.25)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => tree.current?.fitAll()} title="Fit the whole proof map in view">Fit</button>
          </div>
        </div>
      ) : (
        <FocusGraph
          subjects={shown}
          card={card}
          edges={edges}
          route={route}
          routeNote={routeNote}
          label={label}
          lit={lit}
          held={held}
          onSubject={onSubject}
          onHover={onHover}
          availableHeight={availableHeight - switchHeight}
          onFitHeight={reportFitHeight}
        />
      )}
      {!folded && (
        <div className="graph__switch">
          {!automaticOverview && <button type="button" onClick={() => setWhole((w) => !w)}>{whole ? "Around this step" : "Whole proof map"}</button>}
          {narrow && <button type="button" onClick={() => { setWhole(false); setUnfolded(false); }}>Fold the graph</button>}
        </div>
      )}
    </section>
  );
});
