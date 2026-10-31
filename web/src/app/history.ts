// One history entry holds everything needed to stand exactly where the reader
// stood: the paper's pixel, the pin, the tab, the map's camera and what lies open.
// The browser keeps it, so Back, Forward and reload all read the same record.
// Opening something pushes an entry. Following and pointing only rewrite the
// entry they are in.

import type { MapScene } from "../map/scene";

export type Copy = "reading" | "pdf";
export type Tab = "step" | "index" | "file";

/** What a click holds on the right page. */
export interface Pin {
  /** The sentence that holds it; a pin ends when this has left the paper's view. */
  passage: string | null;
  /** The declaration opened, when one was opened by name. */
  decl: string | null;
  /** With no sentence to watch: where the paper stood, so that reading on ends the pin. */
  at: number | null;
}

export interface Entry {
  id: string;
  paper: string;
  copy: Copy;
  tab: Tab;
  pin: Pin | null;
  /** The paper's exact position and the width it was measured at. */
  top: number | null;
  width: number;
  /** The Lean page's scroll, and the map's camera. */
  leanTop: number;
  scene: MapScene | null;
  /** The map pauses following while the reader moves it. */
  mapPaused: boolean;
  /** References opened in place, which change where everything below them sits. */
  insets: string[];
  /** Where Back goes, in words, and which page the words belong on. */
  back: string | null;
  backSide: "paper" | "right" | null;
  /** The right page, on a screen where it opens on demand. */
  sheet: boolean;
  /** An address that named nothing, which the page says plainly. */
  bad: string | null;
}

export const blankEntry = (paper: string, copy: Copy): Entry => ({
  id: newEntryId(),
  paper,
  copy,
  tab: "step",
  pin: null,
  top: null,
  width: 0,
  leanTop: 0,
  scene: null,
  mapPaused: false,
  insets: [],
  back: null,
  backSide: null,
  sheet: false,
  bad: null,
});

export function newEntryId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The entry the browser holds for this page, if it is one of ours for this paper. */
export function readEntry(paper: string): Entry | null {
  const state = window.history.state as Partial<Entry> | null;
  return state && typeof state === "object" && state.id && state.paper === paper ? (state as Entry) : null;
}

export function replaceEntry(entry: Entry, href?: string): void {
  try {
    window.history.replaceState(entry, "", href);
  } catch {
    /* a sandboxed frame, or too many writes: the next write carries the same facts */
  }
}

export function pushEntry(entry: Entry, href: string): void {
  window.history.pushState(entry, "", href);
}
