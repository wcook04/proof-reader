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
  /** The same words set as the reading copy sets them, formulas typeset. Markdown papers only. */
  quote_html?: string;
  lean: string[];
  /** Supplementary proofs compiled against the authors' Lean. */
  checks?: string[];
  title?: string;
  /** Null for Markdown; source_lines give its location. */
  page: number | null;
  last_page: number | null;
  rects: number[][];
  source_quote?: string;
  source_lines?: [number, number];
  source_block?: string;
  anchor?: { heading: string; block: number };
  /** The exact Lean lines this passage describes, when it is narrower than the declaration. */
  lines?: [number, number];
  /** For a standard read against a formalisation made from it: for each linked declaration,
   * the runs of a matcher that found the link (empty when only the authors cite it), and
   * whether the formalisation's authors cite this passage for it ("cites"), cite another
   * passage of the standard ("elsewhere"), or cite none ("uncited"). */
  match?: Record<string, { found_by: string[]; authors: "cites" | "other_release" | "elsewhere" | "uncited"; releases?: string[] }>;
}

/** How well a matcher found the links that a formalisation's authors wrote, with controls. */
export interface Evaluation {
  /** The matcher, as a reader should see it named, such as "GPT-6.1". */
  matcher: string;
  /** Plain sentences, in order, saying what was run and how it was scored. */
  method: string[];
  /** One column per run or control: its label and what it is. */
  columns: { id: string; label: string; about: string }[];
  /** One row per measure: what it counts, and the count [found, of] in each column. */
  rows: { measure: string; about: string; counts: Record<string, [number, number] | null> }[];
  /** Short findings, each a plain sentence. */
  findings: string[];
  /** The authors' citations no run found, one line each. */
  misses: { declaration: string; citation: string }[];
  /** Where the full records are. */
  records: string;
  /** The few figures a reader sees first, each [found, of] with what it counts. */
  headline?: { value: [number, number]; label: string; compare: string }[];
}

export interface OutlineEntry {
  id: string;
  number: string;
  title: string;
  level: number;
  ties: number;
  /** The PDF page the section starts on. */
  page: number | null;
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
  checks?: string[];
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
  /** Where this declaration's facts come from. */
  provenance?: "lean" | "statement-compiled" | "source-read";
  /** The declaration's doc comment, as Lean records it. */
  doc?: string | null;
  passages: string[];
  /** Our note: on the passages in `because`, or on the Lean itself (`on: "lean"`); `html` is its typeset form. */
  note: { text: string; because: string[]; on?: "lean"; summary?: string; html?: string } | null;
  /** How the paper's statement stands to this Lean, compared with AI; absent before it was run. */
  fidelity?: Fidelity | null;
}

export type Verdict = "same" | "stronger" | "weaker" | "different";

export interface Fidelity {
  verdict: Verdict;
  text: string;
  html?: string;
  /** Passage ids the comparison reads. */
  because: string[];
  /** Names of checks, written for this page, that Lean ran against the authors' file. */
  checks: string[];
}

export interface Check {
  name: string;
  title?: string;
  keyword: "theorem" | "def";
  file: string;
  line: number;
  end_line: number;
  code: string;
  doc: string;
  axioms: string[];
  status: "checked";
}

/** What Comparator checked, read by the build from the run's files (`[comparator]` in paper.toml). */
export interface ComparatorEvidence {
  /** The folder of run files, from the repository root. */
  folder: string;
  /** The commit the links below are fixed at; null when the build knew none. */
  commit: string | null;
  run: string;
  date: string;
  /** The commit the run checked out. */
  run_commit?: string;
  toolchain: string;
  sandbox: string;
  /** The kernel the run's output names as accepting the solution. */
  kernel: string;
  paranoid: "not completed";
  permitted_axioms: string[];
  links: { challenge: string; solution: string; config: string; receipt: string; control: string };
  control: { change: string; theorem: string };
  limits: string;
  /** What the challenge imports, when the receipt says; empty when it imports the authors' definitions. */
  imports?: string;
  /** Each theorem name the run checked: its statement in the challenge and the lines it fills. */
  theorems: Record<string, { first: number; last: number; statement: string; url: string }>;
}

export interface Edition {
  check_source_lines?: string;
  schema: 1;
  slug: string;
  source?: { kind: "pdf" | "markdown"; file: string; sha256: string };
  credit?: { text?: string; original_url?: string };
  paper: {
    title: string;
    short_title: string;
    authors: string[];
    venue: string;
    doi: string;
    url: string;
    pdf?: string;
    markdown?: string;
    licence: string;
    licence_url: string;
    /** What the page calls the authors' text: "paper" unless paper.toml says otherwise, as "guide". */
    noun?: string;
    /** Whether the page shows Proof Reader's own films; off unless paper.toml says films = true. */
    films?: boolean;
    /** False when the proof is one statement: the right page is then the Lean alone. */
    graph?: boolean;
    /** A standard read against its formalisation: an entry shows the one declaration stating it. */
    standard?: boolean;
    pages: number;
    sizes: [number, number][];
    crop: [number, number, number, number] | null;
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
    /** Null when the Lean facts were read from the source instead of produced by Lean. */
    version: string | null;
    /** Absent or "lean": names, lines and uses are the output of `paper.py extract`. "source-read": read from the authors' source by hand, pending extraction. */
    provenance?: { kind: "lean" | "source-read"; text?: string };
    files: Record<string, string>;
  };
  claims: Claim[];
  sheets?: Sheet[];
  passages: Passage[];
  mentions: Mention[];
  declarations: Declaration[];
  /** Lean proofs written for this page, which Lean accepted against the authors' file. */
  checks?: Check[];
  /** Comparator's run on some of these declarations, when paper.toml names its files. */
  comparator?: ComparatorEvidence | null;
  /** Which sections hold ties, in reading order. */
  coverage: { sections: string[]; ties: number };
  evaluation?: Evaluation | null;
  /** Present when the paper has a reading copy, which reading.html holds. */
  reading: { outline: OutlineEntry[]; heading_aliases?: Record<string, string>; words: number; formulas: number; pages: number } | null;
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
/** One entry of a statement sheet: a declaration and the authors' sentences that read it. */
export interface SheetEntry {
  id: string;
  prose: string[];
  reading: "authors" | "note" | "none";
}

/** A claim's statement sheet, computed by the build from the Lean dependencies and the links. */
export interface Sheet {
  claim: string;
  title: string;
  heads: SheetEntry[];
  entries: SheetEntry[];
  explained: number;
  total: number;
  boundary: { name: string; used_by: string[] }[];
}

export interface ShelfExample {
  id: string;
  /** The passage's role in links.json: "proves", "states" and so on. */
  role?: string;
  section: string;
  page_label: string;
  source_lines?: [number, number] | null;
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
  source_kind?: "pdf" | "markdown";
  noun?: string;
  declarations: number;
  lean?: { files: number; lines: number; version: string; axioms: number; sorry: number };
  linked?: number;
  example?: ShelfExample | null;
  examples?: ShelfExample[];
  /** Listed on the front page under this paper's entry instead of on its own. */
  with?: string;
  /** Its position among the entries listed under the same paper. */
  place?: number;
  /** Companions sharing a group are listed as one numbered row. */
  group?: string;
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

/** Whether Lean extraction is the default provenance for this edition's declaration records. */
export const fromLean = (edition: Edition) => (edition.lean.provenance?.kind ?? "lean") === "lean";

export const declEvidence = (edition: Edition, d: Declaration) => d.provenance ?? (fromLean(edition) ? "lean" : "source-read");

/** Describe each kind of evidence present, even when edition-level provenance is mixed. */
export function leanOrigin(edition: Edition): string {
  const built = edition.declarations.some((d) => declEvidence(edition, d) === "lean");
  const statements = edition.declarations.filter((d) => declEvidence(edition, d) === "statement-compiled");
  const source = edition.declarations.some((d) => declEvidence(edition, d) === "source-read");
  const version = edition.lean.version ? ` ${edition.lean.version}` : "";
  return [
    built && (source || statements.length
      ? `Some declaration data is Lean’s own output from modules compiled with Lean${version}.`
      : `The declaration data is Lean’s own output from modules compiled with Lean${version}.`),
    statements.length > 0 && `Lean${version} compiled only the ${statements.length === 1 ? "statement" : "statements"} for ${statements.map((d) => d.plain).join(", ")}. The extraction did not build or report axioms for ${statements.length === 1 ? "its proof" : "those proofs"}.`,
    source && `${built || statements.length ? "Other declarations" : "The declarations shown here"} were read from source with AI. Proof dependencies and axiom reports were not extracted for them.`,
  ].filter(Boolean).join(" ");
}

/** One plain phrase for where a declaration's facts come from. */
export const declOrigin = (edition: Edition, d: Declaration) => {
  const kind = declEvidence(edition, d);
  return kind === "lean" ? `read by Lean ${edition.lean.version}`
    : kind === "statement-compiled" ? `statement compiled by Lean ${edition.lean.version}; proof not built in that extraction`
      : "read from the source by hand, with AI";
};

/** The word for the authors' text, as in "In the guide". */
export const noun = (edition: Edition) => edition.paper.noun || "paper";

export const hasComparisons = (edition: Edition) => edition.declarations.some((d) => !!d.fidelity);

/** Source coordinates stay separate from the Lean lines a passage describes. */
export const passageLocation = (passage: Passage) => passage.source_lines
  ? passage.source_lines[0] === passage.source_lines[1] ? `source line ${passage.source_lines[0]}` : `source lines ${passage.source_lines[0]} to ${passage.source_lines[1]}`
  : `page ${passage.page}`;
