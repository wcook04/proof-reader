// The data one paper's page reads. tools/paper.py writes it; nothing here is
// computed in the browser that could differ from the checked build.

export interface Rect extends Array<number> {}

export interface Passage {
  id: string;
  section: string;
  role: "states" | "defines" | "proves" | "explains" | "uses" | "mentions" | "mirrors";
  /** It is a line of code in the paper, not a sentence. */
  code?: boolean;
  quote: string;
  lean: string[];
  page: number;
  last_page: number;
  rects: number[][];
  /** The exact Lean lines this passage describes, when it is narrower than the declaration. */
  lines?: [number, number];
}

export interface OutlineEntry {
  id: string;
  number: string;
  title: string;
  level: number;
  ties: number;
  /** The PDF page the section starts on. */
  page: number;
}

/** A Lean name printed in the paper, found by matching words at build time. */
export interface Mention {
  name: string;
  page: number;
  rect: number[];
}

export interface Claim {
  id: string;
  title: string;
  section: string;
  passage: string;
  lean: string[];
}

export interface Declaration {
  id: string;
  /** What a person calls it. The raw name stays small beside this, and in the code. */
  plain: string;
  keyword: string;
  kind: string;
  type: string;
  file: string;
  line: number;
  end_line: number;
  lines: number;
  /** The last line of the statement; what follows is the proof or body. */
  statement_end: number;
  /** The authors' block comment directly above, as first and last line. */
  comment: [number, number] | null;
  uses: string[];
  uses_statement: string[];
  uses_proof: string[];
  used_by: string[];
  used_by_statement: string[];
  used_by_proof: string[];
  axioms: string[];
  standard_axioms: string[];
  passages: string[];
  note: { text: string; because: string[] } | null;
  /** How the paper's statement stands to this Lean, compared with AI; absent before it was run. */
  fidelity?: Fidelity | null;
}

export type Verdict = "same" | "stronger" | "weaker" | "different";

export interface Fidelity {
  verdict: Verdict;
  text: string;
  /** Passage ids the comparison reads. */
  because: string[];
  /** Names of checks, written for this page, that Lean ran against the authors' file. */
  checks: string[];
}

export interface Check {
  name: string;
  keyword: "theorem" | "def";
  file: string;
  line: number;
  end_line: number;
  code: string;
  doc: string;
  axioms: string[];
  status: "checked";
}

export interface Edition {
  schema: 1;
  slug: string;
  paper: {
    title: string;
    short_title: string;
    authors: string[];
    venue: string;
    doi: string;
    url: string;
    pdf: string;
    licence: string;
    licence_url: string;
    pages: number;
    sizes: [number, number][];
    crop: [number, number, number, number];
  };
  lean: {
    modules: string[];
    source: string;
    source_name: string;
    licence: string;
    scope: string;
    /** Where one declaration's lines can be read: {path}, {line} and {end} are filled in. */
    source_lines?: string;
    toolchain: string;
    version: string;
    files: Record<string, string>;
  };
  claims: Claim[];
  passages: Passage[];
  mentions: Mention[];
  declarations: Declaration[];
  /** Lean proofs written for this page, which Lean accepted against the authors' file. */
  checks?: Check[];
  /** Which sections hold ties, in reading order. */
  coverage: { sections: string[]; ties: number };
  /** Present when the paper has a reading copy, which reading.html holds. */
  reading: { outline: OutlineEntry[]; words: number; formulas: number; pages: number } | null;
  analytics: {
    declarations: number;
    linked_to_paper: number;
    not_linked: string[];
    axioms: string[];
    resting_on_axioms: Record<string, string[]>;
    free_of_axioms: string[];
    standard_axioms: Record<string, string[]>;
    sorry: string[];
    proof_lines: number;
    pages_with_links: number[];
    fidelity?: { required: string[]; same: string[]; stronger: string[]; weaker: string[]; different: string[]; refuted_by_check: string[] };
  };
}

/** One linked sentence and its Lean lines, chosen in paper.toml and cut out by the build. */
export interface ShelfExample {
  id: string;
  section: string;
  page_label: string;
  before: string;
  quote: string;
  after: string;
  name: string;
  plain: string;
  keyword: string;
  file: string;
  decl_first: number;
  decl_last: number;
  first: number;
  last: number;
  code: { n: number; text: string }[];
}

export interface ShelfItem {
  slug: string;
  title: string;
  short_title?: string;
  authors: string[];
  venue: string;
  declarations: number;
  lean?: { files: number; lines: number; version: string; axioms: number; sorry: number };
  linked?: number;
  example?: ShelfExample | null;
}

const base = import.meta.env.BASE_URL;

export const paperFile = (slug: string, name: string) => `${base}papers/${slug}/${name}`;

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

export async function loadEdition(slug: string): Promise<Edition> {
  const edition = await json<Edition>(paperFile(slug, "edition.json"));
  return { ...edition, mentions: [], lean: { ...edition.lean, files: {} } };
}

/** What only the Lean page, the PDF and a search need, kept out of the first screen. */
export const loadSource = (slug: string) => json<{ files: Record<string, string>; mentions: Mention[] }>(paperFile(slug, "source.json"));
export const loadShelf = () => json<{ papers: ShelfItem[] }>(`${base}papers/index.json`);

/** True when the page carries comparisons of the paper's statements with the Lean. */
export const hasComparisons = (edition: Edition) => edition.declarations.some((d) => !!d.fidelity);
