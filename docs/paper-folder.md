# The paper folder

Each page on the site is built from one folder under `papers/`. A new paper changes only
its own folder; the code does not know about any one paper. The
[add-paper guide](../skills/add-paper/SKILL.md) gives the full procedure, step by step,
for a person or an AI assistant. This page is the reference for what goes in the folder.

```
papers/<slug>/
  paper.pdf      the authors' PDF, unchanged, for a PDF source
  paper.md       a reading copy of the PDF, or the supplied Markdown source
  paper.toml     title, authors, licences and the Lean modules to read
  lean/          the authors' Lean project, unchanged
  links.json     which passage goes with which declaration, plain titles, notes and comparisons
  checks/        optional Lean files of ours that test a statement against the authors' Lean
  comparator/    optional files of a Comparator run: challenge, solution, configuration, receipt
  generated/     recorded declaration data and its provenance, plus any compiled checks
```

[`paper.toml.example`](paper.toml.example) is the template that `paper.py new` copies.
Hosting a PDF needs an open licence such as CC BY, or the authors' permission, and
`paper.toml` names the licence of the paper and of the Lean.

## Commands for a PDF paper

```sh
python3 tools/paper.py new my-paper       # then add the PDF, Lean and paper.toml
python3 tools/paper.py extract my-paper   # build the Lean, list its declarations, compile checks/
python3 tools/transcribe.py my-paper      # draft paper.md from the PDF's structure
# define a result under claims in links.json, with its passage and Lean declaration
python3 tools/paper.py check my-paper     # compare the text and test the links
python3 tools/paper.py build              # write the data the site reads
```

`extract` needs [elan](https://github.com/leanprover/elan), the Lean installer, and uses
the Lean version named in the authors' project. It runs the authors' build on your
machine, so read a project you do not trust before extracting it. `check` and `build`
need Python 3.11 and Poppler and, for a paper with a `paper.md`, Node with `npm ci` run
in `web/`. `transcribe.py` also needs `pypdf`.

## Markdown papers

For a paper written in Markdown, set `[paper] markdown` in `paper.toml` to the file name.
There is no PDF and no transcription step. In `links.json`, each linked passage is an exact
quotation that appears once in the source, identified by its heading and block.
A page's declaration data can come from Lean's report on the compiled project, or be read
from the source files by hand; `generated/` records which, and data read by hand is
labelled as source-read.

The `[reading.companions]` table maps relative Markdown paths to other pages on the site,
for example `"../companion/paper.md" = "companion"`. A link in the text to that path opens
the other page, and a heading fragment opens the matching section.

For an explanatory reconstruction, set `[credit] original_url` to the original
paper or project it explains. The header lists that source alongside the Lean
artifact and the credit in `[credit] text`.

### Figures

Put the image in the paper's folder, or a folder inside it, and refer to it with a
relative Markdown image such as `![A proof map](proof-map.png)`. `paper.py check` stops
on a missing image or a path that leads out of the paper's folder. `paper.py build`
copies each referenced image into `web/public/papers/<slug>/` beside the reading HTML and
records its SHA-256 in `edition.json` under `source.images`. Rebuild the paper and then
the website after changing an image. An editable SVG can stay beside the PNG that the
Markdown uses.

## Comparisons and held pages

`links.json` can give each stated result a comparison with its Lean: the Lean says the
same as the paper, more, less, or something different. When a page has comparisons,
`check` stops if a stated result or a relevant author axiom has none. Setting
`fidelity_held` keeps the comparisons in the file and leaves them off the page.
[What the checks show](what-the-checks-show.md) says what these comparisons are based on.

## Notes on the Lean and the whole library

A note normally rests on passages of the paper (`because`). A reading note on the Lean itself
sets `"on": "lean"`, rests on the declaration's own source, and may carry a longer `summary`
title beside the short plain title. Its `$…$` formulas and `` `…` `` code are typeset when the
page is built. `"show_also"` in `links.json` lists declarations the page shows although no
passage names them, such as lemmas used only inside proofs, so that the index and the names
inside a proof can open them. A project whose declaration report is too large to keep can
commit `generated/lean.json.gz` in place of `generated/lean.json`.

## Literature Links

`paper.py build` also writes `literature-links.jsonl` beside the paper's data, with one
[Literature Links](https://github.com/mathlib-initiative/literature-links) annotation
for each passage in `links.json`. The passage is the subject and its Lean declarations
are the object. A PDF passage is a quote on its page, and a quote that runs over a page
break stops the build. A Markdown passage keeps its heading, block and quotation. The
Lean is the project that `[lean] source` names, at the commit in that address, and a
paper without a `[lean] source` gets no file. The workflow checks these files with the
Literature Links checker.

## Comparator runs

A page can show a [Comparator](https://github.com/leanprover/comparator) run. Name the
folder holding the run's files under `[comparator] evidence` in `paper.toml`. Pages that
show the same Lean can name one shared folder, such as `"../pcp-full-argument/comparator"`.
The folder contains `Challenge.lean`, `Solution.lean`, the configuration, a control that
Comparator rejected, and a `receipt.json` recording the run.

## API maps

`api-maps/` holds pages that are not papers. [Physlib](https://github.com/leanprover-community/physlib)
keeps an API map for each area of physics: a Markdown page listing the Lean definitions
and results that cover the area. `api-maps/physlib-gauge-theory/` contains the Gauge
theory map, the Lean files it cites and the pinned index entry, all copied from fixed
commits by `python3 tools/physlib_map.py --refresh`. Our own files beside them are
`glossary.json`, a plain title for each Lean name, and `maths.json`, the typeset form of
each formula in the map. `paper.py build` writes its page under `web/public/api-maps/`.
