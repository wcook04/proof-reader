// The data one paper's page reads. tools/paper.py writes it; nothing here is
// computed in the browser that could differ from the checked build.

export interface Rect extends Array<number> {}

export interface Passage {
  id: string;
  section: string;
  role: "states" | "defines" | "proves" | "explains" | "uses";
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
  keyword: string;
  kind: string;
  type: string;
  file: string;
  line: number;
  end_line: number;
  lines: number;
  uses: string[];
  used_by: string[];
  axioms: string[];
  standard_axioms: string[];
  passages: string[];
  note: { text: string; because: string[] } | null;
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
    toolchain: string;
    version: string;
    files: Record<string, string>;
  };
  claims: Claim[];
  passages: Passage[];
  mentions: Mention[];
  declarations: Declaration[];
  /** Present when the paper has a reading copy, which reading.html holds. */
  reading: { outline: OutlineEntry[]; words: number; formulas: number; pages: number } | null;
  analytics: {
    declarations: number;
    linked_to_paper: number;
    not_linked: string[];
    axioms: string[];
    resting_on_axioms: Record<string, string[]>;
    free_of_axioms: string[];
    proof_lines: number;
    pages_with_links: number[];
  };
}

export interface ShelfItem {
  slug: string;
  title: string;
  authors: string[];
  venue: string;
  declarations: number;
}

const base = import.meta.env.BASE_URL;

export const paperFile = (slug: string, name: string) => `${base}papers/${slug}/${name}`;

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

export const loadEdition = (slug: string) => json<Edition>(paperFile(slug, "edition.json"));
export const loadShelf = () => json<{ papers: ShelfItem[] }>(`${base}papers/index.json`);
