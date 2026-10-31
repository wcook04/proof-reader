// What the two ways of showing the paper share, kept apart from the PDF code so
// that opening the reading copy does not load pdf.js.

/** How far down the left page the sentence being read sits. */
export const READING_LINE = 0.34;

export interface PaperHandle {
  scrollToPassage(id: string, instant?: boolean): void;
  /** A heading, a figure or a PDF page. */
  scrollToPlace?(id: string, instant?: boolean): void;
  toTop?(): void;
  /** Return to where the last jump left from. */
  back?(): void;
}
