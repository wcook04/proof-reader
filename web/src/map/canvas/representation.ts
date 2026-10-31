// How a record is drawn at a screen scale k (DESIGN.md, "Two scales, three
// representations"). The camera never shrinks prose below reading size: past
// a threshold the card changes form instead.

export type Rep = "card" | "compact" | "mark";

/** Card at k >= CARD_K, compact title down to MARK_K, a mark below. */
export const CARD_K = 0.8;
export const MARK_K = 0.5;

/** Steps opens at k = 1; it accepts down to this only when that buys the whole first row. */
export const STEPS_K = 1;
export const STEPS_FLOOR = 0.85;
/** The side pane's tree uses smaller cards and a lower floor. */
export const COMPACT_FLOOR = 0.75;
export const MIN_K = 0.1;
export const MAX_K = 1.8;

export function repFor(k: number): Rep {
  if (k >= CARD_K - 1e-6) return "card";
  if (k >= MARK_K - 1e-6) return "compact";
  return "mark";
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

/** A mark's text box (tree.css, mark form): the fill gives the source, so there is no corner square to clear. */
export const MARK_TILE: TileBox = { padTop: 4, padBottom: 4, padX: 4, border: 1 };

export type TitleKind = "card" | "lean" | "root";

/**
 * Title sizes tried in a compact tile or a mark, largest first, and their line heights.
 * A tile's title stops at 13px so it never outgrows the card it turns into at CARD_K;
 * the plate's title reaches 24px for the same reason.
 */
export const TITLE_SIZES: Record<TitleKind, { sizes: number[]; lineH: number }> = {
  card: { sizes: steps(13, 10), lineH: 1.22 },
  lean: { sizes: steps(12, 9.5), lineH: 1.22 },
  root: { sizes: steps(24, 11), lineH: 1.2 },
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

/** Room for title lines: the tile's height on screen less its padding, border and (on the plate) the "MAIN RESULT" line. */
function roomOf(h: number, k: number, kind: TitleKind, box: TileBox = TILE): number {
  // The plate's "MAIN RESULT" line (11px at line height 1.2) and the 5px gap under it.
  const above = kind === "root" ? 11 * 1.2 + 5 : 0;
  return h * k - 2 * box.border - box.padTop - box.padBottom - above;
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
 * Compact form: the largest title size (13px down to 10px; Lean 12 to 9.5; the
 * plate 24 to 11) at which the whole title fits the tile on screen, and the
 * number of lines the tile holds at that size. Only a title that cannot fit
 * even at the smallest size is cut (`fits` false), at the smallest size and
 * after a whole word.
 */
export function fitTitle(t: MeasuredTitle, w: number, h: number, k: number, kind: TitleKind, box: TileBox = TILE): TitleFit {
  const { sizes, lineH } = TITLE_SIZES[kind];
  const width = widthOf(w, k, kind, box);
  const room = roomOf(h, k, kind, box);
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
  return { size, lines, fits: false, kept, short: kept > 0 && t.pieces[0]?.text !== undefined ? shortTitle(t, kept) : undefined };
}

/**
 * Mark form: a mark is a tile too, and shows its title whenever it fits at 10px or
 * more on screen (`show`). A title too long for the mark is cut after a whole word
 * when at least two lines fit, no word is wider than a line and at least half its
 * words stay; anything less stays a plain mark. Whether text shows depends on the
 * mark's own size on screen, not on the scale alone, so the plate keeps its title
 * long after the tiles lose theirs.
 */
export function fitMark(t: MeasuredTitle, w: number, h: number, k: number, kind: TitleKind): TitleFit & { show: boolean } {
  const fit = fitTitle(t, w, h, k, kind, MARK_TILE);
  if (fit.fits) return { ...fit, show: roomOf(h, k, kind, MARK_TILE) >= fit.size * TITLE_SIZES[kind].lineH - 0.5 };
  const whole = wrapLines(t, fit.size, widthOf(w, k, kind, MARK_TILE)) < Infinity;
  return { ...fit, show: fit.lines >= 2 && whole && (fit.kept ?? 0) * 2 >= t.pieces.length };
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
