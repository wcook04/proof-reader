# Proof Reader

Proof Reader shows a research paper beside its proof in [Lean](https://lean-lang.org), a
language in which a computer program verifies each step of a proof. You read the paper on the
left page as you read any paper. The right page holds a graph of the Lean proof, which moves to
the statement you are reading, and a click on a statement shows the authors' exact Lean lines.
You do not have to search the authors' files to find the Lean for a sentence.

**[Read a paper in it](https://wcook04.github.io/proof-reader/#/contextual-embeddings)**: *Contextual Embeddings* by Frohlich, Foster, Kavvos and Wang (PLDI 2026), shown with the authors' Lean under CC BY 4.0. The links between the paper and the Lean were made with AI and have not been reviewed by the authors.

[![A paper on the left page with one sentence highlighted, and on the right the graph of its Lean proof above the exact Lean lines the sentence describes.](web/public/reader.webp)](https://wcook04.github.io/proof-reader/#/contextual-embeddings)

- As you scroll, the statement a third of the way down the page is highlighted, and its card
  on the graph is outlined. Cards carry plain titles, with the Lean name small beneath.
- The right pane has two modes, Graph and Lean, with a toggle at its top. Click a statement or
  a card and the pane changes to Lean at the exact lines: "isoR's CLam case" opens `CLam`'s five
  lines, not the top of `isoR`. Any Back returns you to the graph at the same place.
- Choose Lean on the toggle and the Lean moves with the text, level with the sentence you are
  reading, with a short line across the gutter between them. Drag the handle to see the graph
  as well.
- Citations and figures open under the paragraph that mentions them, so you keep your place.
- Back returns the same pixel of the paper, the same open statement and the same graph, also
  after a reload. Every statement and declaration has an address you can send to someone.
- An index at the end of the contents lists every declaration and the axioms Lean reports.

The site adds no explanation of the mathematics. A program compares the reading copy with the
PDF word for word, and the PDF is one click away. The graph and the axiom lists are built from
Lean's own output. The only added words are a short plain title for each declaration, and short
notes where the paper and the Lean differ, each linked to the sentence it is about. These links,
notes and titles were made with AI and have not been reviewed by the authors.

## Add a paper

A paper is a folder. Everything else is generated from it.

```
papers/<slug>/
  paper.pdf      the authors' PDF, unchanged
  paper.md       the paper's text, compared with the PDF word for word
  paper.toml     title, authors, licences and the Lean modules to read
  lean/          the authors' Lean project, unchanged
  links.json     which passage goes with which declaration, and each one's plain title
  generated/     what Lean reports about the project
```

The [add-paper skill](skills/add-paper/SKILL.md) walks an agent or a person through
it. In short:

```sh
python3 tools/paper.py new my-paper       # then add the PDF, Lean and paper.toml
python3 tools/paper.py extract my-paper   # build the Lean and list its declarations
python3 tools/transcribe.py my-paper      # draft paper.md from the PDF's structure
python3 tools/paper.py check my-paper     # every word, quote and name must hold
python3 tools/paper.py build              # write the data the site reads
```

`extract` needs [elan](https://github.com/leanprover/elan) and runs the authors' Lean
on the toolchain they pinned. `check` and `build` need Python 3.11 and Poppler, and, for
a paper with a `paper.md`, Node with `npm install` run in `web/`. `transcribe.py` also
needs `pypdf`. The authors' code runs on your machine, so read a project you do not
trust before extracting it.

## Run the site

```sh
cd web
npm install
npm run dev
```

Open the address it prints. `npm run build` writes a static site to `web/dist`; set
`VITE_BASE_PATH` to the folder it will be served from.

To walk a reader's whole visit in a real browser, build for the public path and run the
journey. It needs Playwright for Python, and takes `--browser firefox` or `webkit` as well:

```sh
cd web && VITE_BASE_PATH=/proof-reader/ npm run build && cd ..
python tests/journey.py --shots /tmp/journey
```

`tests/speed.py` measures a paper's first screen on a home connection.

`tools/capture_images.py` retakes the social card and the picture above from a running site.

## What `paper.py check` establishes

The command compares every word of the reading copy with the PDF, and one changed word stops
the build. Two differences are allowed: a word split by a line end, and a block moved from its
place on the PDF page, such as a footnote. A pass means the words are the same. It does not
establish that every word is in the right place inside a moved block, and words inside plots
are left out because the plots are cut from the PDF itself.

The command also confirms that every quotation appears exactly once, that exact Lean lines lie
inside their declaration and that every Lean name exists. No program confirms that a sentence is
about the code it is linked to: a person has to read both. Names printed in the paper are linked
by matching the name alone, so `STLC` in the paper's Haskell opens the Lean `STLC`. Lean reports
what a proof depends on, and does not report whether a Lean statement means what the paper says.
Each page says that the links and notes have not been reviewed by the authors, until an author
has reviewed them.

## Repository map

| Path | What it holds |
| --- | --- |
| `papers/` | One folder for each paper |
| `skills/add-paper/` | How to fill in a new paper |
| `tools/paper.py` | Extract the Lean, compare with the PDF and build the data |
| `tools/transcribe.py` | Draft a paper's reading text from its PDF |
| `tools/reading.py` | Compare the reading copy with the PDF and mark its linked statements |
| `web/tools/render-paper.mjs` | Typeset `paper.md` with Markdown and KaTeX |
| `tools/extract.lean.template` | The Lean program that lists a project's declarations |
| `web/` | The website |
| `web/src/map/` | The map, copied from [lean-exposition](https://github.com/wcook04/lean-exposition) |
| `web/src/app/history.ts` | What one history entry remembers |
| `web/src/proof/` | The right page: graph, Lean, handle |
| `tests/journey.py` | A reader's whole visit, in a real browser |

## Licence

Code is Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Each paper and Lean
project keeps its own licence and credit, named in its `paper.toml` and on its page.

Proof Reader is one of Will Cook's sites. All websites, code and videos are on
[my home page](https://wcook04.github.io/).
