// The focus graph: one subject (a step, a declaration, or the steps of one paragraph) in the
// middle, the cards that use it on the left and the cards it uses on the right, each joined to
// it by a curved line. It fits its pane when it opens: nodes are one compact line of plain
// words, and a side with more neighbours than fit is drawn as named groups, each with its
// count. A small group opens in place; a large one opens as a list of its members beside the
// drawing, so the drawing never has to grow to hold it. Nothing is left out and nothing is
// replaced by a bare count.
// The same file serves the Quartic Reader, the SK and Erdős #257 readers and Proof Reader:
// docs/graph-pane.md is its specification, and a change here should be copied to the other two.
//
// Layout is the browser's own (columns of wrapped titles); the lines are measured from the
// nodes after layout, so a title of any length, or one with typeset mathematics, is never cut.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { graphWheel } from "./graphWheel";
import "./focus-graph.css";

/** What a card is, for the reader: this decides its look and, on a crowded side, its group. */
export type FGRole = "result" | "step" | "definition" | "helper" | "library" | "cited" | "open";

export interface FGCard {
  id: string;
  /** Plain words, shown whole. */
  title: string;
  /** The raw Lean name, shown on the subject and in the dock. */
  name?: string;
  role: FGRole;
  /** A short tag before the title: "Theorem 2.1", "Lemma 4.5". */
  kicker?: string;
  /** The topic colour this card shares with its phrases in the paper (any CSS colour). */
  tone?: string;
  /** The name of that topic: a crowded side is grouped by it. */
  topic?: string;
  /** The Lean file or the section of the paper it belongs to: a large group is divided by it. */
  section?: string;
  /** Where the paper states it, against the reading position. */
  seen?: "before" | "here" | "later";
}

/**
 * `from` uses `to`, and how that is known. Paper argument: `argument`, a link the paper states;
 * `paper`, a use the paper's own text states and no Lean dependency joins (drawn dashed, with the
 * sentence that states it, `why`, and a link to where the using result is stated, `href`);
 * `derived`, a link between results the edition derived from the Lean's dependencies; `assumes`,
 * an assumption. Lean: `statement`, the statement of `from` names `to`; `proof`, its proof or body
 * does; `use`, the Lean uses it and no record says whether in the statement or the proof.
 */
export type FGRelation = "argument" | "paper" | "derived" | "assumes" | "statement" | "proof" | "use";
export interface FGEdge { from: string; to: string; kind?: FGRelation; why?: string; href?: string }

/** The order relations are listed in, and which one a card's line shows when it has several. */
export const RELATION_ORDER: readonly FGRelation[] = ["argument", "paper", "derived", "assumes", "proof", "statement", "use"];
/** Each relation's words in a count ("3 by a link the paper states") and in the key. */
export const RELATION_WORDS: Record<FGRelation, { count: string; key: string }> = {
  argument: { count: "by a link the paper states", key: "a link the paper states" },
  paper: { count: "by the paper's text alone", key: "a use the paper's proof states, with no Lean link" },
  derived: { count: "by a link derived from the Lean", key: "a link between results, derived from the Lean" },
  assumes: { count: "by assumption", key: "an assumption" },
  statement: { count: "in a Lean statement", key: "used in a Lean statement" },
  proof: { count: "in a Lean proof or body", key: "used in a Lean proof or body" },
  use: { count: "in the Lean, statement or proof not recorded", key: "used in the Lean, statement or proof not recorded" },
};

/** How many neighbours each relation joins, as words: "4: 1 by a link the paper states, 3 in a Lean proof or body". */
export function relationCounts(counts: ReadonlyMap<FGRelation, number>): string {
  return RELATION_ORDER.filter((k) => counts.get(k)).map((k) => `${counts.get(k)} ${RELATION_WORDS[k].count}`).join(", ");
}

export interface FGRoleWords { order: number; one: string; many: string; uses: string; usedBy: string }

export const FG_ROLES: Record<FGRole, FGRoleWords> = {
  result: { order: 0, one: "Paper result", many: "Results of the paper", uses: "Results of the paper it uses", usedBy: "Results of the paper that use it" },
  step: { order: 1, one: "Step", many: "Steps of the argument", uses: "Steps of the argument it uses", usedBy: "Steps of the argument that use it" },
  definition: { order: 2, one: "Definition", many: "Definitions", uses: "Definitions it uses", usedBy: "Definitions that use it" },
  cited: { order: 3, one: "Cited result", many: "Cited results", uses: "Cited results it uses", usedBy: "Cited results that use it" },
  open: { order: 4, one: "Open question", many: "Open questions", uses: "Open questions it rests on", usedBy: "Open questions that use it" },
  helper: { order: 5, one: "Lean helper", many: "Lean helper lemmas", uses: "Lean helper lemmas it uses", usedBy: "Lean helper lemmas that use it" },
  library: { order: 6, one: "Library fact", many: "Library facts", uses: "Library facts it uses", usedBy: "Library facts that use it" },
};

export interface FocusGraphProps {
  /** The card or cards in the middle. */
  subjects: readonly string[];
  availableHeight?: number;
  onFitHeight?(height: number): void;
  card(id: string): FGCard | undefined;
  /** Every edge with a subject at one end (others are ignored). */
  edges: readonly FGEdge[];
  /** From the subject to the main result: each card is used by the next. Empty when the subject is the main result. */
  route?: readonly string[] | null;
  /** Said when there is no route to draw. */
  routeNote?: ReactNode;
  /** The words before the route's steps (focusModel's routeWords); absent, a plain count of links. */
  routeLabel?: string;
  /** One line over the drawing: what this view is, and a way back if it is a view of its own. */
  label?: ReactNode;
  /** Cards lit from outside: the phrase or sentence under the pointer. */
  lit?: readonly string[];
  /** The card whose detail is docked below, if it is not the subject. */
  held?: string | null;
  onSubject(id: string): void;
  onHover?(id: string | null): void;
  renderTitle?(card: FGCard): ReactNode;
  roles?: Partial<Record<FGRole, Partial<FGRoleWords>>>;
  /** Words for the subject frame when a paragraph has several steps. */
  manyLabel?: string;
}

interface Box { x: number; y: number; w: number; h: number }
interface Seg { d: string; cls: string; kind: string; edge?: string; why?: string; href?: string }
interface Drawn { w: number; h: number; segs: Seg[]; paths: Record<string, string>; boxes: { id: string; box: Box; band: string }[] }

/** Skip an SVG commit when the layout and its edge targets have not moved. */
function sameDrawing(a: Drawn | null, b: Drawn | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.w !== b.w || a.h !== b.h || a.segs.length !== b.segs.length) return false;
  if (a.boxes.length !== b.boxes.length || a.boxes.some(({ id, band, box }, i) => {
    const next = b.boxes[i];
    return id !== next.id || band !== next.band || Math.abs(box.x - next.box.x) > 0.05 ||
      Math.abs(box.y - next.box.y) > 0.05 || Math.abs(box.w - next.box.w) > 0.05 || Math.abs(box.h - next.box.h) > 0.05;
  })) return false;
  if (!a.segs.every((seg, i) => {
    const next = b.segs[i];
    return seg.d === next.d && seg.cls === next.cls && seg.edge === next.edge &&
      seg.kind === next.kind;
  })) return false;
  const keys = Object.keys(a.paths);
  return keys.length === Object.keys(b.paths).length && keys.every((key) => a.paths[key] === b.paths[key]);
}

type Side = "users" | "uses";
/**
 * A neighbour: the relation its line shows (the first of RELATION_ORDER it has), every relation it
 * has, the subjects it joins, and for a `paper` line the sentence that states it and where.
 */
interface Rel { kind: FGRelation; kinds: Set<FGRelation>; of: Set<string>; why?: string; href?: string }

/** How many of these neighbours each relation joins; a neighbour joined two ways counts under both. */
function countKinds(ids: readonly string[], rels: ReadonlyMap<string, Rel>): Map<FGRelation, number> {
  const counts = new Map<FGRelation, number>();
  for (const id of ids) for (const k of rels.get(id)?.kinds ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}
/** One thing in a side's column: a card, or a named group of cards that opens in place. */
type Item =
  | { type: "node"; id: string }
  | { type: "group"; key: string; name: string; tone?: string; role?: FGRole; said?: string; ids: string[]; open: boolean; children: Item[] };
/** How one side is divided when it does not fit: named parts, some of them drawn out as their own nodes. */
interface Part { key: string; name: string; list: string[]; depth: number }
type Plan = { flat: true } | { flat: false; parts: Part[]; out: ReadonlySet<string>; previews: ReadonlyMap<string, number> };

/** Below this scale a title is too small to read: a side that needs it is grouped further instead. */
const MIN_READ = 0.85;
/** The scales the reader can reach with the buttons, wheel, pinch and keys. */
const K_MIN = 0.2;
const K_MAX = 2.5;
/** A fitted drawing can grow modestly in a large pane or shrink when grouping cannot make it fit. */
const FIT_MAX = 1.15;
/** Room kept around a fitted drawing, and how much of it a pan always leaves in view. */
const FIT_MARGIN = 18;
const KEEP_IN_VIEW = 60;
/** The height the buttons over the bottom of the view take. */
const TOOLS_ROOM = 36;
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const PAD_X = 16;
const PAD_Y = 14;
const ITEM_GAP = 6;
/** A group with more members than this opens as a list beside the drawing, not in it. */
const LIST_ABOVE = 8;
/** Members of a listed group shown at once. */
const LIST_PAGE = 20;
/** What each kind of line records, in the key and in the line's own tooltip: RELATION_WORDS's key words, as a name. */
const relation = (kind: string) => {
  const words = RELATION_WORDS[kind as FGRelation]?.key ?? RELATION_WORDS.use.key;
  return words.charAt(0).toUpperCase() + words.slice(1);
};
/** A kind's words inside a sentence: "Definitions" becomes "definitions"; "Lean helper lemmas" keeps its capital. */
const inSentence = (words: string) => (words.startsWith("Lean ") ? words : words.charAt(0).toLowerCase() + words.slice(1));

/** The visible diagram in world coordinates. Text ranges exclude the unused part of a
 * column, and SVG curve bounds include the wires that run outside the cards on phones. */
function diagramBounds(world: HTMLElement): Box | null {
  const origin = world.getBoundingClientRect();
  if (!origin.width || !world.offsetWidth) return null;
  const scale = origin.width / world.offsetWidth;
  const range = world.ownerDocument.createRange();
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  const include = (x: number, y: number, width: number, height: number) => {
    if (!width && !height) return;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  };
  const fromViewport = (rect: DOMRect) => include(
    (rect.left - origin.left) / scale, (rect.top - origin.top) / scale,
    rect.width / scale, rect.height / scale,
  );
  for (const card of world.querySelectorAll(".fg__card, .fg__grouphead, .fg__subjects--many")) {
    fromViewport(card.getBoundingClientRect());
  }
  for (const wire of world.querySelectorAll<SVGPathElement>(".fg__wire")) {
    const box = wire.getBBox();
    include(box.x, box.y, box.width, box.height);
  }
  for (const label of world.querySelectorAll(".fg__sidehead, .fg__edge-note")) {
    range.selectNodeContents(label);
    for (const rect of range.getClientRects()) fromViewport(rect);
  }
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function FocusGraph(props: FocusGraphProps) {
  const { subjects, card, edges, route, routeNote, routeLabel, label, lit, held, onSubject, onHover, renderTitle } = props;
  const pane = useRef<HTMLDivElement>(null);
  const arrowId = useId();
  const activeArrowId = `${arrowId}-active`;
  const scroller = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, chrome: 0 });
  const layoutHeight = Math.max(size.h, (props.availableHeight ?? 0) - size.chrome);
  const fittedKey = useRef<string | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  /** The sentence of a use the paper's text states, while it is pointed at or after a click. */
  const [paperNote, setPaperNote] = useState<{ why: string; href?: string; edge?: string; held: boolean } | null>(null);
  /** Groups the reader opened, by side and key. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  /** How many times the first estimate of what fits has been tightened for this subject. */
  const [tight, setTight] = useState(0);
  const openedNow = useRef(false);
  openedNow.current = opened.size > 0;
  const tightNow = useRef(0);
  tightNow.current = tight;
  /** The large group whose members are listed beside the drawing, by side and key. It is not "opened": the drawing does not change. */
  const [listed, setListed] = useState<{ side: Side; path: string } | null>(null);
  const listedNow = useRef(false);
  listedNow.current = !!listed;
  /** What the reader searched for and which page they were on in each listed group, until the subject changes. */
  const [lists, setLists] = useState<Record<string, { q: string; page: number }>>({});
  const searchBox = useRef<HTMLInputElement>(null);

  // ---- The camera ---------------------------------------------------------------------------
  // The drawing is laid out once for the pane's size and never for the view of it: panning and
  // zooming only set a transform on the world, so nothing the camera does can change the layout,
  // and the layout changes the camera only by an explicit fit. There are no scroll bars.
  const cam = useRef({ x: 0, y: 0, k: 1 });
  /** True from opening, a new subject or Fit until the reader moves the view or opens a group: the drawing is kept fitted. */
  const auto = useRef(true);
  const drawnRef = useRef<Drawn | null>(null);
  useLayoutEffect(() => { drawnRef.current = drawn; }, [drawn]);
  const applyCam = () => {
    const w = world.current;
    if (!w) return;
    const c = cam.current;
    const t = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) scale(${c.k.toFixed(4)})`;
    if (w.style.transform !== t) w.style.transform = t;
  };
  /** Move the camera, keeping some of the drawing in view whatever the reader does. */
  const setCam = (next: { x: number; y: number; k: number }) => {
    const d = drawnRef.current, el = scroller.current;
    if (d && el) {
      const keepX = Math.min(KEEP_IN_VIEW, (d.w * next.k) / 2), keepY = Math.min(KEEP_IN_VIEW, (d.h * next.k) / 2);
      next = { k: next.k, x: clampTo(next.x, keepX - d.w * next.k, el.clientWidth - keepX), y: clampTo(next.y, keepY - d.h * next.k, el.clientHeight - keepY) };
    }
    cam.current = next;
    applyCam();
  };
  /** Zoom by a factor about a point of the view (its centre by default), by the reader's hand. */
  const zoomBy = (factor: number, px?: number, py?: number) => {
    const el = scroller.current;
    if (!el) return;
    const c = cam.current;
    const k = clampTo(c.k * factor, Math.min(K_MIN, c.k), K_MAX);
    const ox = px ?? el.clientWidth / 2, oy = py ?? el.clientHeight / 2;
    auto.current = false;
    setCam({ k, x: ox - ((ox - c.x) * k) / c.k, y: oy - ((oy - c.y) * k) / c.k });
  };
  const panBy = (dx: number, dy: number) => {
    auto.current = false;
    setCam({ ...cam.current, x: cam.current.x + dx, y: cam.current.y + dy });
  };
  /** Move the camera just enough to show a card or an open group. */
  const reveal = (node: HTMLElement) => {
    const view = scroller.current?.getBoundingClientRect();
    if (!view) return;
    const box = node.getBoundingClientRect();
    const margin = 8;
    let dx = 0, dy = 0;
    if (box.left < view.left + margin || box.width > view.width - 2 * margin) dx = view.left + margin - box.left;
    else if (box.right > view.right - margin) dx = view.right - margin - box.right;
    if (box.top < view.top + margin || box.height > view.height - 2 * margin) dy = view.top + margin - box.top;
    else if (box.bottom > view.bottom - margin) dy = view.bottom - margin - box.bottom;
    if (dx || dy) panBy(dx, dy);
  };
  /**
   * Fit the whole drawing in view with a margin and bounded magnification. When that would set the
   * titles below a readable size, the sides are grouped further first (up to six times) and the fit
   * waits for the new layout. Returns false while it waits.
   */
  const fitNow = (overview = false): boolean => {
    const d = drawnRef.current, el = scroller.current, w = world.current;
    if (!d || !el || !w || !el.clientWidth || !el.clientHeight || !d.w || !d.h) return false;
    // The buttons stand over the bottom of the view: a fitted drawing stays above them.
    const vw = el.clientWidth, vh = Math.max(1, el.clientHeight - TOOLS_ROOM);
    const margin = Math.min(FIT_MARGIN, vw / 6, vh / 6);
    const bounds = diagramBounds(w);
    if (!bounds || vh <= 2 * margin || vw <= 2 * margin) return false;
    const byHeight = (vh - 2 * margin) / bounds.h;
    const byWidth = (vw - 2 * margin) / bounds.w;
    if (!overview && (layoutHeight - TOOLS_ROOM - 2 * margin) / bounds.h < MIN_READ && !openedNow.current && tightNow.current < 6) {
      setTight((t) => Math.min(6, t + 1));
      return false;
    }
    const widthScale = Math.min(FIT_MAX, byWidth);
    props.onFitHeight?.(Math.ceil(bounds.h * widthScale + 2 * margin + TOOLS_ROOM + size.chrome));
    const k = Math.min(widthScale, byHeight);
    // Centre in the full pane when there is room. A tall drawing moves just far
    // enough up to leave the overlaid controls clear.
    const centreY = Math.min(el.clientHeight / 2, vh - margin - bounds.h * k / 2);
    cam.current = {
      k,
      x: vw / 2 - (bounds.x + bounds.w / 2) * k,
      y: centreY - (bounds.y + bounds.h / 2) * k,
    };
    applyCam();
    return true;
  };

  const words = useCallback((role: FGRole): FGRoleWords => ({ ...FG_ROLES[role], ...(props.roles?.[role] ?? {}) }), [props.roles]);

  // What is drawn: the subjects, in ranks when they use one another; on the left the cards that
  // use a subject; on the right the cards a subject uses. A card that both uses and is used is on the left.
  const model = useMemo(() => {
    const subj = subjects.filter((id, i) => card(id) && subjects.indexOf(id) === i);
    const isSubject = new Set(subj);
    const users = new Map<string, Rel>();
    const uses = new Map<string, Rel>();
    const inner: FGEdge[] = [];
    const add = (into: Map<string, Rel>, id: string, subject: string, kind: FGRelation = "use", e?: FGEdge) => {
      if (!card(id)) return;
      const row = into.get(id) ?? { kind, kinds: new Set<FGRelation>(), of: new Set<string>() };
      // The line shows the first relation in RELATION_ORDER: a link the paper states, a use the
      // paper's text alone states, a link derived from the Lean, an assumption, a proof use, a
      // statement-only use, an unsplit use.
      if (RELATION_ORDER.indexOf(kind) < RELATION_ORDER.indexOf(row.kind)) row.kind = kind;
      row.kinds.add(kind);
      if (kind === "paper" && row.kind === "paper" && e?.why) { row.why = e.why; row.href = e.href; }
      row.of.add(subject);
      into.set(id, row);
    };
    for (const e of edges) {
      const f = isSubject.has(e.from), t = isSubject.has(e.to);
      if (f && t) { if (e.from !== e.to) inner.push(e); }
      else if (f) add(uses, e.to, e.from, e.kind, e);
      else if (t) add(users, e.from, e.to, e.kind, e);
    }
    for (const id of users.keys()) uses.delete(id);
    // The subjects of one paragraph, in an order in which a step comes after every step that uses it.
    const rank = new Map(subj.map((id) => [id, 0]));
    for (let pass = 0; pass < subj.length; pass++) {
      let changed = false;
      for (const e of inner) {
        const want = (rank.get(e.from) ?? 0) + 1;
        if ((rank.get(e.to) ?? 0) < want && want <= subj.length) { rank.set(e.to, want); changed = true; }
      }
      if (!changed) break;
    }
    const ordered = [...subj].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    const sorted = (side: Map<string, Rel>) =>
      [...side.keys()].sort((a, b) => {
        const A = card(a)!, B = card(b)!;
        return words(A.role).order - words(B.role).order || (A.topic ?? "~").localeCompare(B.topic ?? "~") || A.title.localeCompare(B.title);
      });
    return { subj: ordered, inner, users, uses, left: sorted(users), right: sorted(uses) };
  }, [subjects, card, edges, words]);

  const key = model.subj.join("|");
  const many = model.subj.length > 1;
  useLayoutEffect(() => { setOpened(new Set()); setTight(0); setHot(null); setListed(null); setLists({}); auto.current = true; }, [key]);
  // Reconsider the grouping at the new pane size. The camera follows the drawing that commits.
  useLayoutEffect(() => {
    if (!size.w || !auto.current || openedNow.current) return;
    if (tightNow.current) setTight(0);
  }, [size.w, size.h]);

  // The widths of the three columns, for the room there is. The height a column may take is the
  // pane's at the smallest readable scale: a taller drawing is grouped further, a shorter one is fitted.
  const W = size.w || 640;
  const H = (layoutHeight || 420) / MIN_READ;
  const both = model.left.length > 0 && model.right.length > 0;
  const gap = Math.round(Math.max(30, Math.min(96, W * 0.07)));
  // The subject is at least 190 wide where two side columns of 150 still fit beside it, and 168 in a narrower pane.
  const subjectW = Math.round(Math.max(W >= 2 * 150 + 2 * gap + 2 * PAD_X + 190 ? 190 : 168, Math.min(280, W * (both ? 0.27 : 0.3))));
  // Too narrow for three columns (a phone): the sides stand over and under the subject, at the pane's width.
  const stacked = W < 520;
  const sideW = stacked ? Math.floor(W - 2 * PAD_X - 18) : Math.floor(Math.max(150, Math.min(both ? 380 : 460, both ? (W - subjectW - 2 * PAD_X - 2 * gap) / 2 : W - subjectW - 2 * PAD_X - gap)));

  // A column fits when its nodes' heights, estimated from the length of each title, come to no more
  // than the height of the area. A side that does not fit starts from its kinds and divides the largest
  // group that can be divided (by topic, then by file or section), largest pieces first, for as long as
  // the column still fits; the smallest groups are then drawn out as their own nodes while there is room.
  const narrow = stacked;
  const plan = useCallback((ids: string[]): Plan => {
    const lines = (text: string, tag = "") => Math.max(1, Math.ceil(((text.length + (tag ? tag.length + 1 : 0)) * 6.9) / (sideW - 24)));
    const nodeH = (id: string) => { const c = card(id)!; return 10 + lines(c.title, c.kicker) * 17.5 + ITEM_GAP; };
    const headH = (name: string) => 15 + lines(name + " 00000") * 17.5 + ITEM_GAP;
    const room = (narrow ? Math.max(H, 520) * 0.5 : H - 2 * PAD_Y - 30) * Math.pow(0.86, tight);
    if (ids.reduce((sum, id) => sum + nodeH(id), 0) <= room) return { flat: true };
    const by = (list: string[], pick: (c: FGCard) => string) => {
      const groups = new Map<string, string[]>();
      for (const id of list) { const k = pick(card(id)!); groups.set(k, [...(groups.get(k) ?? []), id]); }
      return [...groups.entries()];
    };
    let parts: Part[] = by(ids, (c) => c.role).map(([role, list]) => ({ key: role, name: words(role as FGRole).many, list, depth: 0 }));
    // Leave room for actual dependencies before subdividing the column into more headings.
    const previewRoom = size.h && size.w ? Math.min(room * 0.38, 152) : 0;
    const total = (ps: Part[]) => ps.reduce((sum, p) => sum + headH(p.name), 0);
    // The pieces a part divides into, largest first: by topic, and a part that is one topic by file or section.
    const pieces = (p: Part): Part[] | null => {
      for (const depth of [1, 2]) {
        if (p.depth >= depth || (depth === 2 && p.list.length < 8)) continue;
        const found = by(p.list, (c) => (depth === 1 ? c.topic : c.section) ?? "").sort((x, y) => y[1].length - x[1].length);
        if (found.length < 2) continue;
        return found.map(([k, list]) => ({ key: `${p.key}/${depth}:${k}`, list, depth, name: k ? (depth === 2 && p.depth === 1 ? `${p.name} · ${k}` : k) : `Other ${inSentence(p.name)}` }));
      }
      return null;
    };
    for (let guard = 0; guard < 60; guard++) {
      const order = parts.map((_, i) => i).sort((a, b) => parts[b].list.length - parts[a].list.length);
      let done = false;
      for (const i of order) {
        if (parts[i].list.length < 4 || parts[i].key.endsWith("/rest")) continue;
        const all = pieces(parts[i]);
        if (!all) continue;
        // As many of the largest pieces as fit; what is left stays together under the part's own name.
        for (let take = all.length; take >= 1 && !done; take--) {
          const rest = all.slice(take).flatMap((x) => x.list);
          if (take < all.length && rest.length === 0) continue;
          const kept: Part[] = take === all.length ? all : [...all.slice(0, take), { key: `${parts[i].key}/rest`, name: parts[i].name.startsWith("Other ") ? parts[i].name : `Other ${inSentence(parts[i].name)}`, list: rest, depth: parts[i].depth }];
          // Pieces of one name (the cards with no topic, and what was left over) stand as one group.
          const merged: Part[] = [];
          for (const k of kept) { const same = merged.find((m) => m.name === k.name); if (same) same.list = [...same.list, ...k.list]; else merged.push({ ...k }); }
          const next = [...parts.slice(0, i), ...merged, ...parts.slice(i + 1)];
          if (total(next) <= room - previewRoom) { parts = next; done = true; }
        }
        if (done) break;
      }
      if (!done) break;
    }
    let left = room - total(parts);
    const out = new Set<string>();
    for (const p of [...parts].sort((a, b) => a.list.length - b.list.length)) {
      const cost = p.list.reduce((sum, id) => sum + nodeH(id), 0) - headH(p.name);
      if (p.list.length === 1 || cost <= left) { out.add(p.key); left -= Math.max(0, cost); }
    }
    // Deal row space to the groups in turns. A wrapped title costs more than a short one.
    // Each preview is a real child of its group; opening the header still exposes every member.
    const previews = new Map<string, number>();
    if (size.w && size.h) {
      const grouped = parts.filter((p) => !out.has(p.key));
      for (let row = 0; row < 4; row++) {
        for (const part of grouped) {
          if ((previews.get(part.key) ?? 0) !== row || row >= part.list.length - 1) continue;
          const item = card(part.list[row])!;
          const text = [item.kicker, item.title].filter(Boolean).join(" ");
          const lines = Math.max(1, Math.ceil(text.length * 6.9 / Math.max(1, sideW - 46)));
          const cost = 12 + lines * 17.5 + ITEM_GAP;
          if (cost > left) continue;
          previews.set(part.key, row + 1);
          left -= cost;
        }
      }
    }
    return { flat: false, parts, out, previews };
  }, [card, words, sideW, H, tight, narrow, size.w, size.h]);

  // While the reader has a group open or listed the division is kept as it was, so that the group stays where it is.
  const kept = useRef<{ key: string; users: Plan; uses: Plan } | null>(null);
  const plans = useMemo(() => {
    if ((opened.size || listedNow.current) && kept.current?.key === key) return kept.current;
    kept.current = { key, users: plan(model.left), uses: plan(model.right) };
    return kept.current;
  }, [plan, model.left, model.right, opened, key]);

  const column = useCallback((side: Side, ids: string[], how: Plan): Item[] => {
    const node = (id: string): Item => ({ type: "node", id });
    if (how.flat) return ids.map(node);
    const open = (path: string) => opened.has(`${side}:${path}`);
    // Only a small group opens in place; a large one is listed beside the drawing and never opens here.
    const group = (path: string, name: string, list: string[]): Item => {
      const tones = new Set(list.map((id) => card(id)!.tone));
      const kinds = new Set(list.map((id) => card(id)!.role));
      const isOpen = list.length <= LIST_ABOVE && open(path);
      return { type: "group", key: path, name, tone: tones.size === 1 ? [...tones][0] : undefined, role: kinds.size === 1 ? [...kinds][0] : undefined, ids: list, open: isOpen, children: (isOpen ? list : list.slice(0, how.previews.get(path) ?? 0)).map(node) };
    };
    const items = how.parts.flatMap((p) => (how.out.has(p.key) && !open(p.key) ? p.list.map(node) : [group(p.key, p.name, p.list)]));
    // Two groups of one name (one topic among the definitions and again among the lemmas) each say their kind.
    const names = new Map<string, number>();
    for (const it of items) if (it.type === "group") names.set(it.name, (names.get(it.name) ?? 0) + 1);
    for (const it of items) if (it.type === "group" && it.role && (names.get(it.name) ?? 0) > 1) it.said = inSentence(words(it.role).many);
    return items;
  }, [card, opened, words]);

  const leftItems = useMemo(() => column("users", model.left, plans.users), [column, model.left, plans]);
  const rightItems = useMemo(() => column("uses", model.right, plans.uses), [column, model.right, plans]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measurePane = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const chrome = (pane.current?.clientHeight ?? h) - h;
      setSize((s) => s.w === w && s.h === h && s.chrome === chrome ? s : { w, h, chrome });
    };
    measurePane();
    const observer = new ResizeObserver(measurePane);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The lines, measured from the nodes as the browser laid them out.
  const readDrawing = useCallback((): Drawn | null | undefined => {
    const w = world.current;
    if (!w) return;
    // HTML cards and SVG wires share the world's layout space. Position them before
    // the camera transform so a zoom, a drawer animation or a pan cannot detach a wire.
    const box = (el: HTMLElement): Box => {
      let x = 0, y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== w) {
        x += node.offsetLeft;
        y += node.offsetTop;
        const parent = node.offsetParent as HTMLElement | null;
        if (parent && parent !== w) {
          x += parent.clientLeft;
          y += parent.clientTop;
        }
        node = parent;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const frame = w.querySelector<HTMLElement>(".fg__subjects");
    if (!frame) return null;
    const F = box(frame);
    const stackedNow = w.classList.contains("fg__world--narrow");
    const segs: Seg[] = [];
    const paths: Record<string, string> = {};
    const boxes: Drawn["boxes"] = [];
    const subjectBox = new Map<string, Box>();
    for (const el of w.querySelectorAll<HTMLElement>(".fg__card, .fg__grouphead")) {
      const b = box(el);
      boxes.push({ id: el.dataset.card ?? `group:${el.dataset.group}`, box: b, band: el.dataset.band ?? "group" });
      if (el.dataset.band === "subject") subjectBox.set(el.dataset.card!, b);
    }
    // Keep the full arrowhead on a straight part of the line, including its base.
    const approach = 16;
    const curve = (x1: number, y1: number, x2: number, y2: number) => {
      const entry = x2 + approach;
      const mx = (x1 + entry) / 2;
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${mx.toFixed(1)} ${y1.toFixed(1)}, ${mx.toFixed(1)} ${y2.toFixed(1)}, ${entry.toFixed(1)} ${y2.toFixed(1)} H${x2.toFixed(1)}`;
    };
    // In a stacked graph the wires approach from the left instead.
    const loop = (x1: number, y1: number, x2: number, y2: number) => {
      const m = Math.min(x1, x2) - approach - 6;
      const entry = x2 - approach;
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${m.toFixed(1)} ${y1.toFixed(1)}, ${m.toFixed(1)} ${y2.toFixed(1)}, ${entry.toFixed(1)} ${y2.toFixed(1)} H${x2.toFixed(1)}`;
    };
    for (const side of ["users", "uses"] as const) {
      const col = w.querySelector(`.fg__side[data-band="${side}"]`);
      if (!col) continue;
      const rels = side === "users" ? model.users : model.uses;
      // Where lines meet a subject: spread along its edge, in the order of the nodes they come from.
      const tops = [...col.querySelectorAll<HTMLElement>(":scope > .fg__card, :scope > .fg__group > .fg__grouphead")];
      const perSubject = new Map<string, number>();
      const ends: { el: HTMLElement; b: Box; to: Box; id: string }[] = [];
      for (const el of tops) {
        const b = box(el);
        const id = el.dataset.card;
        const of = id ? [...(rels.get(id)?.of ?? [])] : [];
        // A group's line goes to the frame of the subjects; a card's to each subject it is related to.
        const targets = many ? (of.length ? of.map((s) => subjectBox.get(s)).filter((x): x is Box => !!x) : [F]) : [subjectBox.get(model.subj[0]) ?? F];
        for (const to of targets) {
          const k = `${to.x},${to.y}`;
          perSubject.set(k, (perSubject.get(k) ?? 0) + 1);
          ends.push({ el, b, to, id: id ?? `group:${el.dataset.group}` });
        }
      }
      const seenAt = new Map<string, number>();
      for (const e of ends) {
        const k = `${e.to.x},${e.to.y}`;
        const n = perSubject.get(k)!;
        const i = seenAt.get(k) ?? 0;
        seenAt.set(k, i + 1);
        const spread = Math.min(e.to.h - 12, (n - 1) * 7);
        const ty = e.to.y + e.to.h / 2 + (n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0);
        const ny = e.b.y + e.b.h / 2;
        // Edges are stored from consumer to input. Draw the arrow towards the consumer.
        const d = stackedNow
          ? (side === "users" ? loop(e.to.x, ty, e.b.x, ny) : loop(e.b.x, ny, e.to.x, ty))
          : side === "users" ? curve(e.to.x, ty, e.b.x + e.b.w, ny) : curve(e.b.x, ny, e.to.x + e.to.w, ty);
        const isGroup = !e.el.dataset.card;
        const kind = isGroup ? (e.el.dataset.kind ?? "use") : (rels.get(e.id)?.kind ?? "use");
        const rel = isGroup ? undefined : rels.get(e.id);
        // A line's weight says its kind alone: a group's size is its badge, never a heavier line.
        segs.push({ d, cls: `fg__wire fg__edge fg__edge--${kind}${isGroup ? " fg__edge--group" : ""}`, kind, edge: side === "users" ? `${e.id}>` : `>${e.id}`, why: kind === "paper" ? rel?.why : undefined, href: kind === "paper" ? rel?.href : undefined });
        paths[e.id] = paths[e.id] ? `${paths[e.id]} ${d}` : d;
        // A card inside an open group lights the group's own line.
        if (isGroup) for (const m of e.el.parentElement!.querySelectorAll<HTMLElement>(".fg__card")) paths[m.dataset.card!] = paths[e.id];
      }
    }
    // Between subjects, the arrow also points towards the step that uses the other.
    model.inner.forEach((e, i) => {
      const a = subjectBox.get(e.from), b = subjectBox.get(e.to);
      if (!a || !b) return;
      // Neighbouring subjects can connect across their vertical gap. Longer and
      // backward links use the outer edge so they never pass through another title.
      const consecutive = model.subj.indexOf(e.to) === model.subj.indexOf(e.from) + 1;
      const x = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
      const endA = a.x + a.w, endB = b.x + b.w;
      const yA = a.y + a.h / 2, yB = b.y + b.h / 2;
      const gutter = Math.max(endA, endB) + approach + 7 + (i % 3) * 3;
      const d = consecutive
        ? `M${x} ${b.y} V${a.y + a.h}`
        : `M${endB} ${yB} C${gutter} ${yB}, ${gutter} ${yA}, ${endA + approach} ${yA} H${endA}`;
      segs.push({ d, cls: `fg__wire fg__edge fg__edge--${e.kind ?? "use"} fg__inner`, kind: e.kind ?? "use", edge: `${e.from}>${e.to}`, why: e.kind === "paper" ? e.why : undefined, href: e.kind === "paper" ? e.href : undefined });
    });
    // The world's own size: offsetWidth is not scaled by the camera.
    return { w: w.offsetWidth, h: w.offsetHeight, segs, paths, boxes };
  }, [model, many]);

  useLayoutEffect(() => {
    const next = readDrawing();
    if (next !== undefined && !sameDrawing(drawnRef.current, next)) setDrawn(next);
    const w = world.current;
    if (!w) return;

    // Size changes made by the browser arrive after React's layout effect. Commit
    // changed paths in this observer turn, before the browser paints the moved cards.
    const syncDrawing = () => {
      const next = readDrawing();
      if (next === undefined || sameDrawing(drawnRef.current, next)) return;
      flushSync(() => setDrawn(next));
    };
    const ro = new ResizeObserver(syncDrawing);
    if (scroller.current) ro.observe(scroller.current, { box: "border-box" });
    ro.observe(w, { box: "border-box" });
    for (const c of w.querySelectorAll(".fg__card, .fg__grouphead, .fg__side, .fg__subjects, .fg__sidehead, .fg__edge-note")) ro.observe(c, { box: "border-box" });
    const fonts = w.ownerDocument.fonts;
    fonts?.addEventListener("loadingdone", syncDrawing);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener("loadingdone", syncDrawing);
    };
  }, [readDrawing, key, leftItems, rightItems, sideW, subjectW]);

  // The pane and its new SVG can commit in different frames. Fit the latest
  // drawing and pane together, after both the HTML and SVG have laid out.
  useLayoutEffect(() => {
    if (!drawn || !size.w || !size.h) return;
    const fitFor = JSON.stringify([key, size.w, size.h, layoutHeight, model.left, model.right]);
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        // A dock preview can redraw the separate graph under the pointer.
        // A new subject, arriving neighbours or a genuine resize still merits a fit.
        const held = fittedKey.current === fitFor && scroller.current?.matches(":hover");
        if (!auto.current || held) {
          applyCam();
          return;
        }
        if (fitNow()) fittedKey.current = fitFor;
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, key, size.w, size.h, layoutHeight, model.left, model.right]);

  // Drag to pan, two fingers to pinch. A drag that starts on a card and moves is a pan, not a click.
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; far: boolean } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = scroller.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".fg__tools")) return;
    if (e.pointerType === "touch") touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: cam.current.k };
      drag.current = null;
      return;
    }
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, far: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomBy((pinch.current.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist / cam.current.k, mid.x, mid.y);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.far && Math.hypot(dx, dy) < 5) return;
    if (!d.far) { d.far = true; scroller.current!.setPointerCapture(e.pointerId); scroller.current!.classList.add("is-panning"); }
    auto.current = false;
    setCam({ ...cam.current, x: d.cx + dx, y: d.cy + dy });
  };
  const suppressClick = useRef(false);
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.far) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      if (scroller.current!.hasPointerCapture(e.pointerId)) scroller.current!.releasePointerCapture(e.pointerId);
      scroller.current!.classList.remove("is-panning");
    }
  };
  // This listener belongs to the drawing. The member list, annotations and toolbar handle their own input.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const gesture = graphWheel(e, el);
      if ("zoom" in gesture) {
        const p = local(e);
        zoomBy(gesture.zoom, p.x, p.y);
      } else panBy(gesture.panX, 0);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keys on the graph: arrows pan, + and − zoom, 0 fits.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? 160 : 60;
    const pans: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (pans[e.key]) panBy(...pans[e.key]);
    else if (e.key === "+" || e.key === "=") zoomBy(1.2);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.2);
    else if (e.key === "0") fit();
    else return;
    e.preventDefault();
  };
  // Browser scrolling cannot reveal a card above or to the left of a transformed drawing.
  // Move the camera explicitly on focus and keep a card still while a pointer press selects it.
  const onFocus = (e: React.FocusEvent) => {
    if (drag.current) return;
    const node = (e.target as HTMLElement).closest<HTMLElement>(".fg__card, .fg__grouphead");
    if (node) reveal(node);
  };
  // A double click on the drawing (not on a card) zooms in there.
  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, .fg__tools")) return;
    const p = local(e);
    zoomBy(1.6, p.x, p.y);
  };
  /** Frame the drawing as it is: Fit only moves the camera, and folds, closes and forgets nothing. From here the view is kept fitted again. */
  const fit = () => {
    auto.current = true;
    fitNow(true);
  };

  const hover = (id: string | null) => { setHot(id); onHover?.(id); };
  const choose = (id: string) => { if (!suppressClick.current) onSubject(id); };
  const headOf = (side: Side, path: string) =>
    [...(world.current?.querySelectorAll<HTMLElement>(`.fg__side[data-band="${side}"] .fg__grouphead`) ?? [])].find((h) => h.dataset.group === path) ?? null;
  /** Close the list of a large group and give the keyboard back to the group's own button, without moving the drawing. */
  const closeList = () => {
    const was = listed;
    // The opening button can receive focus once the list no longer covers the drawing.
    flushSync(() => setListed(null));
    if (was) headOf(was.side, was.path)?.focus({ preventScroll: true });
  };
  // A large group is listed beside the drawing: the drawing, its groups and the camera stay exactly as they are.
  // A small one opens in place and is kept in view: the drawing may now be taller than its area.
  const toggle = (side: Side, path: string, count: number) => {
    if (suppressClick.current) return;
    if (count > LIST_ABOVE) {
      setListed((was) => (was && was.side === side && was.path === path ? null : { side, path }));
      return;
    }
    const k = `${side}:${path}`;
    setOpened((was) => {
      const next = new Set(was);
      if (next.has(k)) { for (const o of was) if (o === k || o.startsWith(`${k}/`)) next.delete(o); } else next.add(k);
      return next;
    });
    auto.current = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = world.current?.querySelector<HTMLElement>(`.fg__side[data-band="${side}"] .fg__group[data-group="${CSS.escape(path)}"]`);
      if (el) reveal(el);
    }));
  };

  // The list takes the keyboard when it opens, at its search field.
  useEffect(() => { if (listed) searchBox.current?.focus({ preventScroll: true }); }, [listed]);

  const litSet = useMemo(() => new Set(lit ?? []), [lit]);
  const hotOf = hot ? (model.users.get(hot)?.of ?? model.uses.get(hot)?.of) : null;

  const renderCard = (id: string, band: Side | "subject", kind?: string) => {
    const c = card(id)!;
    const subject = band === "subject";
    const cls = ["fg__card", `fg__card--${c.role}`, subject ? "is-subject" : "", litSet.has(id) ? "is-lit" : "", held === id ? "is-held" : "", hot === id ? "is-hot" : "", subject && hotOf?.has(id) ? "is-related" : ""].filter(Boolean).join(" ");
    const said = `${c.kicker ?? words(c.role).one}${c.seen === "later" ? ", stated later in the paper" : c.seen === "before" ? ", already read" : ""}`;
    return (
      <button
        key={id}
        type="button"
        className={cls}
        data-card={id}
        data-band={band}
        data-role={c.role}
        data-kind={kind}
        data-seen={c.seen}
        aria-current={subject ? "true" : undefined}
        title={subject ? undefined : said}
        style={c.tone ? ({ "--fg-tone": c.tone } as React.CSSProperties) : undefined}
        onClick={() => choose(id)}
        onMouseEnter={() => hover(id)}
        onMouseLeave={() => hover(null)}
        onFocus={() => hover(id)}
        onBlur={() => hover(null)}
      >
        {subject && <span className="fg__kicker">{c.kicker ?? words(c.role).one}</span>}
        <span className="fg__title">
          {!subject && c.kicker && <span className="fg__tag">{c.kicker}</span>}
          {renderTitle ? renderTitle(c) : c.title}
        </span>
        {subject && !many && c.name && <code className="fg__name">{c.name.replace(/([._])/g, "$1\u200b")}</code>}
      </button>
    );
  };

  const renderItems = (side: Side, items: Item[], rels: Map<string, Rel>): ReactNode =>
    items.map((it) => {
      if (it.type === "node") return renderCard(it.id, side, rels.get(it.id)?.kind);
      const lines = new Set(it.ids.map((id) => rels.get(id)?.kind ?? "use"));
      const kind = RELATION_ORDER.find((k) => lines.has(k)) ?? "use";
      const how = relationCounts(countKinds(it.ids, rels));
      const large = it.ids.length > LIST_ABOVE;
      const isListed = large && listed?.side === side && listed.path === it.key;
      return (
        <div key={`g:${it.key}`} className={`fg__group${it.open ? " is-open" : ""}${isListed ? " is-listed" : ""}`} data-group={it.key} style={it.tone ? ({ "--fg-tone": it.tone } as React.CSSProperties) : undefined}>
          <button
            type="button"
            className={`fg__grouphead${it.role ? ` fg__grouphead--${it.role}` : ""}`}
            data-group={it.key}
            data-count={it.ids.length}
            data-kind={kind}
            data-opens={large ? "list" : "here"}
            data-preview-count={it.open ? undefined : it.children.length || undefined}
            aria-description={!it.open && it.children.length ? `${it.children.length} of ${it.ids.length} members shown. Open for the full group.` : undefined}
            aria-expanded={large ? isListed : it.open}
            title={large ? (isListed ? `Close the list of these members (${how})` : `List these ${it.ids.length} members (${how})`) : it.open ? `Fold these back into one group (${how})` : `Show these ${it.ids.length} cards here (${how})`}
            onClick={() => toggle(side, it.key, it.ids.length)}
          >
            <span className="fg__groupname">{it.name}{it.said && <span className="fg__groupkind"> {it.said}</span>}</span>
            <span className="fg__count">{it.ids.length}</span>
            <span className="fg__sign" aria-hidden="true">{it.open ? "−" : "+"}</span>
          </button>
          {it.children.length > 0 && <div className="fg__members">{renderItems(side, it.children, rels)}</div>}
        </div>
      );
    });

  // A side with nothing on it takes no room: the subject and the other side have the middle of the area,
  // and one line under the subject says that the side is empty.
  const renderSide = (side: Side, items: Item[], ids: string[], rels: Map<string, Rel>) => ids.length > 0 && (
    <div className="fg__side" data-band={side} data-total={ids.length} style={{ width: sideW }}>
      <h4 className="fg__sidehead">{side === "users" ? "These use the centre" : "The centre uses these"} <span>{ids.length}</span></h4>
      {renderItems(side, items, rels)}
    </div>
  );
  const emptyNote = (side: Side, ids: string[]) => ids.length === 0 && (
    <p className="fg__edge-note" data-band-note={side}>{side === "users" ? `Nothing drawn here uses ${many ? "these" : "this"}.` : `${many ? "These use" : "This uses"} nothing else drawn here.`}</p>
  );

  const groups = (items: Item[]) => items.filter((it) => it.type === "group").length;

  // The listed group, found among the groups on show; if it is no longer drawn, nothing is listed.
  const find = (items: Item[], path: string): Extract<Item, { type: "group" }> | null => {
    for (const it of items) {
      if (it.type !== "group") continue;
      if (it.key === path) return it;
      const inner = find(it.children, path);
      if (inner) return inner;
    }
    return null;
  };
  const listGroup = listed ? find(listed.side === "users" ? leftItems : rightItems, listed.path) : null;
  const listCoversGraph = !!listGroup && size.w < 900;
  const listKey = listed ? `${listed.side}:${listed.path}` : "";
  const listState = lists[listKey] ?? { q: "", page: 0 };
  const setList = (next: Partial<{ q: string; page: number }>) => setLists((was) => ({ ...was, [listKey]: { ...(was[listKey] ?? { q: "", page: 0 }), ...next } }));
  const listIds = listGroup?.ids ?? [];
  const needle = listState.q.trim().toLowerCase();
  // The search runs over the whole group, every page of it: the plain title, the kicker and the Lean name.
  const matching = needle
    ? listIds.filter((id) => { const c = card(id); return !!c && [c.title, c.kicker ?? "", c.name ?? ""].some((t) => t.toLowerCase().includes(needle)); })
    : listIds;
  const pages = Math.max(1, Math.ceil(matching.length / LIST_PAGE));
  const page = Math.min(listState.page, pages - 1);
  const shown = matching.slice(page * LIST_PAGE, (page + 1) * LIST_PAGE);
  const range = `${page * LIST_PAGE + 1}\u2013${page * LIST_PAGE + shown.length}`;
  const listStatus = !listGroup ? "" : needle
    ? (matching.length ? `${matching.length} of ${listIds.length} members match${matching.length > LIST_PAGE ? `, ${range} shown` : ""}` : `No matches among the ${listIds.length} members.`)
    : `${range} of ${listIds.length} members`;
  const hotPath = hot && drawn ? (drawn.paths[hot] ?? (listGroup && listIds.includes(hot) ? drawn.paths[`group:${listGroup.key}`] : undefined)) : undefined;

  return (
    <div
      ref={pane}
      className="fg"
      data-subjects={key}
      data-users={model.left.length}
      data-uses={model.right.length}
      data-groups={groups(leftItems) + groups(rightItems)}
      data-opened={opened.size}
      data-cards={drawn?.boxes.filter((b) => b.band !== "group").length ?? 0}
      data-lines={drawn?.segs.filter((s) => s.edge).length ?? 0}
      data-listed={listGroup ? listKey : undefined}
    >
      {label && <p className="fg__label">{label}</p>}
      {(route || routeNote) && (
        <nav className="fg__route" aria-label="From this step to the main result">
          {route && route.length > 0
            ? <>
              <span className="fg__routeword">{routeLabel ?? (route.length === 1 ? "The main result uses this directly:" : `${route.length} links to the main result:`)}</span>
              {route.map((id, i) => (
                <span key={id} className="fg__crumb">
                  <span aria-hidden="true">→</span>
                  <button type="button" onClick={() => onSubject(id)} className={i === route.length - 1 ? "is-main" : undefined}>{card(id) ? (renderTitle ? renderTitle(card(id)!) : card(id)!.title) : id}</button>
                </span>
              ))}
            </>
            : <span className="fg__routeword">{routeNote}</span>}
        </nav>
      )}
      <div className="fg__stage" data-list-side={listGroup ? listed!.side : undefined}>
      <div
        className="fg__scroll"
        inert={listCoversGraph}
        ref={scroller}
        tabIndex={0}
        role="group"
        aria-label="Dependency graph. Arrows point to the cards that use the results. Use the arrow keys to move, plus and minus to zoom, and 0 to fit."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onFocusCapture={onFocus}
        onDoubleClick={onDoubleClick}
      >
        <div className={`fg__world${narrow ? " fg__world--narrow" : ""}`} ref={world} style={{ columnGap: gap }}>
          {drawn && (
            <svg className="fg__lines" width={drawn.w} height={drawn.h} aria-hidden="true">
              <defs>
                {/* Set each tip back from the border. Its short stem joins even a dashed line to the base. */}
                <marker id={arrowId} viewBox="0 0 17 10" refX="17" refY="5" markerWidth="16" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0.8 4.3 H6 V1 L14 5 L6 9 V5.7 H0.8 Z" className="fg__arrow" />
                </marker>
                <marker id={activeArrowId} viewBox="0 0 17 10" refX="17" refY="5" markerWidth="17" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0.8 3.6 H6 V1 L14 5 L6 9 V6.4 H0.8 Z" className="fg__arrow fg__arrow--hot" />
                </marker>
              </defs>
              {drawn.segs.map((s, i) => <path key={i} d={s.d} className={s.cls} data-edge={s.edge} markerEnd={`url(#${arrowId})`}><title>{relation(s.kind)}</title></path>)}
              {/* A wide, invisible line over each line answers the pointer with its relation's name; over a use the
                  paper's text states, with its sentence too, held by a click. */}
              {drawn.segs.map((s, i) => s.why ? (
                <path key={`hit${i}`} d={s.d} className="fg__edge-hit" data-edge={s.edge}
                  onPointerEnter={() => setPaperNote({ why: s.why!, href: s.href, edge: s.edge, held: false })}
                  onPointerLeave={() => setPaperNote((n) => (n && !n.held ? null : n))}
                  onClick={(ev) => { ev.stopPropagation(); setPaperNote({ why: s.why!, href: s.href, edge: s.edge, held: true }); }}>
                  <title>{`${relation(s.kind)}: ${s.why}`}</title>
                </path>
              ) : (
                <path key={`hit${i}`} d={s.d} className="fg__edge-hit fg__edge-hit--plain"><title>{relation(s.kind)}</title></path>
              ))}
              {hotPath && <path d={hotPath} className="fg__hotline" markerEnd={`url(#${activeArrowId})`} />}
            </svg>
          )}
          {model.subj.length === 0
            ? <p className="fg__none">Nothing is drawn for this place in the paper.</p>
            : <>
              {renderSide("users", leftItems, model.left, model.users)}
              <div className={`fg__subjects${many ? " fg__subjects--many" : ""}`} data-count={model.subj.length} style={{ width: stacked ? sideW : subjectW }}>
                <h4 className="fg__sidehead fg__centrehead">
                  Centre{many && <> · {props.manyLabel ?? "Stated in this paragraph"} <span>{model.subj.length}</span></>}
                </h4>
                {model.subj.map((id) => renderCard(id, "subject"))}
                {emptyNote("users", model.left)}
                {emptyNote("uses", model.right)}
              </div>
              {renderSide("uses", rightItems, model.right, model.uses)}
            </>}
        </div>
      </div>
      <div className="fg__tools" inert={listCoversGraph} role="group" aria-label="Move the graph">
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button type="button" onClick={fit} title="Fit the whole graph in view (0)">Fit</button>
      </div>
      {listGroup && (
        <section
          // Beside the drawing only where the pane is wide enough to leave the subject in view; else over all of it.
          className={`fg__list fg__list--${listed!.side}${listCoversGraph ? " fg__list--narrow" : ""}`}
          role="region"
          aria-label={`Members of ${listGroup.name}`}
          data-group={listGroup.key}
          data-count={listIds.length}
          onKeyDown={(e) => {
            // Escape closes the list only; the page's own Escape (following the paper again) is not reached.
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            closeList();
          }}
        >
          <div className="fg__listhead">
            <h4 className="fg__listname">{listGroup.name}{listGroup.said && <span className="fg__groupkind"> {listGroup.said}</span>}, {listIds.length}</h4>
            <button type="button" className="fg__listback" onClick={closeList}>Back to the graph</button>
          </div>
          <input
            ref={searchBox}
            type="search"
            className="fg__listsearch"
            aria-label="Search these members"
            placeholder="Search these members"
            value={listState.q}
            onChange={(e) => setList({ q: e.target.value, page: 0 })}
          />
          <p className="fg__liststatus" role="status">{listStatus}</p>
          <ul className="fg__listitems">
            {shown.map((id) => {
              const c = card(id)!;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`fg__member fg__member--${c.role}${hot === id ? " is-hot" : ""}`}
                    data-card={id}
                    data-role={c.role}
                    data-seen={c.seen}
                    style={c.tone ? ({ "--fg-tone": c.tone } as React.CSSProperties) : undefined}
                    onClick={() => onSubject(id)}
                    onMouseEnter={() => hover(id)}
                    onMouseLeave={() => hover(null)}
                    onFocus={() => hover(id)}
                    onBlur={() => hover(null)}
                  >
                    {c.kicker && <span className="fg__memberkicker">{c.kicker}</span>}
                    <span className="fg__membertitle">{renderTitle ? renderTitle(c) : c.title}</span>
                    <span className="fg__memberkind">{words(c.role).one}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="fg__listpages">
            <button type="button" disabled={page <= 0} onClick={() => setList({ page: page - 1 })}>Previous</button>
            <button type="button" disabled={page >= pages - 1} onClick={() => setList({ page: page + 1 })}>Next</button>
          </div>
        </section>
      )}
      </div>
      {paperNote && (
        <p className="fg__edge-why" role="status">
          <span className="fg__edge-why-label">The paper:</span> {paperNote.why}{" "}
          {paperNote.href && <a href={paperNote.href}>Read it in the paper</a>}
          {paperNote.held && (
            <button type="button" className="fg__edge-why-close" aria-label="Close this sentence" onClick={() => setPaperNote(null)}>×</button>
          )}
        </p>
      )}
    </div>
  );
}
