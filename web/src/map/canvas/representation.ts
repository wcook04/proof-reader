// How a record is drawn at a screen scale k (DESIGN.md, "Two scales, two
// representations"). The camera never shrinks prose below reading size: past
// a threshold a card turns into a tile that still shows its title, and the
// camera stops at the scale where a tile can hold words at 11px on screen.

export type Rep = "card" | "compact";

/** A card at k >= CARD_K, a tile below it. The dense layout is tiles at every scale. */
export const CARD_K = 0.8;

/** Steps opens at k = 1; it accepts down to this only when that buys the whole first row. */
export const STEPS_K = 1;
export const STEPS_FLOOR = 0.85;
/** The side pane's tree uses smaller cards and a lower floor. */
export const COMPACT_FLOOR = 0.75;

/** The tile's title in world pixels in the dense layout, and the smallest size it may reach on screen. */
export const DENSE_TEXT = 13;
export const MIN_TEXT = 11;
/** Below these scales a tile could not hold its words at MIN_TEXT, so the camera stops here. */
export const DENSE_MIN_K = MIN_TEXT / DENSE_TEXT;
export const STEPS_MIN_K = 0.5;
export const COMPACT_MIN_K = 0.6;
export const MAX_K = 1.8;

/** The dense layout's tiles, in world pixels. */
export const DENSE_W = 190;
export const DENSE_H = 46;
/** With a paper lens on, a dense tile has a third line for the section. */
export const DENSE_H_SECTION = 60;
export const DENSE_ROOT_W = 420;
export const DENSE_ROOT_H = 64;

export function floorK(dense: boolean, compact: boolean): number {
  if (dense) return DENSE_MIN_K;
  return compact ? COMPACT_MIN_K : STEPS_MIN_K;
}

export function repFor(k: number, dense = false): Rep {
  return dense || k < CARD_K - 1e-6 ? "compact" : "card";
}

export type MapMode = "steps" | "overview";

/** A tile's text box on screen: padding and border, in screen pixels. */
export interface TileBox {
  padTop: number;
  padBottom: number;
  padX: number;
  border: number;
}

/** The compact tile's box on screen (tree.css .card__compact). */
export const TILE: TileBox = { padTop: 10, padBottom: 7, padX: 8, border: 1 };

/** The dense tile's box: thin at top and foot, with the source square in the left padding. */
export const DENSE_TILE: TileBox = { padTop: 4, padBottom: 4, padX: 10, border: 1 };


export type TitleKind = "card" | "lean" | "root";

/**
 * Title sizes tried in a tile, largest first, and their line heights. A tile's
 * title stops at 13px so it never outgrows the card it turns into at CARD_K;
 * the plate's title reaches 24px for the same reason. Nothing goes below MIN_TEXT.
 */
export const TITLE_SIZES: Record<TitleKind, { sizes: number[]; lineH: number }> = {
  card: { sizes: steps(13, MIN_TEXT), lineH: 1.22 },
  lean: { sizes: steps(12, MIN_TEXT), lineH: 1.22 },
  root: { sizes: steps(24, MIN_TEXT), lineH: 1.2 },
};

/** The plate's compact form adds the theorem's first sentence, this wide on screen, this far under the title. */
export const STATEMENT_W = 360;
export const STATEMENT_GAP = 12;
/** With the sentence shown, the plate's title stays at least this large. */
const PLATE_TITLE_MIN = 16;

function steps(hi: number, lo: number): number[] {
  const out: number[] = [];
  for (let s = hi; s >= lo - 1e-9; s -= 0.5) out.push(s);
  return out;
}

/** Room for title lines: the tile's height on screen less its padding, border, any reserved line and (on the plate) the "MAIN RESULT" line. */
function roomOf(h: number, k: number, kind: TitleKind, box: TileBox = TILE, reserve = 0): number {
  // The plate's "MAIN RESULT" line (11px at line height 1.2) and the 5px gap under it.
  const above = kind === "root" ? 11 * 1.2 + 5 : 0;
  return h * k - 2 * box.border - box.padTop - box.padBottom - above - reserve;
}

/** The width title lines have on screen: the plate's title keeps a 560px measure. */
function widthOf(w: number, k: number, kind: TitleKind, box: TileBox = TILE): number {
  return (kind === "root" ? Math.min(w, 560 / k) : w) * k - 2 * box.border - 2 * box.padX;
}

/**
 * Compact form at the largest title size: how many lines fit in a tile of world
 * height `h` at scale k. Never fewer than one line.
 */
export function compactLines(h: number, k: number, kind: TitleKind): number {
  const { sizes, lineH } = TITLE_SIZES[kind];
  return Math.max(1, Math.floor((roomOf(h, k, kind) + 0.5) / (sizes[0] * lineH)));
}

/**
 * A title as the pieces a line may break between, measured once at a reference
 * size (REF_PX): words (a line may also break after a hyphen), or a Lean name's
 * pieces (LEAN_BREAK). `gap` is what joins a piece to the one before it on the
 * same line: a space, or nothing. `ellipsis` is the width of "…".
 */
export interface MeasuredTitle {
  pieces: { w: number; gap: number; text?: string }[];
  ellipsis?: number;
}

export const REF_PX = 100;

/**
 * Where a Lean name may break in a compact tile: after a dot or underscore, and
 * between a lower-case letter or digit and the capital that starts the next word of
 * a camel-case name ("ZeroTemperature|SK"). Never inside a word. A full card, which
 * has room, breaks after dots and underscores only.
 */
export const LEAN_BREAK = /(?<=[._])|(?<=[a-z0-9])(?=[A-Z])/;

/**
 * Split a title into the pieces a line may break between; `space` marks a piece that
 * follows a space. With `whole`, a hyphenated word stays one piece (the plate's title
 * breaks between words only: "Full support of / zero-temperature …").
 */
export function titlePieces(text: string, lean: boolean, whole = false): { text: string; space: boolean }[] {
  if (lean) return text.split(LEAN_BREAK).map((t) => ({ text: t, space: false }));
  const out: { text: string; space: boolean }[] = [];
  text
    .trim()
    .split(/\s+/)
    .forEach((word, i) => (whole ? [word] : word.split(/(?<=-)(?=.)/)).forEach((part, j) => out.push({ text: part, space: i > 0 && j === 0 })));
  return out;
}

/**
 * A title too long for its tile is cut after a whole piece, never inside a word: how many
 * pieces fit in `lines` lines at `size` with "…" after the last one kept.
 */
export function keptPieces(t: MeasuredTitle, size: number, width: number, lines: number): number {
  const scale = size / REF_PX;
  const dots = (t.ellipsis ?? 0) * scale;
  let line = 1;
  let cur = 0;
  let kept = 0;
  for (let i = 0; i < t.pieces.length; i++) {
    const p = t.pieces[i];
    const w = p.w * scale;
    const next = cur === 0 ? w : cur + p.gap * scale + w;
    if (next > width + 0.01) {
      if (line === lines) break;
      line++;
      cur = w;
    } else cur = next;
    if (line < lines || cur + dots <= width + 0.01) kept = i + 1;
    else break;
  }
  return kept;
}

/** The first `kept` pieces of a measured title, without trailing punctuation, and "…". */
export function shortTitle(t: MeasuredTitle, kept: number): string {
  const text = t.pieces
    .slice(0, kept)
    .map((p, i) => (i > 0 && p.gap > 0 ? " " : "") + (p.text ?? ""))
    .join("");
  return `${text.replace(/[\s,;:.\-–—_]+$/, "")}…`;
}

/** The start of a single piece wider than a line: the last resort, so a tile always shows words. */
function cutPiece(t: MeasuredTitle, size: number, width: number): string | undefined {
  const first = t.pieces[0];
  if (!first?.text) return undefined;
  const scale = size / REF_PX;
  const room = width - (t.ellipsis ?? 0) * scale;
  const n = Math.max(3, Math.floor((first.text.length * room) / Math.max(1, first.w * scale)));
  return `${first.text.slice(0, n)}…`;
}

/** Greedy wrap at `size`: the number of lines, or Infinity when one piece is wider than the line. */
export function wrapLines(t: MeasuredTitle, size: number, width: number): number {
  const scale = size / REF_PX;
  let lines = 1;
  let cur = 0;
  for (const p of t.pieces) {
    const w = p.w * scale;
    if (w > width + 0.01) return Infinity;
    const next = cur === 0 ? w : cur + p.gap * scale + w;
    if (next > width + 0.01) {
      lines++;
      cur = w;
    } else cur = next;
  }
  return lines;
}

/** A tile's title: its size and line limit, whether it fits whole, and else where it is cut. */
export interface TitleFit {
  size: number;
  lines: number;
  fits: boolean;
  /** Pieces kept when cut; the cut title, when the pieces' text is known. */
  kept?: number;
  short?: string;
}

/**
 * A tile's title: the largest size (13px down to 11px; Lean 12 to 11; the plate
 * 24 to 11) at which the whole title fits the tile on screen, and the number of
 * lines the tile holds at that size. A title that cannot fit even at the
 * smallest size is cut (`fits` false), at the smallest size and after a whole
 * word, so a tile never stands empty. `reserve` is room kept for a line under
 * the title, in screen pixels.
 */
export function fitTitle(t: MeasuredTitle, w: number, h: number, k: number, kind: TitleKind, box: TileBox = TILE, reserve = 0): TitleFit {
  const { sizes, lineH } = TITLE_SIZES[kind];
  const width = widthOf(w, k, kind, box);
  const room = roomOf(h, k, kind, box, reserve);
  if (kind === "root") {
    const plate = fewestLines(t, sizes, width, (size) => Math.max(1, Math.floor((room + 0.5) / (size * lineH))));
    if (plate) return { size: plate.size, lines: plate.max, fits: true };
  } else
    for (const size of sizes) {
      const max = Math.max(1, Math.floor((room + 0.5) / (size * lineH)));
      if (wrapLines(t, size, width) <= max) return { size, lines: max, fits: true };
    }
  const size = sizes[sizes.length - 1];
  const lines = Math.max(1, Math.floor((room + 0.5) / (size * lineH)));
  const kept = keptPieces(t, size, width, lines);
  const short = kept > 0 && t.pieces[0]?.text !== undefined ? shortTitle(t, kept) : cutPiece(t, size, width);
  return { size, lines, fits: false, kept, short };
}

/**
 * The plate in compact form: its title, and under it the theorem's first sentence
 * (`statementH` tall on screen at STATEMENT_W wide, 0 while unmeasured) when the
 * tile is wide enough and both fit with the title at PLATE_TITLE_MIN or larger.
 * Otherwise the title alone, sized like any compact title.
 */
export function fitPlate(t: MeasuredTitle, w: number, h: number, k: number, statementH: number): TitleFit & { statement: boolean } {
  const alone = { ...fitTitle(t, w, h, k, "root"), statement: false };
  if (!(statementH > 0) || w * k - 2 * TILE.border - 2 * TILE.padX < STATEMENT_W) return alone;
  const { sizes, lineH } = TITLE_SIZES.root;
  const width = widthOf(w, k, "root");
  const room = roomOf(h, k, "root") - STATEMENT_GAP - statementH;
  const plate = fewestLines(
    t,
    sizes.filter((s) => s >= PLATE_TITLE_MIN),
    width,
    (size) => Math.floor((room + 0.5) / (size * lineH)),
  );
  return plate ? { size: plate.size, lines: plate.lines, fits: true, statement: true } : alone;
}

/**
 * The plate's title: the largest size at which it fits (`max(size)` lines), unless a size
 * within a fifth of it needs fewer lines; then the largest such. Two balanced lines read
 * better than three with one word left over.
 */
function fewestLines(t: MeasuredTitle, sizes: number[], width: number, max: (size: number) => number): { size: number; lines: number; max: number } | null {
  let best: { size: number; lines: number; max: number } | null = null;
  let top = 0;
  for (const size of sizes) {
    const lines = wrapLines(t, size, width);
    const room = max(size);
    if (lines > room) continue;
    if (!best) {
      best = { size, lines, max: room };
      top = size;
    } else if (size < top * 0.8) break;
    else if (lines < best.lines) best = { size, lines, max: room };
  }
  return best;
}
