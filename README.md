# Proof Reader

Read a paper beside its Lean proof.

Many papers now come with a Lean proof, but the two sit in different places: a PDF
here, an artifact there, and nothing connecting a sentence to the code that proves it.
Proof Reader puts them on one screen. The authors' own PDF sits on the left, a map of
their Lean declarations in the middle, and the Lean source on the right. As you scroll
the paper, the map and the source follow. Choose a card or a name, and the paper moves
to the words that discuss it.

It writes no explanation of its own. The paper is shown unchanged, the map and axiom
facts come from Lean itself, and the only added words are short notes where the paper
and the Lean differ, each marked and tied to the passage it rests on.

## Add a paper

A paper is a folder. Everything else is generated from it.

```
papers/<slug>/
  paper.pdf      the authors' PDF, unchanged
  paper.toml     title, authors, licences and the Lean modules to read
  lean/          the authors' Lean project, unchanged
  links.json     which passage goes with which declaration
  generated/     what Lean reports about the project
```

The [add-paper skill](skills/add-paper/SKILL.md) walks an agent or a person through
it. In short:

```sh
python3 tools/paper.py new my-paper       # then add the PDF, Lean and paper.toml
python3 tools/paper.py extract my-paper   # build the Lean and list its declarations
python3 tools/paper.py check my-paper     # every quote and name must exist
python3 tools/paper.py build              # write the data the site reads
```

`extract` needs [elan](https://github.com/leanprover/elan) and runs the authors' Lean
on the toolchain they pinned. `check` and `build` need Python 3.11 and Poppler's
`pdftotext`. The authors' code runs on your machine, so read a project you do not
trust before extracting it.

## Run the site

```sh
cd web
npm install
npm run dev
```

Open the address it prints. `npm run build` writes a static site to `web/dist`; set
`VITE_BASE_PATH` to the folder it will be served from.

## What the checks mean

`check` confirms that every quotation appears in the PDF exactly once and that every
name is a real declaration. It cannot confirm that a passage is about the code it
points to; that takes reading both. Lean's report says what a proof depends on, and
says nothing about whether a statement means what the paper says. The ties and notes
on a page are unreviewed until an author says otherwise, and each page says so.

## Repository map

| Path | What it holds |
| --- | --- |
| `papers/` | One folder for each paper |
| `skills/add-paper/` | How to fill in a new paper |
| `tools/paper.py` | Extract, check and build |
| `tools/extract.lean.template` | The Lean program that lists a project's declarations |
| `web/` | The website |
| `web/src/map/` | The map, copied from [lean-exposition](https://github.com/wcook04/lean-exposition) |

## Licence

Code is Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Each paper and Lean
project keeps its own licence and credit, named in its `paper.toml` and on its page.
