# Agent entry

To add a paper, follow [the add-paper skill](skills/add-paper/SKILL.md). Change only
that paper's folder; the code should not need to know about any one paper.

To change the tool, the data flows one way: `papers/<slug>/` → `tools/paper.py` →
`web/public/papers/` → `web/`. The browser computes nothing a build could check: the
reading copy arrives as finished HTML with its ties, names and page marks in place.

Keep these true:

- The PDF and the Lean project under `papers/` stay byte for byte as their authors
  published them.
- `paper.md` says what the PDF says. One changed word stops the build, and the authors'
  typos stay. Read code listings by eye as well: the check cannot see a word in the wrong
  column of a moved block.
- Every other word on a paper's page is a quotation, Lean's own output, a marked note, or a
  declaration's short plain title.
- Reading the paper is the way in. At rest the right page is the graph; the Lean opens on a
  click or by hand, and the list of declarations is an index at the back.
- Plain words first wherever a person reads. A raw Lean name is small, beside its plain title,
  and in the code.
- Opening something pushes one history entry that holds the paper's pixel, the pin, the tab
  and the map's camera. Following and pointing never push.
- Failing to find a quote or a name stops the build.
- `web/src/map/` is copied from lean-exposition. Keep it close to that source so fixes
  can move between them. Its few local changes are marked "Proof Reader".

Check a change with:

```sh
python3 -m unittest discover -s tests
python3 tools/paper.py check contextual-embeddings
cd web && VITE_BASE_PATH=/proof-reader/ npm run build && cd ..
python3 tests/journey.py
```

Look at any visual change in a browser at laptop and monitor widths.
