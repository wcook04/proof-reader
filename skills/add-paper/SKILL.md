---
name: add-paper
description: Add a Lean-checked paper to Proof Reader. Use when given a paper and its Lean project, to tie each Lean declaration to the passage of the paper it belongs to and write short notes grounded in the paper, so the paper appears on the site beside its Lean.
---

# Add a paper

A paper page is an open book: the authors' PDF on the left, their Lean on the right,
each sentence level with the code it describes. The paper is never rewritten. Your job
is to find which words of the paper belong to which Lean declaration.

Everything mechanical is done by `tools/paper.py`, including linking every Lean name
printed in the paper. The only thing you write is `papers/<slug>/links.json`.

## 1. Set up the folder

```sh
python3 tools/paper.py new <slug>
```

- Copy the PDF to `papers/<slug>/paper.pdf` and the Lean project into
  `papers/<slug>/lean/`, keeping its `lean-toolchain` and `lakefile`.
- Fill in `paper.toml`. Name the modules to read, the source of each file and both
  licences.

**Licence.** Hosting the PDF needs an open licence such as CC BY, or the authors'
permission. Check the paper itself and the artifact's record. If neither allows
it, stop and say so. Do not host the file.

```sh
python3 tools/paper.py extract <slug>
```

This builds the project on its own toolchain and writes `generated/lean.json`: every
declaration, its lines, what it uses and the axioms it rests on. If it fails, report
the Lean error. Do not edit the authors' Lean.

## 2. Read both sides

Read the paper's sections that discuss the Lean, then the Lean files, including their
comments. Authors' comments often repeat the paper's wording, which makes a good guide
to what goes with what. Read the artifact's README: it may say which claim each file
supports, or that a file is out of date.

## 3. Write links.json

```json
{
  "schema": 1,
  "claims": [
    {"id": "isomorphism", "title": "unembed and contextualise form an isomorphism",
     "section": "3.3", "passage": "proven", "lean": ["isoL", "isoR"]}
  ],
  "passages": [
    {"id": "proven", "section": "3.3", "role": "states", "lean": ["isoL", "isoR"],
     "quote": "We have proven that unembed and contextualise form an isomorphism in Lean 4"}
  ],
  "notes": {
    "ProxyVar": {"text": "This is the type the paper's Haskell calls Var.", "because": ["existential"]}
  }
}
```

**Claims** are what the paper says the Lean establishes. Each one becomes the top of
a map, so use the paper's own words for its title and name the theorems that state it.

**Passages** tie words to declarations.

- `quote` is copied exactly from the PDF, and short enough to read at a glance: one
  sentence is usually right.
- `role` says what the passage does to the declaration: `states`, `defines`, `proves`,
  `explains` or `uses`.
- Tie every declaration you can. A passage may tie to several.
- If a quote occurs twice, add `"page": n` or lengthen it.

**Notes** are the only words of ours on the page, so they earn their place. Write one
only when the paper and the Lean differ in a way a careful reader would want to know:
a renamed object, a different encoding, a step the Lean does differently. Every note
names the passages it rests on in `because`. Plain sentences, one or two. No praise, no
interpretation of what the authors meant, no claims about the mathematics beyond what
the paper and the Lean say. Lean's own report of axioms and dependencies is computed, so
never restate it in a note.

## 4. Check it

```sh
python3 tools/paper.py check <slug>
```

This fails if a quote is not in the PDF exactly once, or if a name is not a Lean
declaration. It then prints how many declarations are tied and what rests on each
axiom. Tie the ones still listed where the paper discusses them. Some declarations are
helpers the paper never mentions: leave those untied.

Then check the meaning yourself, because the tool cannot. For each passage, read the
Lean lines it points to and confirm the passage really is about them. For each note,
confirm it against both sides.

## 5. Look at it

```sh
python3 tools/paper.py build <slug>
cd web && npm run dev
```

Open `#/<slug>`. Scroll the paper and watch the Lean follow. Open the map, click some
cards and confirm the paper moves to the right words. Look at it at laptop and monitor
widths. Fix what you find in `links.json`.

If Lean is slow to start, check where elan keeps its toolchains. A toolchain on an
external drive can turn a 15-second extraction into many minutes.

## What stays true on every page

- The PDF is the authors' file, byte for byte.
- Every word beside it is a quotation from the paper, Lean's own output, or a note
  marked as a note.
- The footer says the ties and notes were made with AI and not reviewed by the authors.
  Change that only when an author has reviewed them.
- Publishing a page is the maintainer's decision. Adding a paper to the repository does
  not make it public, and it is best to show the authors first.
