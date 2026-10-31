// The argument as a map you unfold. The goal sits at the top as a plate with
// the theorem itself; beneath it are the results it uses, each a card with its
// name in words. Open a card's inputs (its "Inputs" button, or Space) to see
// what that result uses; click the card to open everything below it, down to
// the records with no recorded inputs, framed in one move, and click the empty
// map to put it back. Each line runs from a result up into the result it helps establish,
// typed by colour and pattern: recorded support, explicit assumption, recorded
// Lean correspondence. The underlying graph is not a tree: a result used
// several times is drawn once. The drawing is simplified only where a longer
// chain of recorded support already joins two records, and says so.
//
// Two scales, three representations (DESIGN.md): the camera never shrinks a
// card's prose below reading size. Past k = 0.8 a card shows its title alone, at
// up to 13px on screen; past k = 0.5 it becomes a mark in its source colour,
// which keeps its title while it fits at 10px or more. Screen-space labels name
// the goal, the selection and the record under the pointer when their marks are
// too small for their titles. "Steps" opens at k = 1; "Overview" fits the whole goal.
//
// Layout, connectors and motion are this project's own engine (./engine): a
// layered layout, an orthogonal connector router planned once per layout and
// routed every frame, and one animation clock for cards, connectors and camera.
// Camera input: d3-zoom. Screen-space parts (edge chips, labels, notes) live
// in ./canvas.

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import type { Stage } from "../api/types";
import { closure, lensRole, type ArgEdge, type ArgGraph, type ArgNode } from "../model/graph";
import type { Trace } from "../app/router";
import { kindName } from "./labels";
import { expandTo, lineageOf, neededExpansion, pathFromGoal, peekExpansion, reach, routeTo, scopedGraph, usesOf, visibleEdges, visibleSet } from "./treeModel";
import { transitiveReduction } from "./engine/skeleton";
import { consumerOf, edgeKeyOf, layoutScope, recordOf, splitSharedLeaves } from "./engine/occurrences";
import { layoutBounds, layoutTree } from "./engine/layout";
import { arrowHead, polygonPath, roundedPath, route, type Plan, type Pt, type Routed } from "./engine/router";
import { fitBounds, frameBox, revealBox, travelMs, zoomPath, type Bounds, type View, type Viewport } from "./engine/camera";
import { CAMERA_MS, MOVE_MS, easeMove, lerp } from "./engine/motion";
import { METRICS, METRICS_COMPACT, type EngineEdge, type Layout, type Rect, type Size } from "./engine/types";
import { COMPACT_FLOOR, LEAN_BREAK, MAX_K, MIN_K, REF_PX, STEPS_FLOOR, STEPS_K, fitMark, fitPlate, fitTitle, repFor, titlePieces, type MapMode, type MeasuredTitle, type Rep, type TitleFit, type TitleKind } from "./canvas/representation";
import type { MapScene } from "./canvas/scene";
import { useReducedMotion } from "./canvas/useReducedMotion";
import { SIDES, beyond, chipAt, chipText, freeSpot, panToward, sameBeyond, screenRects, type Beyond, type Side } from "./canvas/chips";
import { traceTiming } from "./canvas/trace";
import { EdgeTip, type TipState } from "./canvas/EdgeTip";
import { SimplifiedMap } from "./canvas/SimplifiedMap";
import "./tree.css";

export type { MapScene } from "./canvas/scene";
export type { MapMode } from "./canvas/representation";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapViewHandle {
  fitAll(animate?: boolean): void;
  fitNodes(ids: Iterable<string>, animate?: boolean): void;
  zoomBy(factor: number): void;
  focusNode(id: string): void;
  expandAll(): void;
  collapseAll(): void;
  getScene(): MapScene;
  /** Apply a remembered scene at once, before any automatic framing. */
  restoreScene(scene: MapScene): void;
  /** Commit the unfolding that shows these records, then frame them. */
  revealIds(ids: readonly string[]): void;
  /** Move keyboard focus to a drawn card; false when it is not drawn. */
  focusCard(id: string): boolean;
  /**
   * Draw these records and frame them. With `exclusive`, the unfolding becomes
   * exactly the branches needed to draw them from the goal (everything else
   * folds) in one synchronised move; otherwise their routes are added to what
   * is open. False when the goal's argument draws none of them.
   */
  focusIds(ids: readonly string[], options?: { exclusive?: boolean }): boolean;
}

export interface TreeProps {
  graph: ArgGraph;
  /** The result at the top. Defaults to the first part's goal (the main theorem). */
  goal?: string;
  /** Accepted for compatibility with the earlier map view; ignored. */
  layout?: unknown;
  region?: string;
  onRegion?(id: string | null): void;
  selected?: string;
  trace?: Trace;
  lens?: Stage;
  /**
   * In the side pane (compact): the records of the passage being read; the
   * tree opens the route to them. On the map page: a transient preview, as
   * `previewIds` (kept until every caller passes previewIds).
   */
  echo?: ReadonlySet<string> | null;
  /** Records lit from elsewhere (a passage or ribbon under the pointer). Tints only; never unfolds or moves. */
  previewIds?: ReadonlySet<string> | null;
  insets: Insets;
  intro?: boolean;
  compact?: boolean;
  /** "steps" reads at k = 1; "overview" fits the whole goal. Uncontrolled when omitted. */
  mode?: MapMode;
  onModeChange?(mode: MapMode): void;
  /** After layout and camera settle (including the end of a pan or zoom). */
  onSceneSettled?(scene: MapScene): void;
  /** The body of the goal's plate: the theorem as a paper states it, and its checks. */
  rootContent?: ReactNode;
  /** The theorem's first sentence, shown under the plate's title in compact form when the tile has room. */
  rootExcerpt?: ReactNode;
  onSelect(id: string | null): void;
  onTrace(id: string): void;
  onHover?(id: string | null): void;
  /** The selected edge, as an ArgEdge.key (`${from}→${to}→${kind}`). */
  selectedEdge?: string;
  onEdgeSelect?(key: string | null): void;
  /** A per-account view: when set, the tree only shows records in this set (the root always). */
  within?: ReadonlySet<string>;
  /**
   * Records linked to the passage being read: an amber outline (distinct from
   * the selection), with the lines and assumption tags between them lit in
   * their type colours. Never unfolds or moves anything by itself.
   */
  litIds?: ReadonlySet<string> | null;
  /** Records the paper beside the map discusses; every other record is drawn faded (is-elsewhere). */
  coverage?: ReadonlySet<string> | null;
  /** Remember unfolded branches for the session (default). Off for a map that follows something else. */
  persist?: boolean;
  /** The reader moved the map themselves: a pan, a zoom, an unfold or an edge chip. */
  onUserMove?(): void;
}

const STORE = "lx-tree-expanded:";

/** Following a passage frames down to this scale; below 0.8 cards show their titles at a constant 13px. */
const FOCUS_FLOOR = 0.5;
/** Leaving cards and lines are gone this soon into a move, before they can cross another card. */
const EXIT_MS = 120;
/** Arriving cards fade in at their final places over the move's last part (from this fraction on). */
const ARRIVE_AT = 0.55;
/** A peek's records that are not opened are drawn at this strength. */
const PEEK_OPACITY = 0.5;
/** How long the pointer rests on a card before its lineage is drawn, and how long after leaving it folds back. */
const PEEK_IN_MS = 300;
/** A preview from the dock or inspector opens its records after resting this long, and puts the map back this long after it ends. */
const REVEAL_IN_MS = 180;
const REVEAL_OUT_MS = 250;
const PEEK_OUT_MS = 200;

/** World widths. Narrow enough that a goal's first row usually reads at k = 1 on a laptop. */
function widthOf(node: ArgNode, isRoot: boolean, compact: boolean, rootW: number): number {
  if (isRoot) return compact ? 260 : rootW;
  if (compact) return 184;
  if (node.kind === "declaration") return 196;
  return 176;
}

/** Layout ids of each record, per layout. */
const lidCache = new WeakMap<Layout, Map<string, string[]>>();
function lidsOf(l: Layout, record: string): string[] {
  let m = lidCache.get(l);
  if (!m) {
    m = new Map();
    for (const lid of l.boxes.keys()) {
      const r = recordOf(lid);
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(lid);
    }
    lidCache.set(l, m);
  }
  return m.get(record) ?? [];
}

function guessHeight(node: ArgNode, isRoot: boolean, compact: boolean): number {
  if (isRoot) return compact ? 76 : 300;
  if (compact) return 62;
  return node.kind === "declaration" ? 112 : 124;
}

function hashSet(set: ReadonlySet<string>): string {
  let h = 0;
  for (const id of [...set].sort()) for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

interface CardState {
  rect: Rect;
  op: number;
  sc: number;
}

interface Motion {
  start: number;
  dur: number;
  from: Map<string, CardState>;
  to: Map<string, CardState>;
  dummyFrom: Map<string, number>;
  entering: Set<string>;
  /** The camera's leg: its own start and length on the same clock, so a relayout never cuts it short. */
  view?: CameraLeg;
}

interface CameraLeg {
  from: View;
  to: View;
  start: number;
  dur: number;
  at(t: number): View;
}

interface Built {
  layout: Layout;
  plan: Plan;
  /** Drawn edges between layout ids (records, or occurrences of shared leaves); keys are drawn keys. */
  skeleton: EngineEdge[];
  /** Records drawn as several occurrences, with their number of drawn consumers. */
  shared: Map<string, number>;
  implied: Set<string>;
  provisional: boolean;
  pin: string | null;
}

export const ArgumentTree = forwardRef<MapViewHandle, TreeProps>(function ArgumentTree(props, ref) {
  const { graph: fullGraph, selected, trace, lens, echo, insets, intro, compact = false, rootContent, rootExcerpt, onSelect, onTrace, onHover, selectedEdge, onEdgeSelect, within } = props;
  const goal = props.goal && fullGraph.nodes.has(props.goal) ? props.goal : (fullGraph.regions[0]?.goal ?? fullGraph.goals[0]);
  const graph = useMemo(() => scopedGraph(fullGraph, goal), [fullGraph, goal]);
  const metrics = compact ? METRICS_COMPACT : METRICS;
  const goalRef = useRef(goal);
  goalRef.current = goal;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ width: 1, height: 1 });
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  // The plate narrows on a small screen so it reads whole at k = 1.
  const [paneW, setPaneW] = useState(0);
  const [paneH, setPaneH] = useState(0);
  const rootW = paneW > 0 && paneW < 860 ? Math.max(300, Math.min(800, Math.floor(paneW - 32))) : 800;
  const [hover, setHover] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [tip, setTip] = useState<TipState | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [rep, setRep] = useState<Rep>("card");
  const repRef = useRef<Rep>("card");
  const onSettledRef = useRef(props.onSceneSettled);
  onSettledRef.current = props.onSceneSettled;
  const onUserMoveRef = useRef(props.onUserMove);
  onUserMoveRef.current = props.onUserMove;
  const persist = props.persist ?? true;
  /** A transient reveal (map page): the records a pointed passage mark or inspector row names, opened and framed. */
  const [revealed, setRevealed] = useState<string[] | null>(null);
  const litIds = useMemo(() => {
    const own = props.litIds && props.litIds.size ? props.litIds : null;
    if (!revealed?.length) return own;
    return new Set([...(own ?? []), ...revealed]);
  }, [props.litIds, revealed]);

  // ---- Mode -------------------------------------------------------------------------

  const [modeState, setModeState] = useState<MapMode>("steps");
  const mode: MapMode = compact ? "steps" : (props.mode ?? modeState);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onModeChangeRef = useRef(props.onModeChange);
  onModeChangeRef.current = props.onModeChange;
  const controlled = props.mode !== undefined;
  const requestMode = useCallback(
    (m: MapMode) => {
      if (!controlled) setModeState(m);
      onModeChangeRef.current?.(m);
    },
    [controlled],
  );

  // On the map page, the echo channel is a transient preview; in the side pane it is the passage.
  const preview = compact ? null : (props.previewIds ?? echo ?? null);

  // ---- What is unfolded -------------------------------------------------------------

  const storeKey = STORE + goal + (within ? `|${hashSet(within)}` : "");
  const derived = !!(compact && within && echo && echo.size);
  const readStore = (key: string) => {
    if (!persist) return new Set<string>();
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* storage unavailable */
    }
    return new Set<string>();
  };
  const [expandedState, setExpanded] = useState<Set<string>>(() => readStore(storeKey));
  const keyRef = useRef(storeKey);
  useEffect(() => {
    if (keyRef.current === storeKey) return;
    keyRef.current = storeKey;
    setExpanded(readStore(storeKey));
  }, [storeKey]);
  useEffect(() => {
    // A reveal and a card's opened lineage are transient: what is remembered is what the reader opened for good.
    if (derived || !persist || revealHome.current || openHome.current) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify([...expandedState]));
    } catch {
      /* storage unavailable */
    }
  }, [expandedState, storeKey, derived, persist]);

  // In a passage view (side pane), the route to the passage's records is open; their
  // own uses stay folded. Toggles there flip that default until the passage changes.
  const [flips, setFlips] = useState<{ echo: ReadonlySet<string> | null | undefined; ids: Set<string> }>({ echo, ids: new Set() });
  const routeSet = useMemo(() => (derived ? routeTo(graph, goal, echo!, within) : null), [derived, graph, goal, echo, within]);
  const expanded = useMemo(() => {
    if (!derived || !routeSet) return expandedState;
    const open = new Set<string>();
    for (const id of routeSet) if (id !== goal && usesOf(graph, id, within).some((e) => routeSet.has(e.to))) open.add(id);
    if (flips.echo === echo) for (const id of flips.ids) open.has(id) ? open.delete(id) : open.add(id);
    return open;
  }, [derived, routeSet, expandedState, graph, goal, within, flips, echo]);

  const goalReach = useMemo(() => reach(graph, goal, within), [graph, goal, within]);
  /** What a card unfolds: its recorded supports and Lean correspondences. */
  const inputsOf = (id: string) => usesOf(graph, id, within).filter((e) => e.kind !== "assumes");
  /** Its explicit assumptions, drawn on the card as premise tags. */
  const tagsOf = (id: string) => usesOf(graph, id, within).filter((e) => e.kind === "assumes");

  const traced = useMemo(() => {
    if (!selected || !trace || !graph.nodes.has(selected)) return null;
    const all = closure(fullGraph, selected, trace === "rests" ? "prerequisites" : "consumers");
    return new Set([...all].filter((id) => goalReach.has(id)));
  }, [fullGraph, graph, selected, trace, goalReach]);

  const edgeObj = useMemo(() => (selectedEdge ? fullGraph.edges.find((e) => e.key === selectedEdge) ?? null : null), [fullGraph, selectedEdge]);

  // Whatever is selected or traced is unfolded into view: a deliberate act. A preview never is.
  useEffect(() => {
    if (derived) return;
    const targets = new Set<string>();
    if (selected && goalReach.has(selected)) targets.add(selected);
    if (traced) traced.forEach((id) => targets.add(id));
    if (edgeObj) [edgeObj.from, edgeObj.to].forEach((id) => goalReach.has(id) && targets.add(id));
    if (!targets.size) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = expandTo(graph, goal, targets, next, within);
      if (edgeObj && goalReach.has(edgeObj.from) && edgeObj.from !== goal && !next.has(edgeObj.from)) {
        next.add(edgeObj.from);
        changed = true;
      }
      if (traced && trace === "rests") {
        for (const id of traced) {
          if (id !== goal && usesOf(graph, id, within).length && !next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [derived, selected, traced, trace, edgeObj, graph, goal, goalReach, within]);

  // ---- The peek: a card's whole lineage, drawn faded while the pointer rests on it ----

  const [peek, setPeek] = useState<{ lid: string; id: string } | null>(null);
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const peekLineage = useMemo(() => (peek ? lineageOf(graph, peek.id, within) : null), [peek, graph, within]);
  const peekLineageRef = useRef(peekLineage);
  peekLineageRef.current = peekLineage;
  /** What is drawn: what is unfolded, plus a peeked lineage. */
  const drawnOpen = useMemo(() => (peek && !derived ? peekExpansion(graph, peek.id, expanded, within) : expanded), [peek, derived, graph, expanded, within]);
  const baseVisible = useMemo(() => (drawnOpen === expanded ? null : visibleSet(graph, goal, expanded, within)), [drawnOpen, expanded, graph, goal, within]);

  const visible = useMemo(() => visibleSet(graph, goal, drawnOpen, within), [graph, goal, drawnOpen, within]);
  const shownEdges = useMemo(() => visibleEdges(graph, goal, visible, drawnOpen, within), [graph, goal, visible, drawnOpen, within]);
  const skel = useMemo(() => transitiveReduction(visible, shownEdges), [visible, shownEdges]);

  // ---- Sizes and layout -------------------------------------------------------------

  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  const committed = useRef<Built | null>(null);
  const committedGoal = useRef<string | null>(null);
  const pinRef = useRef<string | null>(null);

  const built: Built = useMemo(() => {
    const prev = committedGoal.current === `${goal}|${compact}` ? committed.current : null;
    let provisional = false;
    // Assumptions are premise tags on their consumers, not nodes; a shared record
    // with nothing drawn below it is drawn under each of its consumers (a clone).
    const scope = layoutScope(goal, visible, skel.edges, (id) => graph.nodes.get(id)?.kind === "assumption");
    const split = splitSharedLeaves(goal, scope.nodes, scope.edges);
    const size = (lid: string): Size => {
      const id = recordOf(lid);
      const node = graph.nodes.get(id) ?? fullGraph.nodes.get(id)!;
      const isRoot = lid === goal;
      const h = heights.get(lid);
      if (h === undefined) provisional = true;
      if (lid !== id) return { w: compact ? 184 : 176, h: h ?? (compact ? 54 : 96) };
      return { w: widthOf(node, isRoot, compact, rootW), h: h ?? guessHeight(node, isRoot, compact) };
    };
    const nodeSet = new Set(split.nodes);
    let prevLayout = prev?.layout ?? null;
    let pin = pinRef.current;
    if (pin && !nodeSet.has(pin)) {
      // An occurrence opened: the record becomes one card where that occurrence was.
      const r = recordOf(pin);
      if (nodeSet.has(r) && prevLayout?.boxes.has(pin)) {
        prevLayout = { ...prevLayout, boxes: new Map(prevLayout.boxes).set(r, prevLayout.boxes.get(pin)!) };
        pin = r;
      } else pin = null;
    }
    const { layout, plan } = layoutTree({ root: goal, nodes: split.nodes, edges: split.edges, size, metrics, prev: prevLayout, pin });
    return { layout, plan, skeleton: split.edges, shared: split.shared, implied: skel.implied, provisional, pin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, goal, visible, skel, heights, compact, metrics, rootW]);
  const layout = built.layout;
  /** Cards a peek adds (not opened): drawn at half strength, never focusable. A clone is the peek's when its consumer is. */
  const peekFaded = useMemo(() => {
    const out = new Set<string>();
    if (!baseVisible) return out;
    for (const lid of layout.boxes.keys()) if (!baseVisible.has(recordOf(lid))) out.add(lid);
    for (const lid of layout.boxes.keys()) {
      const c = consumerOf(lid);
      if (lid !== recordOf(lid) && c && out.has(c)) out.add(lid);
    }
    return out;
  }, [baseVisible, layout]);
  const peekFadedRef = useRef(peekFaded);
  peekFadedRef.current = peekFaded;
  /** For each assumption, the drawn cards that carry it as a tag. */
  const tagHolders = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const lid of layout.boxes.keys())
      for (const e of usesOf(graph, recordOf(lid), within))
        if (e.kind === "assumes") {
          if (!m.has(e.to)) m.set(e.to, []);
          m.get(e.to)!.push(lid);
        }
    return m;
  }, [layout, graph, within]);

  // Cards that left: kept mounted while they move into their parent and fade.
  const renderedRef = useRef<Set<string>>(new Set());
  const exiting = useMemo(() => {
    const out = new Set<string>();
    for (const id of renderedRef.current) if (!layout.boxes.has(id) && graph.nodes.has(recordOf(id))) out.add(id);
    return out;
  }, [layout, graph]);
  const [exitCleared, setExitCleared] = useState<Set<string> | null>(null);
  const exitShown = exitCleared === exiting ? new Set<string>() : exiting;

  // Edges that stop being drawn fade out; new ones fade in.
  const ghostsAndFresh = useMemo(() => {
    const prev = committed.current;
    const now = new Set(built.skeleton.map((e) => e.key));
    const ghosts: EngineEdge[] = [];
    const fresh = new Set<string>();
    if (prev && committedGoal.current === `${goal}|${compact}`) {
      const before = new Set(prev.skeleton.map((e) => e.key));
      for (const e of prev.skeleton) if (!now.has(e.key)) ghosts.push(e);
      for (const e of built.skeleton) if (!before.has(e.key)) fresh.add(e.key);
    }
    return { ghosts, fresh };
  }, [built, goal, compact]);

  // ---- Element registries (positions and paths are written per frame, not by React) ----

  const cardEls = useRef(new Map<string, HTMLElement>());
  const cardVersion = useRef(0);
  const pathEls = useRef(new Map<string, SVGPathElement>());
  const labelEls = useRef(new Map<string, HTMLElement>());
  const cardRefCache = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const cardRef = (id: string) => {
    let fn = cardRefCache.current.get(id);
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) cardEls.current.set(id, el);
        else cardEls.current.delete(id);
        // A card drawn again is a new element: its title size and text flags are written afresh.
        fitOf.current.delete(id);
        measured.current.delete(id);
        cardVersion.current++;
      };
      cardRefCache.current.set(id, fn);
    }
    return fn;
  };
  const refCache = useRef(new Map<string, (el: SVGPathElement | null) => void>());
  const pathRef = (key: string) => {
    let fn = refCache.current.get(key);
    if (!fn) {
      fn = (el: SVGPathElement | null) => {
        if (el) pathEls.current.set(key, el);
        else pathEls.current.delete(key);
      };
      refCache.current.set(key, fn);
    }
    return fn;
  };
  const labelRefCache = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const labelRef = (id: string) => {
    let fn = labelRefCache.current.get(id);
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) labelEls.current.set(id, el);
        else labelEls.current.delete(id);
      };
      labelRefCache.current.set(id, fn);
    }
    return fn;
  };

  // ---- The clock -------------------------------------------------------------------

  const motion = useRef<Motion | null>(null);
  const shown = useRef(new Map<string, CardState>());
  const shownDummy = useRef(new Map<string, number>());
  const lastRouted = useRef<Routed | null>(null);
  const raf = useRef(0);
  const builtRef = useRef(built);
  builtRef.current = built;
  const ghostsRef = useRef(ghostsAndFresh);
  ghostsRef.current = ghostsAndFresh;
  const exitingRef = useRef(exiting);
  exitingRef.current = exiting;

  const applyView = useCallback((v: View, onAnimationFrame = false) => {
    const wrap = wrapRef.current;
    const zoom = zoomRef.current;
    if (!wrap || !zoom) return;
    // An automatic camera leg already runs on the paint clock. Keep its scale
    // compensation on that clock too, rather than queueing it one frame later.
    if (onAnimationFrame) paintScale(v.k);
    select(wrap).call(zoom.transform, zoomIdentity.translate(v.x, v.y).scale(v.k));
  }, []);

  /** Screen-space labels follow their cards every frame. */
  const placeLabels = useCallback(() => {
    const v = viewRef.current;
    const W = sizeRef.current.width;
    const positions: [HTMLElement, string][] = [];
    // Read every label before writing any transform, so one label cannot force
    // layout after the preceding label's style changed.
    for (const [id, el] of labelEls.current) {
      const r = shown.current.get(id)?.rect ?? builtRef.current.layout.boxes.get(id);
      if (!r) continue;
      const cx = (r.x + r.w / 2) * v.k + v.x;
      const top = r.y * v.k + v.y;
      const w = el.offsetWidth;
      const left = Math.max(8, Math.min(W - w - 8, cx - w / 2));
      positions.push([el, `translate(${left.toFixed(1)}px, ${(top - el.offsetHeight - 6).toFixed(1)}px)`]);
    }
    for (const [el, transform] of positions) el.style.transform = transform;
  }, []);

  /**
   * Compact and mark form: each tile's title at the largest size that fits it whole (13px down to
   * 10px on screen), and the lines the tile holds at that size. A mark shows its title whenever
   * it fits (data-text), judged by the mark's own size on screen; the plate adds the theorem's
   * first sentence when it has room (data-statement). Words are measured once per card with a
   * canvas at a reference size and wrapped arithmetically, so nothing is laid out per frame;
   * sizes and flags are written only when they change.
   */
  const fitOf = useRef(new Map<string, string>());
  const measured = useRef(new Map<string, { label: string; kind: TitleKind; title: HTMLElement; t: MeasuredTitle }>());
  const lastLineInputs = useRef<{ layout: Layout; k: number; rep: Rep; statementH: number; cards: number } | null>(null);
  /** Marks showing their whole title: a screen-space label over one would repeat it. */
  const titled = useRef(new Set<string>());
  /** The plate's first sentence: its height on screen at STATEMENT_W wide, 0 until measured. */
  const statementH = useRef(0);
  const applyLines = useCallback(() => {
    const k = viewRef.current.k;
    const rep = repRef.current;
    const mark = rep === "mark";
    const layout = builtRef.current.layout;
    const prev = lastLineInputs.current;
    // A representation render, the camera frame and the statement observer can
    // all request the same fit. Their arithmetic and DOM reads are shared until
    // an actual fitting input changes; new labels still receive their visibility.
    if (prev?.layout === layout && prev.k === k && prev.rep === rep && prev.statementH === statementH.current && prev.cards === cardVersion.current) {
      for (const [id, label] of labelEls.current) label.hidden = titled.current.has(id);
      return;
    }
    lastLineInputs.current = { layout, k, rep, statementH: statementH.current, cards: cardVersion.current };
    const boxes = layout.boxes;
    for (const [lid, el] of cardEls.current) {
      const box = boxes.get(lid) ?? shown.current.get(lid)?.rect;
      if (!box) continue;
      const kind: TitleKind = lid === goalRef.current ? "root" : el.dataset.kind === "declaration" ? "lean" : "card";
      let m = measured.current.get(lid);
      const title = m?.title ?? el.querySelector<HTMLElement>(".card__ctitle");
      if (!title) continue;
      const label = title.textContent ?? "";
      if (!m || m.label !== label || m.kind !== kind) {
        m = { label, kind, title, t: measureTitle(title, label, kind) };
        measured.current.set(lid, m);
      }
      let text = true;
      let statement = false;
      let fit: TitleFit;
      if (mark) {
        const f = fitMark(m.t, box.w, box.h, k, kind);
        fit = f;
        text = f.show;
      } else if (kind === "root") {
        const f = fitPlate(m.t, box.w, box.h, k, statementH.current);
        fit = f;
        statement = f.statement;
      } else fit = fitTitle(m.t, box.w, box.h, k, kind);
      if (mark && text && fit.fits) titled.current.add(lid);
      else titled.current.delete(lid);
      const key = `${fit.size}|${fit.lines}|${text}|${statement}|${fit.short ?? ""}`;
      if (fitOf.current.get(lid) === key) continue;
      fitOf.current.set(lid, key);
      el.style.setProperty("--title", `${fit.size}px`);
      el.style.setProperty("--lines", String(fit.lines));
      el.toggleAttribute("data-text", text);
      el.toggleAttribute("data-statement", statement);
      // A title that cannot fit is cut after a whole word (tree.css draws `data-short` in its place).
      if (fit.short) title.dataset.short = fit.short;
      else delete title.dataset.short;
    }
    for (const [id, label] of labelEls.current) label.hidden = titled.current.has(id);
  }, []);
  // The plate's sentence keeps one size on screen, so its height on screen changes only with its
  // text (it arrives once the papers load) and its fonts; each change refits the plate.
  const statementObserver = useRef<ResizeObserver | null>(null);
  const statementRef = useCallback(
    (el: HTMLDivElement | null) => {
      statementObserver.current?.disconnect();
      statementObserver.current = null;
      if (!el) return;
      const observer = new ResizeObserver(() => {
        const h = el.offsetHeight * viewRef.current.k;
        if (Math.abs(h - statementH.current) < 1) return;
        statementH.current = h;
        applyLines();
      });
      observer.observe(el);
      statementObserver.current = observer;
    },
    [applyLines],
  );
  // Measurements made before the web fonts arrived are redone once they have.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.addEventListener) return;
    const redo = () => {
      measured.current.clear();
      fitOf.current.clear();
      lastLineInputs.current = null;
      applyLines();
    };
    fonts.addEventListener("loadingdone", redo);
    void fonts.ready?.then(redo);
    return () => fonts.removeEventListener("loadingdone", redo);
  }, [applyLines]);

  // Camera input can arrive several times per frame. The world transform stays
  // synchronous for d3's picking/gesture coordinates; screen-space controls and
  // title fitting consume only the latest view once per frame.
  const chips = useRef<ChipState>(emptyChips());
  const controlsRef = useRef<{ update(chips: ChipState): void }>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const chipsRaf = useRef(0);
  const refitOnFrame = useRef(false);
  const paintedScale = useRef(1);
  const chipsEnabled = useRef(false);
  chipsEnabled.current = !compact && mode === "steps";
  function paintScale(k: number) {
    const wrap = wrapRef.current;
    if (!wrap || paintedScale.current === k) return;
    wrap.style.setProperty("--k", String(k));
    wrap.style.backgroundSize = `${22 * k}px ${22 * k}px`;
    paintedScale.current = k;
  }
  const refreshChips = useCallback(() => {
    if (chipsRaf.current) return;
    chipsRaf.current = requestAnimationFrame(() => {
      chipsRaf.current = 0;
      const v = viewRef.current;
      // --k is inherited by the whole drawing. Updating it per input event
      // makes the next wheel event's viewport read flush style/layout again,
      // even when both events precede the same paint. Publish only that paint's
      // final scale; gesture coordinates and the world transform stay immediate.
      paintScale(v.k);
      if (refitOnFrame.current) {
        refitOnFrame.current = false;
        applyLines();
      }
      placeLabels();
      const boxes = builtRef.current.layout.boxes;
      const vp = viewport();
      const showChips = chipsEnabled.current && repRef.current !== "mark";
      // Hidden chips have no positions or counts to publish. The note still
      // avoids cards, but never needs the connector obstacles used by chips.
      if (!showChips && !notesRef.current) return;
      const ids = showChips ? beyond(boxes, v, vp) : emptyChips().ids;
      // Screen-space controls never sit over a card: each slides along its edge to a free place, or hides.
      const rects = screenRects(boxes.values(), v);
      const { insets } = vp;
      // The notes sit at the bottom-left; when cards fill the bottom edge they move along it, else to the top edge.
      const ne = notesRef.current;
      let notes: { x: number; top: boolean } | null = null;
      if (ne) {
        const w = ne.offsetWidth;
        const h = ne.offsetHeight;
        const bottom = freeSpot("x", vp.height - insets.bottom - h, insets.left + w / 2, w, h, insets.left, vp.width - insets.right, rects, 24);
        const top = bottom === null ? freeSpot("x", insets.top, insets.left + w / 2, w, h, insets.left, vp.width - insets.right, rects, 24) : null;
        notes = bottom !== null ? { x: bottom - w / 2, top: false } : top !== null ? { x: top - w / 2, top: true } : null;
      }
      // Chips keep clear of the notes too.
      if (ne && notes) {
        const w = ne.offsetWidth;
        const h = ne.offsetHeight;
        const y0 = notes.top ? insets.top : vp.height - insets.bottom - h;
        rects.push({ x0: notes.x - 6, x1: notes.x + w + 6, y0: y0 - 6, y1: y0 + h + 6 });
      }
      // And off the lines where a gap between them exists: horizontal runs for chips that slide
      // up and down an edge, vertical runs for chips that slide along the top or bottom.
      const hLines: typeof rects = [];
      const vLines: typeof rects = [];
      const routedNow = lastRouted.current;
      if (showChips && routedNow) {
        const add = (a: Pt, b: Pt) => {
          const x0 = Math.min(a.x, b.x) * v.k + v.x;
          const x1 = Math.max(a.x, b.x) * v.k + v.x;
          const y0 = Math.min(a.y, b.y) * v.k + v.y;
          const y1 = Math.max(a.y, b.y) * v.k + v.y;
          if (Math.abs(a.y - b.y) < 0.5) hLines.push({ x0, x1, y0: y0 - 5, y1: y1 + 5 });
          else if (Math.abs(a.x - b.x) < 0.5) vLines.push({ x0: x0 - 5, x1: x1 + 5, y0, y1 });
        };
        for (const re of routedNow.edges.values()) for (let i = 1; i < re.points.length; i++) add(re.points[i - 1], re.points[i]);
        for (const rb of routedNow.buses.values()) add(rb.stem[0], rb.stem[1]);
      }
      const place = (axis: "x" | "y", fixed: number, want: number, w: number, h: number, lo: number, hi: number) =>
        freeSpot(axis, fixed, want, w, h, lo, hi, [...rects, ...(axis === "y" ? hLines : vLines)]) ?? freeSpot(axis, fixed, want, w, h, lo, hi, rects);
      const at = {} as Record<Side, number | null>;
      for (const side of SIDES) {
        if (!ids[side].length) {
          at[side] = null;
          continue;
        }
        const want = chipAt(side, ids[side], boxes, v, vp);
        const w = 118;
        const h = 30;
        if (side === "left") at[side] = place("y", Math.max(4, insets.left - 12), want, w, h, insets.top, vp.height - insets.bottom);
        else if (side === "right") at[side] = place("y", vp.width - Math.max(4, insets.right - 12) - w, want, w, h, insets.top, vp.height - insets.bottom);
        else if (side === "up") at[side] = place("x", Math.max(4, insets.top - 12), want, w, h, insets.left, vp.width - insets.right);
        else at[side] = place("x", vp.height - insets.bottom - 4 - h, want, w, h, insets.left, vp.width - insets.right);
        // Cards cut by the bottom or top edge leave no free place there; the chip still says
        // what lies beyond, sitting on the cut-off edge of the row rather than over its titles.
        if (at[side] === null && (side === "down" || side === "up")) at[side] = Math.round(want);
      }
      const prev = chips.current;
      if (!sameBeyond(prev.ids, ids) || !SIDES.every((side) => prev.at[side] === at[side] || (prev.at[side] !== null && at[side] !== null && Math.abs(prev.at[side]! - at[side]!) < 2)) || prev.notes?.x !== notes?.x || prev.notes?.top !== notes?.top) {
        chips.current = { ids, at, notes };
        controlsRef.current?.update(chips.current);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = useCallback(
    (now: number) => {
      const b = builtRef.current;
      const m = motion.current;
      const raw = m && m.dur > 0 ? Math.min(1, Math.max(0, (now - m.start) / m.dur)) : 1;
      const e = easeMove(raw);
      // A staged move, so two maps never show through each other: leaving cards fade
      // where they are within EXIT_MS; staying cards and the camera move together;
      // arriving cards fade in at their final places over the last part of the move.
      const fadeOut = m && m.dur > 0 ? Math.min(1, Math.max(0, (now - m.start) / EXIT_MS)) : 1;
      const fadeIn = m && m.dur > 0 ? easeMove(Math.min(1, Math.max(0, (raw - ARRIVE_AT) / (1 - ARRIVE_AT)))) : 1;
      // Cards.
      const boxes = new Map<string, Rect>();
      const all = new Map<string, Rect>();
      const faded = peekFadedRef.current;
      const states = m ? m.to : new Map([...b.layout.boxes].map(([id, rect]) => [id, { rect, op: 1, sc: 1 }]));
      for (const [id, to] of states) {
        const from = m?.from.get(id) ?? to;
        const leaving = !!m && to.op === 0;
        const arriving = !!m && m.entering.has(id);
        const s: CardState = {
          rect: leaving ? from.rect : { x: lerp(from.rect.x, to.rect.x, e), y: lerp(from.rect.y, to.rect.y, e), w: to.rect.w, h: to.rect.h },
          op: leaving ? from.op * (1 - fadeOut) : arriving ? lerp(from.op, to.op, fadeIn) : lerp(from.op, to.op, e),
          sc: 1,
        };
        shown.current.set(id, s);
        all.set(id, s.rect);
        if (b.layout.boxes.has(id)) boxes.set(id, s.rect);
        const el = cardEls.current.get(id);
        if (el) {
          el.style.transform = `translate(${s.rect.x}px, ${s.rect.y}px)`;
          // A peek's records not yet opened are drawn at half strength.
          const op = s.op * (faded.has(id) ? PEEK_OPACITY : 1);
          el.style.opacity = op < 1 ? String(op) : "";
          el.style.zIndex = m && raw < 1 && (arriving || leaving) ? "0" : "";
        }
      }
      const dummyX = (key: string) => {
        const to = b.layout.dummies.get(key)!.x;
        const from = m?.dummyFrom.get(key) ?? to;
        const x = lerp(from, to, e);
        shownDummy.current.set(key, x);
        return x;
      };
      const routed = route(b.plan, { boxes, dummyX, ignoreRows: m && raw < 1 ? m.entering : undefined });
      lastRouted.current = routed;
      writePaths(routed, all, fadeIn, fadeOut);
      // Camera on the same clock.
      let cameraMoving = false;
      if (m?.view) {
        const v = m.view;
        const t = v.dur > 0 ? Math.min(1, Math.max(0, (now - v.start) / v.dur)) : 1;
        applyView(t >= 1 ? v.to : v.at(easeMove(t)), true);
        cameraMoving = t < 1;
      }
      placeLabels();
      if (m && (raw < 1 || cameraMoving)) raf.current = requestAnimationFrame(draw);
      else if (m) {
        motion.current = null;
        raf.current = 0;
        setMoving(false);
        setExitCleared(exitingRef.current);
        scheduleSettle();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function writePaths(routed: Routed, all: Map<string, Rect>, e: number, gone = e) {
    const els = pathEls.current;
    const r = metrics.radius;
    const b = builtRef.current;
    const { fresh, ghosts } = ghostsRef.current;
    const busD = new Map<string, string>();
    const busF = new Map<string, string>();
    for (const pe of b.plan.edges.values()) {
      const re = routed.edges.get(pe.key);
      if (!re) continue;
      const d = roundedPath(re.points, r);
      const isFresh = fresh.has(pe.key);
      if (pe.bus) {
        const map = isFresh ? busF : busD;
        map.set(pe.from, (map.get(pe.from) ?? "") + d);
      }
      set(els, `edge:${pe.key}`, d, isFresh ? e : 1);
      set(els, `case:${pe.key}`, d, isFresh ? e : 1);
      set(els, `ov:${pe.key}`, d);
      set(els, `lit:${pe.key}`, d);
      set(els, `litcase:${pe.key}`, d);
      set(els, `plit:${pe.key}`, d);
      set(els, `klit:${pe.key}`, d);
      set(els, `klitcase:${pe.key}`, d);
      set(els, `plitcase:${pe.key}`, d);
      set(els, `mask:${pe.key}`, d);
      set(els, `sel:${pe.key}`, d);
      set(els, `hit:${pe.key}`, roundedPath(re.own, r));
      if (pe.arrow) {
        const head = pe.bus ? routed.buses.get(pe.from)?.head : routed.heads.get(pe.key);
        if (head) {
          const hd = polygonPath(head);
          set(els, `ahead:${pe.key}`, hd, isFresh ? e : 1);
          set(els, `lithead:${pe.key}`, hd);
          set(els, `plithead:${pe.key}`, hd);
          set(els, `klithead:${pe.key}`, hd);
          set(els, `selhead:${pe.key}`, hd);
          set(els, `ovhead:${pe.key}`, hd);
        }
      }
      const j = re.junction;
      const rr = compact ? 2.5 : 3.25;
      set(els, `ring:${pe.key}`, `M${(j.x - rr).toFixed(1)},${j.y.toFixed(1)}a${rr},${rr} 0 1,0 ${2 * rr},0a${rr},${rr} 0 1,0 ${-2 * rr},0`, isFresh ? e : 1);
    }
    for (const [parent, rb] of routed.buses) {
      const stem = roundedPath(rb.stem, r);
      set(els, `bus:${parent}`, (busD.get(parent) ?? "") + stem);
      set(els, `buscase:${parent}`, (busD.get(parent) ?? "") + stem);
      set(els, `busf:${parent}`, busF.get(parent) ?? "", e);
      set(els, `head:${parent}`, polygonPath(rb.head), busD.has(parent) ? 1 : e);
      set(els, `hitstem:${parent}`, stem);
      set(els, `ovstem:${parent}`, stem);
    }
    for (const g of ghosts) {
      const c = all.get(g.to);
      const p = all.get(g.from);
      const el = els.get(`ghost:${g.key}`);
      if (!el) continue;
      if (!c || !p) {
        el.setAttribute("d", "");
        continue;
      }
      const cx = c.x + c.w / 2;
      const px = p.x + p.w / 2;
      const mid = (c.y + p.y + p.h) / 2;
      const pts: Pt[] = [
        { x: cx, y: c.y },
        { x: cx, y: mid },
        { x: px, y: mid },
        { x: px, y: p.y + p.h },
      ];
      el.setAttribute("d", roundedPath(pts, r));
      el.style.opacity = String(1 - gone);
    }
  }

  function set(els: Map<string, SVGPathElement>, key: string, d: string, opacity?: number) {
    const el = els.get(key);
    if (!el) return;
    if (el.getAttribute("d") !== d) el.setAttribute("d", d);
    if (opacity !== undefined) el.style.opacity = opacity < 1 ? String(Math.max(0, opacity)) : "";
  }

  const viewport = (): Viewport => ({ width: sizeRef.current.width, height: sizeRef.current.height, insets: insetsRef.current });

  /** A camera leg along the smooth-zoom path (van Wijk and Nuij), eased in and out. */
  const leg = (from: View, to: View, start: number, dur: number, linear = false): CameraLeg => {
    // A straight pan (holding a card still while the layout moves under it) follows the cards' own curve exactly.
    if (linear) return { from, to, start, dur, at: (t) => ({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), k: lerp(from.k, to.k, t) }) };
    const path = zoomPath(from, to, viewport());
    return { from, to, start, dur, at: path.at };
  };
  /** The time a move along that path takes, by its length. */
  const travelFor = (from: View, to: View) => travelMs(zoomPath(from, to, viewport()).length);

  /** Where the camera is heading (or is). Reveals are judged against this, so they never fight a move in flight. */
  const targetView = (): View => cameraOnly.current?.to ?? motion.current?.view?.to ?? viewRef.current;

  /** Move the camera on the shared clock: with a card motion that starts now, else on its own leg of the same curve. */
  const moveCamera = useCallback(
    (to: View, animate = true, dur = MOVE_MS) => {
      const m = motion.current;
      if (!animate || reducedRef.current) {
        if (m) m.view = undefined;
        cameraOnly.current = null;
        applyView(to);
        scheduleSettle();
        return;
      }
      const now = performance.now();
      if (m && m.dur > 0 && now - m.start < 34) {
        m.view = leg(viewRef.current, to, m.start, m.dur);
        cameraOnly.current = null;
        return;
      }
      if (m) m.view = undefined;
      cameraOnly.current = leg(viewRef.current, to, now, dur);
      if (!cameraRaf.current) cameraRaf.current = requestAnimationFrame(cameraTick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyView],
  );
  const cameraOnly = useRef<CameraLeg | null>(null);
  const cameraRaf = useRef(0);
  const cameraTick = (now: number) => {
    const c = cameraOnly.current;
    if (!c) {
      cameraRaf.current = 0;
      return;
    }
    const raw = Math.min(1, (now - c.start) / c.dur);
    applyView(raw >= 1 ? c.to : c.at(easeMove(raw)), true);
    if (raw < 1) cameraRaf.current = requestAnimationFrame(cameraTick);
    else {
      cameraOnly.current = null;
      cameraRaf.current = 0;
      scheduleSettle();
    }
  };

  // ---- Settling ---------------------------------------------------------------------
  // Once nothing moves, the request (selection, trace, step) must be met — under
  // reduced motion and after a sheet changes the insets too — and the page hears
  // about the scene it can remember.

  const restoreRef = useRef<MapScene | null>(null);
  const framedRef = useRef(false);
  const enteringRef = useRef(false);
  const userMovedSinceAsk = useRef(false);
  const settleTimer = useRef(0);
  const lastSettled = useRef("");
  const askViewRef = useRef<() => View | null>(() => null);
  const getSceneRef = useRef<() => MapScene>(() => ({ camera: { ...viewRef.current }, expanded: [], mode: "steps" }));
  const scheduleSettle = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (motion.current || cameraOnly.current || builtRef.current.provisional || !readyRef.current) return;
      refreshChips();
      if (restoreRef.current) restoreRef.current = null;
      else if (!userMovedSinceAsk.current) {
        const v = askViewRef.current();
        if (v) {
          moveCamera(v, true, CAMERA_MS);
          return;
        }
      }
      const scene = getSceneRef.current();
      // Keyed by the entry too: the same scene still has to be written into a new history entry.
      const key = `${window.location.href}|${JSON.stringify(scene)}`;
      if (key === lastSettled.current) return;
      lastSettled.current = key;
      onSettledRef.current?.(scene);
    }, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Start a motion whenever the layout changes.
  const pendingCamera = useRef<null | ((l: Layout) => View | null)>(null);
  /** The card a peek is opened or folded from: held still on screen through the move. */
  const anchorLid = useRef<string | null>(null);
  /** Where a folding peek returns the camera. */
  const peekReturn = useRef<View | null>(null);
  /** The pending camera is a focus on a passage's records (it takes the distance-scaled duration). */
  const pendingFocus = useRef(false);
  useLayoutEffect(() => {
    const now = performance.now();
    const prev = committed.current;
    const sameScene = !!prev && committedGoal.current === `${goal}|${compact}`;
    const from = new Map<string, CardState>();
    const to = new Map<string, CardState>();
    const entering = new Set<string>();
    for (const [id, rect] of layout.boxes) {
      to.set(id, { rect, op: 1, sc: 1 });
      const cur = sameScene ? shown.current.get(id) : undefined;
      if (cur) {
        from.set(id, cur);
        if (motion.current?.entering.has(id) && cur.op < 1) entering.add(id);
      } else if (sameScene) {
        // New cards arrive at their final places, fading in once the others have made room.
        entering.add(id);
        from.set(id, { rect, op: 0, sc: 1 });
      } else from.set(id, { rect, op: 1, sc: 1 });
    }
    for (const id of exiting) {
      const cur = shown.current.get(id);
      if (!cur) continue;
      // Leaving cards fade where they are (EXIT_MS), before the others move across their place.
      from.set(id, cur);
      to.set(id, { rect: cur.rect, op: 0, sc: 1 });
    }
    for (const id of [...shown.current.keys()]) if (!to.has(id)) shown.current.delete(id);
    const dummyFrom = new Map<string, number>();
    for (const [key, d] of layout.dummies) {
      const known = sameScene ? shownDummy.current.get(key) : undefined;
      if (known !== undefined) dummyFrom.set(key, known);
      else {
        // Between where its two ends start.
        const pe = built.plan.edges.get(d.edge)!;
        const a = from.get(pe.from)?.rect;
        const c = from.get(pe.to)?.rect;
        if (a && c) {
          const t = (d.rank - pe.rankFrom) / (pe.rankTo - pe.rankFrom);
          dummyFrom.set(key, lerp(a.x + a.w / 2, c.x + c.w / 2, t));
        }
      }
    }
    for (const key of [...shownDummy.current.keys()]) if (!layout.dummies.has(key)) shownDummy.current.delete(key);
    // Until the first framing (and during the entrance) the layout settles in place: nothing slides into view.
    const animate = sameScene && !reducedRef.current && !restoreRef.current && framedRef.current && !enteringRef.current;
    const before = motion.current;
    cancelAnimationFrame(raf.current);
    // The camera's target comes from the final layout: a focus waits out a provisional pass (sizes still guessed).
    let camera: View | null = null;
    const focusing = pendingFocus.current;
    if (pendingCamera.current && ready && !restoreRef.current && !(focusing && built.provisional)) {
      camera = pendingCamera.current(layout);
      if (!built.provisional) {
        pendingCamera.current = null;
        pendingFocus.current = false;
      }
    }
    // Following the text, cards, lines and camera share one duration that grows with the camera's travel.
    const dur = !animate ? 0 : focusing && camera ? travelFor(viewRef.current, camera) : MOVE_MS;
    motion.current = { start: now, dur, from, to, dummyFrom, entering };
    // A peek opens or folds: the card under the pointer stays where it is on screen, the camera taking up its shift.
    let hold = false;
    const anchor = anchorLid.current;
    anchorLid.current = null;
    const home = peekReturn.current;
    peekReturn.current = null;
    if (!camera && home && ready && framedRef.current) camera = home;
    else if (!camera && anchor && ready && framedRef.current) {
      const was = shown.current.get(anchor)?.rect;
      const will = layout.boxes.get(anchor);
      if (was && will && (Math.abs(will.x - was.x) > 0.5 || Math.abs(will.y - was.y) > 0.5)) {
        const v = viewRef.current;
        camera = { k: v.k, x: v.x - (will.x - was.x) * v.k, y: v.y - (will.y - was.y) * v.k };
        hold = true;
      }
    }
    if (camera) {
      // One camera move at a time: this one starts from wherever the last one had got to.
      cameraOnly.current = null;
      motion.current.view = animate ? leg(viewRef.current, camera, now, dur, hold) : leg(camera, camera, now, 0);
    }
    // A camera move still in flight keeps its own clock across a relayout (a card measured late, say).
    else if (before?.view && now - before.view.start < before.view.dur) motion.current.view = before.view;
    if (animate || motion.current.view) setMoving(true);
    draw(now);
    renderedRef.current = new Set([...layout.boxes.keys(), ...exiting]);
    if (!built.provisional) {
      committed.current = built;
      committedGoal.current = `${goal}|${compact}`;
      pinRef.current = null;
    }
    // A remembered scene: put the anchor card back exactly where it was.
    const restore = restoreRef.current;
    if (restore) applyView(restoredView(restore, layout));
    refreshChips();
    if (!animate) scheduleSettle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  useEffect(
    () => () => {
      // Reset as well as cancel: a remount (StrictMode) must be able to schedule again.
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(cameraRaf.current);
      cancelAnimationFrame(chipsRaf.current);
      raf.current = 0;
      cameraRaf.current = 0;
      chipsRaf.current = 0;
      cameraOnly.current = null;
    },
    [],
  );

  // Redraw paths after any render (new overlay elements need their geometry now).
  useLayoutEffect(() => {
    // A caller can replace a rendered title without rebuilding its box. Preserve
    // that content check while camera-only frames reuse the element and fit.
    for (const m of measured.current.values()) {
      if (m.label === m.title.textContent) continue;
      lastLineInputs.current = null;
      break;
    }
    applyLines();
    if (!motion.current && lastRouted.current) {
      const all = new Map<string, Rect>();
      for (const [id, s] of shown.current) all.set(id, s.rect);
      writePaths(lastRouted.current, all, 1, 1);
    }
    placeLabels();
  });

  // Measure every card before (re)layout settles: sizes come from the DOM.
  useLayoutEffect(() => {
    const next = new Map(heights);
    let changed = false;
    for (const id of layout.boxes.keys()) {
      const el = cardEls.current.get(id);
      if (!el) continue;
      const h = Math.ceil(el.offsetHeight);
      if (h > 0 && Math.abs((next.get(id) ?? -99) - h) > 1) {
        next.set(id, h);
        changed = true;
      }
    }
    if (changed) setHeights(next);
  });
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      const updates = new Map<string, number>();
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.card;
        if (!id) continue;
        const h = Math.ceil((entry.target as HTMLElement).offsetHeight);
        if (h > 0) updates.set(id, h);
      }
      setHeights((prev) => {
        const next = new Map(prev);
        for (const [id, h] of updates)
          if (Math.abs((prev.get(id) ?? -99) - h) > 1) {
            next.set(id, h);
            changed = true;
          }
        return changed ? next : prev;
      });
    });
    for (const el of cardEls.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  // ---- Camera -----------------------------------------------------------------------

  /** The card that stands for a record: the record itself, else its occurrence nearest the view. */
  const pick = (l: Layout, id: string): string | null => {
    if (l.boxes.has(id)) return id;
    const lids = lidsOf(l, id);
    if (lids.length <= 1) return lids[0] ?? null;
    const v = targetView();
    const vp = viewport();
    const cx = (vp.width / 2 - v.x) / v.k;
    const cy = (vp.height / 2 - v.y) / v.k;
    let best = lids[0];
    let d0 = Infinity;
    for (const lid of lids) {
      const r = l.boxes.get(lid)!;
      const d = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy);
      if (d < d0) [d0, best] = [d, lid];
    }
    return best;
  };
  const hasRec = (l: Layout, id: string) => l.boxes.has(id) || lidsOf(l, id).length > 0;

  const boundsOf = useCallback((l: Layout, ids: Iterable<string>, pad = 36): Bounds | null => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const id of ids) {
      const lid = pick(l, id);
      const box = lid ? l.boxes.get(lid) : undefined;
      if (!box) continue;
      b.x0 = Math.min(b.x0, box.x - pad);
      b.x1 = Math.max(b.x1, box.x + box.w + pad);
      b.y0 = Math.min(b.y0, box.y - pad);
      b.y1 = Math.max(b.y1, box.y + box.h + pad);
    }
    return Number.isFinite(b.x0) ? b : null;
  }, []);
  const boxOf = (l: Layout, id: string, pad = 0): Bounds | null => boundsOf(l, [id], pad);

  const floor = compact ? COMPACT_FLOOR : STEPS_FLOOR;

  /** Reading scale for a box: k = 1, or down to the floor if that fits the box across; never lower. */
  const readingK = (b: Bounds, max = STEPS_K) => {
    const vp = viewport();
    const availW = vp.width - vp.insets.left - vp.insets.right;
    const k = availW / Math.max(1, b.x1 - b.x0);
    return k >= max ? max : k >= floor ? k : max;
  };

  /** Steps: the goal and its direct inputs at reading size, top-aligned; what does not fit is counted by the edge chips. */
  const startView = useCallback(
    (l: Layout): View | null => {
      const vp = viewport();
      if (compact && echo?.size) {
        const b = boundsOf(l, [...echo].filter((id) => hasRec(l, id)), 24);
        if (b) return fitBounds(b, vp, { min: COMPACT_FLOOR, max: 1 });
      }
      const ids = [goal, ...builtRef.current.skeleton.filter((e) => e.from === goal).map((e) => e.to)];
      const b = boundsOf(l, ids, compact ? 24 : 14);
      if (!b) return null;
      if (compact) return fitBounds(b, vp, { max: 1, min: COMPACT_FLOOR, top: true });
      // The plate and its whole first row inside the visible canvas: k = 1 if that fits,
      // else the largest k down to the floor that fits, else the floor with the plate on top.
      const availW = vp.width - vp.insets.left - vp.insets.right;
      const availH = vp.height - vp.insets.top - vp.insets.bottom;
      const fit = Math.min(availW / Math.max(1, b.x1 - b.x0), availH / Math.max(1, b.y1 - b.y0));
      const k = fit >= STEPS_K ? STEPS_K : Math.max(floor, fit);
      return frameBox(b, vp, { min: k, max: k, anchor: boxOf(l, goal), top: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, goal, within, compact, echo, boundsOf, floor],
  );

  const overviewView = useCallback(
    (l: Layout): View => {
      const b = layoutBounds(l);
      // Room above the goal for its screen label.
      const vp = viewport();
      return fitBounds({ x0: b.x0 - 24, y0: b.y0 - 24, x1: b.x1 + 24, y1: b.y1 + 24 }, { ...vp, insets: { ...vp.insets, top: vp.insets.top + 34 } }, { max: 1, min: MIN_K });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Steps around one record: it and its drawn inputs at reading size, the record itself kept in view. */
  const aroundView = useCallback(
    (l: Layout, id: string): View | null => {
      const lid = pick(l, id);
      if (!lid) return null;
      const inputs = builtRef.current.skeleton.filter((e) => e.from === lid).map((e) => e.to);
      const b = boundsOf(l, [lid, ...inputs], 32);
      if (!b) return null;
      const k = readingK(b);
      return frameBox(b, viewport(), { min: k, max: k, anchor: boxOf(l, lid, 24), top: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boundsOf, floor],
  );

  /** Ask for a camera move computed on the next settled layout (or now, if nothing is pending). */
  const askCamera = useCallback(
    (fn: (l: Layout) => View | null, waitForLayout: boolean) => {
      if (waitForLayout) {
        pendingCamera.current = fn;
        return;
      }
      const v = fn(builtRef.current.layout);
      if (v) moveCamera(v);
    },
    [moveCamera],
  );

  /** The smallest move that brings `ids` into view; never below the reading floor in Steps. */
  const revealFn = useCallback(
    (ids: Iterable<string>, anchor?: string | null, pad = 28) =>
      (l: Layout) => {
        const b = boundsOf(l, ids, pad);
        if (!b) return null;
        const cur = targetView();
        const a = anchor ? boxOf(l, anchor, pad) : null;
        if (modeRef.current === "overview") return revealBox(b, viewport(), cur, cur.k, a);
        // Steps never chooses a scale below the reading floor; what does not fit is counted by the edge chips.
        if (cur.k < floor - 1e-3) return frameBox(b, viewport(), { min: floor, max: floor, anchor: a, top: true });
        return revealBox(b, viewport(), cur, floor, a);
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boundsOf, floor],
  );

  /**
   * Following a passage: every one of its drawn records, centred in the visible
   * canvas with a margin, at the largest scale up to 1 that fits them, down to
   * FOCUS_FLOOR (below 0.8 cards read as titles). The cards that use them join
   * the frame only when they still fit at that scale. Only a set that cannot
   * fit even at the floor is centred there, with the edge chips counting the rest.
   */
  const focusReq = useRef<string[] | null>(null);
  /** The camera is the focus's until the reader moves it: resizes and inspectors re-centre it. */
  const focusHeld = useRef(false);
  const focusFrame = useCallback(
    (ids: readonly string[]) =>
      (l: Layout): View | null => {
        const skeleton = builtRef.current.skeleton;
        const pad = 28;
        const grow = (r: Rect): Bounds => ({ x0: r.x - pad, y0: r.y - pad, x1: r.x + r.w + pad, y1: r.y + r.h + pad });
        const lit: { lid: string; box: Bounds }[] = [];
        const tags: string[] = [];
        for (const id of ids) {
          if (graph.nodes.get(id)?.kind === "assumption") tags.push(id);
          else {
            const lid = pick(l, id);
            if (lid) lit.push({ lid, box: grow(l.boxes.get(lid)!) });
          }
        }
        // An assumption is drawn as tags on the records that assume it (every tag lights):
        // the holder nearest the other lit cards stands for it, else the highest one.
        const centre = lit.length
          ? { x: lit.reduce((a, c) => a + (c.box.x0 + c.box.x1) / 2, 0) / lit.length, y: lit.reduce((a, c) => a + (c.box.y0 + c.box.y1) / 2, 0) / lit.length }
          : null;
        for (const id of tags) {
          const holders = [...l.boxes.keys()].filter((lid) => usesOf(graph, recordOf(lid), within).some((e) => e.kind === "assumes" && e.to === id));
          if (!holders.length) continue;
          const score = (lid: string) => {
            const r = l.boxes.get(lid)!;
            return centre ? Math.hypot(r.x + r.w / 2 - centre.x, r.y + r.h / 2 - centre.y) : r.y * 10 + r.x;
          };
          holders.sort((a, b) => score(a) - score(b));
          if (!lit.some((c) => c.lid === holders[0])) lit.push({ lid: holders[0], box: grow(l.boxes.get(holders[0])!) });
        }
        if (!lit.length) return null;
        const union = (list: Bounds[]): Bounds => ({
          x0: Math.min(...list.map((b) => b.x0)),
          y0: Math.min(...list.map((b) => b.y0)),
          x1: Math.max(...list.map((b) => b.x1)),
          y1: Math.max(...list.map((b) => b.y1)),
        });
        const vp = viewport();
        const availW = Math.max(60, vp.width - vp.insets.left - vp.insets.right);
        const availH = Math.max(60, vp.height - vp.insets.top - vp.insets.bottom);
        const fitOf = (b: Bounds) => Math.min(availW / Math.max(1, b.x1 - b.x0), availH / Math.max(1, b.y1 - b.y0));
        const core = union(lit.map((c) => c.box));
        const k = Math.max(FOCUS_FLOOR, Math.min(STEPS_K, fitOf(core)));
        // The cards that use them, if they still fit at that scale (of the goal's tall plate, only its foot).
        const ids0 = new Set(lit.map((c) => c.lid));
        const users: Bounds[] = [];
        for (const e of skeleton) {
          if (!ids0.has(e.to) || ids0.has(e.from)) continue;
          const c = l.boxes.get(e.from);
          if (!c) continue;
          const t = l.boxes.get(e.to)!;
          users.push(e.from === goal ? { x0: Math.max(c.x, t.x - 60), x1: Math.min(c.x + c.w, t.x + t.w + 60), y0: c.y + c.h - 72, y1: c.y + c.h + pad } : grow(c));
        }
        const withUsers = users.length ? union([core, ...users]) : core;
        const box = users.length && fitOf(withUsers) >= k - 1e-6 ? withUsers : core;
        // Centred in the visible canvas (fitBounds centres whatever fits; at the floor, the box's centre).
        const x = vp.insets.left + availW / 2 - ((box.x0 + box.x1) / 2) * k;
        const y = vp.insets.top + availH / 2 - ((box.y0 + box.y1) / 2) * k;
        return { x, y, k };
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, goal, within],
  );

  // ---- Scenes -----------------------------------------------------------------------

  const expandedRef = useRef(expandedState);
  expandedRef.current = expandedState;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  /** The camera is remembered relative to the goal's plate, which a rebuilt layout keeps as its origin. */
  const getScene = useCallback((): MapScene => {
    const v = viewRef.current;
    const l = builtRef.current.layout;
    const root = l.boxes.get(goal);
    const camera = root ? { x: v.x + root.x * v.k, y: v.y + root.y * v.k, k: v.k } : { ...v };
    // The anchor: the selection if drawn, else the card nearest the middle of the view.
    let anchorId = selectedRef.current ? pick(l, selectedRef.current) : null;
    if (!anchorId) {
      const vp = viewport();
      const mx = (vp.width / 2 - v.x) / v.k;
      const my = (vp.height / 2 - v.y) / v.k;
      let best = Infinity;
      for (const [id, r] of l.boxes) {
        const d = Math.hypot(r.x + r.w / 2 - mx, r.y + r.h / 2 - my);
        if (d < best) [best, anchorId] = [d, id];
      }
    }
    const a = anchorId ? l.boxes.get(anchorId)! : null;
    return {
      camera,
      expanded: [...expandedRef.current].sort(),
      mode: modeRef.current,
      ...(a && anchorId ? { anchor: { id: anchorId, x: a.x * v.k + v.x, y: a.y * v.k + v.y } } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);
  getSceneRef.current = getScene;

  function restoredView(scene: MapScene, l: Layout): View {
    const k = scene.camera.k;
    const aid = scene.anchor ? (l.boxes.has(scene.anchor.id) ? scene.anchor.id : pick(l, recordOf(scene.anchor.id))) : null;
    const a = aid ? l.boxes.get(aid) : undefined;
    if (a && scene.anchor) return { k, x: scene.anchor.x - a.x * k, y: scene.anchor.y - a.y * k };
    const root = l.boxes.get(goal);
    return root ? { k, x: scene.camera.x - root.x * k, y: scene.camera.y - root.y * k } : { ...scene.camera };
  }

  // ---- Handle -----------------------------------------------------------------------

  const fittedGoal = useRef<string | null>(null);
  const userMoved = useRef(false);
  const skipModeFrame = useRef(false);
  const lastAsk = useRef("");
  const askKeyOf = () => `${selected ?? ""}|${trace ?? ""}|${selectedEdge ?? ""}|${insets.right}|${insets.bottom}|${mode}`;

  const doRevealIds = useCallback(
    (ids: readonly string[]) => {
      const list = ids.filter((id) => goalReach.has(id));
      if (!list.length) return;
      pinRef.current = null;
      userMovedSinceAsk.current = true;
      const frame = revealFn(list, list[0]);
      if (list.every((id) => hasRec(builtRef.current.layout, id))) {
        const v = frame(builtRef.current.layout);
        if (v) moveCamera(v);
        return;
      }
      pendingCamera.current = frame;
      if (derived) {
        setFlips((prev) => {
          const next = new Set(prev.echo === echo ? prev.ids : []);
          for (const id of list) for (const p of pathFromGoal(graph, goal, id, within)?.slice(1, -1) ?? []) if (!expanded.has(p)) next.add(p);
          return { echo, ids: next };
        });
      } else
        setExpanded((prev) => {
          const next = new Set(prev);
          return expandTo(graph, goal, list, next, within) ? next : prev;
        });
    },
    [goalReach, revealFn, moveCamera, derived, echo, graph, goal, within, expanded],
  );

  /** A focus move on its own: along the smooth-zoom path, timed by its length; nothing when already there. */
  const focusCamera = (v: View | null) => {
    if (!v) return;
    const cur = targetView();
    if (Math.abs(v.k - cur.k) < 0.002 && Math.abs(v.x - cur.x) < 1.5 && Math.abs(v.y - cur.y) < 1.5) return;
    moveCamera(v, true, travelFor(viewRef.current, v));
  };

  const doFocusIds = useCallback(
    (ids: readonly string[], options: { exclusive?: boolean } = {}): boolean => {
      const list = ids.filter((id) => goalReach.has(id));
      if (!list.length) return false;
      if (derived) {
        doRevealIds(list);
        return true;
      }
      clearPeek();
      focusReq.current = list;
      focusHeld.current = true;
      pinRef.current = null;
      userMoved.current = true;
      userMovedSinceAsk.current = true;
      const frame = focusFrame(list);
      const cur = expandedRef.current;
      const needed = neededExpansion(graph, goal, list, within);
      const next = options.exclusive ? needed : new Set([...cur, ...needed]);
      const same = next.size === cur.size && [...next].every((id) => cur.has(id));
      if (same && framedRef.current && !builtRef.current.provisional) {
        pendingCamera.current = null;
        pendingFocus.current = false;
        focusCamera(frame(builtRef.current.layout));
        return true;
      }
      // Framed from the layout that draws them: cards, lines and camera move as one.
      pendingCamera.current = frame;
      pendingFocus.current = true;
      if (!same) setExpanded(next);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goalReach, derived, focusFrame, graph, goal, within, moveCamera],
  );

  // ---- Reveal: a preview opens what it names, and puts the map back afterwards ----------
  // On the map page, pointing at a passage mark (or an inspector row) for REVEAL_IN_MS opens the
  // routes to its records and frames them in one move; another mark retargets in one move; when
  // the preview ends, after REVEAL_OUT_MS, the unfolding and camera from before come back, unless
  // the reader moved the map or opened something in between.
  const revealHome = useRef<{ expanded: Set<string>; view: View } | null>(null);
  const revealIn = useRef(0);
  const revealOut = useRef(0);
  const previewKey = !compact && props.previewIds?.size ? [...props.previewIds].filter((id) => goalReach.has(id)).sort().join("|") : "";
  useEffect(() => {
    window.clearTimeout(revealIn.current);
    if (compact || derived) return;
    if (previewKey) {
      window.clearTimeout(revealOut.current);
      const ids = previewKey.split("|");
      revealIn.current = window.setTimeout(() => {
        clearPeek();
        if (!revealHome.current) revealHome.current = { expanded: new Set(expandedRef.current), view: targetView() };
        const home = revealHome.current;
        const next = new Set([...home.expanded, ...neededExpansion(graph, goal, ids, within)]);
        userMoved.current = true;
        userMovedSinceAsk.current = true;
        setRevealed(ids);
        const frame = focusFrame(ids);
        const cur = expandedRef.current;
        const same = next.size === cur.size && [...next].every((id) => cur.has(id));
        if (same && framedRef.current && !builtRef.current.provisional) focusCamera(frame(builtRef.current.layout));
        else {
          pendingCamera.current = frame;
          pendingFocus.current = true;
          setExpanded(next);
        }
      }, reducedRef.current ? 0 : REVEAL_IN_MS);
    } else if (revealHome.current || revealed) {
      revealOut.current = window.setTimeout(() => {
        const home = revealHome.current;
        revealHome.current = null;
        setRevealed(null);
        if (!home) return;
        const cur = expandedRef.current;
        const same = home.expanded.size === cur.size && [...home.expanded].every((id) => cur.has(id));
        if (same) focusCamera(home.view);
        else {
          pendingCamera.current = () => home.view;
          pendingFocus.current = true;
          setExpanded(home.expanded);
        }
      }, reducedRef.current ? 0 : REVEAL_OUT_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);
  useEffect(
    () => () => {
      window.clearTimeout(revealIn.current);
      window.clearTimeout(revealOut.current);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitAll: (animate = true) => {
        const l = builtRef.current.layout;
        if (mode === "overview" || compact) {
          moveCamera(overviewView(l), animate);
          return;
        }
        // Steps: the drawn branch at reading size, anchored on the selection (else the goal).
        const b = layoutBounds(l);
        const box = { x0: b.x0 - 32, y0: b.y0 - 32, x1: b.x1 + 32, y1: b.y1 + 32 };
        const k = readingK(box);
        const anchor = (selected && pick(l, selected)) || goal;
        moveCamera(frameBox(box, viewport(), { min: k, max: k, anchor: boxOf(l, anchor, 24), top: true }), animate);
      },
      fitNodes: (ids, animate = true) => {
        const list = [...ids];
        const fn = (l: Layout) => {
          const b = boundsOf(l, list, compact ? 24 : 40);
          return b ? fitBounds(b, viewport(), { max: 1, min: compact ? COMPACT_FLOOR : floor }) : null;
        };
        if (list.every((id) => hasRec(builtRef.current.layout, id))) {
          const v = fn(builtRef.current.layout);
          if (v) moveCamera(v, animate);
        } else pendingCamera.current = fn;
      },
      zoomBy: (factor) => {
        const v = viewRef.current;
        const vp = viewport();
        const px = vp.insets.left + (vp.width - vp.insets.left - vp.insets.right) / 2;
        const py = vp.insets.top + (vp.height - vp.insets.top - vp.insets.bottom) / 2;
        const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
        userMovedSinceAsk.current = true;
        moveCamera({ k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k }, true, CAMERA_MS);
      },
      focusNode: (id) => {
        const lid = pick(builtRef.current.layout, id);
        if (lid) cardEls.current.get(lid)?.querySelector<HTMLElement>(".card__open")?.focus({ preventScroll: true });
      },
      expandAll: () => {
        pinRef.current = null;
        openHome.current = null;
        opened.current = null;
        userMovedSinceAsk.current = false;
        pendingCamera.current = overviewView;
        const all = new Set([...goalReach].filter((id) => id !== goal && usesOf(graph, id, within).length));
        if (derived) setFlips({ echo, ids: new Set([...all].filter((id) => !expanded.has(id))) });
        else setExpanded(all);
        if (!compact && mode !== "overview") {
          skipModeFrame.current = true;
          requestMode("overview");
        }
      },
      collapseAll: () => {
        pinRef.current = null;
        openHome.current = null;
        opened.current = null;
        userMovedSinceAsk.current = false;
        pendingCamera.current = startView;
        if (derived) setFlips({ echo, ids: new Set() });
        else setExpanded(new Set());
        if (!compact && mode !== "steps") {
          skipModeFrame.current = true;
          requestMode("steps");
        }
      },
      getScene,
      restoreScene: (scene) => {
        restoreRef.current = scene;
        openHome.current = null;
        opened.current = null;
        fittedGoal.current = goal;
        userMoved.current = true;
        userMovedSinceAsk.current = true;
        pendingCamera.current = null;
        cameraOnly.current = null;
        if (motion.current) motion.current.view = undefined;
        lastAsk.current = askKeyOf();
        if (scene.mode !== modeRef.current) skipModeFrame.current = true;
        if (!controlled && !compact) setModeState(scene.mode);
        if (!derived) {
          const next = new Set(scene.expanded.filter((id) => graph.nodes.has(id)));
          setExpanded((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
        }
        applyView(restoredView(scene, builtRef.current.layout));
        scheduleSettle();
      },
      revealIds: doRevealIds,
      focusIds: doFocusIds,
      focusCard: (id) => {
        const lid = pick(builtRef.current.layout, id);
        const el = lid ? cardEls.current.get(lid)?.querySelector<HTMLElement>(".card__open") : null;
        if (!el || !lid) return false;
        setFocusId(lid);
        el.focus({ preventScroll: true });
        const v = revealFn([lid])(builtRef.current.layout);
        if (v) moveCamera(v, true, CAMERA_MS);
        return true;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boundsOf, moveCamera, goalReach, goal, graph, within, derived, echo, expanded, startView, compact, mode, selected, getScene, doRevealIds, doFocusIds, revealFn, controlled, requestMode, overviewView, floor],
  );

  // ---- Camera input -----------------------------------------------------------------

  useLayoutEffect(() => {
    const wrap = wrapRef.current!;
    const world = worldRef.current!;
    const behaviour = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      // A press that moves less than this is still a click: it opens what it is on.
      .clickDistance(5)
      .filter((event: Event) => {
        if (event.type === "dblclick" || event.type === "wheel") return false;
        const target = event.target as Element;
        // A drag pans from anywhere, cards included. Links, the plate's text, the controls on a card
        // and the canvas's own controls keep the pointer.
        if (target.closest?.("a, .card__body, .card__inputs, .card__usedby, .tag, .tree__ui")) return false;
        return !(event as MouseEvent).button && !(event as MouseEvent).ctrlKey;
      })
      .on("zoom", (event: { transform: ZoomTransform; sourceEvent?: Event | null }) => {
        if (event.sourceEvent) {
          userMoved.current = true;
          userMovedSinceAsk.current = true;
          focusHeld.current = false;
          peekHome.current = null;
          revealHome.current = null;
          onUserMoveRef.current?.();
          if (motion.current) motion.current.view = undefined;
          cameraOnly.current = null;
          pendingCamera.current = null;
        }
        const t = event.transform;
        const scaleChanged = t.k !== viewRef.current.k;
        viewRef.current = { x: t.x, y: t.y, k: t.k };
        world.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
        // The dot grid lives in world space: it moves and scales with the map.
        wrap.style.backgroundPosition = `${t.x}px ${t.y}px`;
        // While the camera travels on its own, the representation is the one it lands in: a move
        // that zooms out on the way never flips cards to tiles and back (two images crossfading).
        const now = performance.now();
        const flight = cameraOnly.current ?? motion.current?.view;
        const r = repFor(flight && now < flight.start + flight.dur ? flight.to.k : t.k);
        const representationChanged = r !== repRef.current;
        if (representationChanged) {
          repRef.current = r;
          wrap.dataset.rep = r;
          setRep(r);
        }
        // Panning changes no card's available title space. Refitting every
        // title is needed only for a scale change (or a new representation).
        refitOnFrame.current ||= scaleChanged || representationChanged;
        refreshChips();
      })
      .on("end", (event: { sourceEvent?: Event | null }) => {
        if (event.sourceEvent) scheduleSettle();
      });
    zoomRef.current = behaviour;
    const s = select(wrap);
    s.call(behaviour);
    wrap.dataset.rep = repRef.current;
    wrap.style.setProperty("--k", String(viewRef.current.k));
    wrap.style.backgroundSize = `${22 * viewRef.current.k}px ${22 * viewRef.current.k}px`;
    paintedScale.current = viewRef.current.k;
    let wheelEnd = 0;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element).closest?.(".tree__ui")) return;
      event.preventDefault();
      const t = viewRef.current;
      const unit = event.deltaMode === 1 ? 16 : 1;
      // On the map, scrolling up or down (a wheel, or two fingers on a trackpad) zooms about the
      // pointer, as a pinch does, and a sideways swipe pans; a drag pans in any direction. In the side
      // pane a wheel scrolls the route rather than shrinking it.
      const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      if (event.ctrlKey || (!compact && vertical)) {
        const rect = wrap.getBoundingClientRect();
        const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
        s.call(behaviour.scaleBy, Math.pow(2, -event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0022) * (event.ctrlKey ? 3.2 : 1)), point);
      } else if (!compact) s.call(behaviour.translateBy, (-event.deltaX * unit) / t.k, 0);
      else s.call(behaviour.translateBy, (-event.deltaX * unit) / t.k, (-event.deltaY * unit) / t.k);
      userMoved.current = true;
      userMovedSinceAsk.current = true;
      pendingCamera.current = null;
      cameraOnly.current = null;
      focusHeld.current = false;
      peekHome.current = null;
      revealHome.current = null;
      onUserMoveRef.current?.();
      window.clearTimeout(wheelEnd);
      wheelEnd = window.setTimeout(scheduleSettle, 160);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      sizeRef.current = { width, height };
      setPaneW(Math.round(width));
      setPaneH(Math.round(height));
      if (width > 10 && height > 10) setReady(true);
      refreshChips();
    });
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      wrap.removeEventListener("wheel", onWheel);
      window.clearTimeout(wheelEnd);
      s.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First frame and goal changes: the plate and its first row, framed once the plate's
  // statement has rendered (or after 1.2 s), so the camera does not jump as the theorem
  // is typeset. Later size changes re-frame only until the reader pans, zooms, unfolds or selects.
  const rootH = layout.boxes.get(goal)?.h ?? 0;
  const firstRowKey = useMemo(() => {
    const ids = built.skeleton.filter((e) => e.from === goal).map((e) => e.to);
    let bottom = 0;
    for (const id of ids) {
      const r = layout.boxes.get(id);
      if (r) bottom = Math.max(bottom, Math.round(r.y + r.h));
    }
    return `${ids.length}|${bottom}`;
  }, [built, layout, goal]);
  const [framed, setFramed] = useState(false);
  framedRef.current = framed || compact;
  const [holdOver, setHoldOver] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setHoldOver(true), 1200);
    return () => window.clearTimeout(t);
  }, []);
  const statementIn = () => !!cardEls.current.get(goal)?.querySelector(".plate__statement, .plate__recorded");
  if (selected && !compact) userMoved.current = true;
  useEffect(() => {
    if (!ready || restoreRef.current) {
      if (restoreRef.current && !framed) setFramed(true);
      return;
    }
    if (fittedGoal.current !== goal) {
      const first = fittedGoal.current === null;
      const wait = first && !compact && !selected && mode === "steps" && !holdOver && (built.provisional || !statementIn());
      if (wait) return;
      // A requested focus is framed once the layout that draws it has its sizes.
      if (focusReq.current && built.provisional && !holdOver) return;
      fittedGoal.current = goal;
      if (!selected && !focusReq.current) userMoved.current = false;
      const v = focusReq.current ? focusFrame(focusReq.current)(layout) : mode === "overview" ? overviewView(layout) : startView(layout);
      if (v) moveCamera(v, !first);
      setFramed(true);
    } else if (!userMoved.current && !focusReq.current && !selected && !moving && mode === "steps" && !(compact && echo?.size) && !built.provisional) {
      const v = startView(layout);
      if (v) moveCamera(v, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, goal, rootH, rootW, paneH, insets.bottom, insets.top, firstRowKey, holdOver, built.provisional]);

  // A held focus re-centres when the canvas is resized or an inspector opens or closes over it.
  useEffect(() => {
    if (!focusHeld.current || !focusReq.current || !framedRef.current || pendingCamera.current || builtRef.current.provisional) return;
    focusCamera(focusFrame(focusReq.current)(builtRef.current.layout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneW, paneH, insets.top, insets.right, insets.bottom, insets.left]);

  // The entrance: first visit per session, never under reduced motion, never moving the camera.
  const [entering, setEntering] = useState(false);
  enteringRef.current = entering;
  const enteredRef = useRef(false);
  useEffect(() => {
    if (!framed || enteredRef.current) return;
    enteredRef.current = true;
    if (!intro || reduced || compact || selected) return;
    setEntering(true);
    const t = window.setTimeout(() => setEntering(false), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framed]);
  // Acting during the entrance jumps to its end.
  useEffect(() => {
    if (!entering) return;
    const wrap = wrapRef.current!;
    const stop = () => setEntering(false);
    wrap.addEventListener("pointerdown", stop, true);
    wrap.addEventListener("wheel", stop, true);
    window.addEventListener("keydown", stop, true);
    return () => {
      wrap.removeEventListener("pointerdown", stop, true);
      wrap.removeEventListener("wheel", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
  }, [entering]);

  // A change of mode frames for the new task.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    if (skipModeFrame.current) {
      skipModeFrame.current = false;
      return;
    }
    if (!ready || restoreRef.current) return;
    userMovedSinceAsk.current = false;
    if (mode === "overview") moveCamera(overviewView(layout));
    else {
      const v = selected && hasRec(layout, selected) ? aroundView(layout, selected) : startView(layout);
      if (v) moveCamera(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // In the side pane, a new passage frames its lit cards.
  const echoKey = echo ? [...echo].sort().join("|") : "";
  const lastEcho = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!compact || !ready || !echo?.size) return;
    if (lastEcho.current === echoKey) return;
    if (![...echo].some((id) => hasRec(layout, id))) return;
    lastEcho.current = echoKey;
    const frame = (l: Layout) => {
      const b = boundsOf(l, [...echo].filter((id) => hasRec(l, id)), 24);
      return b ? fitBounds(b, viewport(), { min: COMPACT_FLOOR, max: 1 }) : null;
    };
    if (built.provisional) {
      pendingCamera.current = frame;
      return;
    }
    const v = frame(layout);
    if (v) moveCamera(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, ready, echoKey, layout]);

  // Keep what was asked for on screen: never recentre what is already visible.
  const askedIds = (): { ids: string[]; anchor: string | null } => {
    const l = builtRef.current.layout;
    if (edgeObj) {
      const ends = [edgeObj.from, edgeObj.to].filter((id) => hasRec(l, id));
      return { ids: ends, anchor: ends.includes(edgeObj.to) ? edgeObj.to : edgeObj.from };
    }
    if (traced && selected) return { ids: [...traced].filter((id) => hasRec(l, id)), anchor: hasRec(l, selected) ? selected : null };
    // A card opened by a click keeps its whole lineage framed while it stays selected.
    const o = opened.current;
    if (o && selected === o.id) return { ids: [o.id, ...o.lineage].filter((id) => graph.nodes.get(id)?.kind !== "assumption"), anchor: o.id };
    // An assumption is drawn as tags on the records that assume it: frame those.
    if (selected && !hasRec(l, selected) && tagHolders.has(selected)) return { ids: tagHolders.get(selected)!, anchor: tagHolders.get(selected)![0] };
    return { ids: selected ? [selected] : [], anchor: selected ?? null };
  };
  askViewRef.current = () => {
    const { ids, anchor } = askedIds();
    const l = builtRef.current.layout;
    // Overview keeps the whole goal fitted until the reader moves the camera.
    if (modeRef.current === "overview" && !compact && !ids.length) {
      const v = overviewView(l);
      const cur = viewRef.current;
      return Math.abs(v.k - cur.k) > 0.002 || Math.abs(v.x - cur.x) > 2 || Math.abs(v.y - cur.y) > 2 ? v : null;
    }
    if (!ids.length || !ids.every((id) => hasRec(l, id))) return null;
    const o = opened.current;
    if (o && selected === o.id && !edgeObj && !traced) {
      // The lineage is framed whole, in the canvas the inspector leaves.
      const v = lineageFrame(o.id, o.lineage)(l);
      const cur = targetView();
      return v && (Math.abs(v.k - cur.k) > 0.002 || Math.abs(v.x - cur.x) > 2 || Math.abs(v.y - cur.y) > 2) ? v : null;
    }
    // Of a trace, the selection itself must be in view; the rest as far as the floor allows.
    const v = revealFn(ids, anchor)(l);
    if (!v) return null;
    return v;
  };
  useEffect(() => {
    if (!ready) return;
    const key = askKeyOf();
    if (key === lastAsk.current) return;
    if (restoreRef.current) {
      lastAsk.current = key;
      return;
    }
    const { ids } = askedIds();
    if (!ids.length) {
      lastAsk.current = key;
      return;
    }
    if (!ids.every((id) => hasRec(layout, id)) || built.provisional) return;
    lastAsk.current = key;
    userMovedSinceAsk.current = false;
    const v = askViewRef.current();
    if (v) moveCamera(v);
    else scheduleSettle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected, trace, traced, selectedEdge, edgeObj, layout, built.provisional, insets.right, insets.bottom, mode]);

  // A new history entry (a selection, a step, a trace) hears about the scene it shows, even when nothing moved.
  useEffect(() => {
    if (ready) scheduleSettle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedEdge, trace, mode, expandedState]);

  // ---- Interaction ------------------------------------------------------------------

  const toggle = useCallback(
    (id: string, lid: string = id) => {
      if (id === goal || inputsOf(id).length === 0) return;
      userMoved.current = true;
      focusHeld.current = false;
      peekHome.current = null;
      revealHome.current = null;
      onUserMoveRef.current?.();
      pinRef.current = lid;
      const opening = !expanded.has(id);
      if (opening) {
        askCamera((l) => {
          const fresh = [...l.boxes.keys()].filter((x) => !committed.current?.layout.boxes.has(x));
          const at = l.boxes.has(lid) ? lid : id;
          return revealFn([at, ...fresh], at)(l);
        }, true);
      } else pendingCamera.current = null;
      if (derived) {
        setFlips((prev) => {
          const ids = new Set(prev.echo === echo ? prev.ids : []);
          ids.has(id) ? ids.delete(id) : ids.add(id);
          return { echo, ids };
        });
        return;
      }
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [goal, graph, within, expanded, derived, echo, askCamera, revealFn],
  );

  /** Opening a mark: select it and read it in Steps, at k = 1 with its inputs in view. */
  const openMark = (id: string, lid: string) => {
    onSelect(id);
    if (!compact && mode !== "steps") {
      skipModeFrame.current = true;
      requestMode("steps");
    }
    lastAsk.current = `${id}||${""}|${insets.right}|${insets.bottom}|steps`;
    userMovedSinceAsk.current = false;
    const v = aroundView(layout, lid);
    if (v) moveCamera(v);
  };

  const neighbours = (id: string) => {
    const ups: string[] = [];
    const downs: string[] = [];
    for (const e of built.skeleton) {
      if (e.to === id) ups.push(e.from);
      if (e.from === id) downs.push(e.to);
    }
    return { ups, downs };
  };

  const moveFocus = (from: string, key: string) => {
    const box = layout.boxes.get(from);
    if (!box) return;
    const { ups, downs } = neighbours(from);
    const centre = (b: Rect) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const c0 = centre(box);
    let candidates: string[] = [];
    if (key === "ArrowDown") candidates = downs;
    else if (key === "ArrowUp") candidates = ups;
    else {
      const r = layout.rank.get(from);
      candidates = [...layout.boxes.keys()].filter((id) => layout.rank.get(id) === r && (key === "ArrowLeft" ? centre(layout.boxes.get(id)!).x < c0.x : centre(layout.boxes.get(id)!).x > c0.x));
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => {
      const A = centre(layout.boxes.get(a)!);
      const B = centre(layout.boxes.get(b)!);
      return Math.hypot(A.x - c0.x, A.y - c0.y) - Math.hypot(B.x - c0.x, B.y - c0.y);
    });
    const next = candidates[0];
    setFocusId(next);
    requestAnimationFrame(() => cardEls.current.get(next)?.querySelector<HTMLElement>(".card__open")?.focus({ preventScroll: true }));
    const v = revealFn([next], next)(layout);
    if (v) moveCamera(v, true, CAMERA_MS);
  };

  const onCardKey = (lid: string, event: React.KeyboardEvent) => {
    const id = recordOf(lid);
    const onOpen = (event.target as Element).classList?.contains("card__open");
    if (!onOpen) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      moveFocus(lid, event.key);
    } else if (event.key === " ") {
      // Space opens the inputs; Enter (the button's own click) opens the record.
      event.preventDefault();
      toggle(id, lid);
    } else if (event.key.toLowerCase() === "t" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      onTrace(id);
    }
  };

  // The peek: resting on a card for PEEK_IN_MS (not while dragging or while the map moves) draws its whole
  // lineage; leaving it and every card of that lineage for PEEK_OUT_MS folds it back.
  const peekIn = useRef(0);
  const peekOut = useRef(0);
  const pressed = useRef(false);
  const hoverLid = useRef<string | null>(null);
  /** Where the camera was when the peek began; it goes back there when the peek ends, unless the reader moved the map. */
  const peekHome = useRef<View | null>(null);
  // A peek never moves the camera of its own accord: only the card under the pointer is held still.
  const showPeek = (next: { lid: string; id: string } | null) => {
    window.clearTimeout(peekIn.current);
    window.clearTimeout(peekOut.current);
    const cur = peekRef.current;
    if ((cur?.lid ?? null) === (next?.lid ?? null)) return;
    if (!cur && next) peekHome.current = targetView();
    if (cur && !next && peekHome.current) {
      // Folding back: the camera returns to where it was, with the cards.
      peekReturn.current = peekHome.current;
      peekHome.current = null;
      anchorLid.current = null;
    } else anchorLid.current = next?.lid ?? cur?.lid ?? null;
    // Not a camera request of the page's: nothing re-frames after it (the start view included).
    userMovedSinceAsk.current = true;
    userMoved.current = true;
    setPeek(next);
  };
  function clearPeek() {
    window.clearTimeout(peekIn.current);
    window.clearTimeout(peekOut.current);
    anchorLid.current = null;
    peekHome.current = null;
    if (peekRef.current) setPeek(null);
  }
  const inPeek = (lid: string) => {
    const p = peekRef.current;
    const id = recordOf(lid);
    return !!p && (id === p.id || !!peekLineageRef.current?.has(id));
  };
  const peekEnter = (lid: string, event: React.PointerEvent) => {
    if (derived || event.pointerType === "touch" || event.buttons || pressed.current) return;
    hoverLid.current = lid;
    window.clearTimeout(peekOut.current);
    if (inPeek(lid)) return;
    window.clearTimeout(peekIn.current);
    const attempt = () => {
      if (hoverLid.current !== lid) return;
      if (motion.current || cameraOnly.current || pressed.current) {
        peekIn.current = window.setTimeout(attempt, 120);
        return;
      }
      const id = recordOf(lid);
      const lineage = lineageOf(graph, id, within);
      showPeek(lineage.size && id !== goal ? { lid, id } : null);
    };
    peekIn.current = window.setTimeout(attempt, PEEK_IN_MS);
  };
  const peekLeave = (lid: string) => {
    if (hoverLid.current === lid) hoverLid.current = null;
    window.clearTimeout(peekIn.current);
    if (!peekRef.current) return;
    window.clearTimeout(peekOut.current);
    peekOut.current = window.setTimeout(() => showPeek(null), PEEK_OUT_MS);
  };
  /** In the side pane, a click while a peek shows keeps that lineage open. */
  const commitPeek = (lid: string): boolean => {
    const p = peekRef.current;
    if (!p || derived || !(recordOf(lid) === p.id || peekFadedRef.current.has(lid))) return false;
    window.clearTimeout(peekIn.current);
    window.clearTimeout(peekOut.current);
    anchorLid.current = null;
    peekHome.current = null;
    setExpanded((prev) => peekExpansion(graph, p.id, prev, within));
    setPeek(null);
    return true;
  };

  // ---- Opening a card: a click draws its whole lineage, as resting the pointer does, and frames the
  // card with all of it in one move, zooming out or in as far as that needs. A click on the empty map,
  // or any other closing of the selection, puts back the unfolding and camera from before.
  /** The unfolding and camera before the first card was opened; dropped by any whole-map change. */
  const openHome = useRef<{ expanded: Set<string>; view: View } | null>(null);
  /** The card opened last and its lineage: while it stays selected, the selection's camera frames them. */
  const opened = useRef<{ id: string; lineage: Set<string> } | null>(null);
  const lineageFrame = useCallback(
    (id: string, lineage: ReadonlySet<string>) =>
      (l: Layout): View | null => {
        const boxes = [...l.boxes].filter(([lid]) => recordOf(lid) === id || lineage.has(recordOf(lid))).map(([, r]) => r);
        if (!boxes.length) return null;
        const pad = 28;
        const b: Bounds = {
          x0: Math.min(...boxes.map((r) => r.x)) - pad,
          y0: Math.min(...boxes.map((r) => r.y)) - pad,
          x1: Math.max(...boxes.map((r) => r.x + r.w)) + pad,
          y1: Math.max(...boxes.map((r) => r.y + r.h)) + pad,
        };
        return fitBounds(b, viewport(), { min: MIN_K, max: STEPS_K });
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const openLineage = (lid: string) => {
    if (derived) return;
    const id = recordOf(lid);
    const p = peekRef.current;
    const fromPeek = !!p && (id === p.id || peekFadedRef.current.has(lid));
    const lineage = id === goal ? new Set<string>() : lineageOf(graph, id, within);
    if (!lineage.size && !fromPeek) return;
    if (!openHome.current) openHome.current = { expanded: new Set(expandedRef.current), view: (p && peekHome.current) || targetView() };
    // The peek ends without its camera return: what it drew stays, solid.
    window.clearTimeout(peekIn.current);
    window.clearTimeout(peekOut.current);
    anchorLid.current = null;
    peekHome.current = null;
    if (p) setPeek(null);
    const base = fromPeek ? peekExpansion(graph, p!.id, expandedRef.current, within) : expandedRef.current;
    const next = lineage.size ? peekExpansion(graph, id, base, within) : new Set(base);
    opened.current = lineage.size ? { id, lineage } : null;
    userMoved.current = true;
    userMovedSinceAsk.current = true;
    focusHeld.current = false;
    revealHome.current = null;
    const cur = expandedRef.current;
    const same = next.size === cur.size && [...next].every((x) => cur.has(x));
    if (!lineage.size) {
      if (!same) setExpanded(next);
      return;
    }
    const frame = lineageFrame(id, lineage);
    if (same && framedRef.current && !builtRef.current.provisional) focusCamera(frame(builtRef.current.layout));
    else {
      pendingCamera.current = frame;
      pendingFocus.current = true;
      setExpanded(next);
    }
  };
  /** Back to the unfolding and camera from before the first card was opened. */
  const closeOpened = () => {
    const home = openHome.current;
    openHome.current = null;
    opened.current = null;
    if (!home) return;
    clearPeek();
    const cur = expandedRef.current;
    const same = home.expanded.size === cur.size && [...home.expanded].every((x) => cur.has(x));
    if (same) focusCamera(home.view);
    else {
      pendingCamera.current = () => home.view;
      pendingFocus.current = true;
      setExpanded(home.expanded);
    }
  };
  useEffect(() => {
    if (!selected) closeOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  // Another mode or goal starts afresh: there is nothing to put back.
  useEffect(() => {
    openHome.current = null;
    opened.current = null;
  }, [mode, goal]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const down = () => (pressed.current = true);
    const up = () => (pressed.current = false);
    wrap.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      wrap.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.clearTimeout(peekIn.current);
      window.clearTimeout(peekOut.current);
    };
  }, []);

  const setHovered = (lid: string | null) => {
    setHover(lid);
    onHover?.(lid ? recordOf(lid) : null);
  };
  const hoverRec = hover ? recordOf(hover) : null;

  // Edge hover: a short delay in; leaving waits a moment so the pointer can reach the tooltip.
  const tipTimer = useRef(0);
  const tipLeave = useRef(0);
  const pointerAt = (event: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const enterEdge = (key: string, event: React.PointerEvent) => {
    window.clearTimeout(tipLeave.current);
    setHoverEdge(key);
    const at = pointerAt(event);
    window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setTip((t) => (t && t.key === key ? t : { key, ...at })), 120);
  };
  const leaveEdge = () => {
    window.clearTimeout(tipTimer.current);
    window.clearTimeout(tipLeave.current);
    tipLeave.current = window.setTimeout(() => {
      setTip(null);
      setHoverEdge(null);
    }, 220);
  };
  useEffect(
    () => () => {
      window.clearTimeout(tipTimer.current);
      window.clearTimeout(tipLeave.current);
    },
    [],
  );
  // Premise tags: pointing at one names the relation and tints every tag of the same assumption.
  const [hoverTag, setHoverTag] = useState<string | null>(null);
  const enterTag = (e: ArgEdge, el: HTMLElement, delay = 120) => {
    window.clearTimeout(tipLeave.current);
    window.clearTimeout(tipTimer.current);
    setHoverTag(e.to);
    const wrap = wrapRef.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const at = { key: e.key, x: r.right - wrap.left, y: r.top + r.height / 2 - wrap.top };
    tipTimer.current = window.setTimeout(() => setTip(at), delay);
  };
  const leaveTag = () => {
    setHoverTag(null);
    leaveEdge();
  };
  const tagClass = (e: ArgEdge) => {
    const parts = ["tag"];
    if (hoverTag === e.to) parts.push("is-hover");
    if (selected === e.to || selectedEdge === e.key) parts.push("is-selected");
    if ((litOn && traced?.has(e.from) && traced.has(e.to)) || (litIds?.has(e.from) && litIds.has(e.to))) parts.push("is-lit");
    // A passage's assumption is drawn only as these tags: they carry its outline.
    if (litIds?.has(e.to)) parts.push("is-passage");
    return parts.join(" ");
  };

  // Escape closes the tooltip before anything else on the page.
  useEffect(() => {
    if (!tip) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setTip(null);
      setHoverEdge(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tip]);

  // ---- Light ------------------------------------------------------------------------

  const edgeByKey = useMemo(() => new Map(fullGraph.edges.map((e) => [e.key, e])), [fullGraph]);

  const hoverTouch = useMemo(() => {
    if (!hoverEdge) return null;
    if (hoverEdge.startsWith("bus:")) {
      const parent = hoverEdge.slice(4);
      const ids = new Set([parent]);
      const keys = new Set<string>();
      for (const e of built.skeleton)
        if (e.from === parent && e.kind === "supports") {
          ids.add(e.to);
          keys.add(e.key);
        }
      return { ids, keys };
    }
    const e = built.skeleton.find((x) => x.key === hoverEdge);
    return e ? { ids: new Set([e.from, e.to]), keys: new Set([e.key]) } : null;
  }, [hoverEdge, built, edgeByKey]);

  const near = useMemo(() => {
    const id = selected;
    if (!id || !hasRec(layout, id)) return null;
    const mine = new Set(lidsOf(layout, id));
    const set = new Set(mine);
    for (const e of built.skeleton) {
      if (mine.has(e.from)) set.add(e.to);
      if (mine.has(e.to)) set.add(e.from);
    }
    return set;
  }, [selected, built, layout]);

  const litKeys = useMemo(() => {
    if (!traced) return new Set<string>();
    return new Set(built.skeleton.filter((e) => traced.has(recordOf(e.from)) && traced.has(recordOf(e.to))).map((e) => e.key));
  }, [traced, built]);

  /** A peek: lines among the lineage's records already drawn light in their type colours; lines to records it adds are faded. */
  const peekKeys = useMemo(() => {
    const lit = new Set<string>();
    const faded = new Set<string>();
    if (!peek || !peekLineage) return { lit, faded };
    const family = (lid: string) => recordOf(lid) === peek.id || peekLineage.has(recordOf(lid));
    for (const e of built.skeleton) {
      if (peekFaded.has(e.from) || peekFaded.has(e.to)) faded.add(e.key);
      else if (family(e.from) && family(e.to)) lit.add(e.key);
    }
    return { lit, faded };
  }, [peek, peekLineage, peekFaded, built]);
  /** A bus is faded when every line in it is; its new part (busf) when any of its new lines is. */
  const busFaded = (parent: string, fresh: boolean) => {
    const keys = built.skeleton.filter((e) => e.from === parent && e.kind === "supports" && (!fresh || ghostsAndFresh.fresh.has(e.key)));
    return keys.length > 0 && (peekFaded.has(parent) || (fresh ? keys.some((e) => peekKeys.faded.has(e.key)) : keys.every((e) => peekKeys.faded.has(e.key))));
  };

  /** Lines between two records of the passage being read. */
  const passageKeys = useMemo(() => {
    if (!litIds) return new Set<string>();
    return new Set(built.skeleton.filter((e) => litIds.has(recordOf(e.from)) && litIds.has(recordOf(e.to))).map((e) => e.key));
  }, [litIds, built]);

  const drawTiming = useMemo(() => {
    if (!litKeys.size || !selected || !trace) return new Map<string, { delay: number; dur: number; from: "start" | "end" }>();
    return traceTiming(
      built.skeleton.filter((e) => litKeys.has(e.key)),
      layout.rank,
      pick(layout, selected) ?? selected,
      trace,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [litKeys, trace, selected]);

  const traceKey = `${selected ?? ""}|${trace ?? ""}|${goal}`;
  // The route lights once the cards the trace unfolds have settled: one action, then the next.
  const [litShown, setLitShown] = useState<string | null>(null);
  const traceReady = !!traced && [...traced].every((id) => hasRec(layout, id) || graph.nodes.get(id)?.kind === "assumption") && !moving && !built.provisional;
  useEffect(() => {
    if (!traced) setLitShown(null);
    else if (traceReady) setLitShown(traceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traced, traceReady]);
  const litOn = !!traced && litShown === traceKey;

  const echoOn = compact && (echo?.size ?? 0) > 0;
  const previewOn = !!preview && preview.size > 0;
  /** Previewed records this main result's argument cannot draw (the reveal opens every other one). */
  const previewOutside = useMemo(() => (preview ? [...preview].filter((id) => fullGraph.nodes.has(id) && !goalReach.has(id)) : []), [preview, goalReach, fullGraph]);

  const cardClass = (lid: string, node: ArgNode, leaf: boolean): string => {
    const id = recordOf(lid);
    const parts = ["card", `card--${node.kind}`];
    if (lid === goal) parts.push("card--root");
    if (lid !== id) parts.push("card--clone");
    if (leaf && lid !== goal) parts.push("card--leaf");
    if (id === selected) parts.push("is-selected");
    if (id === hoverRec || hoverTouch?.ids.has(lid)) parts.push("is-hover");
    const holdsTag = (rec: string) => !!tagsOf(rec).length && (tagsOf(rec).some((e) => e.to === selected) || (!!edgeObj && edgeObj.kind === "assumes" && edgeObj.from === rec));
    if (edgeObj && (edgeObj.from === id || edgeObj.to === id)) parts.push("is-edge-end");
    if (traced && litOn) parts.push(traced.has(id) ? "is-lit" : "is-quiet");
    else if (edgeObj) parts.push(edgeObj.from === id || edgeObj.to === id ? "" : "is-quiet");
    else if (near && id !== selected) parts.push(near.has(lid) ? "is-near" : "is-quiet");
    else if (selected && !near && tagHolders.has(selected)) parts.push(holdsTag(id) ? "is-near" : "is-quiet");
    if (echoOn) parts.push(echo!.has(id) ? "is-echo" : within ? "" : "is-quiet");
    if (previewOn && preview!.has(id)) parts.push("is-preview");
    if (litIds?.has(id)) parts.push("is-passage");
    if (props.coverage && id !== goal && !props.coverage.has(id)) parts.push("is-elsewhere");
    if (peekFaded.has(lid)) parts.push("is-peeked");
    if (exitShown.has(lid)) parts.push("is-exiting");
    return parts.filter(Boolean).join(" ");
  };

  const baseDim = litOn || !!edgeObj || (echoOn && !within);
  const emphasised = useMemo(() => {
    const keys = new Set<string>();
    const touch = (id: string | null | undefined) => {
      if (!id) return;
      for (const e of built.skeleton) if (e.from === id || e.to === id) keys.add(e.key);
    };
    if (!traced && selected) for (const lid of lidsOf(layout, selected)) touch(lid);
    touch(hover);
    hoverTouch?.keys.forEach((k) => keys.add(k));
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, selected, hover, hoverTouch, traced]);

  const roving = focusId && layout.boxes.has(focusId) ? focusId : (selected && pick(layout, selected)) || goal;
  const bounds = layoutBounds(layout);

  const cardIds = [...layout.boxes.keys(), ...[...exitShown].filter((id) => !layout.boxes.has(id))];
  const tipEdge = tip && !moving ? tip : null;

  // Relations in the drawn scope that the simplified drawing leaves out.
  const hiddenEdges = useMemo(() => [...built.implied].map((k) => edgeByKey.get(k)).filter((e): e is ArgEdge => !!e), [built.implied, edgeByKey]);

  // Screen-space labels in mark form: the goal, the selection and the record under the pointer or focus.
  const labelled = useMemo(() => {
    // Tiles and cards are never labelled twice; a mark that shows its whole title hides its label (applyLines).
    if (rep !== "mark") return [] as string[];
    const ids: string[] = [];
    for (const id of [goal, selected ? pick(layout, selected) : null, hover, focusId]) if (id && layout.boxes.has(id) && !ids.includes(id)) ids.push(id);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, goal, selected, hover, focusId, layout]);

  const showChips = !compact && mode === "steps" && rep !== "mark";
  const chipClick = (side: Side) => {
    const ids = chips.current.ids[side];
    if (!ids.length) return;
    userMovedSinceAsk.current = true;
    focusHeld.current = false;
    peekHome.current = null;
    revealHome.current = null;
    onUserMoveRef.current?.();
    moveCamera(panToward(side, ids, builtRef.current.layout.boxes, viewRef.current, viewport()), true, CAMERA_MS);
  };

  const kindOf = (key: string) => built.plan.edges.get(key)?.kind ?? "supports";

  // The entrance: the first row left to right, and the band its lines draw through.
  const enterOrder = useMemo(() => {
    const ids = built.skeleton.filter((e) => e.from === goal).map((e) => e.to).filter((id) => layout.boxes.has(id));
    ids.sort((a, b) => layout.boxes.get(a)!.x - layout.boxes.get(b)!.x);
    return new Map(ids.map((id, i) => [id, i]));
  }, [built, layout, goal]);
  const enterMask = useMemo(() => {
    const root = layout.boxes.get(goal);
    if (!root || !enterOrder.size) return null;
    let bottom = root.y + root.h;
    for (const id of enterOrder.keys()) bottom = Math.max(bottom, layout.boxes.get(id)!.y);
    const b = layoutBounds(layout);
    return { x0: b.x0 - 50, x1: b.x1 + 50, y0: root.y + root.h - 2, y1: bottom + 2 };
  }, [layout, goal, enterOrder]);

  return (
    <div
      ref={wrapRef}
      className={`tree${compact ? " tree--compact" : ""}${rootW < 700 ? " tree--narrow" : ""}${moving ? " tree--moving" : ""}${traced ? " tree--traced" : ""}${entering ? " tree--entering" : ""}${!framed && !compact ? " tree--unframed" : ""}${baseDim ? " tree--dim" : ""}${reduced ? " tree--reduced" : ""}`}
      data-mode={mode}
      onClick={(event) => {
        if ((event.target as Element).closest?.(".card, button, a, .hit, .tree__ui")) return;
        closeOpened();
        if (selected) onSelect(null);
        if (selectedEdge) onEdgeSelect?.(null);
      }}
    >
      <div ref={worldRef} className="tree__world" style={{ width: Math.max(1, bounds.x1), height: Math.max(1, bounds.y1) }}>
        <svg className="tree__links" width={1} height={1} aria-hidden="true">
          {entering && enterMask && (
            <defs>
              <mask id={`${uid}-enter`} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
                <rect x={-100000} y={-100000} width={200000} height={200000} fill="#fff" />
                {/* The first row's lines draw upward into the plate: this cover shrinks toward the row. */}
                <rect className="enter-cover" x={enterMask.x0} y={enterMask.y0} width={enterMask.x1 - enterMask.x0} height={enterMask.y1 - enterMask.y0} fill="#000" />
              </mask>
            </defs>
          )}
          <g className="links" mask={entering && enterMask ? `url(#${uid}-enter)` : undefined}>
            {[...built.plan.buses.keys()].map((parent) => (
              <g key={parent} className={busFaded(parent, false) ? "is-peeked" : undefined}>
                <path ref={pathRef(`buscase:${parent}`)} className="casing" />
                <path ref={pathRef(`bus:${parent}`)} className="link link--supports" />
                <g className={busFaded(parent, true) ? "is-peeked" : undefined}>
                  <path ref={pathRef(`busf:${parent}`)} className="link link--supports" />
                </g>
              </g>
            ))}
            {[...built.plan.edges.values()]
              .filter((pe) => !pe.bus)
              .map((pe) => (
                <g key={pe.key} className={peekKeys.faded.has(pe.key) ? "is-peeked" : undefined}>
                  <path ref={pathRef(`case:${pe.key}`)} className="casing" />
                  <path ref={pathRef(`edge:${pe.key}`)} className={`link link--${pe.kind}`} />
                </g>
              ))}
            {ghostsAndFresh.ghosts.map((g) => (
              <path key={g.key} ref={pathRef(`ghost:${g.key}`)} className={`link link--${g.kind} link--ghost`} />
            ))}
          </g>
          <g className="links-over">
            {[...emphasised]
              .filter((k) => built.plan.edges.has(k) && !(litOn && litKeys.has(k)))
              .map((k) => (
                <path key={k} ref={pathRef(`ov:${k}`)} className={`link link--${kindOf(k)} link--near`} />
              ))}
          </g>
          <g className="links-lit" key={traceKey}>
            {litOn && !reduced && (
              <defs>
                {[...litKeys].map((k, i) => {
                  const t = drawTiming.get(k) ?? { delay: 0, dur: 240, from: "start" as const };
                  return (
                    <mask key={k} id={`${uid}-m${i}`} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
                      <path
                        ref={pathRef(`mask:${k}`)}
                        pathLength={1}
                        className={`lit-mask lit-mask--${t.from}`}
                        style={{ ["--d" as string]: `${t.delay}ms`, ["--dur" as string]: `${t.dur}ms` }}
                      />
                    </mask>
                  );
                })}
              </defs>
            )}
            {[...(litOn ? litKeys : [])].map((k, i) => (
              <g key={k} mask={reduced ? undefined : `url(#${uid}-m${i})`}>
                <path ref={pathRef(`litcase:${k}`)} className="casing casing--lit" />
                <path ref={pathRef(`lit:${k}`)} className={`link link--${kindOf(k)} link--lit`} />
              </g>
            ))}
          </g>
          <g className="links-peek">
            {[...peekKeys.lit]
              .filter((k) => built.plan.edges.has(k))
              .map((k) => (
                <g key={k}>
                  <path ref={pathRef(`klitcase:${k}`)} className="casing casing--lit" />
                  <path ref={pathRef(`klit:${k}`)} className={`link link--${kindOf(k)} link--lit`} />
                </g>
              ))}
          </g>
          <g className="links-passage">
            {[...passageKeys]
              .filter((k) => built.plan.edges.has(k))
              .map((k) => (
                <g key={k}>
                  <path ref={pathRef(`plitcase:${k}`)} className="casing casing--lit" />
                  <path ref={pathRef(`plit:${k}`)} className={`link link--${kindOf(k)} link--lit`} />
                </g>
              ))}
          </g>
          {edgeObj && built.plan.edges.has(edgeObj.key) && (
            <g className="links-sel">
              <path ref={pathRef(`sel:${edgeObj.key}`)} className={`link link--${edgeObj.kind} link--lit link--selected`} />
            </g>
          )}
          <g className="hits">
            {[...built.plan.edges.values()]
              .sort((a, b) => Number(a.bus) - Number(b.bus))
              .map((pe) => (
                <path
                  key={pe.key}
                  ref={pathRef(`hit:${pe.key}`)}
                  className="hit"
                  onPointerEnter={(event) => enterEdge(pe.key, event)}
                  onPointerLeave={leaveEdge}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onEdgeSelect) onEdgeSelect(edgeKeyOf(pe.key));
                    else onSelect(recordOf(pe.from));
                  }}
                />
              ))}
            {[...built.plan.buses.keys()].map((parent) => (
              <path
                key={parent}
                ref={pathRef(`hitstem:${parent}`)}
                className="hit"
                onPointerEnter={(event) => enterEdge(`bus:${parent}`, event)}
                onPointerLeave={leaveEdge}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(recordOf(parent));
                }}
              />
            ))}
          </g>
        </svg>
        {cardIds.map((lid) => {
          const id = recordOf(lid);
          const node = graph.nodes.get(id) ?? fullGraph.nodes.get(id)!;
          const all = usesOf(graph, id).filter((e) => e.kind !== "assumes");
          const uses = inputsOf(id);
          const outside = all.length - uses.length;
          const tags = tagsOf(id);
          const isRoot = lid === goal;
          const clone = lid !== id;
          const open = expanded.has(id);
          const leaf = uses.length === 0;
          const role = lens ? lensRole(node, lens) : "all";
          const peeked = peekFaded.has(lid);
          const tab = lid === roving && !peeked ? 0 : -1;
          const source = isRoot && !compact && node.origin.place ? `${node.origin.label}, ${node.origin.place}` : (node.origin.place ?? node.origin.label);
          const sourceTitle = `${node.origin.label}${node.origin.locator ? `: ${node.origin.locator}` : ""}`;
          const usedBy = built.shared.get(id) ?? 0;
          return (
            <div
              key={lid}
              ref={cardRef(lid)}
              data-card={lid}
              data-record={id}
              data-region={node.region}
              data-slot={node.origin.slot}
              data-kind={node.kind}
              className={cardClass(lid, node, leaf)}
              style={{ width: clone ? (compact ? 184 : 176) : widthOf(node, isRoot, compact, rootW), ["--rank" as string]: layout.rank.get(lid) ?? 0, ["--enter-i" as string]: enterOrder.get(lid) ?? 0 }}
              role="group"
              aria-hidden={peeked || undefined}
              aria-label={`${node.label}, ${kindName(node.kind)}${clone ? `, drawn once under each of the ${usedBy} records that use it` : ""}`}
              title={clone ? node.label : undefined}
              onClick={(event) => {
                if ((event.target as Element).closest?.(".card__inputs, .card__usedby, .tag, a, .card__body")) return;
                // A mark with nothing below it opens at reading size; any other card opens its lineage.
                const below = !compact && id !== goal && lineageOf(graph, id, within).size > 0;
                if (repRef.current === "mark" && !below) openMark(id, lid);
                else {
                  if (compact) commitPeek(lid);
                  else openLineage(lid);
                  onSelect(id);
                }
              }}
              onKeyDown={(event) => onCardKey(lid, event)}
              onFocus={() => setFocusId(lid)}
              onPointerEnter={(event) => {
                setHovered(lid);
                peekEnter(lid, event);
              }}
              onPointerLeave={() => {
                setHovered(null);
                peekLeave(lid);
              }}
            >
              <div className="card__full">
                <p className="card__head">
                  <span className="caps card__kind">{kindName(node.kind)}</span>
                  <span className="card__src" title={sourceTitle}>
                    <span className="src-sq" aria-hidden="true" />
                    <span className="card__srcname">{source}</span>
                  </span>
                </p>
                <button
                  type="button"
                  className={`card__open${isRoot ? " plate__title" : ""}`}
                  tabIndex={tab}
                  aria-pressed={id === selected}
                  aria-label={`Open ${node.label}`}
                >
                  <span className={`card__title${node.kind === "declaration" ? " lean" : ""}`}>{node.kind === "declaration" ? <LeanName name={node.label} /> : node.label}</span>
                  {node.status === "open" && <span className="card__status"> (unresolved)</span>}
                </button>
                {tags.length > 0 && (
                  <div className="card__tags">
                    <span className="caps card__tagword">Assumes</span>
                    {tags.map((e) => (
                      <button
                        key={e.key}
                        type="button"
                        className={tagClass(e)}
                        tabIndex={tab}
                        aria-label={`Explicit assumption: ${node.label} assumes ${graph.nodes.get(e.to)?.label ?? e.to}. Open the step.`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (onEdgeSelect) onEdgeSelect(e.key);
                          else onSelect(e.to);
                        }}
                        title={graph.nodes.get(e.to)?.label ?? e.to}
                        onPointerEnter={(event) => enterTag(e, event.currentTarget)}
                        onPointerLeave={leaveTag}
                        onFocus={(event) => enterTag(e, event.currentTarget, 0)}
                        onBlur={leaveTag}
                      >
                        {tagTitle(tags, e, (x) => graph.nodes.get(x)?.label ?? x)}
                      </button>
                    ))}
                  </div>
                )}
                {isRoot && !compact ? (
                  rootContent && <div className="card__theorem card__body">{rootContent}</div>
                ) : (
                  <div className="card__foot">
                    {uses.length > 0 && !isRoot ? (
                      <button
                        type="button"
                        className={`card__inputs${open ? " is-open" : ""}`}
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} the ${uses.length} recorded ${uses.length === 1 ? "input" : "inputs"} of ${node.label}`}
                        tabIndex={tab}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(id, lid);
                        }}
                      >
                        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                          <path d="M2.5 3.5 L5 6.2 L7.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {uses.length} {uses.length === 1 ? "input" : "inputs"}
                        {outside > 0 && <span className="card__outside">, {outside} outside</span>}
                      </button>
                    ) : !isRoot && !clone && !tags.length ? (
                      <span className="card__none">{outside > 0 ? `${outside} ${outside === 1 ? "input" : "inputs"} outside this account` : "No recorded inputs"}</span>
                    ) : null}
                    {clone && (
                      <button
                        type="button"
                        className="card__usedby"
                        tabIndex={tab}
                        aria-label={`Used by ${usedBy} records on this map. Open ${node.label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(id);
                        }}
                      >
                        Used by {usedBy}
                      </button>
                    )}
                    {role !== "all" && !isRoot && !clone && (
                      <span className="card__cov">
                        <span className={`cov-mark${role === "support" ? " cov-mark--relied" : role === "outside" ? " cov-mark--outside" : ""}`} aria-hidden="true" />
                        {role === "direct" ? "with a passage" : role === "support" ? "used without a passage" : "not used"}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="card__compact" aria-hidden="true">
                <span className="src-sq" />
                {isRoot && <span className="card__cmain">Main result</span>}
                <span className={`card__ctitle${node.kind === "declaration" ? " lean" : ""}`}>
                  {node.kind === "declaration" ? <LeanName name={node.label} camel /> : isRoot ? <WholeWords text={node.label} /> : node.label}
                </span>
                {isRoot && rootExcerpt && (
                  <div ref={statementRef} className="card__cstatement">
                    {rootExcerpt}
                  </div>
                )}
              </div>
              {tags.length > 0 && (
                <span className="card__notches" aria-hidden="true">
                  {tags.map((e) => (
                    <i key={e.key} className={tagClass(e)} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
        <svg className="tree__heads" width={1} height={1} aria-hidden="true">
          <g className="heads">
            {[...built.plan.buses.keys()].map((parent) => (
              <g key={parent} className={busFaded(parent, false) ? "is-peeked" : undefined}>
                <path ref={pathRef(`head:${parent}`)} className="head head--supports" />
              </g>
            ))}
            {[...built.plan.edges.values()]
              .filter((pe) => !pe.bus && pe.arrow)
              .map((pe) => (
                <g key={pe.key} className={peekKeys.faded.has(pe.key) ? "is-peeked" : undefined}>
                  <path ref={pathRef(`ahead:${pe.key}`)} className={`head head--${pe.kind}`} />
                </g>
              ))}
            {[...built.plan.edges.values()]
              .filter((pe) => pe.bus && edgeByKey.get(edgeKeyOf(pe.key))?.application)
              .map((pe) => (
                <path key={pe.key} ref={pathRef(`ring:${pe.key}`)} className="ring" />
              ))}
          </g>
          <g className="heads-over">
            {[...emphasised]
              .filter((k) => built.plan.edges.get(k)?.arrow && !(litOn && litKeys.has(k)))
              .map((k) => (
                <path key={k} ref={pathRef(`ovhead:${k}`)} className={`head head--${kindOf(k)} head--near`} />
              ))}
          </g>
          <g className="heads-lit" key={traceKey}>
            {[...(litOn ? litKeys : [])]
              .filter((k) => built.plan.edges.get(k)!.arrow)
              .map((k) => {
                const t = drawTiming.get(k) ?? { delay: 0, dur: 240, from: "start" as const };
                // The head appears when its line arrives (at its consumer end).
                const at = t.from === "start" ? t.delay + t.dur - 40 : t.delay;
                return <path key={k} ref={pathRef(`lithead:${k}`)} className={`head head--${kindOf(k)} head--lit`} style={{ ["--d" as string]: `${Math.max(0, at)}ms` }} />;
              })}
          </g>
          <g className="heads-peek">
            {[...peekKeys.lit]
              .filter((k) => built.plan.edges.get(k)?.arrow)
              .map((k) => (
                <path key={k} ref={pathRef(`klithead:${k}`)} className={`head head--${kindOf(k)} head--lit`} />
              ))}
          </g>
          <g className="heads-passage">
            {[...passageKeys]
              .filter((k) => built.plan.edges.get(k)?.arrow)
              .map((k) => (
                <path key={k} ref={pathRef(`plithead:${k}`)} className={`head head--${kindOf(k)} head--lit`} />
              ))}
          </g>
          {edgeObj && built.plan.edges.get(edgeObj.key)?.arrow && <path ref={pathRef(`selhead:${edgeObj.key}`)} className={`head head--${edgeObj.kind} head--lit`} />}
        </svg>
      </div>

      {/* Screen-space layer: never scales with the map. */}
      <div className="tree__labels" aria-hidden="true">
        {labelled.map((id) => (
          <span key={id} ref={labelRef(id)} className={`tree__label${id === selected ? " is-selected" : ""}${id === goal ? " is-goal" : ""}`}>
            {graph.nodes.get(recordOf(id))?.label ?? id}
          </span>
        ))}
      </div>
      <MapEdgeControls
        ref={controlsRef}
        showChips={showChips}
        showNotes={!compact && (previewOutside.length > 0 || hiddenEdges.length > 0)}
        insets={insets}
        notesRef={notesRef}
        outsideCount={previewOutside.length}
        graph={fullGraph}
        hiddenEdges={hiddenEdges}
        onChip={chipClick}
        onChoose={(key) => (onEdgeSelect ? onEdgeSelect(key) : onSelect(edgeByKey.get(key)?.from ?? null))}
      />
      {tipEdge && (
        <EdgeTip
          tip={tipEdge}
          graph={fullGraph}
          edge={tipEdge.key.startsWith("bus:") ? null : (edgeByKey.get(edgeKeyOf(tipEdge.key)) ?? null)}
          bus={tipEdge.key.startsWith("bus:") ? { parent: recordOf(tipEdge.key.slice(4)), count: built.skeleton.filter((e) => e.from === tipEdge.key.slice(4) && e.kind === "supports").length } : null}
          wrap={wrapRef.current}
          compact={compact}
          onEnter={() => window.clearTimeout(tipLeave.current)}
          onLeave={leaveEdge}
        />
      )}
    </div>
  );
});

interface ChipState {
  ids: Beyond;
  at: Record<Side, number | null>;
  notes: { x: number; top: boolean } | null;
}

function emptyChips(): ChipState {
  return { ids: { left: [], right: [], up: [], down: [] }, at: { left: null, right: null, up: null, down: null }, notes: null };
}

/** Only these screen-space controls rerender when the camera changes their positions. */
const MapEdgeControls = forwardRef<{ update(chips: ChipState): void }, {
  showChips: boolean;
  showNotes: boolean;
  insets: Insets;
  notesRef: RefObject<HTMLDivElement | null>;
  outsideCount: number;
  graph: ArgGraph;
  hiddenEdges: readonly ArgEdge[];
  onChip(side: Side): void;
  onChoose(key: string): void;
}>(function MapEdgeControls({ showChips, showNotes, insets, notesRef, outsideCount, graph, hiddenEdges, onChip, onChoose }, ref) {
  const [chips, setChips] = useState(emptyChips);
  useImperativeHandle(ref, () => ({ update: setChips }), []);
  return <>
    {showChips && SIDES.map((side) => {
      if (!chips.ids[side].length || chips.at[side] === null) return null;
      const count = uniqueCount(chips.ids[side]);
      return <button
        key={side}
        type="button"
        className={`tree__ui tree__chip tree__chip--${side}`}
        style={chipStyle(side, insets, chips.at[side]!)}
        onClick={() => onChip(side)}
        aria-label={`Show ${count} more ${count === 1 ? "record" : "records"} ${side === "up" ? "above" : side === "down" ? "below" : `to the ${side}`}`}
      >{chipText(side, count)}</button>;
    })}
    {showNotes && <div
      ref={notesRef}
      className={`tree__ui tree__notes${chips.notes?.top ? " tree__notes--top" : ""}`}
      style={chips.notes?.top ? { left: chips.notes.x, top: insets.top } : { left: chips.notes?.x ?? insets.left, bottom: insets.bottom }}
      onClick={(event) => event.stopPropagation()}
    >
      {outsideCount > 0 && <p className="tree__note" role="status">
        {outsideCount === 1 ? "1 linked record is not in the argument for this main result" : `${outsideCount} linked records are not in the argument for this main result`}
      </p>}
      <SimplifiedMap graph={graph} hidden={hiddenEdges} onChoose={onChoose} />
    </div>}
  </>;
});

const uniqueCount = (lids: readonly string[]) => new Set(lids.map(recordOf)).size;

/** A tag shows the assumption's short name (the part before a colon); the full title is its accessible name and tooltip. */
function shortTitle(label: string): string {
  return label.split(/[:;]/)[0].trim();
}

/** Short titles on one card, unless two would read the same: then the full titles (clipped by width). */
function tagTitle(tags: readonly ArgEdge[], e: ArgEdge, label: (id: string) => string): string {
  const short = tags.map((t) => shortTitle(label(t.to)));
  if (new Set(short).size === short.length) return shortTitle(label(e.to));
  // "Scalar-value interface: Brownian space…" twice on one card: the part after the colon tells them apart.
  const full = label(e.to);
  const rest = full.includes(":") ? full.slice(full.indexOf(":") + 1).trim() : full;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function chipStyle(side: Side, insets: Insets, at: number): React.CSSProperties {
  if (side === "left") return { left: Math.max(4, insets.left - 12), top: at };
  if (side === "right") return { right: Math.max(4, insets.right - 12), top: at };
  if (side === "up") return { top: Math.max(4, insets.top - 12), left: at };
  return { bottom: insets.bottom + 4, left: at };
}

/** Region membership used for colour; re-exported for the page key. */
export { goalFor } from "./treeModel";
export { pathFromGoal };
// Kept for callers that draw a single arrowhead elsewhere.
export { arrowHead };

/**
 * A Lean name breaks after its dots and underscores, and, in a compact tile (`camel`),
 * also between camel-case words (LEAN_BREAK), never mid-word; copying it stays exact.
 */
function LeanName({ name, camel = false }: { name: string; camel?: boolean }) {
  const parts = name.split(camel ? LEAN_BREAK : /(?<=[._])/);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && <wbr />}
        </span>
      ))}
    </>
  );
}

/** One canvas for measuring titles; null where there is none (tests). */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureContext(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  measureCtx = null;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return measureCtx;
  try {
    measureCtx = document.createElement("canvas").getContext("2d");
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/** A tile title's break pieces, measured at REF_PX in the title's own font, with a small allowance for the browser's rounding. */
function measureTitle(el: HTMLElement, label: string, kind: TitleKind): MeasuredTitle {
  const ctx = measureContext();
  const cs = getComputedStyle(el);
  const lean = kind === "lean";
  const allow = 1.04;
  const width = (text: string) => {
    if (!ctx) return text.length * REF_PX * (lean ? 0.6 : 0.52);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${REF_PX}px ${cs.fontFamily}`;
    return ctx.measureText(text).width * allow;
  };
  const space = width(" ");
  return {
    pieces: titlePieces(label, lean, kind === "root").map((p, i) => ({ w: width(p.text), gap: i > 0 && p.space ? space : 0, text: p.text })),
    ellipsis: width("…"),
  };
}

/** The plate's title breaks between words only: a hyphenated word ("zero-temperature") stays on one line. */
function WholeWords({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\S+-\S+)/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="card__nobreak">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

