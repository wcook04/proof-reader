# Agent entry

To add a paper, follow [the add-paper skill](skills/add-paper/SKILL.md). Change only
that paper's folder; the code should not need to know about any one paper.

To change the tool, the data flows one way: `papers/<slug>/` → `tools/paper.py` →
`web/public/papers/` → `web/`. The browser computes nothing a build could compute: the
reading copy arrives as finished HTML with its linked statements, names and page marks marked up.

Keep these true:

- The PDF and the Lean project under `papers/` stay byte for byte as their authors
  published them.
- `paper.md` says what the PDF says. One changed word stops the build, and the authors'
  typos stay. Read code listings by eye as well: the comparison cannot see a word in the wrong
  column of a moved block.
- Every other word on a paper's page is a quotation, Lean's own output, a marked note, or a
  declaration's short plain title.
- Reading the paper is the way in. The right pane has two modes, Graph and Lean, with the same
  words and behaviour as Lean Exposition. A click goes to Lean as one history entry, and every
  way back lands where Back lands. The list of declarations is an index at the back.
- Plain words first wherever a person reads. A raw Lean name is small, beside its plain title,
  and in the code.
- Opening something, a reference in place included, pushes one history entry that holds the
  paper's pixel, the pin, the tab and the map's camera. Following and pointing never push.
- A statement opened by a click stays until Unpin, Escape, Back or a new click. Scrolling never
  lets it go.
- The address names the statement carrying the highlighter, and the counter reads the same.
- Failing to find a quote or a name stops the build.
- `web/src/map/` is copied from lean-exposition. Keep it close to that source so fixes
  can move between them. Its few local changes are marked "Proof Reader".

Before committing a change, run:

```sh
python3 -m unittest discover -s tests
python3 tools/paper.py check contextual-embeddings
cd web && npm run test:source && VITE_BASE_PATH=/proof-reader/ npm run build && cd ..
python3 tests/journey.py
```

Look at any visual change in a browser at laptop and monitor widths.
