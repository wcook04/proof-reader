// What the two ways of showing the paper share, kept apart from the PDF code so
// that opening the reading copy does not load pdf.js.

/** How far down the left page the sentence being read sits. */
export const READING_LINE = 0.34;

/** How long a statement holds the line before the right page answers. */
export const FOLLOW_MS = 200;

/** What the left page is called on when a statement settles. */
export type Follow = (id: string | null, zone: Zone, above: string | null) => void;

/** How long a pointer rests before the right page previews. */
export const DWELL_MS = 150;

/** Where to put the paper. */
export type Target =
  | { top: number; width: number; fallback?: Target }
  | { passage: string }
  | { place: string }
  | { page: number; into?: number }
  | { element: HTMLElement }
  | { start: true };

/** What sits at the reading line: on a tie, between two, or outside them all. */
export type Zone = "before" | "tied" | "between" | "after";

export interface Where {
  passage: string | null;
  zone: Zone;
  /** The last statement at or above the line, whatever the distance. */
  above: string | null;
  /** The heading above the line, in the reading copy. */
  section: string | null;
  /** The PDF page the reader is on, with how far down it they are. */
  page: number;
  into: number;
}

export interface PaperHandle {
  /** Put the paper somewhere. False when the place does not exist. */
  place(target: Target, instant?: boolean): boolean;
  top(): number;
  width(): number;
  where(): Where;
  /** The statement carrying the highlighter. */
  active(): string | null;
  /** A place for the address where no tied statement is near: the block at the line. */
  block(): string | null;
  /** Move keyboard focus to a statement, without scrolling. */
  focusPassage(id: string): void;
  /** Hold the highlighter on a statement until the reader scrolls. */
  mark(id: string | null): void;
  insets(): string[];
  setInsets(keys: string[]): void;
  closeInsets(): boolean;
}

/** A pointer or keyboard focus resting on something tied. */
export type Pointed =
  | { kind: "passage"; id: string }
  | { kind: "name"; id: string; passage?: string }
  | { kind: "text"; title: string; text: string }
  | null;
