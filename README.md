# Proof Reader

[Will Cook’s home page: all projects and videos](https://wcook04.github.io/)

Proof Reader displays a research paper beside its proof in
[Lean](https://lean-lang.org), a language for writing mathematical statements
and proofs that a computer can check. Click a linked statement in the paper to
open the authors' corresponding Lean code. You can also explore a diagram of
the proof steps and the connections between them.

**[Read a paper in it](https://wcook04.github.io/proof-reader/#/contextual-embeddings)**: *Contextual Embeddings* by Frohlich, Foster, Kavvos and Wang (PLDI 2026), shown with the authors' Lean under CC BY 4.0. The links between the paper and the Lean were made with AI and have not been reviewed by the authors.

[![A paper on the left page with one sentence highlighted, and on the right the graph of its Lean proof above the exact Lean lines the sentence describes.](web/public/reader.webp)](https://wcook04.github.io/proof-reader/#/contextual-embeddings)

For a specific example, [open a paragraph and its five linked lines of Lean](https://wcook04.github.io/proof-reader/#/contextual-embeddings/@isoR-clam),
linked to Lean lines 217 to 221.

On a desktop, the paper is on the left and the proof diagram is on the right.
As you scroll, the diagram highlights the step linked to the passage you are
reading. Click a statement or diagram card to see its Lean code. Use **Back**
to return to the diagram without losing your place, or the **Graph / Lean**
toggle to choose what stays beside the paper.

Citations and figures open beneath the paragraph that mentions them. Each
linked statement has its own address, so you can send someone directly to it.
The contents also include an index of named Lean definitions and theorems
(called **declarations**), with the assumptions each proof uses (**axioms**).

The site adds no explanation of the mathematics. A program compares the reading copy with the
PDF word for word, and the PDF is one click away. The graph and the axiom lists are built from
Lean's own output. The only added words are a short plain title for each declaration, and short
notes where the paper and the Lean differ, each linked to the sentence it is about. These links,
notes and titles were made with AI and have not been reviewed by the authors.

## Run the site

Use Python 3.11 or later, Node 20.19 or later, and [Poppler](https://poppler.freedesktop.org/)
(`brew install poppler` on macOS; `sudo apt-get install poppler-utils` on Ubuntu).
From a fresh clone:

```sh
git clone https://github.com/wcook04/proof-reader.git
cd proof-reader
cd web
npm ci
cd ..
python3 tools/paper.py build
cd web
npm run dev
```

Open the address it prints and choose *Contextual Embeddings*. The paper build creates
the data the site needs; it uses the checked-in Lean extraction, so running the existing
paper does not require Lean. After changing a paper's files, run `python3 tools/paper.py build`
again from the repository root.

From `web/`, `npm run build` writes a static site to `web/dist`.
`npm run preview` serves that build locally. If you set `VITE_BASE_PATH` for
the build, use the same setting for the preview. For example, a build made with
`VITE_BASE_PATH=/proof-reader/ npm run build` needs
`VITE_BASE_PATH=/proof-reader/ npm run preview`.

To test the reading controls in a real browser, build the site and run the
browser test script. It needs Playwright for Python, and takes `--browser firefox` or `webkit` as well:

```sh
cd web && VITE_BASE_PATH=/proof-reader/ npm run build && cd ..
python3 tests/journey.py --shots /tmp/journey
```

`tests/speed.py` measures a paper's first screen on a home connection.

`tools/capture_images.py` retakes the social card and the picture above from a running site.

## Add a paper

To add a paper, create a folder containing the original PDF and Lean project,
a reading copy of the text, and links between passages and Lean statements.
The build command turns those files into pages for the website.

```
papers/<slug>/
  paper.pdf      the authors' PDF, unchanged
  paper.md       the paper's text, compared with the PDF word for word
  paper.toml     title, authors, licences and the Lean modules to read
  lean/          the authors' Lean project, unchanged
  links.json     which passage goes with which declaration, and each one's plain title
  generated/     what Lean reports about the project
```

The [add-paper guide](skills/add-paper/SKILL.md) gives the full procedure for a
person or an AI assistant. The commands are:

```sh
python3 tools/paper.py new my-paper       # then add the PDF, Lean and paper.toml
python3 tools/paper.py extract my-paper   # build the Lean and list its declarations
python3 tools/transcribe.py my-paper      # draft paper.md from the PDF's structure
python3 tools/paper.py check my-paper     # compare the text and check the links
python3 tools/paper.py build              # write the data the site reads
```

`extract` needs [elan](https://github.com/leanprover/elan), the Lean installer,
and uses the Lean version specified by the paper's authors. `check` and `build` need Python 3.11 and Poppler, and, for
a paper with a `paper.md`, Node with `npm install` run in `web/`. `transcribe.py` also
needs `pypdf`. The authors' code runs on your machine, so read a project you do not
trust before extracting it.

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

Authored paper files and the checked-in Lean extraction live under `papers/`.
`tools/paper.py build` turns them into `web/public/papers/`. The website build
command then packages them with the application in `web/dist/`. Both output directories are ignored by Git:
change their sources and rebuild them.

| Source | What it holds |
| --- | --- |
| [papers/](papers/) | One folder for each paper |
| [skills/add-paper/](skills/add-paper/) | How to fill in a new paper |
| [tools/paper.py](tools/paper.py) | Extract the Lean, compare with the PDF and build the data |
| [tools/transcribe.py](tools/transcribe.py) | Draft a paper's reading text from its PDF |
| [tools/reading.py](tools/reading.py) | Compare the reading copy with the PDF and mark its linked statements |
| [render-paper.mjs](web/tools/render-paper.mjs) | Typeset `paper.md` with Markdown and KaTeX |
| [extract.lean.template](tools/extract.lean.template) | The Lean program that lists a project's declarations |
| [web/](web/) | The website |
| [web/src/map/](web/src/map/) | The map, copied from [lean-exposition](https://github.com/wcook04/lean-exposition) |
| [history.ts](web/src/app/history.ts) | Saved reading position and open statements for the Back button |
| [web/src/lean/](web/src/lean/) | Code for displaying and colouring Lean source |
| [web/src/proof/](web/src/proof/) | The proof diagram and Lean panel beside the paper |
| [check-source.mjs](web/tools/check-source.mjs) | Find source files that the application and tools do not use; run with `npm run check:source` in `web/` |
| [tests/](tests/) | Python unit tests and the browser [journey](tests/journey.py) |
| [Pages workflow](.github/workflows/pages.yml) | Check every paper, build the site and publish to GitHub Pages |

## Related work and videos

[Lean Exposition](https://github.com/wcook04/lean-exposition) contains writing guides and tools for explaining a Lean proof in three papers
with different levels of detail. Its
[reading website](https://wcook04.github.io/lean-exposition-site/) presents those draft
explanations beside the graph; [this video walks through that site](https://www.youtube.com/watch?v=sYMDcT7vyng).
Proof Reader's reading copy keeps the original paper's wording.

## Licence

Code is Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Each paper and Lean
project keeps its own licence and credit, named in its `paper.toml` and on its page.

Proof Reader is one of Will Cook's sites. Find the other websites and code on
[Will's home page](https://wcook04.github.io/), and the [project videos](https://wcook04.github.io/#videos).
