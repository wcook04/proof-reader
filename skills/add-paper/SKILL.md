---
name: add-paper
description: Add a paper with a Lean proof to Proof Reader. Use when given a paper and its Lean project, to set the paper for reading, tie each sentence and line of code to the exact Lean it describes, give each declaration a plain title and write short notes grounded in the paper, so the paper appears on the site beside its Lean.
---

# Add a paper

A paper page is an open book: the authors' paper on the left, read as any paper is, and
on the right a graph of the proof that follows the reader, with the authors' Lean one click
away. The left page is a reading copy set from the PDF, with the PDF itself one click away.
The paper is never rewritten: a program compares every word of the reading copy with the
PDF. Your job is to find which words of the paper belong to which lines of Lean.

Everything mechanical is done by `tools/transcribe.py` and `tools/paper.py`, including
linking every Lean name printed in the paper. What you write is `links.json`, and the
repairs to `paper.md`.

## 1. Set up the folder

```sh
python3 tools/paper.py new <slug>
```

- Copy the PDF to `papers/<slug>/paper.pdf` and the Lean project into
  `papers/<slug>/lean/`, keeping its `lean-toolchain` and `lakefile`.
- Fill in `paper.toml`. Name the modules to read, the source of each file and both
  licences.

**Licence.** Hosting the PDF needs an open licence such as CC BY, or the authors'
permission. Read the licence in the paper itself and in the artifact's record. If neither allows
it, stop and say so. Do not host the file.

```sh
python3 tools/paper.py extract <slug>
```

This builds the project on its own toolchain and writes `generated/lean.json`: every
declaration, its lines, what it uses and the axioms it rests on. If it fails, report
the Lean error. Do not edit the authors' Lean.

## 2. Set the reading copy

```sh
pip install pypdf
python3 tools/transcribe.py <slug>
```

This writes `papers/<slug>/paper.md` from the PDF's own structure: fonts tell code from
prose, positions tell a heading from a footnote, and the PDF's link targets give each
citation and cross-reference its destination. Use the reading copy route for any paper
with an open licence. A paper without a `paper.md` still works, on the PDF alone.

The draft is close, and `paper.py check` lists where it differs from the PDF. Run `npm ci` in
`web/` once first, and write at least one claim in `links.json` (step 4), because `check` stops
without one. `check` ignores the top 7.5% of each PDF page, so words printed there do not count.
Repair `paper.md` by hand:

- **The first page.** The title block, abstract, keywords and the licence box arrive in
  page order, some of them in the middle of the introduction. Lay them out as Sam
  Frohlich's paper does at the top of `papers/contextual-embeddings/paper.md`.
- **Formulas.** Each font change splits a formula. Rejoin it in TeX: `$\lambda x.(x, x)$`.
  Display rules go in `$$`.
- **Numbered items** that the PDF numbers by hand.
- **Code set side by side** whose rows line up. Rows out of step are split for you.
- **Plots.** Find each plot's box in PDF points, add a `[[reading.figure]]` to
  `paper.toml`, and describe the plot in the image's alternative text.

Never correct the authors. A typo in the PDF stays in `paper.md`: it is their paper.

```sh
cd web && npm install && cd ..
python3 tools/paper.py check <slug>
```

The command needs `extract` to have run, so do step 1 first. It lists every word that
differs from the PDF. It stops at zero differences or it stops the build.

**What it cannot see.** Words that are all present but in the wrong place inside a moved
block pass the comparison. A figure's `where` once landed in the wrong column and the
comparison passed. So read every code listing against the PDF yourself, particularly the
side-by-side ones.

## 3. Read both sides

Read the paper's sections that discuss the Lean, then the Lean files, including their
comments. Authors' comments often repeat the paper's wording, which makes a good guide
to what goes with what. Read the artifact's README: it may say which claim each file
supports, or that a file is out of date.

## 4. Write links.json

```json
{
  "schema": 1,
  "claims": [
    {"id": "isomorphism", "title": "unembed and contextualise form an isomorphism",
     "section": "3.3", "passage": "proven", "lean": ["isoL", "isoR"]}
  ],
  "passages": [
    {"id": "proven", "section": "3.3", "role": "states", "lean": ["isoL", "isoR"],
     "quote": "We have proven that unembed and contextualise form an isomorphism in Lean 4"},
    {"id": "isoR-clam", "section": "3.3", "role": "proves", "lean": ["isoR"], "lines": [217, 221],
     "quote": "isoR’s CLam case, which requires function extensionality."}
  ],
  "name_sections": ["2", "3"],
  "plain": {"isoR": "Contextual round trip"},
  "notes": {
    "ProxyVar": {"text": "This is the type the paper's Haskell calls Var.", "because": ["existential"]}
  }
}
```

**Claims** are what the paper says the Lean establishes. Each one becomes the top of
a map, so use the paper's own words for its title and name the theorems that state it.

**Passages** link words to declarations.

- `quote` is copied exactly from the PDF, and short enough to read at a glance: one
  sentence is usually right.
- `role` says what the passage does to the declaration, and must say no more than the two
  say: `states`, `defines`, `proves`, `explains`, `uses`, `mentions` (it names the thing and
  claims nothing about the Lean) or `mirrors` (a line of the paper's other language that
  corresponds to the Lean). The page says "this line" for code by itself.
- `lines` names the exact Lean lines, when the passage is about less than the whole
  declaration. They must lie inside the first declaration in `lean`. This is the point
  of the page: "isoR's CLam case" should land on `CLam`'s lines, not on the top of `isoR`.
- Link lines of code as well as sentences. When the paper prints a definition, a quote of
  one Haskell equation linked to the matching Lean line lets a reader read the two side by
  side. A quote may run across lines of code.
- Link every declaration you can. A passage may link to several.
- If a quote occurs twice, lengthen it, or add `"page": n` for the PDF and `"nth": n` for
  the reading copy.

**Names** need no work: every Lean name printed in the paper as code is linked for you.
If the Lean covers only some sections of the paper, list those sections under `"name_sections"`,
so that a later section's own `Ty` does not open a different `Ty`. If a name is also an
ordinary word, list it under `"unlinked_names"`.

**Plain titles.** Nobody knows what a declaration does from its name. After reading both
sides, give every declaration in the proof a short title under `"plain"`, in the paper's own
words where it has them ("Reflexive case", not a phrase of yours): at most 40 characters, words a newcomer can read, never the name again. These are what
a reader sees on cards, in Back labels and in headings, with the raw name small beside them.
`paper.py check` stops if one is missing. You answer for each title: it must say what the Lean
does and no more.

**Notes** are the only sentences of ours on the page, so they earn their place. Write one
only when the paper and the Lean differ in a way a careful reader would want to know:
a renamed object, a different encoding, a step the Lean does differently. Every note
names the passages it rests on in `because`. Plain sentences, one or two. No praise, no
interpretation of what the authors meant, no claims about the mathematics beyond what
the paper and the Lean say. Lean's own report of axioms and dependencies is computed, so
never restate it in a note.

## 5. Run the comparison

```sh
python3 tools/paper.py check <slug>
```

This fails if a quote is not found exactly once, if a word differs from the PDF, if
`lines` fall outside their declaration, or if a name is not a Lean declaration. It then
prints how many declarations are linked and what depends on each axiom. Link the ones still
listed where the paper discusses them. Some declarations are helpers the paper never
mentions: leave those unlinked.

Then confirm the meaning yourself, because no program can. For each passage, read the
Lean lines it points to and confirm the passage really is about them. For each note,
confirm it against both sides.

## 6. Look at it

```sh
python3 tools/paper.py build <slug>
cd web && npm run dev
```

Open `#/<slug>`. Scroll the paper and watch the graph follow. Click a sentence with exact
lines and see them lit. Open a citation and a figure in place, switch to the PDF, click some
cards and confirm the paper moves to the right words. Look at it at laptop and monitor
widths. Fix what you find in `links.json` or `paper.md`.

`#/<slug>/@<passage>` opens on one sentence with its Lean lit, which is the link to send
someone who wants to see one thing. `#/<slug>/<declaration>` opens a declaration, and
`#/<slug>/@declarations` the index at the back.

If Lean is slow to start, find where elan keeps its toolchains. A toolchain on an
external drive can turn a 15-second extraction into many minutes.

## What stays true on every page

- The PDF is the authors' file, byte for byte, and stays one click away.
- The reading copy says what the PDF says, word for word, and the footer says it was
  retypeset.
- Every other word is a quotation from the paper, Lean's own output, a note marked as a
  note, or a declaration's plain title.
- The line above the title and the footer say the links, notes and plain titles were made with AI and not reviewed by the
  authors.
  Change that only when an author has reviewed them.
- Publishing a page is the maintainer's decision. Adding a paper to the repository does
  not make it public, and it is best to show the authors first.
